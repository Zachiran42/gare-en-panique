'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','docs','game.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(seed=716,progress={}){
  let value=seed>>>0;const math=Object.create(Math);math.random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
  const sandbox={window:{},Math:math};vm.runInNewContext(source,sandbox);const ends=[],messages=[];
  const game=sandbox.window.createGame({progress,hud(){},save(){},toast(text){messages.push(text);},end(...args){ends.push(args);}});game.reset();return{game,progress,ends,messages};
}
function press(game,key){game.key(key,true);game.key(key,false);}
function click(game,x,y){game.pointer('down',x,y);game.pointer('up',x,y);}
function tick(game,seconds,dt=.02){for(let i=0;i<Math.ceil(seconds/dt);i++)game.update(dt);}
function change(game,edit){const state=game.snapshot();edit(state);assert.equal(game.restore(state),true);}
function until(game,predicate,limit=1000){for(let i=0;i<limit&&!predicate(game.snapshot());i++)game.update(.016);assert(predicate(game.snapshot()),'condition not reached');}
function localPair(h,firstColor=0,secondColor=0){
  change(h.game,s=>{s.queue[0].color=firstColor;s.queue[0].express=false;s.queue[0].speed=1.55+(s.level-1)*.12;s.queue[1].color=secondColor;s.queue[1].express=true;s.queue[1].speed=s.queue[0].speed*1.22;});
}
function runService(seed,level){
  const h=setup(seed,{level});
  for(let i=0;i<10000&&!h.game.snapshot().finished;i++){
    const s=h.game.snapshot();
    if(s.queue.length&&!s.trains.some(train=>train.route===null)){press(h.game,String(s.queue[0].color+1));press(h.game,'Enter');}
    h.game.update(.02);
  }
  return h;
}
function context(){const translations=[],angles=[],gradient={addColorStop(){}};return{translations,angles,c:new Proxy({},{get(object,key){if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;if(key==='translate')return(...values)=>translations.push(values);if(key==='rotate')return(value)=>angles.push(value);return object[key]||(()=>{});},set(object,key,value){object[key]=value;return true;}})};}

