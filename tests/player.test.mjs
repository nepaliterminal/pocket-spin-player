import test from 'node:test';
import assert from 'node:assert/strict';
import { artwork, uniqueTracks, playbackBody, playlistFrom, playlistTracks, playlistPlaybackBody, escapeHtml, formatTime, angleDelta, readJson } from '../dist/core.mjs';
import { SpotifyClient, DEFAULT_CLIENT_ID } from '../dist/spotify.mjs';
import { playerScale } from '../dist/fullscreen.mjs';

const memory = (data={}) => ({getItem:key=>data[key]??null,setItem:(key,value)=>{data[key]=value;},removeItem:key=>{delete data[key];}});
const token = {access_token:'test-access',refresh_token:'test-refresh',expires_at:9999999};
const response = (status,data={},headers={}) => new Response(status===204?null:JSON.stringify(data),{status,headers});
const clientFor = (request, saved=token) => new SpotifyClient({storage:memory({
  'pocket-spin-config-v1':JSON.stringify({clientId:'a'.repeat(32)}),
  'pocket-spin-token-v1':JSON.stringify(saved)
}),session:memory(),request,now:()=>1000});
const rawTrack = (id, images=[]) => ({name:id,uri:'spotify:track:'+id,artists:[{name:'Artist'}],album:{name:'Album',images},duration_ms:100000});

test('fullscreen player fits portrait, landscape, and desktop viewports',()=>{
  for(const [width,height] of [[320,568],[360,640],[393,852],[844,390],[1920,1080]]) {
    const scale=playerScale(width,height);
    assert.ok(scale*360 <= width-24);
    assert.ok(scale*710 <= height-90);
    assert.ok(scale<=1.6);
  }
});

