const canvas=document.getElementById("simCanvas"),ctx=canvas.getContext("2d");
let W=0,H=0,dpr=1,frame=0,paused=false,scenario="mixed",manual={x:0,y:0};
const TAU=Math.PI*2;
const ui={distance:document.getElementById("distance"),risk:document.getElementById("risk"),speed:document.getElementById("speed"),action:document.getElementById("action"),confidence:document.getElementById("confidence"),latency:document.getElementById("latency"),objectCount:document.getElementById("objectCount"),objectList:document.getElementById("objectList"),sceneName:document.getElementById("sceneName"),frameCount:document.getElementById("frameCount")};
const configs={mixed:{name:"MIXED TRAFFIC",objects:["car","bus","bike","auto","parked"]},pothole:{name:"POTHOLE + DEBRIS",objects:["pothole","debris","car","bike","parked"]},animal:{name:"ANIMAL CROSSING",objects:["cow","dog","bike","car","auto"]},pedestrian:{name:"PEDESTRIAN CROSSING",objects:["pedestrian","pedestrian","car","bike","auto"]},blocked:{name:"BLOCKED LANE",objects:["parked","parked","car","bus","debris"]},roadwork:{name:"ROADWORK",objects:["cone","cone","barrier","worker","car"]},oncoming:{name:"ONCOMING VEHICLE",objects:["oncoming","oncoming","bike","auto","parked"]}};
let ego={x:0,y:0,targetX:0},obstacles=[];
const lanes=[-1,0,1],laneX=l=>W/2+l*W*.19;
const SENSOR_RANGE_M=60;
const ROAD_LEFT_TOP=.13,ROAD_RIGHT_TOP=.87,ROAD_LEFT_BOTTOM=.03,ROAD_RIGHT_BOTTOM=.97;
const isCross=o=>["cow","dog","pedestrian","worker"].includes(o.type);
const isStatic=o=>["parked","pothole","debris","barrier","cone"].includes(o.type);

function resize(){
  const r=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);
  W=r.width;H=r.height;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
  ego.x=W/2;ego.y=H*.64;ego.targetX=ego.x;resetObjects();
}
window.addEventListener("resize",resize);

function resetObjects(){
  // Keep the initial scene clear of the ego vehicle.
  const safeSpawn=[
    {lane:-1,y:H*.08},{lane:1,y:H*.18},{lane:-1,y:-90},
    {lane:1,y:-170},{lane:0,y:-270},{lane:0,y:-390}
  ];
  obstacles=configs[scenario].objects.map((type,i)=>{
    if(isCross({type})){
      return {type,x:i%2?W*.10:W*.90,y:H*(.12+.12*i),lane:null,
        phase:Math.random()*TAU,speed:.6+Math.random()*.25,dir:i%2?1:-1,active:true};
    }
    const s=safeSpawn[i%safeSpawn.length];
    return {type,x:laneX(s.lane),y:s.y-Math.floor(i/6)*220,lane:s.lane,
      phase:Math.random()*TAU,speed:.6+Math.random()*.35,dir:i%2?1:-1,active:true};
  });
}

function setScenario(s){
  scenario=s;ui.sceneName.textContent=configs[s].name;resetObjects();
  document.querySelectorAll(".scenario").forEach(b=>b.classList.toggle("active",b.dataset.scenario===s));
}
document.querySelectorAll(".scenario").forEach(b=>b.addEventListener("click",()=>setScenario(b.dataset.scenario)));
document.getElementById("pauseBtn").addEventListener("click",e=>{paused=!paused;e.target.textContent=paused?"RESUME":"PAUSE"});

window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(["a","d","w","s","arrowleft","arrowright","arrowup","arrowdown"].includes(k))e.preventDefault();
  manual.x=(k==="a"||k==="arrowleft"?-1:k==="d"||k==="arrowright"?1:0);
  manual.y=(k==="w"||k==="arrowup"?-1:k==="s"||k==="arrowdown"?1:0);
});
window.addEventListener("keyup",e=>{
  if(["a","d","w","s","arrowleft","arrowright","arrowup","arrowdown"].includes(e.key.toLowerCase()))manual={x:0,y:0};
});

