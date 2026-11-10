# 핵심 공식 (게임 코드 원문)

`reference/pixel-football.html` 에서 그대로 뽑은 함수입니다. 상수 `C.xxx` 는 `data/tuning.json` 의 `key`, `SPE(t).xxx`/`sp.xxx` 는 팀 지시 실효값(`data/team-instructions.json`), `RI/RO(p)` 는 역할 보정(`data/roles.json` 의 `mod`), `TR(p)` 는 선수 특성, `TQv/K/AB/SA` 는 전술 이해도·규칙 이해도·악용 성향·코치진 능력치입니다.

## summarize — 전술 요약: 친숙도·필요 능력·실행력 (상성 계산의 입력)

```js
function summarize(shape,style,list,params,shapeO,roles){
  const form=shape.name; shapeO=shapeO||shape;
  const out=list.filter(p=>p.role!=='GK'), n=Math.max(1,out.length), av=f=>out.reduce((a,p)=>a+f(p),0)/n;
  const fw=out.filter(p=>p.role==='FW'), paceF=fw.length?fw.reduce((a,p)=>a+p.tech.pace,0)/fw.length:av(p=>p.tech.pace);
  const tq=k=>av(p=>p.mind.tac.k[k]), fam=av(p=>((famFw(p.mind,shape.w)+famFw(p.mind,shapeO.w))/2+p.mind.tac.famS[style])/2);
  // 역할 적합도: 역할의 핵심 능력치를 선수가 얼마나 갖췄는지
  let rf=0.6; if(roles){ const v=list.map(p=>{ const R=IP_ROLES[roles[p.i]]; if(!R||!p.tech) return 0.6; let a=0,w=0; for(const k in R.needs){ a+=p.tech[k]*R.needs[k]; w+=R.needs[k]; } return w?a/w:0.6; }); rf=v.reduce((a,b)=>a+b,0)/Math.max(1,v.length); }
  const needs=STYLES[style].needs; let need=0,nw=0; for(const k in needs){ need+=(TKS.has(k)?av(p=>p.tech[k]):tq(k))*needs[k]; nw+=needs[k]; }
  const tacAvg=TQ.reduce((a,[k])=>a+tq(k),0)/TQ.length;
  return {form,style,sp:params||STYLES[style],z:zonesOf(shape.pos),zo:zonesOf(shapeO.pos),fam,need:need/nw,roleFit:rf,exec:clamp(adaptFam(list,fam)*0.45+tacAvg*0.45+rf*0.1+0.03+(list[0]&&list[0].t!=null&&game&&game.staff?(SA(list[0].t,'tacK')-0.5)*0.12:0),0,1),
    passCtrl:av(p=>(p.tech.pass+p.tech.ctrl)/2),paceF,head:av(p=>p.tech.head),cross:av(p=>p.tech.cross),
    tac:{press:tq('press'),pos:tq('pos'),build:tq('build'),trans:tq('trans'),line:tq('line'),width:tq('width')}};
}
```

## matchup — 상성 계산 (11개 항목)

```js
function matchup(A,B){
  const one=(X,Y)=>{ const a=X.sp,b=Y.sp; return {
    terr:0.35*((a.line+a.engage)/2-0.45)*X.passCtrl*X.tac.build,
    mid:(X.z.cm-Y.zo.cm)*0.06,
    wide:0.03*a.width*(0.5+X.cross)*(X.z.wideHigh-Y.zo.wide*0.6),
    front:0.025*(X.z.front-(Y.zo.cb-1)),
    press:0.7*(a.engage*0.5+a.press*0.5)*X.tac.press*(0.62-Y.passCtrl)*(1-0.4*b.buildDirect),
    space:0.6*(a.direct*0.5+a.tempo*0.5)*X.paceF*(b.line-0.35),
    thru:0.5*(a.spacePass*0.7+a.runBehind*0.3)*X.paceF*(b.line-0.35)*(1.1-0.4*b.trap),
    block:-0.22*(1-b.line)*Y.tac.pos*(0.55-a.width)*(1-a.direct),
    bypass:0.3*(a.direct*0.5+a.buildDirect*0.5)*(b.engage-0.4)*X.head,
    trans:0.25*a.atkTrans*X.paceF*(1-b.defTrans)*(b.line-0.3),
    exec:0.25*(X.exec-0.6) }; };
  const x=one(A,B), y=one(B,A), c={}; let total=0;
  for(const k in x){ c[k]=x[k]-y[k]; total+=c[k]; }
  return {c,total:clamp(total,-1,1)};
}
```

## computeTactics — 3초마다 상성·실행력 반영, 지시 실효값(spE)

```js
function computeTactics(){
  game.tacT=game.t;
  const S=[0,1].map(t=>summarize(TEAMS[t].shape,TEAMS[t].style,ON.filter(p=>p.t===t),TEAMS[t].params,TEAMS[t].shapeO,TEAMS[t].rolesI));
  const m=matchup(S[0],S[1]);
  if(!game.waiting&&game.phase!=='ft'){ const a=game.muAvg||(game.muAvg={n:0,c:{}}); a.n++; for(const k in m.c) a.c[k]=(a.c[k]||0)+m.c[k]; }
  for(let t=0;t<2;t++){
    const T=TEAMS[t]; T.sum=S[t]; T.exec=S[t].exec; T.adv=t===0?m.total:-m.total; T.mu=m;
    const P=T.params||STYLES[T.style];
    T.spE={}; for(const [k] of SP_KEYS) T.spE[k]=clamp(0.5+(P[k]-0.5)*(0.35+0.65*T.exec)*C.styleEffect,0,1);
    if(game.staff&&T.score<TEAMS[1-t].score&&game.clock>70){ const d=SA(t,'det')*Math.min(1,(game.clock-70)/20)*0.25; for(const k of ['engage','line','tempo','direct','press']) T.spE[k]=clamp(T.spE[k]+d,0,1); }
  }
  tacticsDirty=true;
}
```

