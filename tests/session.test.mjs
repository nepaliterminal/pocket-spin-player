import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../dist/core.mjs';
import { SpotifyClient, remotePlayer } from '../dist/spotify.mjs';

async function loadApp(globals={}) {
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{
      innerHTML:'',classList:{toggle(){}},setAttribute(){},addEventListener(){},querySelector(){return null;}
    });
    return elements.get(selector);
  };
  const storage=new Map();
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const context=vm.createContext({
    ...core,esc:core.escapeHtml,localStorage,performance:{now:()=>0},
    document:{querySelector:element,addEventListener(){}},window:{addEventListener(){}},
    location:{origin:'https://example.com',pathname:'/'},setInterval(){},installFullscreen(){},
    SpotifyClient:class extends SpotifyClient {
      constructor(options){super({...options,storage:localStorage,session:localStorage,request:async()=>new Response('{}',{status:401})});}
    },
    ...globals
  });
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('boot().catch(report);',''),context);
  return {element,context};
}

test('demo search offers Spotify Setup instead of an unusable form',async()=>{
  const {element,context}=await loadApp();
  vm.runInContext("go('search')",context);
  assert.match(element('#screen').innerHTML,/data-action="settings"[^>]*>Spotify Setup/);
  assert.doesNotMatch(element('#screen').innerHTML,/id="searchForm"/);
  vm.runInContext('select()',context);
  assert.match(element('#screen').innerHTML,/Sign in with Spotify/);
  vm.runInContext('back(); actions.settings()',context);
  assert.match(element('#screen').innerHTML,/Sign in with Spotify/);
  vm.runInContext("client.saveToken({access_token:'test-token',expires_in:3600}); back()",context);
  assert.match(element('#screen').innerHTML,/id="searchForm"/);
});

test('automatic logout clears private app state and ignores pending SDK sync',async()=>{
  let disconnected=0,release;
  const playback=new Promise(resolve=>{release=resolve;});
  const {element,context}=await loadApp({player:{disconnect(){disconnected++;},getCurrentState:()=>playback}});
  vm.runInContext(`
    client.saveToken({access_token:'private-token',expires_in:3600});
    Object.assign(state,{page:'search',cursor:3,stack:[{page:'library',cursor:2}],player,deviceId:'device',active:true,
      library:[{name:'private-song'}],results:[{name:'private-song'}],track:{name:'private-song'},query:'private-query',
      searched:true,searching:true,loading:true,libraryError:'private-error',
      playlists:[{name:'private-playlist'}],playlistsLoaded:true,playlistsLoading:true,playlistsError:'private-error',
      playlist:{name:'private-playlist'},playlistTracks:[{name:'private-song'}],playlistLoading:true,playlistError:'private-error'});
    screen.innerHTML='private-song private-query';
  `,context);
  const pending=vm.runInContext('sync()',context);
  await assert.rejects(vm.runInContext("client.api('/me',{},false)",context),/session expired/);
  assert.equal(disconnected,1);
  assert.equal(vm.runInContext('client.token',context),null);
  assert.equal(vm.runInContext(`JSON.stringify([state.library,state.results,state.track,state.query,state.searched,state.searching,state.loading,state.libraryError,state.player,state.deviceId,state.page,state.cursor,state.stack])`,context),
    JSON.stringify([[],[],null,'',false,false,false,'',null,null,'home',0,[]]));
  assert.doesNotMatch(element('#screen').innerHTML,/private-/);
  assert.equal(vm.runInContext(`JSON.stringify([state.playlists,state.playlistsLoaded,state.playlistsLoading,state.playlistsError,state.playlist,state.playlistTracks,state.playlistLoading,state.playlistError])`,context),
    JSON.stringify([[],false,false,'',null,[],false,'']));
  release({paused:false,position:0,track_window:{current_track:{name:'private-song',uri:'spotify:track:private'}}});
  await pending;
  assert.equal(vm.runInContext('state.track',context),null);
  assert.doesNotMatch(element('#screen').innerHTML,/private-/);
});

test('initial SDK failure and reconnect show the remote hint when no device is available',async()=>{
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  for(const native of [false,true]) {
    for(const devices of [[],[{id:'remote-device',name:'Spotify Phone',is_active:true}]]) {
      const elements=new Map();
      const element=selector=>{
        if(!elements.has(selector))elements.set(selector,{
          innerHTML:'',classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector(){return null;}
        });
        return elements.get(selector);
      };
      const storage=new Map();
      const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
      let sdkAttempts=0,deviceRequests=0;
      const context=vm.createContext({
        ...core,esc:core.escapeHtml,localStorage,performance:{now:()=>0},remotePlayer,
        document:{querySelector:element,addEventListener(){}},
        window:{addEventListener(){},PocketSpinAndroid:{isApp:()=>native}},
        setInterval(){},setTimeout(){},clearTimeout(){},installFullscreen(){},
        loadSdk:async()=>{sdkAttempts++;throw new Error('Spotify’s audio player could not load. Try reconnecting in Setup.');},
        SpotifyClient:class extends SpotifyClient {
          constructor(options){super({...options,storage:localStorage,session:localStorage,request:async url=>{
            assert.equal(url,'https://api.spotify.com/v1/me/player/devices');
            deviceRequests++;return new Response(JSON.stringify({devices}));
          }});}
        }
      });
      vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('boot().catch(report);',''),context);
      vm.runInContext("client.saveToken({access_token:'test-token',expires_in:3600})",context);
      for(const action of ['connectPlayer','actions.reconnect']) {
        await vm.runInContext(`run(${action})`,context);
        if(devices.length) {
          assert.equal(vm.runInContext('state.deviceId',context),'remote-device');
          assert.equal(vm.runInContext('state.player.remote',context),true);
          assert.equal(vm.runInContext('state.playerError',context),'');
          assert.equal(element('#errorBox').hidden,true);
        } else {
          const hint=native?'Open the Spotify app on this phone, then press Play in Pocket Spin.':'Open Spotify on any device, then press Play here.';
          assert.equal(vm.runInContext('state.playerError',context),hint);
          assert.equal(element('#statusCopy').textContent,hint);
          assert.equal(element('#errorText').textContent,hint);
          assert.equal(element('#errorBox').hidden,false);
        }
      }
      assert.equal(sdkAttempts,2);
      assert.equal(deviceRequests,2);
    }
  }
});