function drawRoad(){
  ctx.fillStyle="#0d151b";ctx.fillRect(0,0,W,H);ctx.fillStyle="#111c23";
  ctx.beginPath();ctx.moveTo(W*.13,0);ctx.lineTo(W*.87,0);ctx.lineTo(W*.97,H);ctx.lineTo(W*.03,H);ctx.closePath();ctx.fill();
  ctx.strokeStyle="rgba(130,180,190,.13)";[W*.31,W*.50,W*.69].forEach(x=>{ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()});
  for(let y=((frame*1.8)%64)-64;y<H;y+=64){
    ctx.setLineDash([24,30]);ctx.strokeStyle="rgba(145,190,198,.25)";
    [W*.405,W*.595].forEach(x=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+28);ctx.stroke()});
  }ctx.setLineDash([]);
}

function drawSensor(){
  const rx=Math.min(W,H)*.39,ry=Math.min(W,H)*.43,x=ego.x,y=ego.y;
  const g=ctx.createRadialGradient(x,y,20,x,y,Math.max(rx,ry));
  g.addColorStop(0,"rgba(98,230,208,.12)");g.addColorStop(.7,"rgba(98,230,208,.035)");g.addColorStop(1,"rgba(98,230,208,0)");
  ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();
  ctx.strokeStyle="rgba(98,230,208,.48)";ctx.setLineDash([5,5]);ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.stroke();ctx.setLineDash([]);
  [[0,-1],[1,0],[0,1],[-1,0]].forEach(([dx,dy])=>{ctx.strokeStyle="rgba(98,230,208,.16)";ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx*rx*.9,y+dy*ry*.9);ctx.stroke()});
}

/* ---------- Collision model ---------- */
function obstacleBox(o){
  if(o.type==="bus") return {x:22,y:36};
  if(o.type==="oncoming") return {x:20,y:30};
  if(o.type==="car") return {x:19,y:27};
  if(o.type==="parked") return {x:20,y:29};
  if(o.type==="auto") return {x:17,y:25};
  if(o.type==="bike") return {x:9,y:19};
  if(o.type==="barrier") return {x:29,y:11};
  if(o.type==="cone") return {x:13,y:18};
  if(o.type==="worker") return {x:14,y:20};
  if(o.type==="cow") return {x:24,y:22};
  if(o.type==="pedestrian"||o.type==="dog") return {x:13,y:20};
  if(o.type==="pothole") return {x:27,y:12};
  if(o.type==="debris") return {x:18,y:13};
  return {x:20,y:28};
}
const EGO_HALF_W=27,EGO_HALF_H=45,SAFE_X=12,SAFE_Y=16;

function predictObstacle(o,t){
  let x=o.x,y=o.y;
  if(isCross(o)){
    x+=o.dir*(o.type==="pedestrian"?1.25:o.type==="cow"?0.72:0.78)*t;
    const period=W+160;
    while(x<-80)x+=period;while(x>W+80)x-=period;
    y+=Math.sin(o.phase+t*.02)*.2;
  }else{
    y+=(o.type==="oncoming"?1.55:o.speed*(.9+Math.sin(o.phase+t*.02)*.15))*t;
  }
  return{x,y};
}
function rectCollision(ex,ey,px,py,b){
  return Math.abs(ex-px)<EGO_HALF_W+b.x+SAFE_X &&
         Math.abs(ey-py)<EGO_HALF_H+b.y+SAFE_Y;
}
function roadBoundsAtY(y){
  const q=Math.max(0,Math.min(1,y/Math.max(1,H)));
  return {
    left:W*(ROAD_LEFT_TOP+(ROAD_LEFT_BOTTOM-ROAD_LEFT_TOP)*q),
    right:W*(ROAD_RIGHT_TOP+(ROAD_RIGHT_BOTTOM-ROAD_RIGHT_TOP)*q)
  };
}
function onRoadX(x,y){
  const b=roadBoundsAtY(y);
  const margin=EGO_HALF_W+8;
  return x>=b.left+margin && x<=b.right-margin;
}
function clampToRoad(x,y){
  const b=roadBoundsAtY(y);
  const margin=EGO_HALF_W+10;
  return Math.max(b.left+margin,Math.min(b.right-margin,x));
}
function onRoadPath(fromX,toX){
  const steps=Math.max(8,Math.ceil(Math.abs(toX-fromX)/1.2));
  for(let i=0;i<=steps;i++){
    const q=i/steps,xx=fromX+(toX-fromX)*q;
    if(!onRoadX(xx,ego.y)) return false;
  }
  return true;
}