## aiParams — AI 감독의 지시 값: 스타일 + 성향 보정 + 상대 분석 조정

```js
function aiParams(ci,style,M,O){ const prm={...STYLES[style]}; const S=CLUBS[ci]; if(S.tweak&&S.pref&&style===S.pref.style) Object.assign(prm,S.tweak);
  if(O&&O.params){   // 상대(유저) 전술을 읽은 만큼 조정: 높은 라인이면 뒤를 찌르고, 공간 패스가 많으면 라인을 내림
    const r=M&&M.mind&&M.mind.tac?M.mind.tac.k.read:0.5, op=O.params, hi=clamp((op.line-0.5)*2.5,0,1), th=clamp((op.spacePass*0.7+op.runBehind*0.3-0.45)*2.5,0,1)*clamp((prm.line-0.35)*2.5,0,1);
    prm.spacePass=clamp(prm.spacePass+0.45*r*hi,0,1); prm.runBehind=clamp(prm.runBehind+0.35*r*hi,0,1); prm.direct=clamp(prm.direct+0.2*r*hi,0,1); prm.buildDirect=clamp(prm.buildDirect+0.15*r*hi,0,1);
    prm.line=clamp(prm.line-0.25*r*th,0,1); prm.trap=clamp(prm.trap-0.2*r*th,0,1);
    prm.adapt={hi:r*hi,th:r*th}; }
  prm.waste=clamp(prm.waste+(AB(M)-0.35)*0.8,0,1); return prm; }
```

## chooseTactics — AI 감독의 포메이션·스타일 선택

```js
function chooseTactics(t){
  const useBans=game.mode==='league', ci=TEAMS[t].ci, oci=TEAMS[1-t].ci, M=mgrOf(ci,useBans), read=M.mind.tac.k.read;
  const oM=mgrOf(oci,useBans), best=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0][0];
  const OT=TEAMS[1-t];
  let oForm=best(oM.mind.tac.famF), oStyle=best(oM.mind.tac.famS), O;
  if(OT.userCtl&&OT.shape&&players.some(p=>p.t===1-t)){   // 유저의 실제 전술을 분석
    oForm=OT.form; oStyle=OT.style; O=summarize(OT.shape,OT.style,players.filter(p=>p.t===1-t&&p.st!=='off'),OT.params,OT.shapeO,OT.rolesI);
  } else { const oSh=shapeOfKey(oForm); O=summarize(oSh,oStyle,squadList(oci,oForm,useBans),STYLES[oStyle],shapeOfPos(deriveOOP(oSh.pos,STYLES[oStyle]))); }
  let top=null; const cache={};
  for(const f of (CLUBS[ci].pref?[CLUBS[ci].pref.form,CLUBS[ci].pref.sub]:FKEYS)){ const list=cache[f]||(cache[f]=squadList(ci,f,useBans));
    for(const st of SKEYS){ const sh=shapeOfKey(f), A=summarize(sh,st,list,STYLES[st],shapeOfPos(deriveOOP(sh.pos,STYLES[st])));
      const fit=0.3*A.fam+0.3*A.need+0.4*(M.mind.tac.famF[f]+M.mind.tac.famS[st])/2;   // 감독 자신의 철학 비중 큼
      const mu=matchup(A,O).total, score=fit+read*mu*0.8+(1-read)*rnd(-0.06,0.06);
      if(!top||score>top.score) top={form:f,style:st,score,fit,mu}; } }
  return {...top,M,read,oForm,oStyle};
}
```

## xgAt — 득점 기대값 근사

```js
function xgAt(t,x,y,blk){ const gx=goalX(t), dx=Math.abs(gx-x), a=Math.abs(Math.atan2(CY+GH-y,dx)-Math.atan2(CY-GH-y,dx)), dG=hyp(gx-x,CY-y);
  return clamp(C.xgK*a*Math.exp(-dG/C.xgDist),0,0.9)/(1+0.7*(blk||0)); }
```

## decide — 공 가진 선수의 판단: 슈팅/걷어내기/크로스/패스/드리블

