# raw.json + 게임 HTML → 레포의 data/*.json, docs/formulas.md
import json,sys,os,re
raw,html,repo=sys.argv[1],sys.argv[2],sys.argv[3]
D=json.load(open(raw)); src=open(html).read()
os.makedirs(f'{repo}/data',exist_ok=True); os.makedirs(f'{repo}/docs',exist_ok=True)
def w(name,obj):
    json.dump(obj,open(f'{repo}/data/{name}','w'),ensure_ascii=False,indent=2); open(f'{repo}/data/{name}','a').write('\n')
# 1) 엔진 튜닝 파라미터
w('tuning.json',{'_doc':'엔진 튜닝 파라미터. default 가 현재 게임 값. min~max 는 연속 범위.',
  'params':[dict(key=r[0],group=r[1],name=r[2],desc=r[3],min=r[4],max=r[5],step=r[6],default=r[7],format=r[8],unit=(r[9] if len(r)>9 else '')) for r in D['CFG_DEF']]})
# 2) 팀 지시
w('team-instructions.json',{'_doc':'팀 지시. 모든 값은 0~1 연속값. scale 은 0 ↔ 1 의 의미. FM26 지시 체계를 연속값으로 옮김.',
  'groups':[dict(id=g,name=n) for g,n in D['IGROUPS']],
  'instructions':[dict(key=k,name=n,group=g,scale=h) for k,n,g,h in D['INSTR']]})
# 3) 스타일 템플릿
keys=[i[0] for i in D['INSTR']]
w('styles.json',{'_doc':'스타일(전술 템플릿). params 는 팀 지시 값(0~1), needs 는 이 스타일에 필요한 능력치 가중치.',
  'styles':{k:dict(name=v['name'],params={p:v[p] for p in keys},needs=v.get('needs',{})) for k,v in D['STYLES'].items()}})
# 4) 역할
w('roles.json',{'_doc':'선수 역할. area=맡을 수 있는 위치 라벨(*=GK 제외 전부), mod=움직임·판단 보정(연속값), needs=핵심 능력치 가중치.',
  'inPossession':D['IP_ROLES'],'outOfPossession':D['OOP_ROLES']})
# 5) 포메이션·좌표계
g=D['GEO']
w('formations.json',{'_doc':'포메이션 좌표. [fx, fy, 라인]. fx=0(우리 골라인)~1(상대 골라인), fy=0(왼쪽 터치라인)~1(오른쪽). GK 제외 10명, 순서가 슬롯 번호(1~10).',
  'positionLabels':'fx<0.28: DF(측면이면 LB/RB, 중앙 CB) · <0.36: DM/WB · <0.46: CM/LM·RM · <0.56: AM/LW·RW · 그 이상: ST/LW·RW. 측면 = fy<0.25 또는 >0.75',
  'grid':dict(rows=g['GROWS'],cols=g['GCOLS'],cellFx='0.12+(row-1)*0.055',cellFy='0.06+col*0.11'),
  'formations':D['FORMS']})
w('pitch.json',{'_doc':'경기장 픽셀 좌표계 (실제 105m 길이 = PW px). DT=시뮬레이션 한 스텝(초).','geometry':g,
  'pxPerMeter':round(g['PW']/105,3)})
# 6) AI 감독 (가상 인물)
w('managers.json',{'_doc':'AI 감독 7명 (모두 가상 인물). pref=주/부 포메이션과 주 스타일, tweak=주 스타일일 때 덮어쓰는 지시, roles/oop=위치별 선호 역할, read=경기 읽기(상대 분석 반영 정도), attr=감독 능력치(0~1).',
  'managers':[c for c in D['CLUBS'] if c.get('mgr')]})
# 7) 감독 전술 프리셋
w('presets.json',{'_doc':'감독 전술 프리셋. cells=공격 시 [행,열], cellsO=수비 시. 행 1(우리 골 쪽)~11, 열 0(왼쪽)~8. 슬롯 순서 1 LB,2 LCB,3 RCB,4 RB,5 LDM,6 RDM,7 LM/LW,8 AM,9 RM/RW,10 ST. roles 배열 0번은 GK.',
  'presets':D['MGR_PRESETS']})
