"""One-off: extra searches for foods whose first search found poor matches."""
import json, re, subprocess, time
Q = {18:["moldy corn ear rot","Aspergillus corn","mouldy peanuts"],20:["Vitis vinifera grapes bunch vineyard"],21:["Litchi chinensis fruit tree"],8:["blue mussels Mytilus edulis rocks","cooked mussels dish"]}
def get(params):
    args = ["curl", "-s", "-G", "-A", "food-book-local/1.0 (school project)", "https://commons.wikimedia.org/w/api.php"]
    for k, v in params.items():
        args += ["--data-urlencode", f"{k}={v}"]
    for wait in (5, 15, 30, 60):
        body = subprocess.run(args, capture_output=True, check=True).stdout
        try:
            return json.loads(body)
        except ValueError:
            time.sleep(wait)
    raise SystemExit("refused")
c = json.load(open("tools/candidates.json", encoding="utf-8"))
for rank, qs in Q.items():
    items = []
    for q in qs:
        r = get({"action":"query","format":"json","generator":"search","gsrnamespace":6,"gsrlimit":14,"gsrsearch":q+" filetype:bitmap","prop":"imageinfo","iiprop":"url|extmetadata|mime|size","iiurlwidth":640})
        for p in sorted(r.get("query",{}).get("pages",{}).values(), key=lambda p:p.get("index",99)):
            ii=(p.get("imageinfo") or [{}])[0]; em=ii.get("extmetadata",{}); lic=em.get("LicenseShortName",{}).get("value","")
            if ii.get("mime")!="image/jpeg" or ii.get("width",0)<600 or not lic: continue
            artist=re.sub(r"\s+"," ",re.sub("<[^>]+>","",em.get("Artist",{}).get("value","Unknown"))).strip()
            items.append({"file":p["title"].removeprefix("File:"),"thumb":ii.get("thumburl"),"artist":artist,"license":lic,"page":ii.get("descriptionurl")})
        time.sleep(1.5)
    c[str(rank)] = items[:8]
json.dump(c, open("tools/candidates.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print({k:len(c[str(k)]) for k in Q})
for r,idx in {"35":[2,3],"44":[1,2],"14":[0,2],"7":[3,5,0],"32":[0,1],"37":[0,1],"6":[3,7],"9":[0,7],"16":[3,4],"33":[0,5],"48":[3,4,5],"26":[1,4],"25":[2,3]}.items():
    for i in idx: print(r,i,c[r][i]["file"][:70],"|",c[r][i]["license"])
