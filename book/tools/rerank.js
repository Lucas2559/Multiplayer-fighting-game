// One-off: give the original 30 entries their places in the 50-food ranking.
const fs = require("fs");
const f = process.argv[2];
const RANK = {
  "Death Cap": 1, "Water Hemlock": 2, "Pufferfish (Fugu)": 3, "Destroying Angel": 4, "Poison Hemlock": 6,
  "Toxic Shellfish": 8, "Deadly Nightshade": 9, "Foxglove": 11, "False Morel": 12, "Fesikh (Fermented Fish)": 14,
  "Sea Turtle Meat": 15, "Ackee": 16, "Cassava": 17, "Moldy Peanuts and Corn": 18, "Unripe Lychee": 21,
  "Honey (for Babies)": 22, "Ciguatera Fish (e.g. Barracuda)": 23, "Pokeweed": 24, "Bitter Almonds": 25,
  "Apricot Kernels": 26, "Polar Bear Liver": 27, "Star Fruit": 28, "Sannakji (Live Octopus)": 30, "Mad Honey": 34,
  "Green Potatoes": 37, "Raw Elderberries": 38, "Rhubarb Leaves": 39, "Bracken Fern": 42, "Raw Kidney Beans": 43,
  "Nutmeg": 46,
};
let s = fs.readFileSync(f, "utf8"), n = 0;
s = s.replace(/rank: \d+, name: "([^"]+)"/g, (m, name) => name in RANK ? (n++, `rank: ${RANK[name]}, name: "${name}"`) : m);
if (n !== 30) throw new Error("renumbered " + n);
fs.writeFileSync(f, s);
eval(s + ";globalThis.E = ENTRIES");
const ranks = E.map(e => e.rank).sort((a, b) => a - b);
console.log("entries:", E.length, "ranks 1-50 unique:", ranks.every((r, i) => r === i + 1));
for (let lvl = 1; lvl <= 5; lvl++) {
  const g = E.filter(e => e.danger === lvl).map(e => e.rank).sort((a, b) => b - a);
  console.log("level", lvl, g.join(" "));
}
const missing = E.filter(e => !e.why).map(e => e.name);
console.log("missing why:", missing.length ? missing : "none");