```js
function decide(p){
  const t=p.t,gx=goalX(t),dG=hyp(gx-p.x,CY-p.y),pr=nearestOpp(p),press=pr?pr.d:99;
  if(p.fkShot){ shoot(p,99,true); return; }
  const spT=SPE(t), ri=RI(p), inB=inBox(1-t,p.x,p.y);
  if(!p.mustPass&&dG<C.shotRange&&Math.abs(p.y-CY)<70){
    // 내 슈팅의 기대값 vs 가장 좋은 패스를 받은 동료의 기대값(패스가 끊길 위험 반영) — 더 나은 쪽을 고름
    const far=!inB&&dG>=40;
    const shotV=xgAt(t,p.x,p.y,shotBlockers(p,gx))*(0.6+0.8*p.tech.shoot)*(press<6?0.8:1)*(1+(ri.shoot||0))*(1+C.matchupEffect*ADV(t))*(far?(0.6+0.8*spT.longShot)*(1+0.3*(TR(p).longShot||0)):1);
    let passV=0; const lineO=Math.max(offsideLine(t),0.5);
    for(const m of ON){ if(m.t!==t||m===p||m.role==='GK'||prog(t,m.x)>lineO) continue; let lane=99,mark=99;
      for(const q of ON){ if(q.t===t) continue; lane=Math.min(lane,segDist(q.x,q.y,p.x,p.y,m.x,m.y)); mark=Math.min(mark,hyp(q.x-m.x,q.y-m.y)); }
      const v=xgAt(t,m.x,m.y,shotBlockers(m,gx))*(0.6+0.8*m.tech.shoot)*Math.min(1,lane/7)*(mark<6?0.55:1); if(v>passV) passV=v; }
    const need=Math.max(C.shotMinXG*(0.5+spT.patience)*(inB?0.7:1)*(press<9&&inB?0.6:1)*(!inB&&TEAMS[t].counterUntil>game.t&&press>10?C.ctrHold:1), passV*C.shootEdge);   // 역습 중 앞이 비었으면 더 끌고 들어감
    if(shotV*rnd(0.8,1.2)>need){ shoot(p,press); return; }
  }
  const sp=SPE(t), ctr=TEAMS[t].counterUntil>game.t, own3=prog(t,p.x)<0.35, dir=own3?sp.buildDirect:sp.direct;
  if(!p.mustPass&&own3&&press<14&&Math.random()<C.clearance*(0.4+1.0*sp.buildDirect)*(1+(ri.clear||0))){ clearBall(p); return; }
  if(!p.mustPass&&prog(t,p.x)>0.8-0.16*sp.crossEarly&&Math.abs(p.y-CY)>50&&Math.random()<C.crossRate*(0.3+1.2*sp.cross)*(1+(ri.cross||0))*(1+0.5*(TR(p).cross||0))*(1.2-0.5*sp.patience)){ cross(p); return; }
  const lw=m=>(TEAMS[t].dir>0?(CY-m.y):(m.y-CY))/(PH/2);   // 공격 방향 기준 왼쪽(+)
  let best=null;
  for(const m of ON){
    if(m.t!==t||m===p) continue;
    if(m.role==='GK'&&!(press<8&&prog(t,p.x)<0.35)) continue;
    const d=hyp(m.x-p.x,m.y-p.y); if(d<16||d>C.passMax*(0.8+0.5*dir)*(1+0.3*(ri.longPass||0))*(ctr?1.3:1)) continue;
    const g=prog(t,m.x)-prog(t,p.x); let lane=99,mark=99;
    for(const q of ON){ if(q.t===t) continue; lane=Math.min(lane,segDist(q.x,q.y,p.x,p.y,m.x,m.y)); mark=Math.min(mark,hyp(q.x-m.x,q.y-m.y)); }
    const lv=prog(t,m.x)-Math.max(offsideLine(t),0.5), fwdRun=m.moving&&m.ux*TEAMS[t].dir>0.3;
    const thru=lv<=0&&lv>-0.05&&fwdRun?2.2*(0.15+clamp(sp.spacePass+0.3*(TR(p).throughBall||0),0,1)):lv>0?-(0.4+2.6*K(p,'off')):0;   // 오프사이드 위치는 이해도만큼 피함
    let s=thru+g*(1.6+1.8*dir+(ctr&&lane>=6?C.ctrVert:0)+(ri.passFwd||0))+(0.5-sp.side)*lw(m)*1.2+rnd(-1,1)*(sp.freedom*0.5+(ri.freedom||0))*0.5+Math.min(lane,14)/14*0.7*(1.2-TQv(p,'build')*0.4)+Math.min(mark,24)/24*C.markAvoid-(mark<7?C.markAvoid*0.8*(0.6+0.4*TQv(p,'build')):0)-d/260-(TR(p).shortPass||0)*d/120; if(lane<4) s-=1.6*(1.3-sp.risk);
    if(prog(t,p.x)>0.7&&g<0) s+=g*C.backPen*(1.3-sp.patience);   // 골문 근처 백·횡패스 비용
    if(!best||s>best.s) best={m,s,d};
  }
  if(best){
    const dr=clamp((prog(t,p.x)>0.66?sp.dribbleFinal:sp.dribble)+(ri.dribble||0)+0.3*(TR(p).dribble||0),0,1.2);   // 전개 지역 / 마무리 지역 드리블   // 드리블 지시·역할: 높을수록 공을 더 끌고 감
    let carry=false; if(ctr&&!p.mustPass&&press>10){ const ahead=q=>prog(t,q.x)>prog(t,p.x); const oa=ON.filter(q=>q.t!==t&&q.role!=='GK'&&ahead(q)).length, ma=ON.filter(q=>q.t===t&&q!==p&&ahead(q)).length; const gap=nearestOpp(p,p.x+TEAMS[t].dir*20,p.y); carry=oa<=ma+1&&(!gap||gap.d>14)&&Math.random()<0.4+0.5*dr; }
    const want=!carry&&(p.mustPass||ctr||(press<9?best.s>-0.6:(best.s>0.85-0.4*sp.tempo+0.3*dr&&Math.random()<(0.4+0.4*sp.tempo)*(1.3-0.8*dr))||(best.s>0.4&&Math.random()<(0.1+0.15*sp.tempo)*(1.3-0.8*dr))));
    if(want){ pass(p,best.m); return; }
  }
  p.mustPass=false;
}
```

