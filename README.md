# Pocket Spin

A nostalgic iPod Classic-inspired Spotify player for the browser. It pairs a tactile click-wheel interface with Spotify's Web API and Web Playback SDK.

## Features

- Fully keyboard-accessible click wheel with menus, play/pause, and track skipping
- A silent offline preview (demo mode does not stream audio)
- Spotify sign-in with Authorization Code + PKCE — no client secret is stored in the app
- Recently played tracks, Playlists (including private and collaborative playlists), song search, and highest-resolution available album artwork
- An in-browser Spotify Connect device via the Web Playback SDK
- Play/pause, actual selected-track playback, skipping, seeking, and volume
- Recoverable Spotify errors, refresh-token renewal, and rate-limit handling
- Fullscreen/player-only view that scales the entire iPod to fit the viewport
- A small installable Android companion APK using Chrome Custom Tabs

## Fullscreen and Android

Click **Fullscreen** at the top right. The side panel disappears and the whole player fits the display. Use **Exit fullscreen** or Escape to return. Browsers that deny fullscreen fall back to a player-only layout with a **Show page** exit. The Android companion starts in this layout and needs a tap on Fullscreen to hide browser controls.

See [Android build and installation](android/README.md). The APK uses the same private hosted Site and Spotify settings. It is test-signed for sideloading, not a Play Store release. It requires a compatible browser, internet, and the existing Site/Spotify permissions; it does not bundle a native or offline music engine.

References: [Spotify browser support](https://developer.spotify.com/documentation/web-playback-sdk), [Android Custom Tabs](https://developer.android.com/reference/androidx/browser/customtabs/CustomTabsIntent).

## Run locally

Serve the `dist/` directory with any static file server. For example:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4173/`.

## Connect Spotify

1. Create a Spotify app in the [Developer Dashboard](https://developer.spotify.com/dashboard).
2. Select **Web API** and **Web Playback SDK**.
3. Add your live app URL — including the trailing slash — as a Redirect URI. For local testing, use `http://127.0.0.1:4173/`.
4. In Pocket Spin, open **Spotify Setup**, paste the app's Client ID, then select **Sign in with Spotify**.

Spotify's Web Playback SDK requires a Premium account. Development Mode apps also have Spotify-imposed user and endpoint limits.

Open **Playlists** to browse your Spotify playlists and play songs in playlist order. Existing signed-in users must **sign in again** once from **Spotify Setup** to allow playlist access. Demo mode includes a silent sample playlist.

MENU goes back one screen; **Home menu** always returns to the main menu. Use the wheel, arrow keys, or clickable rows to browse. Center selects; the bottom wheel button or Space plays/pauses. Settings and long lists scroll inside the screen. Spotify playback state updates never replace a form you are typing in.

The app registers a Spotify Connect device without taking over playback on startup. Selecting a song starts playback on this browser; some browsers require a second Play click to authorize audio. If protected playback is unsupported, try a supported Chrome browser. Spotify must allow the account and requested scopes; this app cannot bypass Premium or developer-access restrictions.

Tokens stay in this browser's local storage and are never committed or sent to an app backend. Signing out clears this app's saved tokens. Do not use this on an untrusted shared browser.

## Checks

No dependency installation or build is required:

```sh
node --test tests/*.test.mjs
node --check dist/app.js
```

## Deploy to Vercel

Set the project root to this repository, choose **Other** as the Framework Preset, leave the Build Command blank, and set Output Directory to `dist`.

After deployment, add the exact Vercel production URL as a Spotify Redirect URI.

## Project structure

```
dist/
  index.html   # Interface shell
  style.css    # iPod-inspired visuals
  app.js       # Navigation, click wheel, playback UI and SDK lifecycle
  core.mjs     # Track normalization, full-resolution artwork, queue helpers
  spotify.mjs  # PKCE, session refresh, Web API, SDK loading
  fullscreen.mjs # Fullscreen API and responsive player-only mode
tests/
  player.test.mjs # Offline regression tests (no real credentials)
android/       # Dependency-free Android companion source/build script
```
