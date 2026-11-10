cd "$(dirname "$0")/.."; f=$1; out=$2; : > $out; for r in possession gegen counter lowblock direct wing; do (node tools/matrix.js $f ${N:-6} $r >> $out) & done; wait; python3 -I tools/table.py $out