## pass — 패스 실행: 공간 패스 리드, 정확도, 오프사이드 판정

```js
function pass(p,m){
  const spc=clamp(SPE(p.t).spacePass+0.3*(TR(p).throughBall||0),0,1);
  const fwdRun=m.moving&&m.ux*TEAMS[p.t].dir>0.3;   // 앞으로 침투 중인 선수에게만 공간으로, 나머지는 발밑으로
  const lead=fwdRun?0.2+0.6*spc+0.3*(RI(m).runBehind||0):0.1;
  const tx=m.x+(m.moving?m.ux*m.spd*lead:0)+(fwdRun?TEAMS[p.t].dir*(1+8*spc):0),ty=m.y+(m.moving?m.uy*m.spd*lead:0);
  const press=(nearestOpp(p)||{d:99}).d, dd=hyp(tx-p.x,ty-p.y),err=(1+C.staSkill*1.5*(1-(p.sta||1)))*(TEAMS[p.t].counterUntil>game.t?0.85:1)*((1-(p.role==='GK'?p.tech.kick:p.tech.pass))*C.passErr+(press<7?C.passErr*0.6*(1.2-p.tech.ctrl):0))*(1-C.matchupEffect*ADV(p.t))*(1.1-0.2*SA(p.t,'att'))*MOR(p.t)*rnd(-1,1),ang=Math.atan2(ty-p.y,tx-p.x)+err,lifted=dd>110;
  // 오프사이드 판정: 패스 순간 받는 선수 위치
  let line=Math.max(offsideLine(p.t),0.5); const mp=prog(p.t,m.x),bp=prog(p.t,ball.x);
  { const tr=SPE(1-p.t).trap; if(tr>0.05&&mp>0.5){ const dfs=ON.filter(q=>q.t!==p.t&&q.role==='DF'), lk=dfs.length?dfs.reduce((a,q)=>a+TQv(q,'line'),0)/dfs.length:0.5;
      if(Math.random()<lk){ line-=tr*0.03; TEAMS[1-p.t].trapOK=(TEAMS[1-p.t].trapOK||0)+1; } else { line+=tr*0.025; TEAMS[1-p.t].trapFail=(TEAMS[1-p.t].trapFail||0)+1; } } }
  const isThrow=p.y<PY0||p.y>PY1;
  kick(p,ang,lifted?clamp(dd*0.95+30,90,200):clamp(dd*1.5+C.passArrive,70,300),lifted?rnd(55,80):0);
  const ar=ARm(arFor(m.x)), ka=K(ar,'off');
  if(!isThrow&&mp>line&&mp>bp){
    const margin=(mp-line)*PW;
    ball.offside={m,flagged:margin>2+(1-ka)*6||Math.random()>=C.linesmanMiss*(1.5-ka),x:m.x,y:m.y,lineX:wx(p.t,line),margin};
  } else if(!isThrow&&mp>0.5&&mp>bp&&(line-mp)*PW<4&&Math.random()<(1-ka)*0.35){
    ball.offside={m,flagged:true,wrong:true,x:m.x,y:m.y,lineX:wx(p.t,line),margin:-(line-mp)*PW};   // 실제로는 온사이드인데 깃발
  }
  ball.passFrom=p; ball.target=m; TEAMS[p.t].passes++;
}
```

## shoot — 슈팅 실행: 길목 수비수 블록

```js
function shoot(p,press,fk=false){
  const t=p.t,gx=goalX(t),dG=hyp(gx-p.x,CY-p.y);
  const aim=CY+(fk?(Math.random()<.5?-1:1)*rnd(GH-8,GH-3):rnd(-GH+3,GH-3));
  // 슈팅 길목의 수비수: 몸으로 막거나(블록) 각도를 좁혀 정확도를 떨어뜨림 — 밀집 수비의 핵심 효과
  const blk=fk?0:shotBlockers(p,gx);
  const err=rnd(-1,1)*(blk*C.blockErr+(1-p.tech.shoot)*C.shotErrSkill+(press<8?C.shotErrPress:0)+dG*(fk?C.shotErrDist*0.6:C.shotErrDist))*(1.15-0.3*SA(t,'att'))*MOR(t);
  kick(p,Math.atan2(aim+err-p.y,gx-p.x),fk?rnd(170,200):rnd(C.shotSpdMin,C.shotSpdMin+(C.shotSpdMax-C.shotSpdMin)*(0.45+0.55*p.tech.shoot)),fk?rnd(52,64):rnd(5,C.shotLiftMax));
  ball.shot=true; TEAMS[t].shots++;
  if(blk&&Math.random()<1-Math.pow(1-C.blockHit,blk)){ const a=Math.atan2(ball.vy,ball.vx)+Math.PI+rnd(-1.3,1.3), v=rnd(40,110); ball.vx=Math.cos(a)*v; ball.vy=Math.sin(a)*v; ball.vz=rnd(0,30); ball.shot=false; TEAMS[t].blocked=(TEAMS[t].blocked||0)+1; }
}
```

