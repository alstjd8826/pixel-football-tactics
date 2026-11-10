// usage: node tools/run.js <html> <matches> [mytacJSON]
const fs=require('fs'); const [,,file,N='10',tac='']=process.argv;
let s=fs.readFileSync(file,'utf8'); s=s.match(/<script>([\s\S]*?)<\/script>/)[1];
const tail="startMatch();\nshow('name');\nrequestAnimationFrame(frame);\n})();";
if(!s.includes(tail)) throw 'tail';
s=s.replace(tail,`
const RES=[]; global.__DBG=[]; global.__W={n:0,blk0:0,blk1:0,blk2:0,blk3:0,pressed:0,free:0,must:0,choice:0,chance:0,psSum:0}; global.__H={n:0,ok:0,okL:0,L:0,lifted:0,early:0,midway:0,atTarget:0,beyond:0,'mk<6':0,'mk<12':0,'mk12+':0}; const TAC=${tac?tac:'null'};
for(let i=0;i<${+N};i++){ OPP=1+(i%7); if(TAC) MYTAC=JSON.parse(JSON.stringify(TAC)); global.__P=[0,1].map(()=>({sent:0,okTarget:0,okOther:0,oppField:0,oppGK:0,out:0,headOwn:0,headOpp:0,slow:0,mid:0,fast:0,tgtNear:0,tgtMid:0,tgtFar:0})); global.__X=[0,1].map(()=>({offCand:0,thruCand:0,passes:0,thru:0,toOff:0,dec:0,hold:0,tbOK:0,tbLost:0,tbGK:0,tbShotDirect:0})); startMatch(); __F=[{tac:0,tk:0,ok:0},{tac:0,tk:0,ok:0}]; kickOff(); let k=0; while(game.phase!=='ft'&&k<200000){ step(DT); k++; }
  __DBG.push([TEAMS[1].form,TEAMS[1].style,JSON.stringify(TEAMS[1].params.adapt||{}),game.muAvg?Object.entries(game.muAvg.c).map(([k,v])=>k+":"+(v/game.muAvg.n).toFixed(3)).join(","):""].join(" ")); RES.push(TEAMS.map((T,ti)=>({P:global.__P[ti],sta:players.filter(p=>p.t===ti&&p.role!=='GK'&&p.st==='on').reduce((a,p,_,A)=>a+p.sta/A.length,0),X:global.__X[ti],ps:T.passes,pk:T.passOk,po:T.poss,tk:T.tackles,F:(typeof __F!=="undefined"&&__F)?__F[ti]:{},g:T.score,f:T.fouls,y:T.yellows,r:T.reds,o:T.offsides,sh:T.shots,on:T.onT}))); }
module.exports.RES=RES; })();`);
const stub=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='length'?0:k==='style'||k==='dataset'||k==='classList'?stub():stub(),apply:()=>stub(),set:()=>true,construct:()=>stub()});
global.document=stub(); global.window=global; global.location={hash:''}; global.addEventListener=()=>{}; global.requestAnimationFrame=()=>{}; global.setTimeout=()=>{}; global.localStorage={getItem:()=>null,setItem(){},removeItem(){}}; global.matchMedia=()=>({matches:false,addEventListener(){}}); global.performance={now:()=>0};
global.module_={}; const f=new Function('module',s); const mod={exports:{}}; f(mod);
const R=mod.exports.RES, n=R.length, av=k=>(R.reduce((a,m)=>a+m[0][k]+m[1][k],0)/n).toFixed(2), me=k=>(R.reduce((a,m)=>a+m[0][k],0)/n).toFixed(2);
const FF=k=>(R.reduce((a,m)=>a+m[0].F[k],0)/n).toFixed(1); console.log("mine tactical",FF("tac"),"tackle-foul",FF("tk"),"clean tackles",FF("ok")); console.log(`n=${n} goals ${av('g')} fouls ${av('f')} (mine ${me('f')}) yellows ${av('y')} reds ${av('r')} offsides ${av('o')} shots ${av('sh')} onT ${av('on')} | my goals ${me('g')} vs ${(R.reduce((a,m)=>a+m[1].g,0)/n).toFixed(2)}`);
const per={}; R.forEach((m,i)=>{ const o=1+(i%7); (per[o]=per[o]||[0,0,0]); per[o][0]+=m[0].g; per[o][1]+=m[1].g; per[o][2]++; });
console.log('per opp (me-them):',Object.entries(per).map(([o,[a,b,c]])=>`${o}:${(a/c).toFixed(1)}-${(b/c).toFixed(1)}`).join(' '));
if(process.env.DBG) console.log(global.__DBG.join('\n'));
const A=(t,k)=>(R.reduce((a,m)=>a+(m[t][k]||0),0)/n).toFixed(2);
console.log('ME  shots',A(0,'sh'),'onT',A(0,'on'),'off',A(0,'o'),'passes',A(0,'ps'),'ok',A(0,'pk'),'poss',A(0,'po'),'tackles',A(0,'tk'));
console.log('AI  shots',A(1,'sh'),'onT',A(1,'on'),'off',A(1,'o'),'passes',A(1,'ps'),'ok',A(1,'pk'),'poss',A(1,'po'),'tackles',A(1,'tk'));
const XX=(t)=>{const o={}; for(const k in R[0][t].X) o[k]=(R.reduce((a,m)=>a+m[t].X[k],0)/n).toFixed(0); return JSON.stringify(o);};
console.log('ME X',XX(0)); console.log('AI X',XX(1));
console.log('end stamina me',A(0,'sta'),'ai',A(1,'sta'));
const PP=t=>{const o={}; for(const k in R[0][t].P) o[k]=(R.reduce((a,m)=>a+m[t].P[k],0)/n).toFixed(1); return JSON.stringify(o);}; console.log('ME P',PP(0)); console.log('AI P',PP(1));
if(global.__H) console.log('H', JSON.stringify(Object.fromEntries(Object.entries(global.__H).map(([k,v])=>[k,+(v/n).toFixed(1)]))));
if(global.__W) console.log('W', JSON.stringify(Object.fromEntries(Object.entries(global.__W).map(([k,v])=>[k,+(v/n).toFixed(2)]))), 'avg shot prob per decision', (global.__W.psSum/Math.max(1,global.__W.chance)).toFixed(2));
