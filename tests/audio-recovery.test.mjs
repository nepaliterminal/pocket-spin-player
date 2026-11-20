import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../dist/core.mjs';

test('unavailable SDK playback gives recovery instructions for the current platform',async()=>{
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  for(const [installed,message] of [
    [undefined,/Try Chrome/],
    [false,/Install the Spotify app on this phone/],
    [true,/Open the Spotify app on this phone/]
  ]) {
    const callbacks={};
    const player={disconnect(){},addListener:(event,listener)=>{callbacks[event]=listener;},connect:async()=>{callbacks.initialization_error();return true;}};
    let attemptedFallback=false;
    const context=vm.createContext({
      ...core,esc:core.escapeHtml,localStorage:{getItem:()=>null},performance,
      document:{querySelector:()=>({classList:{toggle(){}},setAttribute(){},addEventListener(){},querySelector(){return null;}}),addEventListener(){}},
      window:{addEventListener(){},PocketSpinAndroid:installed===undefined?undefined:{isApp:()=>true,hasSpotifyApp:()=>installed}},
      setTimeout,clearTimeout,setInterval(){},installFullscreen(){},
      SpotifyClient:class {token={};async accessToken(){return 'test-token';}},
      loadSdk:async()=>({Player:class {constructor(){return player;}}}),
      remotePlayer:async()=>{attemptedFallback=true;return null;}
    });
    vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('boot().catch(report);',''),context);
    await assert.rejects(vm.runInContext('connectPlayer()',context),message);
    assert.equal(attemptedFallback,true);
    assert.match(vm.runInContext('state.playerError',context),message);
  }
});