function pointSafe(x,t){
  if(!onRoadX(x,ego.y))return false;
  for(const o of obstacles){
    const p=predictObstacle(o,t),b=obstacleBox(o);
    if(p.y<ego.y-520||p.y>ego.y+180)continue;
    if(rectCollision(x,ego.y,p.x,p.y,b))return false;
  }
  return true;
}

/*
  Rolling-horizon gap planner.
  It searches actual lateral positions across the road, not only lane centers.
  The horizon is deliberately short enough that the planner can replan as
  traffic moves, so a later obstacle does not incorrectly block a usable gap.
*/
function planGap(){
  const minX=W*.16,maxX=W*.84;
  const step=Math.max(8,Math.min(14,W/75));
  const candidates=[];
  for(let x=minX;x<=maxX;x+=step)candidates.push(x);

  // Add exact gap candidates beside nearby obstacles.
  obstacles.forEach(o=>{
    const b=obstacleBox(o);
    [o.x-(b.x+EGO_HALF_W+SAFE_X+8),o.x+(b.x+EGO_HALF_W+SAFE_X+8)].forEach(x=>{
      if(x>=minX&&x<=maxX)candidates.push(x);
    });
  });
  candidates.push(ego.x,laneX(-1),laneX(0),laneX(1));

  const horizon=105;
  let best=null,bestScore=Infinity;
  for(const x of candidates){
    let safe=true;
    for(let t=0;t<=horizon;t+=3){
      if(!pointSafe(x,t)){safe=false;break}
    }
    if(!safe)continue;

    // Prefer small lateral motion, but prefer a real gap when the current
    // lane is threatened.
    let score=Math.abs(x-ego.x);
    const centerPenalty=Math.abs(x-W/2)*0.035;
    score+=centerPenalty;
    const centerSafe=pointSafe(W/2,24);
    if(!centerSafe && Math.abs(x-W/2)>22)score-=10;
    if(manual.x)score+=Math.abs(x-laneX(manual.x))*0.03;
    if(score<bestScore){bestScore=score;best=x;}
  }
  return best;
}

function immediateMoveClear(fromX,toX){
  if(!onRoadPath(fromX,toX))return false;
  const steps=Math.max(8,Math.ceil(Math.abs(toX-fromX)/1.2));
  for(let i=0;i<=steps;i++){
    const q=i/steps,xx=fromX+(toX-fromX)*q;
    for(const o of obstacles){
      const p=predictObstacle(o,q),b=obstacleBox(o);
      if(rectCollision(xx,ego.y,p.x,p.y,b))return false;
    }
  }
  return true;
}

function currentThreats(){
  return obstacles.map(o=>({...o,d:Math.hypot(o.x-ego.x,o.y-ego.y)}))
    .filter(o=>o.d<Math.min(W,H)*.52).sort((a,b)=>a.d-b.d);
}

let currentPlan={targetX:W/2,safe:true,gap:false};

function chooseLane(){
  const tx=planGap();
  if(tx===null)return{lane:0,targetX:ego.x,safe:false,gap:false};
  let nearestLane=0;
lanes.forEach(l=>{if(Math.abs(laneX(l)-tx)<Math.abs(laneX(nearestLane)-tx))nearestLane=l;});
  return{lane:nearestLane,targetX:tx,safe:true,gap:Math.abs(tx-laneX(nearestLane))>20};
}

