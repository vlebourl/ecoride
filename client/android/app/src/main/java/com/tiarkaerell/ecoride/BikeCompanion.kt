package com.tiarkaerell.ecoride

import android.bluetooth.le.ScanFilter
import android.companion.AssociationInfo
import android.companion.AssociationRequest
import android.companion.BluetoothLeDeviceFilter
import android.companion.CompanionDeviceManager
import android.companion.CompanionDeviceService
import android.companion.DevicePresenceEvent
import android.companion.ObservingDevicePresenceRequest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Companion Device Manager side of the background sync (Android 12+): the
 * association is what lets Android wake a killed app when the bike starts
 * advertising, and exempts it from background-start limits. It is not a bond.
 */
@RequiresApi(Build.VERSION_CODES.S)
internal object BikeCompanion {
    private const val TYPED_PRESENCE_API = 36

    private fun manager(context: Context) = context.getSystemService(CompanionDeviceManager::class.java)

    /** Exact MAC, single device: the system dialog names this bike only. */
    fun associationRequest(address: String): AssociationRequest = AssociationRequest.Builder()
        .addDeviceFilter(
            BluetoothLeDeviceFilter.Builder()
                .setScanFilter(ScanFilter.Builder().setDeviceAddress(address).build())
                .build(),
        )
        .setSingleDevice(true)
        .build()

    @Suppress("DEPRECATION")
    fun isAssociated(context: Context, address: String): Boolean =
        manager(context).associations.any { it.equals(address, ignoreCase = true) }

    /** Start presence observation and remember the bike. False if not associated (yet). */
    fun observe(context: Context, address: String): Boolean {
        if (!isAssociated(context, address)) return false
        val m = manager(context)
        if (Build.VERSION.SDK_INT >= TYPED_PRESENCE_API) {
            val request = observingRequest(context, address) ?: return false
            m.startObservingDevicePresence(request)
        } else {
            @Suppress("DEPRECATION")
            m.startObservingDevicePresence(address)
        }
        BikeSync.prefs(context).edit().putString(BikeSync.DEVICE_KEY, address).apply()
        Log.d(BikeSync.TAG, "observing presence of $address (API ${Build.VERSION.SDK_INT})")
        return true
    }

    /** Re-register after boot, an update, or an app start. Never throws. */
    fun restore(context: Context) {
        val address = BikeSync.prefs(context).getString(BikeSync.DEVICE_KEY, null) ?: return
        try {
            if (!observe(context, address)) Log.w(BikeSync.TAG, "association for $address is gone")
        } catch (e: RuntimeException) {
            Log.w(BikeSync.TAG, "presence restore failed: ${e.message}")
        }
    }

    fun remove(context: Context, address: String) {
        val m = manager(context)
        runCatching {
            if (Build.VERSION.SDK_INT >= TYPED_PRESENCE_API) {
                observingRequest(context, address)?.let(m::stopObservingDevicePresence)
            } else {
                @Suppress("DEPRECATION")
                m.stopObservingDevicePresence(address)
            }
        }
        @Suppress("DEPRECATION")
        runCatching { m.disassociate(address) }
    }

    @RequiresApi(TYPED_PRESENCE_API)
    private fun observingRequest(context: Context, address: String): ObservingDevicePresenceRequest? {
        val id = manager(context).myAssociations
            .firstOrNull { it.deviceMacAddress?.toString().equals(address, ignoreCase = true) }
            ?.id ?: return null
        return ObservingDevicePresenceRequest.Builder().setAssociationId(id).build()
    }

    @RequiresApi(TYPED_PRESENCE_API)
    fun addressOf(context: Context, associationId: Int): String? =
        manager(context).myAssociations.firstOrNull { it.id == associationId }?.deviceMacAddress?.toString()
}

/** Android 12+ and a companion-capable phone; minSdk is 24. */
internal fun backgroundSyncSupported(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_COMPANION_DEVICE_SETUP)

/** Bound by the system while the associated bike is in range. */
@RequiresApi(Build.VERSION_CODES.S)
class BikeCompanionService : CompanionDeviceService() {
    // Each API level calls a different overload; the SDK guards keep one
    // appearance from starting two transactions.
    @Deprecated("API 31-32 callback")
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onDeviceAppeared(address: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) appeared(address, "address")
    }

    @Deprecated("API 33-35 callback")
    @Suppress("OVERRIDE_DEPRECATION")
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    override fun onDeviceAppeared(associationInfo: AssociationInfo) {
        if (Build.VERSION.SDK_INT >= 36) return
        associationInfo.deviceMacAddress?.toString()?.let { appeared(it, "association") }
    }

    @RequiresApi(36)
    override fun onDevicePresenceEvent(event: DevicePresenceEvent) {
        Log.d(BikeSync.TAG, "presence event ${event.event} association ${event.associationId}")
        if (event.event != DevicePresenceEvent.EVENT_BLE_APPEARED) return
        BikeCompanion.addressOf(this, event.associationId)?.let { appeared(it, "presence event") }
    }

    private fun appeared(address: String, source: String) = BikeSync.synchronize(this, address, source)
}

/** Presence observation does not survive a reboot or an app update. */
class BikeSyncBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (backgroundSyncSupported(context)) BikeCompanion.restore(context)
    }
}
