import { readJson, pickDevice, remoteState } from './core.mjs';

export const DEFAULT_CLIENT_ID = '52465c9af39448d084401984ce00ec51';
const CONFIG_KEY = 'pocket-spin-config-v1';
const TOKEN_KEY = 'pocket-spin-token-v1';
const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-recently-played playlist-read-private playlist-read-collaborative';
const SESSION_KEY = 'pocket-spin-oauth-v2';
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(48)));
let sdkPromise;

export class SpotifyClient {
  constructor({storage = localStorage, session = sessionStorage, request = fetch, now = Date.now, onLogout = () => {}} = {}) {
    this.storage = storage; this.session = session; this.request = request; this.now = now;
    this.onLogout = onLogout;
    this.config = readJson(storage, CONFIG_KEY, {});
    if (!this.config?.clientId) this.config = {...this.config, clientId: DEFAULT_CLIENT_ID};
    this.token = readJson(storage, TOKEN_KEY, null);
    if (!this.token?.access_token) this.token = null;
    this.generation = 0; this.refreshing = null; this.retryAt = 0;
  }
  saveToken(data) {
    if (!data?.access_token || !Number.isFinite(data.expires_in)) throw new Error('Spotify returned an incomplete session. Please sign in again.');
    this.token = {...this.token, ...data, expires_at: this.now() + data.expires_in * 1000};
    try { this.storage.setItem(TOKEN_KEY, JSON.stringify(this.token)); } catch { /* Session works in memory if persistence is blocked. */ }
  }
  logout() {
    this.generation++; this.token = null; this.refreshing = null; this.retryAt = 0;
    try { this.storage.removeItem(TOKEN_KEY); } catch { /* Storage may be disabled. */ }
    try { this.onLogout(); } catch { /* cleanup must not mask the logout error */ }
  }
  async fetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    // Browser fetch must not be invoked with this client as its receiver.
    const request = this.request;
    try { return await request(url, {...options, signal: controller.signal}); }
    catch (error) { throw new Error(error.name === 'AbortError' ? 'Spotify took too long to respond. Please try again.' : 'Cannot reach Spotify. Check your connection and try again.'); }
    finally { clearTimeout(timer); }
  }
  async accessToken(force = false) {
    if (!this.token) throw new Error('Sign in to Spotify from Setup to play your music.');
    if (!force && this.now() < this.token.expires_at - 60000) return this.token.access_token;
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    this.refreshing = (async () => {
      if (!this.token.refresh_token || !this.config.clientId) { this.logout(); throw new Error('Your session expired. Please sign in again from Setup.'); }
      const response = await this.fetch('https://accounts.spotify.com/api/token', {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:this.config.clientId, grant_type:'refresh_token', refresh_token:this.token.refresh_token})
      });
      if (generation !== this.generation) throw new Error('Session changed. Please sign in again.');
      if (!response.ok) {
        if ([400, 401].includes(response.status)) this.logout();
        throw new Error('Could not renew your Spotify session. Try again or reconnect in Setup.');
      }
      const data = await response.json();
      if (generation !== this.generation) throw new Error('Session changed.');
      this.saveToken(data); return this.token.access_token;
    })();
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }
  async api(path, options = {}, retry = true) {
    if (this.now() < this.retryAt) throw new Error(`Spotify is busy. Try again in ${Math.ceil((this.retryAt - this.now()) / 1000)} seconds.`);
    const generation = this.generation;
    const access = await this.accessToken();
    const response = await this.fetch('https://api.spotify.com/v1' + path, {
      ...options, headers:{...options.headers, Authorization:`Bearer ${access}`}
    });
    if (generation !== this.generation) throw new Error('Session changed.');
    const playlistPath = /^\/(me\/playlists|playlists\/)/.test(path);
    if (/^\/playlists\//.test(path) && response.status === 403) throw new Error('Spotify only shares songs from playlists you own or collaborate on with this app. If this is your playlist, sign in again from Spotify Setup.');
    if (playlistPath && (response.status === 403 || (response.status === 401 && !retry))) throw new Error('Sign in again from Spotify Setup to allow access to your playlists.');
    if (playlistPath && response.status === 404) throw Object.assign(new Error('This playlist is not available. Please try again.'), {status:404});
    if (response.status === 401 && retry) { await this.accessToken(true); return this.api(path, options, false); }
    if (response.status === 429) {
      const delay = Number(response.headers.get('Retry-After')) || 30;
      this.retryAt = this.now() + delay * 1000;
      throw new Error(`Spotify rate limit reached. Try again in ${delay} seconds.`);
    }
    if (response.status === 403) throw new Error('Spotify denied access. Check Premium, your app’s allowed users, and permissions in Setup.');
    if (response.status === 401) { this.logout(); throw new Error('Your session expired. Please sign in again from Setup.'); }
    if (response.status === 404) throw new Error('The Spotify player is not available yet. Reconnect the player in Setup.');
    if (!response.ok) throw new Error(`Spotify could not complete that request (${response.status}). Please try again.`);
    return response.status === 204 ? null : response.json();
  }
  async login(clientId, redirect) {
    if (!/^[a-f\d]{32}$/i.test(clientId)) throw new Error('Enter the 32-character Client ID from your Spotify app settings.');
    const uri = new URL(redirect);
    if (uri.protocol !== 'https:' && !['127.0.0.1', '[::1]'].includes(uri.hostname)) throw new Error('Open this app over HTTPS, or use 127.0.0.1 for local setup.');
    const verifier = random(), state = random();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    this.config = {clientId};
    try {
      this.storage.setItem(CONFIG_KEY, JSON.stringify(this.config));
      this.session.setItem(SESSION_KEY, JSON.stringify({verifier, state, redirect, created:this.now()}));
    } catch { throw new Error('Browser storage is blocked. Allow it to sign in with Spotify.'); }
    return 'https://accounts.spotify.com/authorize?' + new URLSearchParams({client_id:clientId,
      response_type:'code', redirect_uri:redirect, scope:SCOPES, state, code_challenge_method:'S256', code_challenge:base64url(new Uint8Array(digest))});
  }
  async callback(search) {
    const query = new URLSearchParams(search);
    if (!query.has('code') && !query.has('error')) return false;
    const flow = readJson(this.session, SESSION_KEY, null);
    this.session.removeItem(SESSION_KEY);
    if (!flow?.state || !flow.verifier || query.get('state') !== flow.state || this.now() - flow.created > 600000) {
      throw new Error('This sign-in link expired or belongs to another tab. Start again from Setup.');
    }
    if (query.has('error')) throw new Error('Spotify sign-in was cancelled. You can try again from Setup.');
    const response = await this.fetch('https://accounts.spotify.com/api/token', {method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:this.config.clientId, grant_type:'authorization_code',
        code:query.get('code'), code_verifier:flow.verifier, redirect_uri:flow.redirect})});
    if (!response.ok) throw new Error('Spotify sign-in failed. Check your exact redirect URL and try again.');
    this.saveToken(await response.json()); return true;
  }
}

