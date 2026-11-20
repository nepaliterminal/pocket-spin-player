/* Pocket Spin: browser-only PKCE. Never put a client secret in this app. */
import { clamp, escapeHtml as esc, readJson, trackFrom, uniqueTracks, playbackBody, playlistFrom, playlistTracks, playlistPlaybackBody, formatTime, angleDelta } from './core.mjs';
import { SpotifyClient, loadSdk } from './spotify.mjs';
import { installFullscreen } from './fullscreen.mjs';

const $ = selector => document.querySelector(selector);
const screen = $('#screen');
const client = new SpotifyClient({onLogout:clearSession});
const demoTracks = [
  {name:'Neon Gardens', artist:'Satellite Club', album:'Midnight Circuit', duration:247000},
  {name:'Sea Glass', artist:'Eleanor Hart', album:'Low Tide', duration:218000},
  {name:'Slow Motion', artist:'Garden Club', album:'Lemon Season', duration:196000}
];
const menuItems = [
  ['Now Playing','now'], ['Recently Played','library'], ['Playlists','playlists'], ['Search Songs','search'],
  ['Spotify Setup','settings'], ['About Pocket Spin','about']
];
const state = {
  page:'home', cursor:0, stack:[], track:null, playing:false, position:0, updated:performance.now(),
  player:null, deviceId:null, active:false, connecting:null, busy:false, epoch:0,
  library:[], loading:false, libraryError:'', results:[], query:'', searched:false, searching:false,
  playlists:[], playlistsLoaded:false, playlistsLoading:false, playlistsError:'', playlist:null,
  playlistTracks:[], playlistLoading:false, playlistError:'', playlistRequest:0,
  error:'', playerError:'', volume:clamp(readJson(localStorage,'pocket-spin-volume',0.6),0,1)
};
let searchId = 0;
const demo = () => !client.token;
const redirect = () => location.origin + location.pathname;
const position = () => clamp(state.position + (state.playing ? performance.now()-state.updated : 0),0,state.track?.duration || 0);
const button = (label, action, extra='') => '<button type="button" class="screen-action" data-action="'+action+'" '+extra+'>'+label+'</button>';
const topbar = title => '<div class="topbar">'+(state.page==='home'?'<b>POCKET SPIN</b>':'<button data-action="back" aria-label="Back">Back</button>')+'<b>'+esc(title)+'</b><span class="connection-state">'+(demo()?'DEMO':state.deviceId?'READY':'SPOTIFY')+'</span></div>';
function artwork(track, small=false) {
  return '<div class="'+(small?'thumb':'art')+'">'+(track?.image?'<img src="'+esc(track.image)+'" alt="'+esc(track.album || track.name)+' album cover" '+(small?'loading="lazy"':'fetchpriority="high"')+'>':'<span aria-hidden="true">♫</span>')+'</div>';
}
function trackRows(tracks) {
  return tracks.map((track,i)=>'<button type="button" class="library-row '+(i===state.cursor?'selected':'')+'" data-track="'+i+'">'+artwork(track,true)+'<span class="row-copy"><b>'+esc(track.name)+'</b><small>'+esc(track.artist)+'</small></span></button>').join('');
}
function nowView() {
  const t = state.track;
  if (!t) return topbar('Now Playing')+'<div class="screen-scroll empty"><p>Choose a song from Recently Played or Search.</p>'+button('Recently Played','library')+'</div>';
  return topbar('Now Playing')+'<div class="now-playing">'+artwork(t)+'<div class="track-title" title="'+esc(t.name)+'">'+esc(t.name)+'</div><div class="artist">'+esc(t.artist)+'</div><input id="seek" aria-label="Playback position" type="range" min="0" max="'+t.duration+'" step="1000" value="'+position()+'"><div class="times"><span id="elapsed">'+formatTime(position())+'</span><span>'+formatTime(t.duration)+'</span></div><div class="play-state" id="playState"></div>'+(t.url?'<a class="spotify-link" target="_blank" rel="noopener noreferrer" href="'+esc(t.url)+'">Open in Spotify</a>':'')+'</div>';
}
function libraryView() {
  const tracks=demo()?demoTracks:state.library;
  return topbar('Recently Played')+'<div class="screen-scroll">'+(state.loading?'<p class="empty">Loading recent songs…</p>':state.libraryError?'<p class="empty">'+esc(state.libraryError)+'</p>'+button('Try again','refresh'):tracks.length?trackRows(tracks):'<p class="empty">No recent tracks yet. Listen on Spotify, or search for a song.</p>')+'</div>';
}
function searchView() {
  return topbar('Search Songs')+'<div class="search-view"><form id="searchForm"><input id="searchInput" aria-label="Search songs" placeholder="Song or artist" value="'+esc(state.query)+'" maxlength="200" required><button type="submit" '+(state.searching?'disabled':'')+'>Find</button></form><div class="search-results">'+(demo()?'<p class="empty">Connect Spotify in Setup to search.</p>':state.searching?'<p class="empty">Searching…</p>':trackRows(state.results)+(state.searched&&!state.results.length?'<p class="empty">No songs found.</p>':''))+'</div></div>';
}
function playlistsView() {
  return topbar('Playlists')+'<div class="screen-scroll">'+(state.playlistsLoading?'<p class="empty">Loading playlists…</p>':state.playlistsError?'<p class="empty">'+esc(state.playlistsError)+'</p>'+button('Try again','refreshPlaylists'):state.playlists.length?state.playlists.map((playlist,i)=>'<button type="button" class="library-row '+(i===state.cursor?'selected':'')+'" data-playlist="'+i+'">'+artwork(playlist,true)+'<span class="row-copy"><b>'+esc(playlist.name)+'</b><small>'+esc(playlist.owner)+'</small></span></button>').join(''):'<p class="empty">No playlists yet. Create or save a playlist on Spotify.</p>')+'</div>';
}
function playlistView() {
  return topbar(state.playlist?.name || 'Playlist')+'<div class="screen-scroll">'+(state.playlistLoading?'<p class="empty">Loading songs…</p>':state.playlistError?'<p class="empty">'+esc(state.playlistError)+'</p>'+button('Try again','refreshPlaylist'):state.playlistTracks.length?trackRows(state.playlistTracks):'<p class="empty">No playable songs in this playlist.</p>')+'</div>';
}
function settingsView() {
  return topbar('Spotify Setup')+'<div class="screen-scroll connect"><p>Use your Spotify app’s Client ID. Never enter a client secret.</p><form id="loginForm"><label for="clientId">Client ID</label><input class="field" id="clientId" value="'+esc(client.config.clientId||'')+'" placeholder="32-character Client ID" autocomplete="off" spellcheck="false" required><label for="redirect">Redirect URL (exact match)</label><input class="field" id="redirect" readonly value="'+esc(redirect())+'"><button class="screen-action" type="submit">'+(demo()?'Sign in with Spotify':'Sign in again')+'</button></form>'+(demo()?'':button('Reconnect audio player','reconnect')+button('Sign out on this browser','signout'))+'<label for="volume">Volume</label><input id="volume" aria-label="Volume" type="range" min="0" max="100" value="'+Math.round(state.volume*100)+'"><p class="legal">Browser playback requires Spotify Premium. Development apps must allow your account in their dashboard. Select Web API and Web Playback SDK. Allow protected-content playback in your browser.</p></div>';
}
function render() {
  if(state.page==='now') screen.innerHTML=nowView();
  else if(state.page==='library') screen.innerHTML=libraryView();
  else if(state.page==='playlists') screen.innerHTML=playlistsView();
  else if(state.page==='playlist') screen.innerHTML=playlistView();
  else if(state.page==='search') screen.innerHTML=searchView();
  else if(state.page==='settings') screen.innerHTML=settingsView();
  else if(state.page==='about') screen.innerHTML=topbar('About')+'<div class="screen-scroll connect"><h2>Pocket Spin</h2><p>A classic wheel for your Spotify music.</p><p>Drag around the wheel or use the arrow keys to browse. Center selects. MENU goes back. The bottom button plays or pauses.</p><p>Demo mode is a silent preview. Not affiliated with Apple or Spotify.</p><p>Fullscreen edition · 1.2</p></div>';
  else screen.innerHTML=topbar('Music')+'<div class="screen-title">Music</div><div class="menu-list">'+menuItems.map(([label,page],i)=>'<button type="button" data-page="'+page+'" class="menu-item '+(i===state.cursor?'selected':'')+'">'+label+'</button>').join('')+'</div>';
  updateStatus(); updateProgress();
  if(['library','search','playlists','playlist'].includes(state.page)) {
    const selected=screen.querySelector('.selected');
    if(selected) selected.scrollIntoView({block:'nearest'});
  }
}
function updateStatus() {
  $('#connectionDot').classList.toggle('online',!!state.deviceId);
  $('#statusCopy').textContent=demo()?'Silent demo mode. Open Spotify Setup to connect your music.':state.playerError|| (state.deviceId?'Spotify player ready. Choose a song, then press Play.':'Connecting Spotify’s audio player…');
  const badge=screen.querySelector('.connection-state');
  if(badge) badge.textContent=demo()?'DEMO':state.deviceId?'READY':'SPOTIFY';
  $('#errorBox').hidden=!state.error;
  $('#errorText').textContent=state.error;
  $('#playButton').setAttribute('aria-label',state.playing?'Pause':'Play');
}
function updateProgress() {
  const seek=$('#seek');
  if(seek && document.activeElement!==seek) seek.value=position();
  if($('#elapsed')) $('#elapsed').textContent=formatTime(position());
  if($('#playState')) $('#playState').textContent=state.busy?'Starting…':demo()?(state.playing?'Silent demo · playing':'Silent demo · paused'):state.playing?'Playing':state.active?'Paused':'Press Play to listen here';
}
function report(error) { state.error=error.message||String(error); updateStatus(); }
const run = action => Promise.resolve().then(action).catch(report);
function notify(message) {
  const toast=$('#toast'); toast.textContent=message; toast.classList.add('show');
  clearTimeout(notify.timer); notify.timer=setTimeout(()=>toast.classList.remove('show'),3500);
}
function items() { return state.page==='home'?menuItems:state.page==='library'?(demo()?demoTracks:state.library):state.page==='search'?state.results:state.page==='playlists'?state.playlistsLoading||state.playlistsError?[]:state.playlists:state.page==='playlist'?state.playlistLoading||state.playlistError?[]:state.playlistTracks:[]; }
function move(delta) {
  const list=items(); if(!list.length) return;
  state.cursor=(state.cursor+delta+list.length)%list.length; render();
}
function go(page) {
  if(state.page===page) return;
  state.stack.push({page:state.page,cursor:state.cursor}); state.page=page; state.cursor=0;
  if(page==='now'&&demo()&&!state.track) state.track=demoTracks[0];
  render();
  if(page==='playlists'&&!state.playlistsLoaded&&!state.playlistsLoading) run(loadPlaylists);
}
function back() { Object.assign(state,state.stack.pop()||{page:'home',cursor:0}); render(); }
function home() { state.page='home';state.cursor=0;state.stack=[];render(); }
function select() {
  if(state.page==='home') return go(menuItems[state.cursor][1]);
  if(state.page==='library'||state.page==='search') return playTrack(items()[state.cursor],items());
  if(state.page==='playlists') {
    const playlist=items()[state.cursor];if(!playlist)return;
    state.playlist=playlist;state.playlistTracks=[];state.playlistError='';go('playlist');return loadPlaylist();
  }
  if(state.page==='playlist') return playTrack(items()[state.cursor],items(),state.playlist);
  if(state.page==='now') return togglePlay();
}
function applyPlayback(playback) {
  if(!playback) { state.position=position();state.updated=performance.now();state.playing=false;state.active=false;updateProgress();return; }
  const track=trackFrom(playback.track_window?.current_track); if(!track) return;
  track.duration=playback.duration||track.duration;
  const changed=track.uri!==state.track?.uri || track.image!==state.track?.image;
  state.track=track;state.position=playback.position;state.updated=performance.now();state.playing=!playback.paused;state.active=true;
  if(changed&&state.page==='now') render(); else {updateStatus();updateProgress();}
}
async function sync() {
  const epoch=state.epoch;
  if(state.player&&state.deviceId) {
    const playback=await state.player.getCurrentState();
    if(epoch===state.epoch) applyPlayback(playback);
  }
}
function disconnect() {
  state.epoch++;state.player?.disconnect();state.player=null;state.deviceId=null;state.connecting=null;
  state.position=position();state.updated=performance.now();state.playing=false;state.active=false;
}
async function connectPlayer() {
  if(demo()) return;
  if(state.connecting) return state.connecting;
  if(state.deviceId) return;
  const epoch=state.epoch;
  const task=(async()=>{
    state.playerError='';updateStatus();
    await client.accessToken();const sdk=await loadSdk();
    if(epoch!==state.epoch) return;
    const player=new sdk.Player({name:'Pocket Spin',volume:state.volume,getOAuthToken:cb=>client.accessToken().then(cb).catch(report)});
    state.player=player;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Spotify audio is not ready. Reconnect in Setup or try Chrome with protected content enabled.')),15000);
      const valid=()=>epoch===state.epoch&&state.player===player;
      const fail=message=>{clearTimeout(timer);if(valid()){state.playerError=message;report(new Error(message));}reject(new Error(message));};
      player.addListener('ready',({device_id})=>{clearTimeout(timer);if(!valid())return;state.deviceId=device_id;state.playerError='';updateStatus();resolve();});
      player.addListener('not_ready',()=>{if(!valid())return;state.deviceId=null;state.active=false;state.position=position();state.updated=performance.now();state.playing=false;state.playerError='Player disconnected. Reconnect in Spotify Setup.';updateStatus();updateProgress();});
      player.addListener('player_state_changed',p=>{if(valid())applyPlayback(p);});
      player.addListener('initialization_error',()=>fail('This browser could not start protected playback. Try Chrome and allow protected content.'));
      player.addListener('authentication_error',()=>fail('Spotify authorization failed. Sign in again from Setup.'));
      player.addListener('account_error',()=>fail('Spotify Premium is required for browser playback.'));
      player.addListener('playback_error',({message})=>{if(valid())report(new Error(message||'Spotify could not play this track.'));});
      player.addListener('autoplay_failed',()=>{if(valid())notify('Press Play again to allow audio in this browser.');});
      player.connect().then(ok=>{if(!ok)fail('Spotify could not connect. Try reconnecting in Setup.');}).catch(error=>fail(error.message));
    });
  })();
  state.connecting=task;
  try {await task;} catch(error) {if(epoch!==state.epoch)return;state.player?.disconnect();state.player=null;state.deviceId=null;state.playerError=error.message;updateStatus();throw error;}
  finally {if(state.connecting===task)state.connecting=null;}
}
async function readyForPlayback() {
  // Activate synchronously inside the user's gesture, before any network wait.
  const activation=state.player?.activateElement?.();
  if(activation) await activation;
  if(!state.deviceId) {await connectPlayer();throw new Error('Audio player is ready. Press Play once more to start.');}
}
async function playTrack(track,queue=[],playlist=null) {
  if(!track||state.busy) return;
  if(demo()) {
    state.track=track;state.position=0;state.updated=performance.now();state.playing=true;go('now');render();return;
  }
  const ready=readyForPlayback();
  state.busy=true;state.error='';updateStatus();updateProgress();
  try {
    await ready;
    await client.api('/me/player/play?device_id='+encodeURIComponent(state.deviceId),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(playlist?playlistPlaybackBody(track,playlist,queue):playbackBody(track,queue))});
    state.track=track;state.position=0;state.updated=performance.now();go('now');render();await sync();
  } finally {state.busy=false;updateProgress();}
}
async function togglePlay() {
  if(state.busy) return;
  if(demo()) {state.track ||= demoTracks[0];state.position=position();state.updated=performance.now();state.playing=!state.playing;updateStatus();updateProgress();return;}
  if(!state.active) {
    const track=state.track||state.library[0];
    if(!track) {go('library');throw new Error('Choose a song from Recently Played or Search first.');}
    return playTrack(track,state.library);
  }
  const ready=readyForPlayback();
  state.busy=true;
  try {await ready;await state.player.togglePlay();await sync();} finally {state.busy=false;updateProgress();}
}
async function skip(direction) {
  if(state.busy) return;
  if(demo()) {const index=Math.max(0,demoTracks.indexOf(state.track));state.track=demoTracks[(index+direction+demoTracks.length)%demoTracks.length];state.position=0;state.updated=performance.now();if(state.page==='now')render();return;}
  await readyForPlayback();
  if(!state.active) return togglePlay();
  state.busy=true;
  try {await state.player[direction>0?'nextTrack':'previousTrack']();await sync();}finally{state.busy=false;updateProgress();}
}
async function loadLibrary() {
  if(demo()) return;
  const epoch=state.epoch;state.loading=true;state.libraryError='';
  if(state.page==='library')render();
  try {const data=await client.api('/me/player/recently-played?limit=20');if(epoch===state.epoch)state.library=uniqueTracks(data.items);}
  catch(error){if(epoch===state.epoch)state.libraryError=error.message;}
  finally {if(epoch===state.epoch){state.loading=false;state.cursor=clamp(state.cursor,0,Math.max(0,state.library.length-1));if(state.page==='library')render();}}
}
async function search() {
  if(demo()) throw new Error('Connect Spotify from Setup to search.');
  state.query=$('#searchInput').value.trim();if(!state.query)return;
  const id=++searchId, epoch=state.epoch;
  state.searching=true;state.searched=false;state.results=[];render();
  try {const data=await client.api('/search?type=track&limit=10&q='+encodeURIComponent(state.query));if(id===searchId&&epoch===state.epoch){state.results=uniqueTracks(data.tracks?.items);state.searched=true;state.cursor=0;}}
  finally {if(id===searchId&&epoch===state.epoch){state.searching=false;if(state.page==='search')render();}}
}
async function playlistPages(path, limit) {
  const rows=[];
  while(path&&rows.length<limit) {
    const data=await client.api(path);rows.push(...(data.items || []));
    path=data.next?new URL(data.next,'https://api.spotify.com').pathname.replace(/^\/v1/,'')+new URL(data.next,'https://api.spotify.com').search:null;
  }
  return rows.slice(0,limit);
}
async function loadPlaylists() {
  const epoch=state.epoch;state.playlistsLoading=true;state.playlistsError='';
  if(state.page==='playlists')render();
  try {
    const playlists=demo()?[{id:'demo',name:'Pocket Spin Mix',owner:'Pocket Spin',uri:'',total:demoTracks.length}]: (await playlistPages('/me/playlists?limit=50',200)).map(playlistFrom).filter(Boolean);
    if(epoch===state.epoch){state.playlists=playlists;state.playlistsLoaded=true;}
  } catch(error){if(epoch===state.epoch)state.playlistsError=error.message;}
  finally {if(epoch===state.epoch){state.playlistsLoading=false;if(state.page==='playlists'){state.cursor=clamp(state.cursor,0,Math.max(0,state.playlists.length-1));render();}}}
}
async function loadPlaylist() {
  const epoch=state.epoch, id=++state.playlistRequest, playlist=state.playlist;
  if(!playlist)return;
  state.playlistLoading=true;state.playlistError='';if(state.page==='playlist')render();
  try {
    let tracks;
    if(demo()) tracks=demoTracks;
    else {
      const path='/playlists/'+encodeURIComponent(playlist.id);
      let rows;
      try {rows=await playlistPages(path+'/items?limit=50',10000);}
      catch(error){if(error.status!==404)throw error;rows=await playlistPages(path+'/tracks?limit=50',10000);}
      tracks=playlistTracks(rows);
    }
    if(epoch===state.epoch&&id===state.playlistRequest)state.playlistTracks=tracks;
  }catch(error){if(epoch===state.epoch&&id===state.playlistRequest)state.playlistError=error.message;}
  finally {if(epoch===state.epoch&&id===state.playlistRequest){state.playlistLoading=false;if(state.page==='playlist'){state.cursor=clamp(state.cursor,0,Math.max(0,state.playlistTracks.length-1));render();}}}
}
function clearSession() {
  Object.assign(state,{playlists:[],playlistsLoaded:false,playlistsLoading:false,playlistsError:'',playlist:null,playlistTracks:[],playlistLoading:false,playlistError:''});
  disconnect();searchId++;state.library=[];state.results=[];state.track=null;state.query='';state.searched=false;state.searching=false;state.loading=false;state.libraryError='';state.error='';state.playerError='';home();
}
function signout() { client.logout(); }
const actions={menu:back,back,home,select,play:togglePlay,next:()=>skip(1),previous:()=>skip(-1),
  library:()=>go('library'),refresh:loadLibrary,dismiss:()=>{state.error='';updateStatus();},
  refreshPlaylists:loadPlaylists,refreshPlaylist:loadPlaylist,
  reconnect:()=>{disconnect();return connectPlayer();},signout};
