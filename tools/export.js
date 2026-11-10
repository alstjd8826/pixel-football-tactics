// 게임 HTML 의 세팅 상수를 실행해서 JSON 으로 뽑는다. usage: node tools/export.js <html> <outdir>
const fs=require('fs'), path=require('path'); const [,,file,out]=process.argv;
let s=fs.readFileSync(file,'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const tail="startMatch();\nshow('name');\nrequestAnimationFrame(frame);\n})();";
if(!s.includes(tail)) throw 'tail';
s=s.replace(tail,`module.exports.D={CFG_DEF,INSTR,IGROUPS,STYLES,IP_ROLES,OOP_ROLES,FORMS:typeof FORMS!=='undefined'?FORMS:null,CLUBS,MGR_PRESETS,RK,TQ,TK,MA:typeof MA!=='undefined'?MA:null,MA_BIAS:typeof MA_BIAS!=='undefined'?MA_BIAS:null,PT,MU_LABEL,MU_NAME,GEO:{W,H,PX0,PX1,PY0,PY1,PW,PH,CX,CY,GH,GD,BAR,BOX_D,BOX_H,SIX_D,SIX_H,DT,GROWS,GCOLS},ME,STAFF_ROLES}; })();`);
const stub=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='length'?0:stub(),apply:()=>stub(),set:()=>true,construct:()=>stub()});
global.document=stub(); global.window=global; global.location={hash:''}; global.addEventListener=()=>{}; global.requestAnimationFrame=()=>{}; global.setTimeout=()=>{}; global.localStorage={getItem:()=>null,setItem(){},removeItem(){}}; global.matchMedia=()=>({matches:false,addEventListener(){}}); global.performance={now:()=>0};
const mod={exports:{}}; new Function('module',s)(mod); const D=mod.exports.D;
console.log(Object.entries(D).map(([k,v])=>k+':'+(v==null?'null':Array.isArray(v)?v.length:typeof v==='object'?Object.keys(v).length:v)).join(' '));
fs.writeFileSync(path.join(out,'raw.json'),JSON.stringify(D,null,1));