function drawPath(){
  const tx=currentPlan.targetX;
  ctx.strokeStyle=currentPlan.safe?"rgba(98,230,208,.95)":"rgba(255,97,112,.9)";
  ctx.lineWidth=4;ctx.setLineDash([11,9]);ctx.beginPath();ctx.moveTo(ego.x,ego.y);
  ctx.bezierCurveTo(ego.x+(tx-ego.x)*.25,ego.y-100,tx,ego.y-190,tx,28);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=currentPlan.safe?"#62e6d0":"#ff6170";ctx.beginPath();ctx.arc(tx,33,4,0,TAU);ctx.fill();
}

function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function drawEgo(){
  ctx.save();ctx.translate(ego.x,ego.y);ctx.shadowBlur=26;ctx.shadowColor="rgba(98,230,208,.28)";
  const g=ctx.createLinearGradient(-25,-45,25,45);g.addColorStop(0,"#e8f0f2");g.addColorStop(1,"#71848d");
  ctx.fillStyle=g;rr(-27,-45,54,90,12);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#10232b";rr(-19,-31,38,27,7);ctx.fill();
  ctx.fillStyle="#dffefa";ctx.font="7px 'DM Mono'";ctx.textAlign="center";ctx.fillText("PATH AI",0,34);ctx.restore();
}
function drawObstacle(o){
  ctx.save();ctx.translate(o.x,o.y);
  if(o.type==="pothole"){ctx.fillStyle="#4d5c63";ctx.beginPath();ctx.ellipse(0,0,26,13,0,0,TAU);ctx.fill()}
  else if(o.type==="debris"){ctx.fillStyle="#a87951";ctx.rotate(.2);ctx.fillRect(-13,-8,26,16)}
  else if(o.type==="cone"){ctx.fillStyle="#ed8c42";ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(12,15);ctx.lineTo(-12,15);ctx.closePath();ctx.fill()}
  else if(o.type==="barrier"){ctx.fillStyle="#dbaa63";ctx.fillRect(-27,-9,54,18)}
  else if(isCross(o)){ctx.fillStyle=o.type==="worker"?"#e99b46":o.type==="cow"?"#b27b50":"#5a9dca";ctx.beginPath();ctx.arc(0,-13,7,0,TAU);ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(0,13);ctx.stroke()}
  else{let w=o.type==="bus"?34:o.type==="auto"?27:o.type==="bike"?14:31,h=o.type==="bus"?65:o.type==="bike"?35:52;
    ctx.fillStyle=o.type==="oncoming"?"#d45b67":o.type==="parked"?"#77878d":o.type==="bus"?"#4d8698":o.type==="auto"?"#bb8e50":"#668f9b";
    rr(-w/2,-h/2,w,h,7);ctx.fill();ctx.fillStyle="#dbe8ea";rr(-w*.32,-h*.34,w*.64,h*.24,4);ctx.fill()}
  ctx.restore();ctx.font="7px 'DM Mono'";ctx.textAlign="center";ctx.fillStyle="#76929b";ctx.fillText(o.type.toUpperCase(),o.x,o.y-28);
}

function updateObjects(){
  obstacles.forEach(o=>{
    o.phase+=.02;
    if(isCross(o)){
      // Crossing objects keep an independent straight-line trajectory.
      o.x+=o.dir*(o.type==="pedestrian"?1.25:o.type==="cow"?0.72:0.78);
      if(o.x<-80)o.x=W+80;if(o.x>W+80)o.x=-80;
    }else{
      o.y+=(o.type==="oncoming"?1.55:o.speed*(.9+Math.sin(o.phase)*.15));
    }
    if(o.y>H+100)o.y=-100-Math.random()*100;
  });
}

