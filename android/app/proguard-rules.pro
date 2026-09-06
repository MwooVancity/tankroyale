# Capacitor — keep plugin bridge classes intact
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PluginMethod public *;
}

# Google Sign-In / Google Auth
-keep class com.google.android.gms.** { *; }
-keep class com.google.gson.** { *; }
-keepattributes Signature
-keepattributes *Annotation*

# AdMob
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.ads.**

# Capgo OTA updater
-keep class ee.forgr.capacitor_updater.** { *; }

# WebView JavaScript interface (Capacitor bridge)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX WebKit (WebSettingsCompat for force-dark, WebViewCompat)
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**

# Google Auth plugin (codetrix-studio)
-keep class com.codetrixstudio.capacitor.GoogleAuth.** { *; }

# Splash screen (AndroidX core-splashscreen)
-keep class androidx.core.splashscreen.** { *; }

# Preserve stack traces for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# R8 full mode: keep generic type signatures used by Gson/Capacitor reflection
-keepattributes InnerClasses
-keep class * extends java.lang.Enum { *; }
