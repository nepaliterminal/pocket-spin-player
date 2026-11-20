package io.github.nepaliterminal.pocketspin;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * The iPod player itself: the bundled UI in assets/www runs in a WebView.
 * Requests to APP_HOST are answered from the APK and never reach the network,
 * so Spotify's registered redirect URL lands back inside the app.
 */
public final class MainActivity extends Activity {
    static final String APP_HOST = "pocket-spin-player.upperstork16.chatgpt.site";
    private static final String APP_URL = "https://" + APP_HOST + "/?app=1";
    private static final String SPOTIFY_PACKAGE = "com.spotify.music";
    private WebView web;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(16, 19, 21));
        window.setNavigationBarColor(Color.rgb(16, 19, 21));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(16, 19, 21));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new Bridge(), "PocketSpinAndroid");
        web.setWebViewClient(new PlayerClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                boolean ours = APP_HOST.equals(request.getOrigin().getHost());
                for (String resource : request.getResources()) {
                    if (ours && PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(resource)) {
                        request.grant(new String[] {PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID});
                        return;
                    }
                }
                request.deny();
            }
        });
        setContentView(web);
        // Android 13+ with predictive Back no longer calls onBackPressed for target SDK 36.
        if (Build.VERSION.SDK_INT >= 33)
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        hideSystemBars();
        if (savedState == null || web.restoreState(savedState) == null) web.loadUrl(APP_URL);
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // Music keeps playing in the background, so the WebView is not paused here.
    @Override protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        Uri current = Uri.parse(String.valueOf(web.getUrl()));
        if (!APP_HOST.equals(current.getHost())) {
            if (web.canGoBack()) web.goBack(); else web.loadUrl(APP_URL);
            return;
        }
        web.evaluateJavascript("window.pocketSpinBack ? window.pocketSpinBack() : false", result -> {
            if (!"true".equals(result)) moveTaskToBack(true);
        });
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    private boolean openExternal(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(intent); return true; }
        catch (ActivityNotFoundException missing) { return false; }
    }

    private final class PlayerClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            Uri uri = request.getUrl();
            String scheme = String.valueOf(uri.getScheme());
            String host = String.valueOf(uri.getHost());
            if (APP_HOST.equals(host)) {
                // Server redirects (Spotify's OAuth return) skip shouldInterceptRequest; reload locally.
                if (request.isRedirect()) { view.loadUrl(uri.toString()); return true; }
                return false;
            }
            if ("https".equals(scheme) && !"open.spotify.com".equals(host)) return false;
            if (!openExternal(uri)) Toast.makeText(MainActivity.this, "No app can open that link.", Toast.LENGTH_SHORT).show();
            return true;
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!APP_HOST.equals(uri.getHost())) return null;
            return asset(getAssets(), uri.getPath());
        }
    }

    static WebResourceResponse asset(AssetManager assets, String path) {
        if (path == null || path.isEmpty() || path.endsWith("/")) path = (path == null ? "/" : path) + "index.html";
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("Access-Control-Allow-Origin", "https://" + APP_HOST);
        if (path.contains("..")) return missing(headers);
        try {
            InputStream body = assets.open("www" + path);
            return new WebResourceResponse(mime(path), "utf-8", 200, "OK", headers, body);
        } catch (IOException notBundled) {
            return missing(headers);
        }
    }

    private static WebResourceResponse missing(Map<String, String> headers) {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
            new ByteArrayInputStream("Not found".getBytes()));
    }

    static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    /** Exposed to page scripts as window.PocketSpinAndroid; every method is harmless to call. */
    private final class Bridge {
        @JavascriptInterface public boolean isApp() { return true; }

        @JavascriptInterface public boolean hasSpotifyApp() {
            return getPackageManager().getLaunchIntentForPackage(SPOTIFY_PACKAGE) != null;
        }

        @JavascriptInterface public void openSpotify() {
            runOnUiThread(() -> {
                Intent launch = getPackageManager().getLaunchIntentForPackage(SPOTIFY_PACKAGE);
                if (launch != null) { startActivity(launch); return; }
                if (!openExternal(Uri.parse("market://details?id=" + SPOTIFY_PACKAGE)))
                    openExternal(Uri.parse("https://play.google.com/store/apps/details?id=" + SPOTIFY_PACKAGE));
            });
        }
    }
}