function analyze(){
  const threats=currentThreats(),c=threats[0],plan=currentPlan;
  let risk="LOW",speed=42,action=plan.safe?(plan.gap?"GAP NAVIGATION":"HOLD LANE"):"BRAKE / WAIT",conf=97;
  if(!plan.safe){risk="HIGH";speed=0;action="STOP — NO SAFE GAP";conf=99}
  else if(c){
    const sideNear=Math.abs(c.x-ego.x)<150&&Math.abs(c.y-ego.y)<170;
    const cm=sensorDistanceM(c);
    if(cm<=60 && (sideNear||c.y<=ego.y)){risk=cm<25?"HIGH":"MEDIUM";speed=cm<25?14:28;action=plan.gap?"DIVERT — 60 m RESPONSE":"REACT — 60 m RANGE";conf=98}
    else{action="MONITOR 360°";speed=42;conf=96}
  }
  ui.distance.textContent=c?Math.max(1,Math.round(sensorDistanceM(c)))+" m":"— m";
  ui.risk.textContent=risk;ui.risk.dataset.risk=risk;ui.speed.textContent=speed+" km/h";
  ui.action.textContent=action;ui.confidence.textContent=conf+"%";
  ui.latency.textContent=(24+Math.round(Math.random()*15))+" ms";
  ui.objectCount.textContent=threats.length;
  ui.objectList.innerHTML=threats.slice(0,8).map(o=>`<span class="object-chip">${o.type.toUpperCase()}</span>`).join("")||'<span class="object-chip">CLEAR</span>';
}


function emergencySeparate(){
  // Final visual safety net: if an obstacle is already inside the ego envelope,
  // immediately move the ego to the nearest currently clear position.
  let collision=false;
  for(const o of obstacles){
    const p={x:o.x,y:o.y},b=obstacleBox(o);
    if(rectCollision(ego.x,ego.y,p.x,p.y,b)){collision=true;break}
  }
  if(!collision)return;
  const candidates=[];
  for(let x=W*.16;x<=W*.84;x+=4){
    let safe=true;
    for(const o of obstacles){
      const b=obstacleBox(o);
      if(rectCollision(x,ego.y,o.x,o.y,b)){safe=false;break}
    }
    if(safe)candidates.push(x);
  }
  if(candidates.length){
    candidates.sort((a,b)=>Math.abs(a-ego.x)-Math.abs(b-ego.x));
    ego.x=candidates[0];
  }
}

