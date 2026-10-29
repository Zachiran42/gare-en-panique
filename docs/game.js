/* Gare en panique v1.1 — original game code, MIT. Entirely local. */
(function () {
  'use strict';
  const X=46,Y=83,CELL=47,COMMIT=2.5,COLLISION=.57;
  const COLORS=['#71dfd5','#f8bd70','#dd9acb'],NAMES=['LAGON','SOLEIL','ROSE'],ROWS=[1,3,5];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const screen=(x,y)=>({x:X+(x+.5)*CELL,y:Y+(y+.5)*CELL});
  const speed=(level,express)=>(1.55+Math.min(level-1,12)*.12)*(express?1.22:1);
  const interval=level=>Math.max(1.8,3.6-(level-1)*.14);
  function box(c,x,y,w,h,r,fill,stroke){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
  function text(c,value,x,y,size,color,align){c.fillStyle=color||'#f5f1e9';c.font=`600 ${size}px system-ui, sans-serif`;c.textAlign=align||'left';c.fillText(value,x,y);}
  function makePath(route){
    const raw=route===1?[[-1,3],[6.75,3]]:[[-1,3],[2,3],[2,ROWS[route]],[6.75,ROWS[route]]];
    const points=[raw[0]],radius=.38;
    for(let i=1;i<raw.length-1;i++){
      const a=raw[i-1],b=raw[i],d=raw[i+1],la=Math.hypot(b[0]-a[0],b[1]-a[1]),lb=Math.hypot(d[0]-b[0],d[1]-b[1]);
      const before=[b[0]-(b[0]-a[0])*radius/la,b[1]-(b[1]-a[1])*radius/la],after=[b[0]+(d[0]-b[0])*radius/lb,b[1]+(d[1]-b[1])*radius/lb];
      points.push(before);
      for(let step=1;step<=20;step++){const t=step/20,u=1-t;points.push([u*u*before[0]+2*u*t*b[0]+t*t*after[0],u*u*before[1]+2*u*t*b[1]+t*t*after[1]]);}
    }
    points.push(raw.at(-1));const cumulative=[0];
    for(let i=1;i<points.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    return{points,cumulative,length:cumulative.at(-1)};
  }
  const PATHS=[0,1,2].map(makePath);
  function along(route,distance){
    const path=PATHS[route];let i=1;while(i<path.points.length-1&&path.cumulative[i]<distance)i++;
    const a=path.points[i-1],b=path.points[i],length=path.cumulative[i]-path.cumulative[i-1],fraction=clamp((distance-path.cumulative[i-1])/length,0,1);
    return{x:a[0]+(b[0]-a[0])*fraction,y:a[1]+(b[1]-a[1])*fraction,angle:Math.atan2(b[1]-a[1],b[0]-a[0])};
  }
  window.createGame=function(api){
    const p=api.progress;p.level=integer(p.level,1,999)?p.level:1;p.best=Number.isFinite(p.best)?Math.max(0,p.best):0;
    let s,touch=null,pulse=0,feedback=0;
    function hud(){api.hud('LIVRAISONS',s.delivered+'/'+s.target,'NIVEAU',s.level,'EN ATTENTE',s.queue.length+'/5');}
    function newTrain(){const express=Math.random()<Math.min(.45,.25+(s.level-1)*.025);return{id:s.nextId++,color:Math.floor(Math.random()*3),express,speed:speed(s.level,express)};}
    function reset(){
      s={game:'gare-en-panique',version:2,level:p.level,route:1,target:8+Math.min(p.level-1,8)*2,delivered:0,
        queue:[],trains:[],scheduled:0,nextId:1,time:0,spawn:0,lastDispatch:-9,finished:false};
      for(let i=0;i<2;i++){s.queue.push(newTrain());s.scheduled++;}
      touch=null;pulse=0;feedback=0;hud();api.toast('Choisissez directement le quai 1, 2 ou 3, puis Départ. Un train engagé garde sa voie.');api.save();
    }
    const trainPosition=train=>along(train.route===null?s.route:train.route,train.distance);
    function finish(won,reason){
      if(s.finished)return;s.finished=true;const score=s.delivered*100+(won?Math.max(0,300-Math.floor(s.time)):0);
      p.best=Math.max(p.best,score);api.save();api.end(won?'Service impeccable !':'Service interrompu',reason||'Tous les trains ont trouvé leur quai. Le prochain service sera plus rapide.',score,won);
    }
    function choose(route){
      if(s.finished||!integer(route,0,2))return;s.route=route;feedback=.25;
      const engaged=s.trains.some(train=>train.route!==null&&train.distance<4.2);
      api.toast('Voie '+(route+1)+' · '+NAMES[route]+(engaged?' sélectionnée. Le train déjà engagé conserve sa route.':'. Le prochain train non engagé la suivra.'));api.save();
    }
    function dispatchWait(){
      if(!s.queue.length)return 0;
      const follower=s.queue[0],v=follower.speed;let wait=Math.max(0,.18-(s.time-s.lastDispatch));
      for(const ahead of s.trains){
        const route=ahead.route===null?ahead.color:ahead.route;
        const shared=route===follower.color?PATHS[route].length:3.9;
        if(ahead.distance>=shared+.8)continue;
        // At the end of the shared route a faster follower still needs .8 cell clearance.
        const ratio=ahead.speed/v;
        const required=v>ahead.speed?.8*ratio+shared*(1-ratio):.8;
        wait=Math.max(wait,(required-ahead.distance)/ahead.speed);
      }
      return Math.max(0,wait);
    }
    function dispatch(){
      if(s.finished||!s.queue.length)return;const wait=dispatchWait();
      if(wait>.001){pulse=.3;api.toast('Espacement de sécurité : départ possible dans '+wait.toFixed(1)+' s. Les express sont plus rapides.');return;}
      const train=s.queue.shift();train.distance=0;train.route=null;s.trains.push(train);s.lastDispatch=s.time;hud();api.save();
    }
    function update(dt){
      if(!s||s.finished)return;dt=clamp(Number(dt)||0,0,.08);s.time+=dt;if(s.scheduled<s.target)s.spawn+=dt;
      pulse=Math.max(0,pulse-dt);feedback=Math.max(0,feedback-dt);
      if(s.scheduled<s.target&&s.spawn>=interval(s.level)){
        s.spawn-=interval(s.level);
        if(s.queue.length>=5){finish(false,'La file est pleine. Faites partir les trains au rythme des arrivées.');return;}
        s.scheduled++;s.queue.push(newTrain());hud();api.save();
      }
      const arrived=[];
      for(const train of s.trains){
        const distance=train.distance+train.speed*dt;
        if(train.route===null&&distance>=COMMIT)train.route=s.route;
        train.distance=distance;
        if(train.route!==null&&distance>=PATHS[train.route].length){
          if(train.route!==train.color){finish(false,'Le train '+(train.color+1)+' '+NAMES[train.color]+' a rejoint le quai '+(train.route+1)+'. Choisissez sa voie avant le cercle central.');return;}
          arrived.push(train.id);s.delivered++;hud();
        }
      }
      if(arrived.length){s.trains=s.trains.filter(train=>!arrived.includes(train.id));api.save();}
      for(let i=0;i<s.trains.length;i++)for(let j=i+1;j<s.trains.length;j++){
        const a=trainPosition(s.trains[i]),b=trainPosition(s.trains[j]);
        if(Math.hypot(a.x-b.x,a.y-b.y)<COLLISION){finish(false,'Collision sur une voie commune. Le choix d’une autre voie ne dévie pas les trains déjà engagés.');return;}
      }
      if(s.delivered>=s.target)finish(true);
    }
    function rail(c,route,color,width){
      c.beginPath();PATHS[route].points.forEach((point,i)=>{const pnt=screen(...point);if(!i)c.moveTo(pnt.x,pnt.y);else c.lineTo(pnt.x,pnt.y);});
      c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();
    }
    function trainShape(c,x,y,angle,color,express,number,scale){
      c.save();c.translate(x,y);c.rotate(angle);c.scale(scale||1,scale||1);
      box(c,-16,-11,32,22,6,color,'#ffffff77');box(c,5,-7,7,14,3,'#20313b');
      c.fillStyle='#fff0b9';c.fillRect(13,-6,3,4);c.fillRect(13,2,3,4);
      text(c,String(number),-6,4,12,'#17313b','center');
      if(express){c.strokeStyle='#fff7df';c.lineWidth=2;c.beginPath();c.moveTo(-13,-5);c.lineTo(-10,0);c.lineTo(-13,5);c.stroke();}c.restore();
    }
    function draw(c){
      if(!s)return;const bg=c.createLinearGradient(0,0,420,600);bg.addColorStop(0,'#213747');bg.addColorStop(1,'#101c29');c.fillStyle=bg;c.fillRect(0,0,420,600);
      text(c,'POSTE D’AIGUILLAGE '+String(s.level).padStart(2,'0'),26,27,12,'#7eddd2');
      text(c,'Choisissez. Faites partir.',26,52,21);text(c,'Touchez un quai ou 1 / 2 / 3 · voie immédiate',26,75,12,'#a7bec8');
      text(c,'×'+(speed(s.level,false)/1.55).toFixed(1),392,29,14,'#f8bd70','right');
      box(c,15,95,390,322,17,'#142b36','#345260');
      for(let i=0;i<28;i++){c.fillStyle='#244350';c.beginPath();c.arc(28+(i*83)%365,109+(i*47)%285,i%3===0?3:1.5,0,Math.PI*2);c.fill();}
      for(let route=0;route<3;route++){rail(c,route,'#0a1721',15);rail(c,route,'#6c858d',9);rail(c,route,'#1b3039',4);}
      rail(c,s.route,COLORS[s.route]+(feedback?'dd':'88'),5);
      for(const train of s.trains)if(train.route!==null&&train.distance<4.1&&train.route!==s.route)rail(c,train.route,COLORS[train.color]+'55',3);
      const sw=screen(2,3);c.fillStyle=pulse?'#ff8e7766':COLORS[s.route]+'22';c.beginPath();c.arc(sw.x,sw.y,30,0,Math.PI*2);c.fill();
      c.strokeStyle=COLORS[s.route];c.lineWidth=2;c.beginPath();c.arc(sw.x,sw.y,23,0,Math.PI*2);c.stroke();
      text(c,String(s.route+1),sw.x,sw.y+5,16,COLORS[s.route],'center');text(c,'OPTION : TOURNER',sw.x-2,sw.y+49,8,'#a7bec8','center');
      for(let route=0;route<3;route++){
        const pnt=screen(6.75,ROWS[route]),active=route===s.route;
        box(c,pnt.x-17,pnt.y-25,33,50,7,active?COLORS[route]+'66':COLORS[route]+'22',COLORS[route]);
        text(c,String(route+1),pnt.x,pnt.y+6,20,COLORS[route],'center');text(c,NAMES[route],pnt.x-3,pnt.y-32,9,COLORS[route],'right');
      }
      for(const train of s.trains){const pos=trainPosition(train),pnt=screen(pos.x,pos.y);trainShape(c,pnt.x,pnt.y,pos.angle,COLORS[train.color],train.express,train.color+1);}
      for(let route=0;route<3;route++){
        const left=25+route*125,active=route===s.route;
        box(c,left,427,120,42,10,active?COLORS[route]+'44':'#1b3441',active?COLORS[route]:'#38525e');
        text(c,(route+1)+' · '+NAMES[route],left+60,453,13,COLORS[route],'center');
      }
      text(c,s.scheduled<s.target?'ARRIVÉE '+Math.max(0,Math.ceil(interval(s.level)-s.spawn))+' s':'DERNIERS DÉPARTS',26,487,10,'#a7bec8');
      text(c,'Le premier train part en premier',393,487,10,'#a7bec8','right');
      for(let i=0;i<5;i++){
        const left=26+i*75,train=s.queue[i];box(c,left,495,67,41,8,i===0?'#294653':'#1c323f',i===0?'#6d8d94':'#314d5b');
        if(train){trainShape(c,left+20,513,0,COLORS[train.color],train.express,train.color+1,.7);text(c,train.express?'EXP':'LOC',left+49,517,9,COLORS[train.color],'center');}
        else text(c,'·',left+34,522,21,'#4a6572','center');
      }
      const wait=dispatchWait(),ready=s.queue.length>0&&wait<=.001;
      box(c,26,547,265,42,11,ready?'#86e2cf':pulse?'#73504a':'#34545e');
      text(c,!s.queue.length?'EN ATTENTE':ready?'DÉPART DU PREMIER TRAIN':'ESPACEMENT · '+wait.toFixed(1)+' s',158,573,12,ready?'#15313a':'#c6dcda','center');
      box(c,303,547,91,42,11,'#294653','#52717e');text(c,'TOURNER',348,573,11,'#f2eee5','center');
    }
    function pointer(type,x,y){
      if(type==='down'){touch={x,y};return;}if(type==='cancel'){touch=null;return;}
      if(type!=='up'||!touch||!s||s.finished)return;const distance=Math.hypot(x-touch.x,y-touch.y);touch=null;if(distance>25)return;
      if(y>=427&&y<=469&&x>=25&&x<395){const route=Math.floor((x-25)/125);if(route<3)choose(route);return;}
      if(x>=270&&x<=408&&y>=103&&y<=391){const route=ROWS.findIndex(row=>Math.abs(y-screen(6.75,row).y)<35);if(route>=0){choose(route);return;}}
      const sw=screen(2,3);
      if(Math.hypot(x-sw.x,y-sw.y)<35||x>=303&&x<=394&&y>=547&&y<=591)choose((s.route+1)%3);
      else if(x>=26&&x<=291&&y>=547&&y<=591)dispatch();
    }
    function key(k,down){
      if(!down||!s||s.finished)return;const value=String(k).toLowerCase();
      if(['1','2','3'].includes(value))choose(Number(value)-1);
      else if([' ','space','enter'].includes(value))dispatch();
      else if(['arrowleft','a','q'].includes(value))choose((s.route+2)%3);
      else if(['arrowright','d','arrowup','arrowdown'].includes(value))choose((s.route+1)%3);
    }
    function snapshot(){return clone(s);}
    function validTrain(train,active,level){
      if(!train||!integer(train.id,1,1000000)||!integer(train.color,0,2)||typeof train.express!=='boolean'||!Number.isFinite(train.speed)||Math.abs(train.speed-speed(level,train.express))>1e-8)return false;
      if(!active)return train.distance===undefined&&train.route===undefined;
      if(!Number.isFinite(train.distance)||train.distance<0||!(train.route===null||integer(train.route,0,2)))return false;
      if(train.route===null)return train.distance<COMMIT;
      return train.distance>=COMMIT&&train.distance<PATHS[train.route].length;
    }
    function restore(data){
      if(!data||data.game!=='gare-en-panique'||data.version!==2||data.finished!==false||!integer(data.level,1,999)||!integer(data.route,0,2))return false;
      if(data.target!==8+Math.min(data.level-1,8)*2||!integer(data.delivered,0,data.target-1)||!integer(data.scheduled,2,data.target)||!integer(data.nextId,1,1000000))return false;
      if(!Number.isFinite(data.time)||data.time<0||!Number.isFinite(data.spawn)||data.spawn<0||data.spawn>interval(data.level)||!Number.isFinite(data.lastDispatch)||data.lastDispatch>data.time)return false;
      if(!Array.isArray(data.queue)||data.queue.length>5||!data.queue.every(train=>validTrain(train,false,data.level))||!Array.isArray(data.trains)||data.trains.length>data.target||!data.trains.every(train=>validTrain(train,true,data.level)))return false;
      const all=data.queue.concat(data.trains),ids=new Set(all.map(train=>train.id));
      if(all.length+data.delivered!==data.scheduled||ids.size!==all.length||all.some(train=>train.id>=data.nextId))return false;
      s=clone(data);touch=null;pulse=0;feedback=0;hud();return true;
    }
    function next(){p.level=Math.min(999,Math.max(p.level,s.level+1));reset();}
    return{reset,update,draw,pointer,key,snapshot,restore,next};
  };
}());