## homeOf — 선수 위치 결정: 라인·오버랩·침투·레스트 디펜스·역습

```js
function homeOf(p){
  const t=p.t,bp=prog(t,ball.x), T=TEAMS[t];
  const att=ball.owner?ball.owner.t===t:(ball.last?ball.last.t===t:false);
  // 공격 시 / 수비 시 포메이션 자리
  const [bfx,bfy,prole]=att?[p.bfx,p.bfy,p.role]:(p.oop||[p.bfx,p.bfy,p.role]);
  const ri=RI(p), ro=RO(p), follow=1-0.4*(att?(ri.hold||0):0);
  let fx=prole==='DF'&&!att?bfx+(bp-0.5)*0.7*follow+0.05:bfx+((bp-0.5)*0.55*follow+(att?0.1:-0.02))*(att&&prole==='DF'?C.restMin+(1-C.restMin)*SPE(t).line:1);   // 레스트 디펜스: 라인이 낮은 팀은 공격할 때도 수비수가 덜 올라감
  // 수비수: 오프사이드를 잘 알면 라인을 끌어올려 함정을 만들고, 모르면 혼자 처져 상대를 온사이드로 만듦
  if(prole==='DF'&&!att) fx+=(K(p,'off')-0.6)*0.07+AB(p)*K(p,'off')*0.035+(game.staff?(K(boss(t),'off')-0.6)*0.03:0);   // 감독의 오프사이드 이해도만큼 라인 운영
  if(att&&prole==='FW') fx+=0.08;
  const sp=SPE(t), lab=posLabel(bfx,bfy);
  if(att){
    fx+=(ri.fwd||0);                                                                 // 역할: 전진·후퇴
    if(/B$/.test(lab)){ const L=(TEAMS[t].dir>0)===(bfy<0.5); fx+=0.09*sp.overlap*clamp(1+(L?-1:1)*(sp.overlapSide-0.5)*1.6,0.2,1.8); }   // 풀백 지원 침투 지시 · 측면
    if(prole!=='DF') fx+=0.035*(sp.runBehind-0.5)+0.03*(ri.runBehind||0);            // 뒷공간 침투 지시·역할
    if(bp>0.6&&ri.runBox) fx+=0.06*ri.runBox;                                         // 박스 침투 역할
  } else {
    fx-=(ro.deep||0); fx+=(ro.stepUp||0);
    if(prole==='DF'&&!ball.owner&&ball.vx*TEAMS[t].dir>30) fx+=0.06*(sp.stepUp-0.3);   // 라인 전진: 공이 우리 진영 밖으로 나가는 순간 라인을 끌어올림
    if(T.regroupUntil>game.t) fx-=0.06;                                              // 공 뺏긴 직후 대형 복귀
  }
  fx+=(sp.line-0.5)*(att?0.1:0.22);                                                // 스타일의 라인 높이
  if(!att&&prole==='FW'&&fx<bfx) fx+=(bfx-fx)*C.outletKeep*sp.atkTrans;            // 역습 출구: 공 뺏은 직후 지시만큼 최전방이 덜 내려옴
  if(att&&prole!=='DF'&&TEAMS[t].counterUntil>game.t) fx+=C.ctrRun*(0.5+0.5*TQv(p,'trans'))*(prole==='FW'?1:0.75);    // 역습 전환: 공격수·미드필더가 함께 침투
  if(prole==='DF'&&!att) fx+=(TQv(p,'line')-0.6)*0.05;                             // 라인 조율 이해도
  fx+=Math.sin(game.t*0.37+p.i*3.1+p.t)*(1-TQv(p,'pos'))*0.05*(att?1:1.3-0.6*SA(t,'def'));                     // 포지셔닝이 약하면 대형이 흐트러짐
  const [a,b]=LIM[prole]; fx=clamp(fx,a,b);
  if(att&&prole!=='DF'){ // 오프사이드 라인에 맞춰 침투 (가끔 타이밍을 놓침)
    // 공격수: 이해도가 낮을수록 자주·깊이 라인을 넘고, 영리한 선수는 라인에 딱 맞춰 침투
    const ko=K(p,'off'), sharp=AB(p)*ko;          // 규칙을 활용하려는 정도 × 이해도 → 라인에 바짝 붙음
    // 침투하는 선수: 공격수, 또는 뒷공간·박스 침투 역할의 미드필더. 팀의 '패스 받는 방식' 지시만큼 자주 뜀
    const runner=prole==='FW'||(ri.runBehind||0)>0||(ri.runBox||0)>0;
    const freq=clamp(C.runFreq*(1.5-ko)*(0.6+0.8*sp.runBehind)*(runner?1:0.25)*(1+0.4*(TR(p).runBehind||0)),0,1), depth=C.runDepth*(1.6-ko)*(1-sharp)+0.004*sharp;
    const lineT=Math.max(offsideLine(t),0.5), running=prog(t,ball.x)>0.3&&(TEAMS[t].counterUntil>game.t||Math.sin(game.t*0.6+p.i*2.3+p.t*1.7)>Math.cos(Math.PI*freq));
    // 뛰는 순간에는 실제로 라인을 넘어 들어가고(패스 타이밍이 늦으면 오프사이드), 아니면 라인에 맞춰 대기
    fx=running?Math.min(0.97,Math.max(fx,lineT+depth)):Math.min(fx,Math.max(lineT-0.008,prog(t,ball.x)));
  }
  let fy0=bfy;
  if(att){ const dy=fy0-0.5; fy0=0.5+dy*(1+(ri.wide||0)*4)-Math.sign(dy)*(ri.inside||0); if(bp>0.6&&ri.runBox) fy0=0.5+(fy0-0.5)*(1-0.5*ri.runBox); }
  if(att&&/B$/.test(lab)&&bp>0.45) fy0=0.5+(fy0-0.5)*(1-0.45*sp.underlap*sp.overlap);   // 언더랩: 풀백이 안쪽 통로로 침투
  let fy=0.5+(fy0-0.5)*(att?0.75+0.5*sp.width*(0.6+0.4*TQv(p,'width')):0.85)+(ball.y-CY)/PH*0.35+Math.sin(game.t*0.7+p.i*1.7+p.t*2)*(0.02+(1-TQv(p,'pos'))*0.03);
  fy=clamp(fy,.04,.96);
  return [wx(t,fx),PY0+fy*PH];
}
```