# 8) 사람 속성
w('people.json',{'_doc':'사람(선수·코치진·심판)이 가진 연속 속성 정의. 값은 모두 0~1 (선수 특성만 -1~+1).',
  'ruleUnderstanding':[dict(key=k,name=n) for k,n in D['RK']],
  'tacticalUnderstanding':[dict(key=k,name=n) for k,n in D['TQ']],
  'technical':[dict(key=k,name=n) for k,n in D['TK']],
  'staffAttributes':[dict(key=k,name=n) for k,n in D['MA']],
  'staffRoleBias':D['MA_BIAS'],'staffRoles':[dict(name=n,key=k) for n,k in D['STAFF_ROLES']],
  'playerTraits':dict(range='-1(싫어함) ~ 0(중립) ~ +1(좋아함). 현재 게임은 전원 0',items=[dict(key=k,name=n,desc=d) for k,n,d in D['PT']])})
# 9) 상성 항목
w('matchup.json',{'_doc':'전술 상성 항목. 각 항목은 (A 기준 값 - B 기준 값). 합계가 + 면 A 유리. 공식은 docs/formulas.md',
  'components':{k:dict(label=D['MU_LABEL'].get(k),short=D['MU_NAME'].get(k)) for k in D['MU_LABEL']}})
# docs/formulas.md: 핵심 함수 원문 추출
def fn(name):
    m=re.search(r'\nfunction '+re.escape(name)+r'\(',src)
    if not m: m=re.search(r'\nconst '+re.escape(name)+r'=',src)
    i=m.start()+1; depth=0; j=src.index('{',i)
    k=j
    while True:
        c=src[k]
        if c=='{': depth+=1
        elif c=='}':
            depth-=1
            if depth==0: break
        k+=1
    return src[i:k+1]
secs=[('summarize','전술 요약: 친숙도·필요 능력·실행력 (상성 계산의 입력)'),('matchup','상성 계산 (11개 항목)'),('computeTactics','3초마다 상성·실행력 반영, 지시 실효값(spE)'),
 ('aiParams','AI 감독의 지시 값: 스타일 + 성향 보정 + 상대 분석 조정'),('chooseTactics','AI 감독의 포메이션·스타일 선택'),
 ('xgAt','득점 기대값 근사'),('decide','공 가진 선수의 판단: 슈팅/걷어내기/크로스/패스/드리블'),('pass','패스 실행: 공간 패스 리드, 정확도, 오프사이드 판정'),
 ('shoot','슈팅 실행: 길목 수비수 블록'),('homeOf','선수 위치 결정: 라인·오버랩·침투·레스트 디펜스·역습'),('computeRoles','압박 담당 선정: 압박 시작선·재압박·체력'),
 ('movePlayers','선수 이동: 마킹 간격·패스 받으러 가기·라인 뒤 추격'),('moveTo','이동과 체력 소모: 거리 + 압박 강도'),('clearBall','걷어내기: 역습 출구 노리기'),
 ('gain','공 소유 획득: 전환(역습·재압박) 시작')]
md=['# 핵심 공식 (게임 코드 원문)','',f'`reference/pixel-football.html` 에서 그대로 뽑은 함수입니다. 상수 `C.xxx` 는 `data/tuning.json` 의 `key`, `SPE(t).xxx`/`sp.xxx` 는 팀 지시 실효값(`data/team-instructions.json`), `RI/RO(p)` 는 역할 보정(`data/roles.json` 의 `mod`), `TR(p)` 는 선수 특성, `TQv/K/AB/SA` 는 전술 이해도·규칙 이해도·악용 성향·코치진 능력치입니다.','']
for n,t in secs:
    try: code=fn(n)
    except Exception as e: print('skip',n,e); continue
    md+= [f'## {n} — {t}','','```js',code,'```','']
# 태클·파울 구간 (함수 안쪽 블록)
i=src.index('const tq=ON.filter(q=>q.t!==o.t&&q.cool<=0)'); j=src.index('        return;\n      }\n    }',i)
md+=['## 태클·반칙 (step 내부 블록)','','```js',src[i:j+30].rstrip(),'```','']
i=src.index('    // 패스 차단'); j=src.index('\n',src.index('return; }',i))
md+=['## 패스 차단 (공 줍기 블록)','','```js',src[i:j],'```','']
open(f'{repo}/docs/formulas.md','w').write('\n'.join(md))
print('ok')
