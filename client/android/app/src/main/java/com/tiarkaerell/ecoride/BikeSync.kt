package com.tiarkaerell.ecoride

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.RequiresApi
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Owns the one native background transaction and its persisted state. Every
 * entry point runs on the main thread, and so do the GATT callbacks (the
 * connection is opened with a main-looper Handler): no locking.
 */
internal object BikeSync {
    const val TAG = "EcoBikeSync"
    private const val PREFS = "super73_background_sync"
    private const val PLAN_KEY = "plan"
    const val DEVICE_KEY = "device_id"

    private val main = Handler(Looper.getMainLooper())
    private var active: BikeTransaction? = null

    /** Set by the plugin from the Activity's onStart/onStop. */
    var foreground = false
        set(value) {
            field = value
            if (value) cancel("app entered the foreground")
        }

    fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun savePlan(context: Context, plan: BikeSyncPlan) {
        val json = JSONObject()
            .put("deviceId", plan.deviceId)
            .put("protocol", plan.protocol)
            .put("commands", JSONArray(plan.commands.map(BikeSyncProtocol::toHex)))
        prefs(context).edit().putString(PLAN_KEY, json.toString()).apply()
    }

    fun loadPlan(context: Context): BikeSyncPlan? {
        val raw = prefs(context).getString(PLAN_KEY, null) ?: return null
        val json = JSONObject(raw)
        val commands = json.getJSONArray("commands")
        return BikeSyncPlan.of(
            json.getString("deviceId"),
            json.getString("protocol"),
            List(commands.length()) { BikeSyncProtocol.fromHex(commands.getString(it)) },
        )
    }

    fun clear(context: Context) {
        cancel("background sync disabled")
        prefs(context).edit().remove(PLAN_KEY).remove(DEVICE_KEY).remove(BikeAutoOpen.PREF_KEY).apply()
    }

    @RequiresApi(Build.VERSION_CODES.S)
    fun synchronize(context: Context, address: String, source: String) {
        val appContext = context.applicationContext
        main.post { synchronizeOnMain(appContext, address, source) }
    }

    fun cancel(reason: String) {
        main.post {
            val transaction = active ?: return@post
            active = null
            transaction.finish("cancelled", reason)
        }
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun synchronizeOnMain(context: Context, address: String, source: String) {
        Log.d(TAG, "bike appeared ($source)")
        val plan = try {
            loadPlan(context)
        } catch (e: RuntimeException) {
            return record(context, "failed", "unreadable plan: ${e.message}")
        }
        when {
            plan == null -> record(context, "skippedNoPlan", null)
            !plan.deviceId.equals(address, ignoreCase = true) -> record(context, "skippedDeviceMismatch", address)
            foreground -> record(context, "skippedForeground", null)
            active != null -> record(context, "skippedBusy", null)
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) !=
                PackageManager.PERMISSION_GRANTED -> record(context, "failed", "BLUETOOTH_CONNECT not granted")
            else -> {
                val transaction = BikeTransaction(context, plan) { t, outcome, detail ->
                    if (active === t) active = null
                    record(context, outcome, detail)
                    if (outcome != "cancelled") BikeAutoOpen.afterSync(context, address)
                }
                active = transaction
                prefs(context).edit().putLong("last_started_at", System.currentTimeMillis()).apply()
                transaction.start()
            }
        }
    }

    private fun record(context: Context, outcome: String, detail: String?) {
        prefs(context).edit()
            .putString("last_outcome", outcome)
            .putString("last_detail", detail)
            .putLong("last_completed_at", System.currentTimeMillis())
            .apply()
        Log.i(TAG, "outcome=$outcome" + (detail?.let { " ($it)" } ?: ""))
    }
}

/**
 * connect (with retries) → discover → SHA-1 auth → history barrier → read the
 * control record → write the marked frame only if byte 5 is unset → verify.
 * Bounded by [TIMEOUT_MS] — the CompanionDeviceService binding is all the
 * background time we get (no foreground service).
 *
 * The MTU is deliberately left to the bike: it starts its own exchange, and a
 * second, client-initiated one stalls the ATT queue
 * (client/src/lib/__tests__/native-no-mtu-request.test.ts scans this file).
 */
