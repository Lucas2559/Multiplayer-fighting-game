"""Write outlines for every country named in a food's `shade` list to countries.js.

Usage: python3 -I tools/build_countries.py path/to/countries-50m.json   (run from book/)
Source: world-atlas (Natural Earth, public domain).
"""
import json, re, sys

t = json.load(open(sys.argv[1]))
sx, sy = t["transform"]["scale"]
tx, ty = t["transform"]["translate"]
arcs = []
for arc in t["arcs"]:
    x = y = 0
    pts = []
    for dx, dy in arc:
        x += dx
        y += dy
        pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)

def ring(indices):
    out = []
    for i in indices:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        out.extend(a[1:] if out else a)
    return out

# Keep only the main territory of these countries (lon min, lon max, lat min, lat max),
# so far-off islands and overseas land don't get shaded.
MAINLAND = {
    "France": (-6, 10, 41, 52), "Spain": (-10, 5, 35, 44), "Portugal": (-10, -6, 36, 43),
    "Netherlands": (3, 8, 50, 54), "Norway": (4, 32, 57, 72), "United Kingdom": (-9, 2, 49, 61),
    "United States of America": (-125, -66, 24, 50),
}

def path(geom, name):
    polys = [geom["arcs"]] if geom["type"] == "Polygon" else geom["arcs"]
    d = []
    box = MAINLAND.get(name)
    for poly in polys:
        if box:
            outer = ring(poly[0])
            lon = sum(p[0] for p in outer) / len(outer)
            lat = sum(p[1] for p in outer) / len(outer)
            if not (box[0] <= lon <= box[1] and box[2] <= lat <= box[3]):
                continue
        for r in poly:
            lonlat = ring(r)
            # Shapes crossing the 180th meridian would draw a line across the map, so unwrap them.
            if any(abs(a[0] - b[0]) > 180 for a, b in zip(lonlat, lonlat[1:])):
                lonlat = [(lon + 360 if lon < -100 else lon, lat) for lon, lat in lonlat]
            pts = []
            for lon, lat in lonlat:
                p = (round(lon + 180, 1), round(85 - lat, 1))
                if not pts or pts[-1] != p:
                    pts.append(p)
            d.append("M" + "L".join(f"{x} {y}" for x, y in pts) + "Z")
    return "".join(d)

src = open("easy.js", encoding="utf-8").read()
wanted = sorted({n for block in re.findall(r"shade: \[(.*?)\]", src) for n in re.findall(r'"([^"]+)"', block)})
geoms = {g["properties"]["name"]: g for g in t["objects"]["countries"]["geometries"]}
missing = [n for n in wanted if n not in geoms]
if missing:
    raise SystemExit(f"Not in the map data: {missing}")
out = {n: path(geoms[n], n) for n in wanted}
open("countries.js", "w", encoding="utf-8").write("// Outlines of the shaded countries (Natural Earth, public domain). See tools/build_countries.py.\nconst COUNTRY_PATHS = " + json.dumps(out) + ";\n")
print(len(out), "countries")
