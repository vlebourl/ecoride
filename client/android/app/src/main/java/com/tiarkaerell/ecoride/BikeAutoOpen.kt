package com.tiarkaerell.ecoride

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.annotation.RequiresApi

/** Hands off to the UI only after the native GATT transaction has closed. */
internal object BikeAutoOpen {
    const val PREF_KEY = "auto_open"
    private const val CHANNEL = "bike_detected"
    private const val NOTIFICATION_ID = 7302
    private const val COOLDOWN_MS = 30_000L
    private var lastPresentation: Long? = null

    fun clearNotification(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
    }

    @RequiresApi(31)
    fun afterSync(context: Context, address: String) {
        val prefs = BikeSync.prefs(context)
        if (BikeSync.foreground || !prefs.getBoolean(PREF_KEY, false) ||
            !address.equals(prefs.getString(BikeSync.DEVICE_KEY, null), ignoreCase = true)
        ) return

        val now = SystemClock.elapsedRealtime()
        // A fresh advertisement can follow a GATT disconnect.
        if (lastPresentation?.let { now - it < COOLDOWN_MS } == true) return
        lastPresentation = now

        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val interactive = context.getSystemService(PowerManager::class.java).isInteractive
        val locked = context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
        if (interactive && !locked) {
            try {
                context.startActivity(intent)
                return
            } catch (e: RuntimeException) {
                Log.w(BikeSync.TAG, "Could not bring ecoRide to the foreground", e)
            }
        }

        val notifications = context.getSystemService(NotificationManager::class.java)
        if (!notifications.areNotificationsEnabled()) return
        notifications.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.bike_detected_channel), NotificationManager.IMPORTANCE_DEFAULT),
        )
        val open = PendingIntent.getActivity(context, NOTIFICATION_ID, intent, PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle(context.getString(R.string.bike_detected_title))
            .setContentText(context.getString(R.string.bike_detected_body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setTimeoutAfter(5 * 60_000L)
            .build()
        notifications.notify(NOTIFICATION_ID, notification)
    }
}
