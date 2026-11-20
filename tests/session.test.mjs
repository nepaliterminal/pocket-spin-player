import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../dist/core.mjs';
import { SpotifyClient } from '../dist/spotify.mjs';

test('automatic logout clears private app state and ignores pending SDK sync',async()=>{
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{
      innerHTML:'',classList:{toggle(){}},setAttribute(){},addEventListener(){},querySelector(){return null;}
    });
    return elements.get(selector);
  };
  const storage=new Map();
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  let disconnected=0,release;
  const playback=new Promise(resolve=>{release=resolve;});
  const context=vm.createContext({
    ...core,esc:core.escapeHtml,localStorage,performance:{now:()=>0},
    document:{querySelector:element,addEventListener(){}},window:{addEventListener(){}},
    setInterval(){},installFullscreen(){},
    SpotifyClient:class extends SpotifyClient {
      constructor(options){super({...options,storage:localStorage,session:localStorage,request:async()=>new Response('{}',{status:401})});}
    },
    player:{disconnect(){disconnected++;},getCurrentState:()=>playback}
  });
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('boot().catch(report);',''),context);
  vm.runInContext(`
    client.saveToken({access_token:'private-token',expires_in:3600});
    Object.assign(state,{page:'search',cursor:3,stack:[{page:'library',cursor:2}],player,deviceId:'device',active:true,
      library:[{name:'private-song'}],results:[{name:'private-song'}],track:{name:'private-song'},query:'private-query',
      searched:true,searching:true,loading:true,libraryError:'private-error'});
    screen.innerHTML='private-song private-query';
  `,context);
  const pending=vm.runInContext('sync()',context);
  await assert.rejects(vm.runInContext("client.api('/me',{},false)",context),/session expired/);
  assert.equal(disconnected,1);
  assert.equal(vm.runInContext('client.token',context),null);
  assert.equal(vm.runInContext(`JSON.stringify([state.library,state.results,state.track,state.query,state.searched,state.searching,state.loading,state.libraryError,state.player,state.deviceId,state.page,state.cursor,state.stack])`,context),
    JSON.stringify([[],[],null,'',false,false,false,'',null,null,'home',0,[]]));
  assert.doesNotMatch(element('#screen').innerHTML,/private-/);
  release({paused:false,position:0,track_window:{current_track:{name:'private-song',uri:'spotify:track:private'}}});
  await pending;
  assert.equal(vm.runInContext('state.track',context),null);
  assert.doesNotMatch(element('#screen').innerHTML,/private-/);
});
