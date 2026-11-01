"""Write the hand-picked extra photos (index into tools/candidates.json) to photos.js."""
import json
PICKS = {50:[1,6],49:[0,4],48:[3,4],47:[1,5],46:[2,3],45:[4,5],44:[1,2],43:[2,5],42:[1,3],41:[0,2],40:[4,6],39:[3,6],38:[3,1],37:[0,1],36:[6,7],35:[3,2],34:[1,0],33:[0,5],32:[6,2],31:[3,4],30:[0,2],29:[0,4],28:[0,4],27:[2,6],26:[1,4],25:[1,3],24:[7,0],23:[1,5],22:[4,3],21:[0,4],20:[0,1],19:[3,5],18:[2,3],17:[5,6],16:[3,4],15:[2,3],14:[0,2],13:[1,4],12:[1,3],11:[2,3],10:[6,4],9:[7,2],8:[5,0],7:[3,0],6:[3,7],5:[3,6],4:[1,7],3:[1,4],2:[2,3],1:[1,3]}
c = json.load(open("tools/candidates.json", encoding="utf-8"))
out = {r: [c[str(r)][i] for i in idx] for r, idx in PICKS.items()}
open("photos.js", "w", encoding="utf-8").write("// Extra photos for each food's right-hand page, keyed by rank. See tools/pick_photos.py.\nconst EXTRA_PHOTOS = " + json.dumps(out, ensure_ascii=False) + ";\n")
for r, v in out.items():
    print(r, " || ".join(x["file"][:48] for x in v))
