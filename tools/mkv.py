# usage: mkv.py src dst key=val ... style.key=val ...
import sys,re
src,dst=sys.argv[1],sys.argv[2]; s=open(src).read()
for kv in sys.argv[3:]:
    k,v=kv.split('=')
    if '.' in k:
        st,key=k.split('.'); i=s.index(st+":mkStyle("); j=s.index("{",i)+1; e=s.index("}",j); body=s[j:e]
        body2,n=re.subn(r"(?<![A-Za-z])"+key+r":[0-9.]+",key+":"+v,body)
        if n==0: body2=key+":"+v+","+body
        s=s[:j]+body2+s[e:]
    else:
        s,n=re.subn(r"(\['"+k+r"',(?:'[^']*',){3}[^,]+,[^,]+,[^,]+,)([0-9.]+)",lambda m:m.group(1)+v,s); assert n==1,(k,n)
open(dst,'w').write(s)
