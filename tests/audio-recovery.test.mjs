import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../dist/core.mjs';

async function loadApp(installed, startupEvent) {
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  const callbacks={};
  const player={disconnect(){},addListener:(event,listener)=>{callbacks[event]=listener;},connect:async()=>{callbacks[startupEvent]({device_id:'device'});return true;}};
  const fallback={attempted:false};
  const context=vm.createContext({
    ...core,esc:core.escapeHtml,localStorage:{getItem:()=>null},performance,
    document:{querySelector:()=>({classList:{toggle(){}},setAttribute(){},addEventListener(){},querySelector(){return null;}}),addEventListener(){}},
    window:{addEventListener(){},PocketSpinAndroid:installed===undefined?undefined:{isApp:()=>true,hasSpotifyApp:()=>installed}},
    setTimeout,clearTimeout,setInterval(){},installFullscreen(){},
    SpotifyClient:class {token={};async accessToken(){return 'test-token';}},
    loadSdk:async()=>({Player:class {constructor(){return player;}}}),
    remotePlayer:async()=>{fallback.attempted=true;return null;}
  });
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('boot().catch(report);',''),context);
  return {context,callbacks,fallback};
}

test('unavailable SDK playback gives recovery instructions for the current platform',async()=>{
  for(const [installed,message] of [
    [undefined,/Try Chrome/],
    [false,/Install the Spotify app on this phone/],
    [true,/Open the Spotify app on this phone/]
  ]) {
    const {context,fallback}=await loadApp(installed,'initialization_error');
    await assert.rejects(vm.runInContext('connectPlayer()',context),message);
    assert.equal(fallback.attempted,true);
    assert.match(vm.runInContext('state.playerError',context),message);
  }
});

test('SDK errors after readiness remain visible',async()=>{
  const {context,callbacks,fallback}=await loadApp(undefined,'ready');
  await vm.runInContext('connectPlayer()',context);
  callbacks.authentication_error();
  assert.match(vm.runInContext('state.error',context),/Sign in again/);
  callbacks.account_error();
  assert.match(vm.runInContext('state.error',context),/Spotify Premium/);
  assert.equal(fallback.attempted,false);
});

test('Shuffle and Repeat menu items cycle like an iPod',async()=>{
  const {context}=await loadApp(undefined,'ready');
  vm.runInContext("client.token=null;state.page='home';state.cursor=menuItems.findIndex(([,page])=>page==='shuffle');",context);
  await vm.runInContext('select()',context);
  assert.equal(vm.runInContext('state.shuffle',context),true);
  vm.runInContext("state.cursor=menuItems.findIndex(([,page])=>page==='repeat');",context);
  await vm.runInContext('select()',context);await vm.runInContext('select()',context);
  assert.equal(vm.runInContext('state.repeat',context),2);
  assert.equal(vm.runInContext("state.page",context),'home');
});
