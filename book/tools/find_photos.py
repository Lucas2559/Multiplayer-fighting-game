"""Search Wikimedia Commons for extra photo candidates into tools/candidates.json.

Usage: python3 -I tools/find_photos.py   (run from book/)
"""
import json, re, subprocess, time

QUERIES = {50:"mango fruit tree",49:"Lepidocybium flavobrunneum",48:"cashew nuts shell",47:"hakarl shark Iceland",46:"nutmeg fruit mace",45:"Carolina Reaper pepper",44:"casu marzu cheese",43:"red kidney beans",42:"Pteridium aquilinum",41:"swordfish Xiphias gladius",40:"grapefruit tree",39:"rhubarb stalks",38:"Sambucus nigra berries",37:"green potato solanine",36:"cookie dough",35:"daffodil bulbs",34:"Rhododendron ponticum flowers",33:"black liquorice candy",32:"raw milk bottle",31:"raw chicken meat",30:"sannakji octopus",29:"Amanita muscaria",28:"carambola star fruit",27:"polar bear",26:"apricot kernels",25:"bitter almonds",24:"pokeweed berries",23:"barracuda fish",22:"honey jar",21:"lychee unripe green",20:"grapes bunch",19:"raw oysters",18:"moldy peanuts aflatoxin",17:"cassava roots",16:"ackee fruit",15:"Chelonia mydas",14:"fesikh",13:"Convallaria majalis berries",12:"Gyromitra esculenta",11:"Digitalis purpurea flowers",10:"Taxus baccata berries",9:"Atropa belladonna berries",8:"mussels",7:"Ricinus communis seeds",6:"Conium maculatum",5:"Aconitum napellus flowers",4:"Amanita virosa",3:"pufferfish",2:"Cicuta",1:"Amanita phalloides"}

def get(params):
    args = ["curl", "-s", "-G", "-A", "food-book-local/1.0 (school project)", "https://commons.wikimedia.org/w/api.php"]
    for k, v in params.items():
        args += ["--data-urlencode", f"{k}={v}"]
    for wait in (5, 15, 30, 60):
        body = subprocess.run(args, capture_output=True, check=True).stdout
        try:
            return json.loads(body)
        except ValueError:  # Rate limited: Commons answered with an error page.
            time.sleep(wait)
    raise SystemExit("Commons kept refusing: " + body[:200].decode(errors="replace"))

out = {}
for rank, q in QUERIES.items():
    r = get({"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": 14,
             "gsrsearch": q + " filetype:bitmap", "prop": "imageinfo", "iiprop": "url|extmetadata|mime|size", "iiurlwidth": 640})
    items = []
    pages = sorted(r.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        em = ii.get("extmetadata", {})
        lic = em.get("LicenseShortName", {}).get("value", "")
        if ii.get("mime") != "image/jpeg" or ii.get("width", 0) < 600 or not lic:
            continue
        artist = re.sub(r"\s+", " ", re.sub("<[^>]+>", "", em.get("Artist", {}).get("value", "Unknown"))).strip()
        items.append({"file": p["title"].removeprefix("File:"), "thumb": ii.get("thumburl"), "artist": artist, "license": lic, "page": ii.get("descriptionurl")})
    out[rank] = items[:8]
    time.sleep(1.5)
json.dump(out, open("tools/candidates.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in out.items()})