## computeRoles — 압박 담당 선정: 압박 시작선·재압박·체력

```js
function computeRoles(){
  const chase=[null,null],cover=[null,null];
  const gkHold=ball.owner&&ball.owner.role==='GK'&&ball.owner.hands;
  for(let t=0;t<2;t++){
    if(ball.owner&&ball.owner.t===t) continue;
    if(gkHold) continue; // 손으로 잡은 골키퍼에게는 도전 불가 → 압박하지 않음
    const px=ball.x+ball.vx*0.35,py=ball.y+ball.vy*0.35, sp=SPE(t);
    const s=ON.filter(p=>p.t===t&&p.role!=='GK'&&p.cool<=0).map(p=>({p,d:hyp(p.x-px,p.y-py)})).sort((a,b)=>a.d-b.d);
    // 압박 시작선: 이 선보다 우리 골문 쪽으로 공이 오면 압박. 공 뺏긴 직후 재압박 중이면 어디서든
    const cp=TEAMS[t].cpUntil>game.t;
    const tsta=s.length?s.reduce((a,x)=>a+x.p.sta,0)/s.length:1;
    const inZone=!ball.owner||cp||prog(t,ball.x)<0.3+0.68*sp.engage*(0.55+0.45*tsta);
    if(s[0]&&(inZone||s[0].d<12)&&!(TEAMS[t].regroupUntil>game.t&&s[0].d>14)) chase[t]=s[0].p;
    if(ball.owner&&s[1]) cover[t]=s[1].p;
    // 압박 빈도 × 압박 이해도(또는 적극 압박 역할): 두 번째 선수도 협력 압박
    if(ball.owner&&s[1]&&inZone&&(cp||(sp.press*TQv(s[1].p,'press')+(RO(s[1].p).press||0)*0.3)*(0.4+0.6*s[1].p.sta)>0.42)) cover[t]={press:s[1].p};
  }
  return {chase,cover};
}
```

## movePlayers — 선수 이동: 마킹 간격·패스 받으러 가기·라인 뒤 추격

```js
function movePlayers(dt,live){
  const {chase,cover}=live?computeRoles():{chase:[],cover:[]};
  for(const p of ON){
    if(p.down){p.moving=false;continue;}
    if(!live&&p===ball.owner){p.moving=false;continue;}
    let tx,ty,sp=p.spd;
    if(p.role==='GK'){ [tx,ty,sp]=gkTarget(p); if(!live&&ball.owner!==p){tx=ownX(p.t)+TEAMS[p.t].dir*5;ty=CY;} }
    else if(ball.owner===p){ [tx,ty]=dribbleTarget(p); sp*=0.78+0.2*p.tech.drib; }
    else if(!ball.owner&&ball.target===p){ const v2=ball.vx*ball.vx+ball.vy*ball.vy; if(v2>400){ const k=Math.max(0,((p.x-ball.x)*ball.vx+(p.y-ball.y)*ball.vy)/v2); tx=ball.x+ball.vx*k; ty=ball.y+ball.vy*k; } else { tx=ball.x; ty=ball.y; } sp*=1.05; }   // 패스를 받으러 감: 공이 지나갈 길목으로
    else if(chase[p.t]===p){ tx=ball.x+ball.vx*0.3; ty=ball.y+ball.vy*0.3+Math.sign(CY-ball.y)*(SPE(p.t).funnel-0.5+(RO(p).funnel||0)*0.5)*12; sp*=0.95+0.2*SPE(p.t).press; }   // 압박 함정: 안쪽/바깥쪽을 막아 몰아감
    else if(cover[p.t]&&cover[p.t].press===p){ tx=ball.x+ball.vx*0.2; ty=ball.y+ball.vy*0.2; }
    else if(cover[p.t]===p){ const ox=ownX(p.t); tx=ball.x+(ox-ball.x)*0.3; ty=ball.y+(CY-ball.y)*0.3; }
    else if(!ball.owner||ball.owner.t!==p.t){
      const ro=RO(p), og=ball.owner&&ball.owner.role==='GK';
      // 상대 GK 짧은 배급 막기: 전방 선수가 상대 수비수를 붙잡음
      if(og&&p.role!=='DF'&&((p.i*0.37)%1)<SPE(p.t).gkPress&&(p.gkMark||(p.gkMark=nearestOf(1-p.t,p.x,p.y)))){ const m=p.gkMark; tx=m.x+(ownX(p.t)-m.x)*0.1; ty=m.y; }
      else if(ro.press&&ball.owner&&hyp(p.x-ball.x,p.y-ball.y)<25){ tx=ball.x; ty=ball.y; }      // 적극 압박 역할
      else if(ro.mark&&ball.owner){ const m=nearestOf(1-p.t,...homeOf(p)); tx=m.x+(ownX(p.t)-m.x)*0.08; ty=m.y; }   // 맨마킹 역할
      else { [tx,ty]=homeOf(p); const mt=SPE(p.t).markTight; if(ball.owner&&mt>0.05){ const m=nearestOf(1-p.t,tx,ty); if(m&&hyp(m.x-tx,m.y-ty)<30){ const w=0.55*mt; tx+=(m.x+(ownX(p.t)-m.x)*0.08-tx)*w; ty+=(m.y-ty)*w; } } }
      if(!og) p.gkMark=null;
    }
    else [tx,ty]=homeOf(p);
    if(p.role==='DF'&&!ball.owner&&ball.last&&ball.last.t!==p.t){ const od=-TEAMS[p.t].dir; if(ball.vx*od>40&&(ball.x-p.x)*od>0) sp*=C.turnSlow*(0.85+0.3*p.tech.pace); }
    moveTo(p,tx,ty,sp*(1-C.staEffect+C.staEffect*p.sta),dt);
  }
  separate();
}
```

