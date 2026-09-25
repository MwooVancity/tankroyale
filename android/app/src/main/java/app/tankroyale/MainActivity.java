package app.tankroyale;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on during gameplay — belt-and-suspenders with the JS wake lock
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        tuneWebView();

        // WebGL renderer can be killed under memory pressure. Without a handler
        // returning true, Android kills the whole app ("keeps stopping").
        // Recreate the activity instead so the player lands back in the game.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                recreate();
                return true;
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-apply sticky immersive mode whenever the window regains focus
        // (Android clears it on nav-bar auto-dismiss and on window transitions).
        if (hasFocus) applyImmersiveMode();
    }

    // ---------------------------------------------------------------------------
    // Immersive sticky — hides status + nav bar; swipe-in reveals them briefly
    // then auto-hides. Uses the non-deprecated WindowInsetsController on API 30+
    // with a legacy fallback for API 24-29.
    // ---------------------------------------------------------------------------
    @SuppressWarnings("deprecation")
    private void applyImmersiveMode() {
        View decorView = getWindow().getDecorView();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController ctrl = decorView.getWindowInsetsController();
            if (ctrl != null) {
                ctrl.hide(android.view.WindowInsets.Type.systemBars());
                ctrl.setSystemBarsBehavior(
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    // ---------------------------------------------------------------------------
    // WebView performance tuning — called once after Capacitor bridge init.
    // ---------------------------------------------------------------------------
    @SuppressWarnings("deprecation")
    private void tuneWebView() {
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        WebSettings settings = webView.getSettings();

        // High render priority — prevents OS from deprioritising WebView rendering
        // under memory pressure (deprecated but functional on all supported APIs).
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH);

        // Disable force-dark via reflection — avoids a hard androidx.webkit compile
        // dep while still firing on devices where WebSettingsCompat is available
        // (Capacitor pulls it transitively; the try/catch is the safety net).
        // Android's auto dark-mode applies a GPU inversion compositing pass on
        // WebViews. The game has its own dark theme; the pass burns GPU for nothing.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            try {
                Class<?> compat = Class.forName("androidx.webkit.WebSettingsCompat");
                Class<?> feat   = Class.forName("androidx.webkit.WebViewFeature");
                java.lang.reflect.Method isSupported =
                    feat.getMethod("isFeatureSupported", String.class);
                if (Boolean.TRUE.equals(isSupported.invoke(null, "FORCE_DARK"))) {
                    java.lang.reflect.Field offField = compat.getField("FORCE_DARK_OFF");
                    java.lang.reflect.Method setForceDark =
                        compat.getMethod("setForceDark", WebSettings.class, int.class);
                    setForceDark.invoke(null, settings, offField.get(null));
                }
            } catch (Exception ignored) { /* androidx.webkit not on classpath — skip */ }
        }

        // Allow audio without a preceding user gesture — required for background
        // music to start at the splash/garage screen on Android 9+.
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Force GPU compositing layer on the WebView surface — eliminates the
        // software-fallback path that can kick in when the view is first created.
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }
}
