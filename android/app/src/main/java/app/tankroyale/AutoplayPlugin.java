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
        if (i != null && (TEST_LOOP.equals(i.getAction()) || i.getBooleanExtra("autoplay", false))) {
            scenario = i.getIntExtra("scenario", 1);
        }
        JSObject r = new JSObject();
        r.put("scenario", scenario);
        call.resolve(r);
    }

    @PluginMethod
    public void finish(PluginCall call) {
        String json = call.getString("json", "{}");
        Log.i("Autoplay", json);
        Intent i = getActivity().getIntent();
        Uri out = i == null ? null : i.getData();
        if (out != null) {
            try (OutputStream o = getContext().getContentResolver().openOutputStream(out)) {
                if (o != null) o.write(json.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) { Log.w("Autoplay", "results file: " + e); }
        }
        call.resolve();
        // Game Loop ends when the activity finishes; a local run keeps the game open.
        if (i != null && TEST_LOOP.equals(i.getAction())) getActivity().finish();
    }
}