## moveTo — 이동과 체력 소모: 거리 + 압박 강도

```js
function moveTo(p,tx,ty,sp,dt){
  const dx=tx-p.x,dy=ty-p.y,d=hyp(dx,dy);
  if(d<0.6||sp<=0){p.moving=false;return;}
  const v=Math.min(sp,d*4);
  p.x+=dx/d*v*dt; p.y+=dy/d*v*dt; p.ux=dx/d; p.uy=dy/d;
  if(Math.abs(dx)>0.3) p.face=Math.sign(dx);
  p.anim+=v*dt*0.32; p.moving=v>6;
  if(p.role!=='GK'){ const fit=(p.tech?1.5-p.tech.stam:1)*(p.tech?1.3-0.6*SA(p.t,'fit'):1);
    p.sta-=v*dt*0.0001*C.staDrain*fit;
    if(p.team&&!(ball.owner&&ball.owner.t===p.t)){ const S=SPE(p.t), I=S.engage*0.45+S.press*0.35+S.line*0.2+(TEAMS[p.t].cpUntil>game.t?0.25:0); p.sta-=dt*90/MATCH_SECONDS/90*C.pressFat*Math.max(0,I-0.35)*fit; }   // 수비 시 압박 강도만큼 팀 전체가 지침
    p.sta=Math.max(0.2,p.sta); }
  p.x=clamp(p.x,PX0-6,PX1+6); p.y=clamp(p.y,PY0-6,PY1+6);
}
```

## clearBall — 걷어내기: 역습 출구 노리기

```js
function clearBall(p){
  // 앞에 남아 있는 동료(역습 출구)가 있으면 그쪽으로 길게, 없으면 측면으로 멀리 걷어냄
  const sp=SPE(p.t), fw=ON.filter(m=>m.t===p.t&&m!==p&&m.role!=='GK'&&prog(p.t,m.x)>0.5).sort((a,b)=>prog(p.t,b.x)-prog(p.t,a.x))[0];
  if(fw&&Math.random()<C.clearAim*(0.4+0.6*Math.max(sp.buildDirect,sp.atkTrans))*(0.6+0.4*p.tech.kick)){
    const dd=hyp(fw.x-p.x,fw.y-p.y), tx=fw.x+TEAMS[p.t].dir*rnd(4,16), ty=fw.y+rnd(-12,12);
    kick(p,Math.atan2(ty-p.y,tx-p.x)+rnd(-1,1)*(0.12-0.08*p.tech.kick),clamp(dd*0.95+30,90,220),rnd(50,75)); ball.target=fw; ball.passFrom=p; TEAMS[p.t].passes++; return; }
  const side=p.y<CY?-1:1, tx=wx(p.t,rnd(.4,.85)), ty=CY+side*rnd(70,150);
  kick(p,Math.atan2(ty-p.y,tx-p.x)+rnd(-.3,.3),rnd(160,230),rnd(45,90));
}
```

## gain — 공 소유 획득: 전환(역습·재압박) 시작

