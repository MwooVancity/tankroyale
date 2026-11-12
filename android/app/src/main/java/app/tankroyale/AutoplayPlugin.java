package app.tankroyale;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

// Self-test autoplay (src/game/autoplay.ts). Scenario from Test Lab's / Play
// pre-launch's Game Loop intent, or `--ez autoplay true --ei scenario N` locally.
// A normal launch returns 0 and the game never autoplays.
@CapacitorPlugin(name = "Autoplay")
public class AutoplayPlugin extends Plugin {
    static final String TEST_LOOP = "com.google.intent.action.TEST_LOOP";

    @PluginMethod
    public void get(PluginCall call) {
        Intent i = getActivity().getIntent();
        int scenario = 0;
        // RC3 QA blocker (2026-11-12): MainActivity is exported, so any app could
        // start autoplay with a plain extra. Release builds: Game Loop action only.
        if (i != null && (TEST_LOOP.equals(i.getAction())
                || (debuggable() && i.getBooleanExtra("autoplay", false)))) {
            scenario = i.getIntExtra("scenario", 1);
        }
        JSObject r = new JSObject();
        r.put("scenario", scenario);
        // Optional fixed map (`--es map monsoon`) so a run compares like with like.
        String map = i == null ? null : i.getStringExtra("map");
        if (map != null && map.matches("[a-z0-9-]{1,32}")) r.put("map", map);
        // Local runs only (`--ez lite true`): play the budget-phone (Lite) way on any GPU.
        if (scenario > 0 && i.getBooleanExtra("lite", false)) r.put("lite", true);
        // Local soak only (`--ei battles 40`): more than the Game Loop's 3 battles, capped.
        int battles = i == null ? 0 : i.getIntExtra("battles", 0);
        if (scenario > 0 && battles > 0) r.put("battles", Math.min(battles, 60));
        call.resolve(r);
    }

    @PluginMethod
    public void finish(PluginCall call) {
        String json = call.getString("json", "{}");
        Log.i("Autoplay", json);
        Intent i = getActivity().getIntent();
        Uri out = i == null || !TEST_LOOP.equals(i.getAction()) ? null : i.getData();
        if (out != null && !safeResultsUri(out)) {
            Log.w("Autoplay", "results file refused: " + out);
            out = null;
        }
        if (out != null) {
            try (OutputStream o = getContext().getContentResolver().openOutputStream(out)) {
                if (o != null) o.write(json.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) { Log.w("Autoplay", "results file: " + e); }
        }
        call.resolve();
        // Game Loop ends when the activity finishes; a local run keeps the game open.
        if (i != null && TEST_LOOP.equals(i.getAction())) getActivity().finish();
    }

    // The results address comes from the launching app, so it must never point
    // into this app's private storage (save files, shared_prefs, the Unity bridge).
    // content:// goes through the provider's own permission checks; file:// is
    // canonicalised so "../" cannot climb back into the data dir.
    // AGP 8 generates no BuildConfig here; the manifest flag is the same truth.
    boolean debuggable() {
        return (getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    boolean safeResultsUri(Uri u) {
        String scheme = u.getScheme();
        if ("content".equals(scheme)) return !getContext().getPackageName().equals(u.getAuthority());
        if (!"file".equals(scheme) || u.getPath() == null) return false;
        try {
            String path = new java.io.File(u.getPath()).getCanonicalPath();
            String data = getContext().getApplicationInfo().dataDir;
            String[] own = { new java.io.File(data).getCanonicalPath(), "/data/data/" + getContext().getPackageName(),
                "/data/user/", "/data/user_de/" };
            for (String p : own) if (path.startsWith(p)) return false;
            return true;
        } catch (java.io.IOException e) { return false; }
    }
}
