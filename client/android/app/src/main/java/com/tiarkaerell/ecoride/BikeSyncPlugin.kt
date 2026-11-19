package com.tiarkaerell.ecoride

import android.Manifest
import android.app.Activity
import android.bluetooth.le.ScanResult
import android.companion.AssociationInfo
import android.companion.CompanionDeviceManager
import android.content.Intent
import android.content.IntentSender
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PermissionState
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Bridge for the Super73 background sync. TypeScript pushes the plan
 * (setPlan) and asks for the one-time system association dialog (enable);
 * everything after that runs natively, without the WebView.
 */
@CapacitorPlugin(
    name = "Super73BackgroundSync",
    requestCodes = [BikeSyncPlugin.REQUEST_ASSOCIATE],
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class BikeSyncPlugin : Plugin() {
    private class Pending(val call: PluginCall, val address: String, var chooserShown: Boolean = false)

    private val main = Handler(Looper.getMainLooper())
    private var pending: Pending? = null

    // Android 12/12L can end discovery without any callback when the bike is off.
    private val discoveryTimeout = Runnable { fail("Bike not found — is it switched on?") }

    override fun load() {
        if (backgroundSyncSupported(context)) BikeCompanion.restore(context)
    }

    // One GATT owner at a time: the WebView's connection wins.
    override fun handleOnStart() {
        BikeSync.foreground = true
        BikeAutoOpen.clearNotification(context)
    }

    override fun handleOnStop() {
        BikeSync.foreground = false
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val prefs = BikeSync.prefs(context)
        val address = prefs.getString(BikeSync.DEVICE_KEY, null)
        val supported = backgroundSyncSupported(context)
        call.resolve(
            JSObject()
                .put("supported", supported)
                .put("deviceId", address)
                .put("associated", supported && address != null && BikeCompanion.isAssociated(context, address))
                .put("hasPlan", prefs.contains("plan"))
                .put("autoOpen", prefs.getBoolean(BikeAutoOpen.PREF_KEY, false))
                .put("lastOutcome", prefs.getString("last_outcome", null))
                .put("lastDetail", prefs.getString("last_detail", null))
                .put("lastStartedAt", prefs.getLong("last_started_at", 0))
                .put("lastCompletedAt", prefs.getLong("last_completed_at", 0)),
        )
    }

    @PluginMethod
    fun setAutoOpen(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: return call.reject("enabled required")
        if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState("notifications") == PermissionState.PROMPT
        ) {
            requestPermissionForAlias("notifications", call, "saveAutoOpen")
            return
        }
        saveAutoOpen(call)
    }

    @PermissionCallback
    private fun saveAutoOpen(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: return call.reject("enabled required")
        val prefs = BikeSync.prefs(context)
        if (enabled && (!prefs.contains(BikeSync.DEVICE_KEY) || !prefs.contains("plan"))) {
            return call.reject("Bike sync is disabled")
        }
        prefs.edit().putBoolean(BikeAutoOpen.PREF_KEY, enabled).apply()
        if (!enabled) BikeAutoOpen.clearNotification(context)
        call.resolve()
    }

    /** { deviceId, protocol: "v1" | "v2", commands: number[10][] } — 0xFF leaves a field alone. */
    @PluginMethod
    fun setPlan(call: PluginCall) {
        try {
            val frames = call.getArray("commands") ?: throw IllegalArgumentException("commands required")
            val commands = List(frames.length()) { i ->
                val bytes = frames.getJSONArray(i)
                ByteArray(bytes.length()) { j ->
                    bytes.getInt(j).also { require(it in 0..255) { "frame bytes must be 0-255" } }.toByte()
                }
            }
            val plan = BikeSyncPlan.of(
                call.getString("deviceId") ?: throw IllegalArgumentException("deviceId required"),
                call.getString("protocol") ?: throw IllegalArgumentException("protocol required"),
                commands,
            )
            BikeSync.savePlan(context, plan)
            call.resolve(JSObject().put("commands", JSArray(plan.commands.map(BikeSyncProtocol::toHex))))
        } catch (e: Exception) {
            call.reject(e.message, e)
        }
    }

    /** Associate (system dialog, once) and observe the bike's presence. */
    @PluginMethod
    fun enable(call: PluginCall) {
        if (!backgroundSyncSupported(context)) return call.reject("Requires Android 12 or later")
        if (pending != null) return call.reject("An association is already in progress")
        val address = try {
            BikeSyncProtocol.normalizeAddress(call.getString("deviceId") ?: "")
        } catch (e: IllegalArgumentException) {
            return call.reject(e.message)
        }
        val previous = BikeSync.prefs(context).getString(BikeSync.DEVICE_KEY, null)
        if (previous != null && previous != address) BikeCompanion.remove(context, previous)
        try {
            if (BikeCompanion.observe(context, address)) return call.resolve(JSObject().put("associated", true))
            pending = Pending(call, address)
            val manager = context.getSystemService(CompanionDeviceManager::class.java)
            val request = BikeCompanion.associationRequest(address)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                manager.associate(request, context.mainExecutor, associationCallback())
            } else {
                @Suppress("DEPRECATION")
                manager.associate(request, associationCallback(), main)
            }
            main.postDelayed(discoveryTimeout, DISCOVERY_TIMEOUT_MS)
        } catch (e: RuntimeException) {
            fail(e.message ?: e.javaClass.simpleName)
        }
    }

    @PluginMethod
    fun disable(call: PluginCall) {
        BikeSync.prefs(context).getString(BikeSync.DEVICE_KEY, null)?.let {
            if (backgroundSyncSupported(context)) BikeCompanion.remove(context, it)
        }
        BikeSync.clear(context)
        BikeAutoOpen.clearNotification(context)
        call.resolve()
    }

    private fun associationCallback() = object : CompanionDeviceManager.Callback() {
        // API 33+ routes onAssociationPending here by default.
        @Deprecated("Still the API 31-32 entry point")
        override fun onDeviceFound(intentSender: IntentSender) {
            val p = pending ?: return
            if (p.chooserShown) return
            p.chooserShown = true
            main.removeCallbacks(discoveryTimeout)
            try {
                activity.startIntentSenderForResult(intentSender, REQUEST_ASSOCIATE, null, 0, 0, 0)
            } catch (e: IntentSender.SendIntentException) {
                fail(e.message ?: "Could not open the association dialog")
            }
        }

        override fun onAssociationCreated(associationInfo: AssociationInfo) {
            complete(associationInfo.deviceMacAddress?.toString())
        }

        override fun onFailure(error: CharSequence?) {
            fail(error?.toString() ?: "Association failed")
        }
    }

    @Deprecated("Capacitor routes legacy request codes here")
    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_ASSOCIATE) return
        if (resultCode != Activity.RESULT_OK) return fail("Association cancelled")
        complete(resultAddress(data))
    }

    private fun resultAddress(data: Intent?): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return data?.getParcelableExtra(CompanionDeviceManager.EXTRA_ASSOCIATION, AssociationInfo::class.java)
                ?.deviceMacAddress?.toString()
        }
        @Suppress("DEPRECATION")
        return (data?.getParcelableExtra<ScanResult>(CompanionDeviceManager.EXTRA_DEVICE))?.device?.address
    }

    /** Both the callback and the activity result land here; the first one wins. */
    private fun complete(approved: String?, attempt: Int = 0) {
        val p = pending ?: return
        if (approved != null && !approved.equals(p.address, ignoreCase = true)) {
            BikeCompanion.remove(context, approved)
            return fail("Android associated a different device ($approved)")
        }
        // The association can take a moment to become visible to observe().
        val observed = try {
            BikeCompanion.observe(context, p.address)
        } catch (e: RuntimeException) {
            return fail(e.message ?: e.javaClass.simpleName)
        }
        if (!observed) {
            if (attempt >= 20) return fail("Association not saved yet — try again")
            main.postDelayed({ if (pending === p) complete(null, attempt + 1) }, 100)
            return
        }
        pending = null
        main.removeCallbacks(discoveryTimeout)
        p.call.resolve(JSObject().put("associated", true))
    }

    private fun fail(message: String) {
        val p = pending ?: return
        pending = null
        main.removeCallbacks(discoveryTimeout)
        p.call.reject(message)
    }

    companion object {
        const val REQUEST_ASSOCIATE = 7301
        private const val DISCOVERY_TIMEOUT_MS = 45_000L
    }
}