```js
function gain(p){
  const off=ball.offside;
  if(off){
    ball.offside=null;
    if(off.m===p){
      if(off.flagged){ callOffside(p,off); return false; }
      ball.hiddenOff=p.t; ball.hiddenSpot={x:off.x,y:off.y,lineX:off.lineX,margin:off.margin}; rc('arMiss');
    }
  }
  if(ball.hiddenOff!=null&&p.t!==ball.hiddenOff) ball.hiddenOff=null;
  if(ball.setPiece&&p.t!==ball.setPiece.t) ball.setPiece=null;
  if(ball.passFrom&&ball.passFrom.t===p.t&&ball.passFrom!==p) TEAMS[p.t].passOk++;
  if(ball.last&&ball.last.t!==p.t){ p.gainT=game.t;   // 공을 뺏은 순간만 첫 터치 보호
    const sp=SPE(p.t), lost=1-p.t, sl=SPE(lost);
    if(Math.random()<sp.atkTrans) TEAMS[p.t].counterUntil=game.t+C.ctrDur*(0.4+0.6*TQv(p,'trans'))*sp.atkTrans;   // 공 뺏은 직후
    if(Math.random()<sl.defTrans) TEAMS[lost].cpUntil=game.t+1.2+2*sl.defTrans; else TEAMS[lost].regroupUntil=game.t+1.5+2*(1-sl.defTrans);   // 공 뺏긴 직후
  }
  ball.passFrom=null; ball.gkRel=null; ball.target=null; ball.owner=p; ball.last=p; ball.shot=false; ball.vx=ball.vy=ball.vz=0; ball.z=0;
  p.think=TEAMS[p.t].counterUntil>game.t?rnd(.05,.15):rnd(.15,.35);   // 역습 전환 땐 첫 터치로 바로 연결
  if(p.role==='GK'){ p.no8=false; p.hands=true; p.handT=0; const dl=delayFor(p,p.t,8,'gk'); p.hold=dl<3?rnd(C.gkHoldMin,C.gkHoldMax)*(1.4-0.8*SPE(p.t).gkSpeed):dl*REF_S; p.enf8=enforce(REFm(),'gk'); p.mustPass=true; }
  return true;
}
```

## 태클·반칙 (step 내부 블록)

```js
const tq=ON.filter(q=>q.t!==o.t&&q.cool<=0).map(q=>[q,hyp(q.x-ball.x,q.y-ball.y)]).sort((a,b)=>a[1]-b[1]);
    for(let ti=0;ti<tq.length;ti++){ const q=tq[ti][0], second=ti>0?C.tackleSecond:1;
      const isGK=q.role==='GK';
      if(isGK&&!inBox(q.t,ball.x,ball.y)) continue;
      const d=tq[ti][1]; if(d>=C.tackleRadius) break;
      // 전술적 반칙: 영리·악용형이 역습을 끊음. 잘 아는 선수는 퇴장감(DOGSO)이면 참음
      if(!isGK&&prog(o.t,o.x)>0.45&&o.moving&&Math.random()<C.tacticalRate*dt*AB(q)*2){
        if(!(isDogso(q,o)&&Math.random()<K(q,'foul'))){ foul(q,o,{tactical:true}); return; }   // 퇴장감인 줄 알면 참음 (이해도에 비례)
      }
      if(Math.random()<(isGK?2.8*(0.5+0.5*q.tech.hand):C.tackleRate*second*(game.t-(o.gainT||-9)<C.shieldT?C.shieldMul*(1.3-0.6*o.tech.ctrl):1)*(0.3+0.7*q.tech.tack)*(1-C.staSkill*(1-q.sta))*(1+(RI(q).win||0))*(0.75+0.5*SPE(q.t).tackle)*(1+0.5*(TR(q).tackle||0))*(0.85+0.3*SA(q.t,'def'))/MOR(q.t))*(1.35-o.tech.drib*0.6)*(1+C.matchupEffect*ADV(q.t))*dt){
        const behind=((o.x-q.x)*o.ux+(o.y-q.y)*o.uy)>0;
        const fp=(isGK?0.12:C.foulBase+(behind?C.foulBehind:0)+(1-q.tech.tack)*0.2)*(0.75+0.7*AB(q))*(1.3-K(q,'foul')*0.6)*(0.7+0.6*SPE(q.t).tackle)*(1+0.4*(TR(q).tackle||0));
        if(Math.random()<fp*(inBox(q.t,ball.x,ball.y)?C.foulBoxMul*(1.6-K(q,'foul')):1)){ foul(q,o); return; }
        if(Math.random()<C.dangerPlay){
          TEAMS[q.t].fouls++; rc('danger'); ball.owner=null; ball.vx=ball.vy=0;
          log(`위험한 플레이: ${who(q)} 발을 높이 듦 → 간접 프리킥`,q.t);
          stop(withSubs([{dur:0.9,msg:'FOUL',hold:true}],freeKickSteps(o.t,{x:clamp(ball.x,PX0+3,PX1-3),y:clamp(ball.y,PY0+3,PY1-3)},o,true))); return;
        }
        TEAMS[q.t].tackles++; o.cool=0.6;
        if(isGK) gain(q);
        else { ball.owner=null; const a=rnd(0,Math.PI*2), sp=rnd(50,120); ball.vx=Math.cos(a)*sp; ball.vy=Math.sin(a)*sp; ball.last=q; q.cool=0.05; }
        return;
      }
    }
```

## 패스 차단 (공 줍기 블록)

```js
    // 패스 차단: 빠른 패스일수록, 수비수가 지쳤을수록 지나가는 공을 끊기 어려움 (프레임마다 판정)
    if(ball.passFrom&&p.t!==ball.passFrom.t&&p.role!=='GK'){ const v=hyp(ball.vx,ball.vy);
      if(v>50&&Math.random()>=clamp(C.interceptBase*(1.25-v/C.interceptSpd)*(0.7+0.3*p.tech.tack+0.2*TQv(p,'pos'))*(1-C.staSkill*(1-p.sta)),0.04,1)) return; }
```