test('three route buttons select a destination directly with one tap',()=>{
  const h=setup();click(h.game,335,449);assert.equal(h.game.snapshot().route,2);click(h.game,85,449);assert.equal(h.game.snapshot().route,0);click(h.game,210,449);assert.equal(h.game.snapshot().route,1);
});
test('dock and branch taps select routes directly, while the central switch still cycles',()=>{
  const h=setup();click(h.game,385,153.5);assert.equal(h.game.snapshot().route,0);click(h.game,300,341.5);assert.equal(h.game.snapshot().route,2);
  click(h.game,163.5,247.5);assert.equal(h.game.snapshot().route,0);click(h.game,385,247.5);assert.equal(h.game.snapshot().route,1);
});
test('number keys 1, 2 and 3 immediately choose the matching route',()=>{
  const h=setup();for(const key of ['3','1','2','1','3']){press(h.game,key);assert.equal(h.game.snapshot().route,Number(key)-1);}
});
test('trains start faster and both local and express speed scale progressively',()=>{
  const actual=[];for(const level of [1,2,7,13,999]){const h=setup(3,{level});const t=h.game.snapshot().queue[0];actual.push(t.speed/(t.express?1.22:1));}
  assert.equal(actual[0],1.55);assert(actual[1]>actual[0]);assert(actual[2]>actual[1]);assert(actual[3]>actual[2]);assert.equal(actual[3],actual[4]);
});
test('a selection before engagement applies to the moving train',()=>{
  const h=setup();change(h.game,s=>{s.queue[0].color=2;});press(h.game,'1');press(h.game,'Enter');
  until(h.game,s=>s.trains[0].distance>=1);assert.equal(h.game.snapshot().trains[0].route,null);
  press(h.game,'3');until(h.game,s=>s.delivered===1||s.finished);assert.equal(h.game.snapshot().delivered,1);assert.equal(h.ends.length,0);
});
test('a train already engaged keeps its route while the next route changes immediately',()=>{
  const h=setup();change(h.game,s=>{s.queue[0].color=0;});press(h.game,'1');press(h.game,'Enter');
  until(h.game,s=>s.trains[0].distance>=2.6);assert.equal(h.game.snapshot().trains[0].route,0);const before=h.game.snapshot().trains[0].distance;
  press(h.game,'3');assert.equal(h.game.snapshot().route,2);assert.equal(h.game.snapshot().trains[0].route,0);assert.equal(h.game.snapshot().trains[0].distance,before);
  until(h.game,s=>s.delivered===1||s.finished);assert.equal(h.game.snapshot().delivered,1);assert.equal(h.ends.length,0);
});
test('rounded turns move continuously and rotate gradually without a position jump',()=>{
  const h=setup();change(h.game,s=>{s.queue[0].color=0;s.queue[0].express=false;s.queue[0].speed=1.55;});press(h.game,'1');press(h.game,'Enter');until(h.game,s=>s.trains[0].distance>=2.55);
  let previous=null,previousAngle=null,turned=false;
  for(let i=0;i<60;i++){
    const ctx=context();h.game.draw(ctx.c);const now=ctx.translations[0],angle=ctx.angles[0];assert(now);
    if(previous){assert(Math.hypot(now[0]-previous[0],now[1]-previous[1])<=1.55*.016*47+.01);assert(Math.abs(angle-previousAngle)<.25);}
    if(Math.abs(angle)>.3)turned=true;previous=now;previousAngle=angle;h.game.update(.016);
  }
  assert(turned);
});
test('dispatch uses speed-aware headway instead of allowing an express to catch a local',()=>{
  const h=setup();localPair(h);press(h.game,'1');press(h.game,'Enter');press(h.game,'Enter');assert.equal(h.game.snapshot().trains.length,1);
  for(let i=0;i<250&&h.game.snapshot().trains.length===1;i++){h.game.update(.016);press(h.game,'Enter');}
  assert.equal(h.game.snapshot().trains.length,2);assert(h.game.snapshot().time>1);
  tick(h.game,8);assert.equal(h.ends.length,0);assert.equal(h.game.snapshot().delivered,2);
});
test('safe departure headway becomes shorter at higher speeds while remaining collision-free',()=>{
  const times=[];
  for(const level of [1,10]){
    const h=setup(1,{level});localPair(h);press(h.game,'1');press(h.game,'Enter');
    for(let i=0;i<300&&h.game.snapshot().trains.length<2;i++){h.game.update(.016);press(h.game,'Enter');}
    times.push(h.game.snapshot().time);tick(h.game,7);assert.equal(h.ends.length,0);assert.equal(h.game.snapshot().delivered,2);
  }
  assert(times[1]<times[0]);
});
test('collision detection is geometric and emits only one end event',()=>{
  const h=setup();change(h.game,s=>{s.trains=s.queue.map((train,i)=>({...train,route:null,distance:i===0?1:.7}));s.queue=[];});tick(h.game,1);
  assert.equal(h.ends.length,1);assert.equal(h.ends[0][3],false);assert.match(h.ends[0][1],/Collision/);
});
test('a wrong dock and a completely full waiting queue remain clear failures',()=>{
  const wrong=setup();change(wrong.game,s=>{s.queue[0].color=2;});press(wrong.game,'1');press(wrong.game,'Enter');tick(wrong.game,10);
  assert.equal(wrong.ends.length,1);assert.match(wrong.ends[0][1],/quai 1/);
  const full=setup();tick(full.game,20);assert.equal(full.ends.length,1);assert.match(full.ends[0][1],/file est pleine/);
});
test('legal direct choices can clear services at multiple speeds across 40 seeds',()=>{
  for(const level of [1,5,12])for(let seed=1;seed<=40;seed++){
    const h=runService(seed,level);assert.equal(h.ends.length,1,'missing end level '+level+' seed '+seed);assert.equal(h.ends[0][3],true,'unfair service level '+level+' seed '+seed);
  }
});
test('v2 save round trips preserve active train commitment and copies are independent',()=>{
  const h=setup(1,{level:3});press(h.game,'1');press(h.game,'Enter');until(h.game,s=>s.trains[0].distance>=2.6);
  const saved=h.game.snapshot(),copy=setup(7,{level:3});assert.equal(copy.game.restore(saved),true);assert.deepEqual(clone(copy.game.snapshot()),clone(saved));
  saved.trains[0].route=2;assert.notEqual(copy.game.snapshot().trains[0].route,2);
});
test('legacy, invalid speed, duplicate IDs and impossible commitments are rejected without progress loss',()=>{
  const h=setup(2,{level:4,best:200});const baseline=clone(h.game.snapshot()),progress=clone(h.progress);
  assert.equal(h.game.restore({version:1}),false);
  let bad=clone(baseline);bad.queue[0].speed=999;assert.equal(h.game.restore(bad),false);
  bad=clone(baseline);bad.queue[1].id=bad.queue[0].id;assert.equal(h.game.restore(bad),false);
  bad=clone(baseline);bad.trains=[{...bad.queue.shift(),distance:.5,route:0}];assert.equal(h.game.restore(bad),false);
  assert.deepEqual(clone(h.game.snapshot()),baseline);assert.deepEqual(clone(h.progress),progress);
});
test('a completed service unlocks the next level and drawing does not alter simulation',()=>{
  const h=runService(8,1);assert.equal(h.ends[0][3],true);h.game.next();assert.equal(h.progress.level,2);assert.equal(h.game.snapshot().target,10);
  const before=JSON.stringify(h.game.snapshot()),ctx=context();h.game.draw(ctx.c);h.game.draw(ctx.c);assert.equal(JSON.stringify(h.game.snapshot()),before);
});