package com.tiarkaerell.ecoride;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Drops a stale Android bond with the bike. The Super73 display keeps its own
 * bond table; once it forgets this phone (re-paired elsewhere, reset), Android
 * still offers the old key, encryption fails, and every encrypted read times
 * out. Android has no public API for this: BluetoothDevice.removeBond() is
 * hidden, hence the reflection. BLUETOOTH_CONNECT is already granted by the
 * bluetooth-le plugin before any connection.
 */
@CapacitorPlugin(name = "Super73Bond")
public class Super73BondPlugin extends Plugin {

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void removeBond(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId required");
            return;
        }
        try {
            BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter adapter = manager.getAdapter();
            BluetoothDevice device = adapter.getRemoteDevice(deviceId);
            boolean removed = device.getBondState() == BluetoothDevice.BOND_NONE
                || (Boolean) device.getClass().getMethod("removeBond").invoke(device);
            JSObject result = new JSObject();
            result.put("removed", removed);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("removeBond failed: " + e.getMessage(), e);
        }
    }
}
