export const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
export function setPageCursor(state, page, cursor) {
  if (state.page === page) state.cursor = cursor;
}
export function clampPageCursor(state, length) {
  state.cursor = clamp(state.cursor, 0, Math.max(0, length - 1));
}
export const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function readJson(storage, key, fallback) {
  try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function artwork(images = []) {
  return [...(images || [])].filter(i => i?.url && /^https:\/\//.test(i.url))
    .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || '';
}
export function trackFrom(raw) {
  if (!raw?.name) return null;
  return { name: raw.name, artist: (raw.artists || []).map(a => a.name).join(', ') || 'Unknown artist',
    album: raw.album?.name || '', image: artwork(raw.album?.images),
    uri: raw.uri || '', duration: raw.duration_ms || raw.duration || 0,
    playable: raw.is_playable !== false && !raw.is_local && /^spotify:track:/.test(raw.uri || ''),
    url: raw.external_urls?.spotify || (/^spotify:track:/.test(raw.uri || '') ? `https://open.spotify.com/track/${raw.uri.split(':')[2]}` : '') };
}
export function uniqueTracks(items = []) {
  const seen = new Set();
  return items.map(i => trackFrom(i && 'item' in i ? i.item : i?.track || i)).filter(t => {
    if (!t || !t.uri || seen.has(t.uri)) return false;
    seen.add(t.uri); return true;
  });
}
export function playlistFrom(raw) {
  if (!raw?.id) return null;
  return {id:raw.id, name:raw.name || 'Untitled playlist', owner:raw.owner?.display_name || raw.owner?.id || 'Unknown owner',
    image:artwork(raw.images), uri:raw.uri || '', total:raw.items?.total ?? raw.tracks?.total ?? 0};
}
export function playlistTracks(items = []) {
  return items.map((item, position) => {
    const raw = item && 'item' in item ? item.item : item?.track || item;
    const track = trackFrom(raw);
    return raw?.type !== 'episode' && track?.playable ? {...track, position} : null;
  }).filter(Boolean);
}
export function playlistPlaybackBody(track, playlist, queue = []) {
  if (!playlist?.uri) return playbackBody(track, queue);
  if (!track?.playable) throw new Error('This track cannot be played here. Choose another song.');
  const offset = Number.isInteger(track.position) && track.position >= 0 ? {position:track.position} : {uri:track.uri};
  return {context_uri:playlist.uri, offset, position_ms:0};
}
export function playbackBody(track, queue = []) {
  if (!track?.playable) throw new Error('This track cannot be played here. Choose another song.');
  const uris = [...new Set(queue.filter(t => t.playable).map(t => t.uri))].slice(0, 100);
  if (!uris.includes(track.uri)) return { uris: [track.uri], position_ms: 0 };
  return { uris, offset: { position: uris.indexOf(track.uri) }, position_ms: 0 };
}
export function formatTime(ms) {
  const s = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function angleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}
export function pickDevice(devices = [], skipName = 'Pocket Spin') {
  const usable = (devices || []).filter(d => d?.id && !d.is_restricted && d.name !== skipName);
  return usable.find(d => d.is_active) || usable.find(d => d.type === 'Smartphone') || usable[0] || null;
}
export function remoteState(playback) {
  if (!playback?.item) return null;
  return {paused:!playback.is_playing, position:playback.progress_ms || 0, duration:playback.item.duration_ms || 0,
    track_window:{current_track:playback.item}};
}
