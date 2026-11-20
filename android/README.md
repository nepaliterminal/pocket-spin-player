# Pocket Spin for Android

A sideloadable, test-signed APK for Android 7.0+ (API 24). The APK is the iPod player itself: the click-wheel UI from `dist/` is bundled inside it and runs in a full-screen WebView. Nothing is loaded from the hosted Site.

## Install and use

1. If an older Pocket Spin (the Chrome Custom Tab version) is installed, uninstall it first; this build has a different signing key.
2. Transfer the APK to your phone and open it. Android may ask you to allow installs from that source.
3. Open Pocket Spin and tap **Sign in with Spotify**. Spotify's login page opens inside the app; after you agree, you land back on the iPod.
4. Browse with the wheel and press Play. Android Back works like MENU; on the home menu it leaves the app.

Spotify Premium and internet access are required. If the Spotify app is in Development Mode, your Spotify account must be listed under the app's **User Management**.

## How sign-in and audio work

- Sign-in uses Authorization Code + PKCE with the built-in Client ID. The redirect URI is the existing Site URL `https://pocket-spin-player.upperstork16.chatgpt.site/` (trailing slash), which must stay registered in the Spotify dashboard. The app answers that address from its own bundled files, so the Spotify redirect returns into the app and never reaches the Site.
- Use email/password, Facebook or Apple on the Spotify login page. Google blocks its sign-in inside embedded WebViews.
- Audio plays through the Spotify app on the phone via Spotify Connect (Spotify's Web Playback SDK does not support Android). Pocket Spin only ever picks a phone, never a computer or speaker; pressing Play opens the Spotify app when it is not running yet; come back and press Play again.
- Tokens stay in the app's WebView storage. There is no client secret in the APK.

## Build without dependency downloads

Requires JDK 17+, SDK Build Tools 36.0.0, and the android-37.0 compile platform. Target SDK is 36, minimum SDK 24. Only framework APIs are used.

```sh
bash android/build.sh /absolute/android-sdk /absolute/jdk /absolute/Pocket-Spin.apk
```

The script copies `dist/` into the APK's assets, compiles Java, packages resources and DEX, aligns, signs and verifies the APK. The generated local test key is excluded from Git; keep it to sign compatible updates. Use a separately managed production key before public distribution.
