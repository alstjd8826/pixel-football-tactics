// usage: node tools/matrix.js <html> <N per ordered pair> <rowStyle> [OPP]
// 팀0 = rowStyle, 팀1 = 각 스타일. 결과 JSON 한 줄
const fs=require('fs'); const [,,file,N='6',row,OPPI='2']=process.argv;
let s=fs.readFileSync(file,'utf8'); s=s.match(/<script>([\s\S]*?)<\/script>/)[1];
const tail="startMatch();\nshow('name');\nrequestAnimationFrame(frame);\n})();";
if(!s.includes(tail)) throw 'tail';
s=s.replace(tail,`
const FORM={possession:'4-3-3',gegen:'4-3-3',counter:'4-2-3-1',lowblock:'5-3-2',direct:'4-4-2',wing:'3-5-2'};
const OUT={};
for(const col of (${JSON.stringify(process.env.COLS?process.env.COLS.split(','):null)}||SKEYS)){ const acc={n:0,gf:0,ga:0,sf:0,sa:0,pf:0,pa:0,f:0,o:0,w:0,d:0,l:0};
  for(let i=0;i<${+N};i++){ OPP=${+OPPI};
    const P0={...STYLES['${row}'],...(${process.env.OVR||'{}'})}; MYTAC={auto:false,cells:cellsFromPos(formOf(FORM['${row}'])),cellsO:cellsFromPos(deriveOOP(formOf(FORM['${row}']),P0)),style:'${row}',params:P0};
    startMatch(); kickOff();
    const T=TEAMS[1]; if(T.form!==FORM[col]) applyFormation(1,FORM[col]); T.style=col; T.params={...STYLES[col]}; T.posO=deriveOOP(T.pos,T.params); T.shapeO=shapeOfPos(T.posO);
    for(const p of players) if(p.t===1&&p.st!=='off') p.oop=[T.posO[p.i][0],T.posO[p.i][1],p.i===0?'GK':T.posO[p.i][2]];
    aiRoles(1); computeTactics();
    let k=0; while(game.phase!=='ft'&&k<200000){ step(DT); k++; }
    const A=TEAMS[0],B=TEAMS[1]; acc.n++; acc.gf+=A.score; acc.ga+=B.score; acc.sf+=A.shots; acc.sa+=B.shots; acc.pf+=A.passOk/Math.max(1,A.passes); acc.pa+=B.passOk/Math.max(1,B.passes); acc.f+=A.fouls+B.fouls; acc.o+=A.offsides+B.offsides;
    if(A.score>B.score) acc.w++; else if(A.score<B.score) acc.l++; else acc.d++; }
  OUT[col]=acc; }
module.exports.OUT=OUT; })();`);
const stub=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='length'?0:stub(),apply:()=>stub(),set:()=>true,construct:()=>stub()});
global.document=stub(); global.window=global; global.location={hash:''}; global.addEventListener=()=>{}; global.requestAnimationFrame=()=>{}; global.setTimeout=()=>{}; global.localStorage={getItem:()=>null,setItem(){},removeItem(){}}; global.matchMedia=()=>({matches:false,addEventListener(){}}); global.performance={now:()=>0};
const mod={exports:{}}; new Function('module',s)(mod); console.log(JSON.stringify({row,out:mod.exports.OUT}));
