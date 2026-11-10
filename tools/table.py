import json,sys
rows=[json.loads(l) for l in open(sys.argv[1]) if l.startswith('{')]
K=['possession','gegen','counter','lowblock','direct','wing']; NM={'possession':'점유','gegen':'게겐','counter':'역습','lowblock':'로우','direct':'다이렉트','wing':'측면'}
M={r['row']:r['out'] for r in rows}
# 대칭화: (a vs b) 와 (b vs a) 합산 → a 관점 득실
print('행 관점 평균 득실차 (양 진영 합산) / 승점률')
print('        '+''.join(f'{NM[c]:>9}' for c in K)+'   종합')
tot={}
for a in K:
    line=f'{NM[a]:<8}'; ss=[]
    for b in K:
        x=M[a][b]; y=M[b][a]; n=x['n']+y['n']
        gf=x['gf']+y['ga']; ga=x['ga']+y['gf']; pts=(3*(x['w']+y['l'])+(x['d']+y['d']))/(3*n)
        line+=f'{(gf-ga)/n:+6.2f}/{pts:.2f}'[:9].rjust(9); ss.append(pts)
    tot[a]=sum(ss)/len(ss); line+=f'   {tot[a]:.2f}'; print(line)
g=sum(M[a][b]['gf']+M[a][b]['ga'] for a in K for b in K)/sum(M[a][b]['n'] for a in K for b in K)
f=sum(M[a][b]['f'] for a in K for b in K)/sum(M[a][b]['n'] for a in K for b in K)
o=sum(M[a][b]['o'] for a in K for b in K)/sum(M[a][b]['n'] for a in K for b in K)
pc=sum(M[a][b]['pf']+M[a][b]['pa'] for a in K for b in K)/sum(2*M[a][b]['n'] for a in K for b in K)
print(f'경기당 골 {g:.2f} 파울 {f:.1f} 오프사이드 {o:.1f} 패스성공 {pc*100:.0f}%')