export function loadSdk() {
  if (window.Spotify?.Player) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timer); script.remove(); sdkPromise = null; reject(new Error('Spotify’s audio player could not load. Try reconnecting in Setup.')); };
    const timer = setTimeout(fail, 15000);
    window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(timer); resolve(window.Spotify); };
    script.src = 'https://sdk.scdn.co/spotify-player.js'; script.onerror = fail; document.head.appendChild(script);
  });
  return sdkPromise;
}

// Controls the Spotify app (or another Connect device) through the Web API when in-app audio is unavailable.
export async function remotePlayer(client) {
  const device = pickDevice((await client.api('/me/player/devices'))?.devices);
  if (!device) return null;
  const id = encodeURIComponent(device.id);
  let playing = false;
  const getCurrentState = async () => {
    const state = remoteState(await client.api('/me/player'));
    playing = !!state && !state.paused;
    return state;
  };
  return {remote:true, deviceId:device.id, name:device.name,
    togglePlay:async () => { await getCurrentState(); await client.api(`/me/player/${playing ? 'pause' : 'play'}?device_id=${id}`, {method:'PUT'}); },
    nextTrack:() => client.api(`/me/player/next?device_id=${id}`, {method:'POST'}),
    previousTrack:() => client.api(`/me/player/previous?device_id=${id}`, {method:'POST'}),
    seek:ms => client.api(`/me/player/seek?position_ms=${Math.round(ms)}&device_id=${id}`, {method:'PUT'}),
    setVolume:level => client.api(`/me/player/volume?volume_percent=${Math.round(level * 100)}&device_id=${id}`, {method:'PUT'}),
    getCurrentState, disconnect() {}};
}