@SuppressLint("MissingPermission")
private class BikeTransaction(
    private val context: Context,
    private val plan: BikeSyncPlan,
    private val onFinished: (BikeTransaction, String, String?) -> Unit,
) {
    private enum class State { CONNECTING, DISCOVERING, CHALLENGE, RESPONSE, AUTH_STATE, HISTORY, FINISHED }

    // Own Handler: finish() clears exactly this transaction's timers and the
    // GATT callbacks still queued for it.
    private val main = Handler(Looper.getMainLooper())
    private val timeout = Runnable { finish("failed", "timed out after ${TIMEOUT_MS / 1000} s in $state") }
    private val control = ControlSync(plan.commands)
    private var state = State.CONNECTING
    private var attempt = 0
    private var gatt: BluetoothGatt? = null
    private var selector: BluetoothGattCharacteristic? = null
    private var register: BluetoothGattCharacteristic? = null
    private var response: BluetoothGattCharacteristic? = null
    private var authState: BluetoothGattCharacteristic? = null

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) =
            onConnection(g, status, newState)

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) = onDiscovered(g, status)

        @Deprecated("API < 33 path")
        override fun onCharacteristicRead(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
            @Suppress("DEPRECATION")
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) onRead(g, c, c.value ?: ByteArray(0), status)
        }

        override fun onCharacteristicRead(
            g: BluetoothGatt,
            c: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int,
        ) = onRead(g, c, value, status)

        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) =
            onWritten(g, c, status)
    }

    fun start() {
        main.postDelayed(timeout, TIMEOUT_MS)
        connect()
    }

    private fun connect() {
        if (state == State.FINISHED) return
        try {
            val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
            if (adapter?.isEnabled != true) return finish("failed", "Bluetooth is off")
            Log.d(BikeSync.TAG, "connect attempt ${attempt + 1}")
            gatt = adapter.getRemoteDevice(plan.deviceId).connectGatt(
                context,
                false,
                callback,
                BluetoothDevice.TRANSPORT_LE,
                BluetoothDevice.PHY_LE_1M_MASK,
                main,
            )
        } catch (e: RuntimeException) {
            finish("failed", "connectGatt: ${e.message}")
        }
    }

    private fun onConnection(g: BluetoothGatt, status: Int, newState: Int) {
        if (state == State.FINISHED || g !== gatt) return
        val connected = status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED
        if (state == State.CONNECTING && !connected) {
            // The bike often drops the first attempts: LE Connection Complete,
            // then HCI 0x3E ~100 ms later, reported as GATT 147 then 133
            // (docs/architecture/capacitor-android.md). Same delays as ble-native.ts.
            g.close()
            gatt = null
            val delay = RETRY_DELAYS_MS.getOrNull(attempt++)
                ?: return finish("failed", "connection failed after $attempt attempts (status $status)")
            Log.d(BikeSync.TAG, "connect_retry status=$status in $delay ms")
            main.postDelayed(::connect, delay)
            return
        }
        if (!connected) return finish("failed", "bike disconnected in $state (status $status)")
        if (state == State.CONNECTING) {
            state = State.DISCOVERING
            if (!g.discoverServices()) finish("failed", "discoverServices refused")
        }
    }

    private fun onDiscovered(g: BluetoothGatt, status: Int) {
        if (state != State.DISCOVERING) return
        if (status != BluetoothGatt.GATT_SUCCESS) return finish("failed", "discovery status $status")
        val auth = g.getService(AUTH_SERVICE)
        val metrics = g.getService(METRICS_SERVICE)
        val challenge = auth?.getCharacteristic(AUTH_CHALLENGE)
        response = auth?.getCharacteristic(AUTH_RESPONSE)
        authState = auth?.getCharacteristic(AUTH_STATE)
        selector = metrics?.getCharacteristic(REGISTER_ID)
        register = metrics?.getCharacteristic(REGISTER)
        if (challenge == null || response == null || authState == null || selector == null || register == null) {
            return finish("failed", "missing GATT characteristic")
        }
        // Always run the handshake: v1 firmware leaves the auth state at 1
        // after a disconnect, which does not mean this link is authenticated.
        state = State.CHALLENGE
        if (!g.readCharacteristic(challenge)) finish("failed", "challenge read refused")
    }

    private fun onRead(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
        if (state == State.FINISHED) return
        if (status != BluetoothGatt.GATT_SUCCESS) return finish("failed", "read ${c.uuid} status $status")
        when {
            state == State.CHALLENGE && c.uuid == AUTH_CHALLENGE -> {
                val answer = try {
                    BikeSyncProtocol.authResponse(value)
                } catch (e: IllegalArgumentException) {
                    return finish("failed", e.message)
                }
                state = State.RESPONSE
                if (!write(g, response, answer)) finish("failed", "auth response write refused")
            }
            state == State.AUTH_STATE && c.uuid == AUTH_STATE -> {
                if (value.firstOrNull() != 1.toByte()) {
                    return finish("failed", "authentication refused (${BikeSyncProtocol.toHex(value)})")
                }
                Log.d(BikeSync.TAG, "auth_ok")
                advance(g, control.start())
            }
            state == State.HISTORY && c.uuid == REGISTER -> {
                Log.d(BikeSync.TAG, "history ${BikeSyncProtocol.toHex(value)}")
                advance(g, control.onRead(value))
            }
        }
    }

    private fun onWritten(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
        if (state == State.FINISHED) return
        if (status != BluetoothGatt.GATT_SUCCESS) return finish("failed", "write ${c.uuid} status $status")
        when {
            state == State.RESPONSE && c.uuid == AUTH_RESPONSE -> {
                state = State.AUTH_STATE
                if (!g.readCharacteristic(authState)) finish("failed", "auth state read refused")
            }
            state == State.HISTORY && (c.uuid == REGISTER_ID || c.uuid == REGISTER) -> advance(g, control.onWrite())
        }
    }

    private fun advance(g: BluetoothGatt, action: ControlSync.Action) {
        state = State.HISTORY
        when (action) {
            is ControlSync.Action.Select ->
                if (!write(g, selector, action.selector)) finish("failed", "history select refused")
            is ControlSync.Action.Read -> main.postDelayed({
                if (state == State.HISTORY && !g.readCharacteristic(register)) finish("failed", "history read refused")
            }, action.delayMs)
            is ControlSync.Action.Write -> {
                Log.i(BikeSync.TAG, "writing ${BikeSyncProtocol.toHex(action.command)}")
                if (!write(g, register, action.command)) finish("failed", "control write refused")
            }
            is ControlSync.Action.Complete ->
                finish(if (action.applied) "confirmed" else "skippedAlreadySynchronized", null)
            is ControlSync.Action.Failed -> finish("failed", action.detail)
        }
    }

    private fun write(g: BluetoothGatt, c: BluetoothGattCharacteristic?, value: ByteArray): Boolean {
        c ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeCharacteristic(c, value, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) ==
                BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            c.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            @Suppress("DEPRECATION")
            c.value = value
            @Suppress("DEPRECATION")
            g.writeCharacteristic(c)
        }
    }

    fun finish(outcome: String, detail: String?) {
        if (state == State.FINISHED) return
        state = State.FINISHED
        main.removeCallbacksAndMessages(null)
        gatt?.let {
            runCatching { it.disconnect() }
            runCatching { it.close() }
        }
        gatt = null
        onFinished(this, outcome, detail)
    }

    companion object {
        const val TIMEOUT_MS = 45_000L
        val RETRY_DELAYS_MS = longArrayOf(1_000, 2_000, 3_000, 5_000)
        private fun uuid(short: String) = UUID.fromString("0000$short-1212-efde-1523-785feabcd123")
        val METRICS_SERVICE: UUID = uuid("1554")
        val REGISTER_ID: UUID = uuid("1564")
        val REGISTER: UUID = uuid("155f")
        val AUTH_SERVICE: UUID = uuid("2554")
        val AUTH_CHALLENGE: UUID = uuid("2556")
        val AUTH_RESPONSE: UUID = uuid("2557")
        val AUTH_STATE: UUID = uuid("2558")
    }
}
