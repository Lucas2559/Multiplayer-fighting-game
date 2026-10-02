// Move every picture still stored inline in the database (a data: URL) into
// Cloudflare R2, and point its row at the new object instead.
//
//   npm run migrate-images -- --dry-run     # report only, change nothing
//   npm run migrate-images                  # do it
//
// Reads .env.local (see .env.example). Signs in as the owner account, which is
// the only one the swap functions accept. Safe to run more than once: anything
// already in R2 is skipped, and each swap is compare-and-set on the old value's
// md5, so a picture somebody changed mid-run is left alone, not overwritten.

import crypto from "node:crypto";
import { TYPES, rpc, signUpload } from "../api/_lib.js";

const DRY = process.argv.includes("--dry-run");
const owner = process.env.CHAT_OWNER_NAME;
const password = process.env.CHAT_OWNER_PASSWORD;
if (!owner || !password) {
  console.error("Set CHAT_OWNER_NAME and CHAT_OWNER_PASSWORD in .env.local first.");
  process.exit(1);
}

const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");

// data:image/gif;base64,AAAA -> { type: "image/gif", bytes }
function decode(dataUrl) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("not a base64 data: URL");
  const type = m[1].toLowerCase();
  if (!TYPES[type]) throw new Error(`unsupported picture type ${type}`);
  return { type, bytes: Buffer.from(m[2], "base64") };
}

async function upload(kind, dataUrl) {
  const { type, bytes } = decode(dataUrl);
  const key = `${kind}/${crypto.randomUUID()}.${TYPES[type]}`;
  const url = await signUpload(key, type, bytes.length);
  // Content-Length is part of the signature; fetch sets it from the body,
  // which is exactly the length we signed for.
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: bytes });
  if (!res.ok) throw new Error(`R2 refused the upload (${res.status}): ${await res.text()}`);
  return { ref: `r2:${key}`, size: bytes.length };
}

const [acct] = await rpc("chat_login", { p_name: owner, p_password: password });
const auth = { p_name: acct.name, p_token: acct.token };
console.log(`Signed in as ${acct.name}${DRY ? " — DRY RUN, nothing will change" : ""}\n`);

let moved = 0, skipped = 0, failed = 0, bytes = 0;

// ---- pictures in messages, every chat ----
const rooms = await rpc("chat_my_rooms", auth);
for (const room of rooms) {
  const history = await rpc("chat_history", { ...auth, p_code: room.code, p_after: 0, p_limit: 500 });
  const ids = history.filter((m) => m.has_image).map((m) => m.id);
  if (!ids.length) continue;
  for (const { id, image } of await rpc("chat_images", { ...auth, p_ids: ids })) {
    const where = `message ${id} in "${room.name}"`;
    if (!image.startsWith("data:")) { skipped++; continue; }
    try {
      if (DRY) { console.log(`  would move  ${where}  (${image.length.toLocaleString()} chars)`); moved++; continue; }
      const up = await upload("msg", image);
      const swapped = await rpc("chat_swap_image", { ...auth, p_id: id, p_old_md5: md5(image), p_new: up.ref });
      if (swapped) { moved++; bytes += up.size; console.log(`  moved       ${where}  -> ${up.ref}`); }
      else { skipped++; console.log(`  left alone  ${where}  (changed while we worked)`); }
    } catch (e) {
      failed++;
      console.error(`  FAILED      ${where}: ${e.message}`);
    }
  }
}

// ---- profile pictures ----
const people = await rpc("chat_accounts", auth);
const avatars = await rpc("chat_avatars", { ...auth, p_names: people.map((p) => p.name) });
for (const { name, avatar } of avatars) {
  if (!avatar) continue;
  const where = `avatar of ${name}`;
  if (!avatar.startsWith("data:")) { skipped++; continue; }
  try {
    if (DRY) { console.log(`  would move  ${where}  (${avatar.length.toLocaleString()} chars)`); moved++; continue; }
    const up = await upload("avatar", avatar);
    const swapped = await rpc("chat_swap_avatar", { ...auth, p_who: name, p_old_md5: md5(avatar), p_new: up.ref });
    if (swapped) { moved++; bytes += up.size; console.log(`  moved       ${where}  -> ${up.ref}`); }
    else { skipped++; console.log(`  left alone  ${where}  (changed while we worked)`); }
  } catch (e) {
    failed++;
    console.error(`  FAILED      ${where}: ${e.message}`);
  }
}

console.log(`\n${DRY ? "Would move" : "Moved"} ${moved}, skipped ${skipped} already in R2, ${failed} failed.` +
  (DRY ? "" : `  ${(bytes / 1024).toFixed(0)} KB now in R2.`));
process.exit(failed ? 1 : 0);