test('artwork chooses full resolution regardless of API array order',()=>{
  const images=[{width:64,url:'https://images.test/small'},{width:640,url:'https://images.test/large'},{width:300,url:'https://images.test/medium'}];
  assert.equal(artwork(images),'https://images.test/large');
  assert.equal(images[0].width,64);
  assert.equal(artwork([{width:1000,url:'javascript:bad'}]),'');
});
test('recent library deduplicates and tolerates unavailable tracks',()=>{
  assert.deepEqual(uniqueTracks([{track:rawTrack('one')},{track:null},{track:rawTrack('one')},{track:rawTrack('two')}]).map(t=>t.name),['one','two']);
});
test('playlists normalize metadata and tolerate missing values',()=>{
  assert.equal(playlistFrom(null),null);
  assert.equal(playlistFrom({name:'Missing id'}),null);
  assert.deepEqual(playlistFrom({id:'mix',name:'Mix',owner:{display_name:'DJ'},images:[{url:'https://images.test/mix'}],uri:'spotify:playlist:mix',tracks:{total:3}}),
    {id:'mix',name:'Mix',owner:'DJ',image:'https://images.test/mix',uri:'spotify:playlist:mix',total:3});
  assert.equal(playlistFrom({id:'empty',items:{total:0}}).total,0);
  assert.equal(playlistFrom({id:'empty'}).owner,'Unknown owner');
});
test('playlist items accept old and new wrappers and skip local, null, and episodes',()=>{
  assert.deepEqual(playlistTracks([{track:rawTrack('one')},{item:rawTrack('two')},{item:rawTrack('one')},{item:null},{track:null},{item:{...rawTrack('local'),is_local:true}},{item:{name:'Podcast',type:'episode',uri:'spotify:episode:one'}}]).map(t=>t.name),['one','two']);
  assert.deepEqual(playlistTracks(),[]);
});
test('playlist playback uses context and URI offset or falls back to the queue',()=>{
  const tracks=playlistTracks([{item:rawTrack('one')},{track:rawTrack('two')}]);
  assert.deepEqual(playlistPlaybackBody(tracks[1],{uri:'spotify:playlist:mix'},tracks),{context_uri:'spotify:playlist:mix',offset:{uri:'spotify:track:two'},position_ms:0});
  assert.deepEqual(playlistPlaybackBody(tracks[1],{},tracks),playbackBody(tracks[1],tracks));
  assert.throws(()=>playlistPlaybackBody(null,{uri:'spotify:playlist:mix'}),/cannot be played/);
  assert.throws(()=>playlistPlaybackBody(null,null),/cannot be played/);
});
test('playlist API fetches with authorization and provides targeted permission and 404 errors',async()=>{
  const client=clientFor(async(url,options)=>{
    assert.equal(url,'https://api.spotify.com/v1/me/playlists?limit=50');
    assert.equal(options.headers.Authorization,'Bearer test-access');
    return response(200,{items:[],next:null});
  });
  assert.deepEqual(await client.api('/me/playlists?limit=50'),{items:[],next:null});
  for(const status of [401,403]) {
    await assert.rejects(clientFor(async()=>response(status)).api('/me/playlists?limit=50'),/Sign in again from Spotify Setup.*playlists/);
    await assert.rejects(clientFor(async()=>response(status)).api('/playlists/mix/items?limit=100'),/Sign in again from Spotify Setup.*playlists/);
  }
  await assert.rejects(clientFor(async()=>response(404)).api('/playlists/mix/items?limit=100'),error=>error.status===404);
});
test('clicking a song starts that URI at its actual queue offset',()=>{
  const tracks=uniqueTracks([rawTrack('one'),rawTrack('two')]);
  assert.deepEqual(playbackBody(tracks[1],tracks),{uris:['spotify:track:one','spotify:track:two'],offset:{position:1},position_ms:0});
  assert.deepEqual(playbackBody(tracks[1]),{uris:['spotify:track:two'],position_ms:0});
  assert.throws(()=>playbackBody({...tracks[0],playable:false}),/cannot be played/);
});
test('display helpers handle corrupt data and wheel wraparound',()=>{
  assert.equal(readJson(memory({bad:'{'}),'bad',null),null);
  assert.equal(escapeHtml('"<>&'), '&quot;&lt;&gt;&amp;');
  assert.equal(formatTime(-100), '0:00');
  assert.equal(formatTime(247000), '4:07');
  assert.equal(angleDelta(170,-170),20);
  assert.equal(angleDelta(-170,170),-20);
});
test('token refresh is single-flight and preserves refresh token',async()=>{
  let calls=0;
  const client=clientFor(async()=>{calls++;return response(200,{access_token:'new',expires_in:3600});},{...token,expires_at:0});
  assert.deepEqual(await Promise.all([client.accessToken(),client.accessToken(),client.accessToken()]),['new','new','new']);
  assert.equal(calls,1);assert.equal(client.token.refresh_token,'test-refresh');
});
test('401 refreshes once then retries the request',async()=>{
  let calls=0;
  const client=clientFor(async(url,options)=>{
    calls++;
    if(url.includes('/api/token'))return response(200,{access_token:'new',expires_in:3600});
    return options.headers.Authorization==='Bearer new'?response(200,{ok:true}):response(401);
  });
  assert.deepEqual(await client.api('/me'),{ok:true});assert.equal(calls,3);
});
test('persistent unauthorized response signs out instead of looping',async()=>{
  let calls=0;
  const client=clientFor(async url=>{calls++;return url.includes('/api/token')?response(200,{access_token:'new',expires_in:3600}):response(401);});
  await assert.rejects(client.api('/me'),/session expired/);assert.equal(calls,3);assert.equal(client.token,null);
});
test('429 waits for Retry-After without retry storms',async()=>{
  let calls=0;
  const client=clientFor(async()=>{calls++;return response(429,{}, {'Retry-After':'60'});});
  await assert.rejects(client.api('/me'),/60 seconds/);
  await assert.rejects(client.api('/me'),/60 seconds/);assert.equal(calls,1);
});
test('403 and offline failures are actionable, not swallowed',async()=>{
  await assert.rejects(clientFor(async()=>response(403)).api('/me'),/Premium/);
  await assert.rejects(clientFor(async()=>{throw new TypeError('offline');}).api('/me'),/Check your connection/);
});
test('fetch is invoked without an incompatible browser receiver',async()=>{
  const client=clientFor(function(){assert.equal(this,undefined);return Promise.resolve(response(200,{ok:true}));});
  assert.deepEqual(await client.api('/me'),{ok:true});
});
test('logout during refresh cannot resurrect a session',async()=>{
  let release;
  const client=clientFor(()=>new Promise(resolve=>{release=resolve;}),{...token,expires_at:0});
  const pending=client.accessToken();client.logout();release(response(200,{access_token:'new',expires_in:3600}));
  await assert.rejects(pending,/Session changed/);assert.equal(client.token,null);
});
test('OAuth rejects absent or mismatched state before making any request',async()=>{
  let calls=0;const client=clientFor(async()=>{calls++;return response(200);});
  await assert.rejects(client.callback('?code=abc'),/expired/);
  assert.equal(calls,0);
});
test('PKCE roundtrip validates state and uses the original redirect URI',async()=>{
  let sent;
  const client=clientFor(async(url,options)=>{sent=options.body;return response(200,{access_token:'new',refresh_token:'r',expires_in:3600});});
  const login=new URL(await client.login('a'.repeat(32),'https://player.test/'));
  assert.ok(login.searchParams.get('scope').split(' ').includes('playlist-read-private'));
  assert.ok(login.searchParams.get('scope').split(' ').includes('playlist-read-collaborative'));
  assert.equal(login.searchParams.get('code_challenge_method'),'S256');
  assert.equal(login.searchParams.get('code_challenge').length,43);
  assert.equal(login.searchParams.has('client_secret'),false);
  assert.equal(await client.callback('?code=test&state='+login.searchParams.get('state')),true);
  assert.equal(sent.get('redirect_uri'),'https://player.test/');
  assert.equal(client.token.access_token,'new');
});

test('client ID defaults to the built-in app but a saved ID overrides it',()=>{
  assert.equal(new SpotifyClient({storage:memory(),session:memory()}).config.clientId,DEFAULT_CLIENT_ID);
  assert.match(DEFAULT_CLIENT_ID,/^[a-f\d]{32}$/);
  assert.equal(clientFor(()=>{}).config.clientId,'a'.repeat(32));
});
