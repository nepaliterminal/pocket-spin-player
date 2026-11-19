# Pocket Spin

A nostalgic iPod Classic-inspired Spotify player for the browser. It pairs a tactile click-wheel interface with Spotify's Web API and Web Playback SDK.

## Features

- Fully keyboard-accessible click wheel with menus, play/pause, and track skipping
- A polished offline demo mode with a Now Playing screen and album art
- Spotify sign-in with Authorization Code + PKCE — no client secret is stored in the app
- Recently played tracks and artwork from the Spotify Web API
- An in-browser Spotify Connect device via the Web Playback SDK

## Run locally

Serve the `dist/` directory with any static file server. For example:

```sh
python3 -m http.server 4173 --directory dist
```

Open `http://127.0.0.1:4173/`.

## Connect Spotify

1. Create a Spotify app in the [Developer Dashboard](https://developer.spotify.com/dashboard).
2. Select **Web API** and **Web Playback SDK**.
3. Add your live app URL — including the trailing slash — as a Redirect URI. For local testing, use `http://127.0.0.1:4173/`.
4. In Pocket Spin, open **Spotify Setup**, paste the app's Client ID, then select **Sign in with Spotify**.

Spotify's Web Playback SDK requires a Premium account. Development Mode apps also have Spotify-imposed user and endpoint limits.

## Deploy to Vercel

Set the project root to this repository, choose **Other** as the Framework Preset, leave the Build Command blank, and set Output Directory to `dist`.

After deployment, add the exact Vercel production URL as a Spotify Redirect URI.

## Project structure

```
dist/
  index.html   # Interface shell
  style.css    # iPod-inspired visuals
  app.js       # Click wheel, demo state, OAuth PKCE, Web API, Playback SDK
```
