"""Fetch the lead photo and credit for every entry's `img` page into images.json.

Usage: python3 -I tools/fetch_images.py   (run from book/)
"""
import json, re, subprocess, time

UA = "food-book-local/1.0 (school project)"

def get(url, params):
    args = ["curl", "-s", "-G", "-A", UA, url] + sum((["--data-urlencode", f"{k}={v}"] for k, v in params.items()), [])
    return json.loads(subprocess.run(args, capture_output=True, check=True).stdout)

src = open("entries.js", encoding="utf-8").read()
pages = sorted(set(re.findall(r'img: "([^"]+)"', src)))
out = {}
for i in range(0, len(pages), 40):
    q = get("https://en.wikipedia.org/w/api.php", {"action": "query", "format": "json", "redirects": 1,
        "prop": "pageimages", "piprop": "name|thumbnail", "pithumbsize": 800, "titles": "|".join(pages[i:i + 40])})["query"]
    back = {}
    for n in q.get("normalized", []) + q.get("redirects", []):
        back[n["to"]] = back.get(n["from"], n["from"])
    for p in q["pages"].values():
        key = back.get(p["title"], p["title"]).replace("_", " ")
        out[key] = {"file": p.get("pageimage"), "thumb": p.get("thumbnail", {}).get("source")}
    time.sleep(1)

# Pages whose lead image isn't a real photo of the food.
OVERRIDES = {"Cassava": "PeeledCassava.jpg"}
for k, f in OVERRIDES.items():
    out[k] = {"file": f, "thumb": f"https://commons.wikimedia.org/wiki/Special:FilePath/{f}?width=800"}

files = [v["file"] for v in out.values() if v["file"]]
meta = {}
for i in range(0, len(files), 40):
    r = get("https://commons.wikimedia.org/w/api.php", {"action": "query", "format": "json",
        "prop": "imageinfo", "iiprop": "extmetadata|url", "titles": "|".join("File:" + f for f in files[i:i + 40])})["query"]
    for p in r["pages"].values():
        ii = (p.get("imageinfo") or [{}])[0]
        em = ii.get("extmetadata", {})
        artist = re.sub(r"\s+", " ", re.sub("<[^>]+>", "", em.get("Artist", {}).get("value", "Unknown"))).strip()
        meta[p["title"].removeprefix("File:").replace(" ", "_")] = {
            "artist": artist, "license": em.get("LicenseShortName", {}).get("value", ""), "page": ii.get("descriptionurl")}
    time.sleep(1)

for k, v in out.items():
    v.update(meta.get((v["file"] or "").replace(" ", "_"), {}))
json.dump(out, open("images.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
missing = [p for p in pages if not out.get(p.replace("_", " "), {}).get("thumb")]
print(f"{len(pages)} pages, {len(pages) - len(missing)} with photos; missing: {missing or 'none'}")
