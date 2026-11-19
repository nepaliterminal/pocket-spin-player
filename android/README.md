# Pocket Spin for Android

An installable, test-signed APK for Android 7.0+ (API 24). It opens the live Pocket Spin player in a Chrome Custom Tab, using the browser's existing protected-media support and OAuth. It is not an embedded WebView, offline music player, standalone native Spotify SDK implementation, or Play Store release.

## Install and use

1. Transfer the APK to your Android phone and open it. Android may ask you to allow installation from that source.
2. Keep Chrome enabled and updated.
3. Open Pocket Spin, sign in to the private Site with its owner account, and connect Spotify if needed.
4. Tap **Fullscreen** inside the player. **Exit fullscreen** or Android Back exits it. If the browser rejects fullscreen, the player-only layout still fits the viewport; **Show page** restores the normal page.

The APK opens the existing private Site. It does not change sharing. Spotify Premium, developer-mode account access, internet connectivity, and a compatible protected-media browser remain required. The Spotify redirect URL remains the exact HTTPS Site URL with its trailing slash, not a custom Android scheme. The APK contains no client secret or saved user tokens.

Fullscreen needs a user gesture. Login pages retain their browser security UI. This is deliberately not claimed as an automatically fullscreen Trusted Web Activity: that requires publicly reachable domain verification, which is not guaranteed on an owner-private Site.

## Build without dependency downloads

Requires JDK 17+ (tested with Android Studio's JDK 25), SDK Build Tools 36.0.0, and installed compile platform android-37.0. Target SDK is 36, minimum SDK 24. This small companion uses only framework APIs.

```sh
bash android/build.sh /absolute/android-sdk /absolute/jdk /absolute/Pocket-Spin.apk
```

The script compiles Java, packages resources and DEX, aligns the APK, signs it, and verifies signatures. The generated local test key is excluded from Git. Keep it to sign compatible updates; losing it requires uninstalling the old app before installing a differently signed build. Use a separately managed production key before public distribution or Play Store submission.

No Android device was attached during the initial build. Signature/package validation does not establish on-device playback compatibility.
