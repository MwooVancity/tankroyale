package app.tankroyale;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

// Save-migration bridge (Unity PLAN E12, PM 2026-11-11). The WebView's
// localStorage is unreadable to the Unity build that replaces this app, so
// src/game/saveBridge.ts mirrors every save key here on launch and whenever
// the app goes to the background. SharedPreferences file "tankroyale_bridge":
// one string entry per localStorage key (same name, same value), plus
// __bridge_schema (int) and __bridge_ts (long, ms epoch). Keys starting with
// "__" other than ours (e.g. Unity's migrated marker) are never touched.
@CapacitorPlugin(name = "SaveBridge")
public class SaveBridgePlugin extends Plugin {
    static final String PREFS = "tankroyale_bridge";

    @PluginMethod
    public void write(PluginCall call) {
        JSObject entries = call.getObject("entries");
        if (entries == null) { call.reject("entries required"); return; }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = prefs.edit();
        Set<String> live = new HashSet<>();
        Iterator<String> keys = entries.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            if (k.startsWith("__")) continue;
            live.add(k);
            ed.putString(k, entries.optString(k, ""));
        }
        // A key the game deleted (e.g. a reset camo) must not come back in Unity.
        for (String k : prefs.getAll().keySet()) {
            if (!k.startsWith("__") && !live.contains(k)) ed.remove(k);
        }
        ed.putInt("__bridge_schema", call.getInt("schema", 1));
        ed.putLong("__bridge_ts", System.currentTimeMillis());
        ed.apply();
        JSObject r = new JSObject();
        r.put("written", live.size());
        call.resolve(r);
    }
}
