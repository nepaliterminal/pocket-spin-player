package io.github.nepaliterminal.pocketspin;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * A minimal browser-backed Android companion. Chrome owns cookies, OAuth and
 * protected audio. The APK never reads credentials or embeds a WebView.
 */
public final class MainActivity extends Activity {
    private static final String PLAYER_URL =
        "https://pocket-spin-player.upperstork16.chatgpt.site/?app=1";
    private static final String CHROME = "com.android.chrome";

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setBackgroundColor(Color.rgb(16, 19, 21));
        int padding = Math.round(28 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding * 2, padding, padding * 2);
        TextView title = new TextView(this);
        title.setText("Pocket Spin");
        title.setTextSize(32);
        title.setTextColor(Color.rgb(195, 255, 62));
        title.setGravity(Gravity.CENTER);
        content.addView(title);
        TextView description = new TextView(this);
        description.setText("Your music, with a spin.\n\nOpens the live player in Chrome. Tap Fullscreen in the player to hide browser controls.\n\nSign in to the private site, then connect Spotify. Premium and internet access are required.");
        description.setTextSize(16);
        description.setTextColor(Color.LTGRAY);
        description.setGravity(Gravity.CENTER);
        description.setPadding(0, padding, 0, padding);
        content.addView(description);
        Button open = new Button(this);
        open.setText("Open Pocket Spin");
        open.setOnClickListener(view -> openPlayer());
        content.addView(open);
        setContentView(content);
        // Do not reopen the browser when Back returns to this activity.
        if (savedState == null) openPlayer();
    }

    private void openPlayer() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(PLAYER_URL));
        Bundle extras = new Bundle();
        // The documented Custom Tabs protocol allows a null session binder.
        extras.putBinder("android.support.customtabs.extra.SESSION", null);
        extras.putInt("android.support.customtabs.extra.TOOLBAR_COLOR", Color.rgb(16, 19, 21));
        extras.putBoolean("android.support.customtabs.extra.ENABLE_URLBAR_HIDING", true);
        extras.putInt("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
        intent.putExtras(extras);
        try {
            if (getPackageManager().getApplicationInfo(CHROME, 0).enabled) intent.setPackage(CHROME);
        } catch (PackageManager.NameNotFoundException ignored) {
            // A standard HTTPS browser is a safe fallback; no embedded login.
        }
        try { startActivity(intent); }
        catch (ActivityNotFoundException error) {
            intent.setPackage(null);
            try { startActivity(intent); }
            catch (ActivityNotFoundException missingBrowser) {
                Toast.makeText(this, "Install or enable Chrome, then tap Open Pocket Spin.", Toast.LENGTH_LONG).show();
            }
        }
    }
}