function emergencySeparate(){
  for(const o of obstacles){
    const b=obstacleBox(o);
    if(!rectCollision(ego.x,ego.y,o.x,o.y,b))continue;
    let best=null,bestD=Infinity;
    for(let x=W*.16;x<=W*.84;x+=4){
      let safe=true;
      for(const other of obstacles){
        const ob=obstacleBox(other);
        if(rectCollision(x,ego.y,other.x,other.y,ob)){safe=false;break}
      }
      if(safe&&onRoadX(x,ego.y)&&Math.abs(x-ego.x)<bestD){best=x;bestD=Math.abs(x-ego.x)}
    }
    if(best!==null)ego.x=best;
  }
}
function sensorGeometry(){
  // The oval represents a 60 m detection envelope.
  return {rx:Math.min(W,H)*.39, ry:Math.min(W,H)*.43, rangeM:SENSOR_RANGE_M};
}
function sensorDistanceM(o){
  const {rx,ry,rangeM}=sensorGeometry();
  const dx=(o.x-ego.x)/rx, dy=(o.y-ego.y)/ry;
  return Math.sqrt(dx*dx+dy*dy)*rangeM;
}
function insideSensor(o){
  return sensorDistanceM(o)<=SENSOR_RANGE_M;
}
function isVehicle(o){
  return ["car","bus","auto","bike","oncoming"].includes(o.type);
}
function frontThreat(o){
  if(isStatic(o) && o.type!=="parked") return false;
  if(o.y > ego.y+90) return false;
  const {rx,ry}=sensorGeometry();
  const dx=(o.x-ego.x)/rx, dy=(o.y-ego.y)/ry;
  const inOval=dx*dx+dy*dy <= 1.0;
  const touchesFront=o.y <= ego.y-ry*.96 && Math.abs(o.x-ego.x) < rx*.95;
  // React at the full 60 m sensor range, with an extra front-edge check.
  return inOval || touchesFront;
}
function activeForwardThreats(){
  return obstacles.filter(frontThreat).sort((a,b)=>sensorDistanceM(a)-sensorDistanceM(b));
}
function chooseEvasiveTarget(threats){
  if(!threats.length) return null;
  const primary=threats[0];
  // Move away from the threat's lateral side, then validate with the full
  // collision planner. This is triggered as soon as a vehicle enters the oval
  // or reaches the front sensor perimeter.
  const preferred = primary.x >= ego.x ? laneX(-1) : laneX(1);
  const alternate = primary.x >= ego.x ? laneX(1) : laneX(-1);
  const candidates=[preferred,alternate,laneX(0)];
  for(const x of candidates){
    if(onRoadPath(ego.x,x) && immediateMoveClear(ego.x,x) && pointSafe(x,0) && pointSafe(x,18) && pointSafe(x,42)) return x;
  }
  const gap=planGap();
  return gap===null?ego.x:gap;
}
function updateEgo(){
  const threats=activeForwardThreats();
  const plan=chooseLane();

  // Once the obstacle has been crossed and is behind the ego vehicle, return
  // to the nearest normal lane. The return is still checked before every step.
  const obstacleStillAhead=threats.some(o=>o.y <= ego.y+55);
  let targetX=plan.targetX;
  let evasive=false;

  if(threats.length){
    const ev=chooseEvasiveTarget(threats);
    if(ev!==null){targetX=ev;evasive=true;}
  }else if(!obstacleStillAhead){
    const nearestLane=lanes.reduce((best,l)=>
      Math.abs(laneX(l)-ego.x)<Math.abs(laneX(best)-ego.x)?l:best,0);
    const laneTarget=laneX(nearestLane);
    if(immediateMoveClear(ego.x,laneTarget) && pointSafe(laneTarget,24)) targetX=laneTarget;
  }

  currentPlan={...plan,targetX,gap:plan.gap||evasive};
  const dx=targetX-ego.x;
  const maxStep=evasive?3.2:2.65;
  const next=ego.x+Math.max(-maxStep,Math.min(maxStep,dx*.09));

  if(onRoadPath(ego.x,next) && immediateMoveClear(ego.x,next) && pointSafe(next,18)){
    ego.x=next;
  }else{
    // Search for a nearby safe position rather than crossing through the threat.
    let moved=false;
    for(let offset=1;offset<=18&&!moved;offset++){
      for(const dir of [-1,1]){
        const alt=ego.x+dir*offset*2;
        if(alt<W*.16||alt>W*.84)continue;
        if(onRoadPath(ego.x,alt) && immediateMoveClear(ego.x,alt) && pointSafe(alt,18)){
          ego.x=alt;moved=true;break;
        }
      }
    }
    if(!moved)ego.targetX=ego.x;
  }
  ego.y=H*.64+Math.sin(frame*.02)*1.2;
  // Hard road-boundary constraint: the ego vehicle is never allowed to
  // leave the drivable road surface, even during emergency avoidance.
  ego.x=clampToRoad(ego.x,ego.y);
  ego.targetX=clampToRoad(ego.targetX,ego.y);
  emergencySeparate();
  // Emergency separation can move laterally; clamp once more after it.
  ego.x=clampToRoad(ego.x,ego.y);
  analyze();
}
function loop(){
  if(!paused){frame++;updateObjects();updateEgo()}
  drawRoad();drawPath();obstacles.forEach(drawObstacle);drawSensor();drawEgo();
  ui.frameCount.textContent=String(frame%10000).padStart(4,"0");requestAnimationFrame(loop);
}
resize();setScenario("mixed");loop();
