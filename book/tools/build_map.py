"""Turn Natural Earth land outlines (world-atlas land-110m TopoJSON) into map.js.

Usage: python3 -I tools/build_map.py path/to/land-110m.json   (run from book/)
"""
import json, sys

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

polys = []
for g in t["objects"]["land"]["geometries"]:
    if g["type"] == "Polygon":
        polys.append(g["arcs"])
    else:
        polys.extend(g["arcs"])

d = []
for poly in polys:
    for r in poly:
        # Equirectangular: x = lon + 180, y = 85 - lat. Antarctica is cropped by the viewBox.
        lonlat = ring(r)
        # Shapes crossing the 180th meridian would draw a line across the map, so unwrap them.
        if any(abs(a[0] - b[0]) > 180 for a, b in zip(lonlat, lonlat[1:])):
            lonlat = [(lon + 360 if lon < -100 else lon, lat) for lon, lat in lonlat]
        pts = [(round(lon + 180, 1), round(85 - lat, 1)) for lon, lat in lonlat]
        d.append("M" + "L".join(f"{x} {y}" for x, y in pts) + "Z")
open("map.js", "w").write("// World land outlines from Natural Earth (public domain). See tools/build_map.py.\nconst LAND_PATH = " + json.dumps("".join(d)) + ";\n")
print("polygons", len(polys))