// Direct click handlers preserve browser user activation for protected audio.
document.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  const action=target.dataset.action;
  try {
    let result;
    if(action&&actions[action])result=actions[action]();
    else if(target.dataset.page)result=go(target.dataset.page);
    else if(target.dataset.track!==undefined){state.cursor=Number(target.dataset.track);result=select();}
    else if(target.dataset.playlist!==undefined){state.cursor=Number(target.dataset.playlist);result=select();}
    Promise.resolve(result).catch(report);
  }catch(error){report(error);}
});
document.addEventListener('submit',event=>{
  if(event.target.id==='loginForm'){event.preventDefault();const id=$('#clientId').value.trim();run(async()=>{location.assign(await client.login(id,redirect()));});}
  if(event.target.id==='searchForm'){event.preventDefault();run(search);}
});
document.addEventListener('input',event=>{if(event.target.id==='searchInput')state.query=event.target.value;});
document.addEventListener('change',event=>{
  if(event.target.id==='volume'){state.volume=Number(event.target.value)/100;try{localStorage.setItem('pocket-spin-volume',JSON.stringify(state.volume));}catch{}if(state.player)run(()=>state.player.setVolume(state.volume));}
  if(event.target.id==='seek'){const value=Number(event.target.value);if(demo()){state.position=value;state.updated=performance.now();updateProgress();}else run(async()=>{if(!state.active)throw new Error('Play this song before seeking.');await state.player.seek(value);await sync();});}
});
document.addEventListener('keydown',event=>{
  if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(event.target.closest('button,a')&&(event.key==='Enter'||event.key===' '))return;
  const keyActions={ArrowDown:()=>move(1),ArrowRight:()=>move(1),ArrowUp:()=>move(-1),ArrowLeft:()=>move(-1),Enter:select,' ':togglePlay,Escape:back,Home:home};
  if(keyActions[event.key]){event.preventDefault();try{Promise.resolve(keyActions[event.key]()).catch(report);}catch(error){report(error);}}
});
const wheel=$('#wheel');let lastAngle=null,wheelDelta=0;
const angle=event=>{const r=wheel.getBoundingClientRect();return Math.atan2(event.clientY-r.top-r.height/2,event.clientX-r.left-r.width/2)*180/Math.PI;};
wheel.addEventListener('pointerdown',event=>{
  if(event.target.closest('button')||event.button!==0||!event.isPrimary)return;
  wheel.setPointerCapture(event.pointerId);lastAngle=angle(event);
});
wheel.addEventListener('pointermove',event=>{
  if(lastAngle===null)return;
  const current=angle(event),delta=angleDelta(lastAngle,current);
  if(Math.abs(delta)>=22){move(delta>0?1:-1);lastAngle=current;}
});
['pointerup','pointercancel','lostpointercapture'].forEach(name=>wheel.addEventListener(name,()=>{lastAngle=null;}));
wheel.addEventListener('wheel',event=>{event.preventDefault();wheelDelta+=event.deltaY;if(Math.abs(wheelDelta)>=40){move(wheelDelta>0?1:-1);wheelDelta=0;}},{passive:false});
screen.addEventListener('error',event=>{if(event.target.tagName==='IMG'){event.target.hidden=true;event.target.parentElement.classList.add('art-unavailable');}},true);
setInterval(()=>{if(demo()&&state.playing&&position()>=state.track.duration)skip(1);if(state.page==='now')updateProgress();},500);
let syncing=false;
setInterval(()=>{if(!document.hidden&&state.deviceId&&!syncing){syncing=true;sync().catch(()=>{}).finally(()=>{syncing=false;});}},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.deviceId)run(sync);});
window.addEventListener('pagehide',()=>disconnect());
window.addEventListener('pageshow',event=>{if(event.persisted&&!demo())run(connectPlayer);});
async function boot() {
  render();
  try {await client.callback(location.search);}catch(error){state.page='settings';report(error);}
  finally {const query=new URLSearchParams(location.search);if(query.has('code')||query.has('error'))history.replaceState({},'',redirect());}
  render();
  if(!demo()){run(loadLibrary);run(connectPlayer);}
}
installFullscreen(notify);
boot().catch(report);
