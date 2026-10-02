// Delete pictures in R2 that nothing points at any more.
//
//   npm run sweep-r2              # list what would go (the default -- safe)
//   npm run sweep-r2 -- --delete  # actually delete it
//
// Deleting a message, the 500-message trim, clearing or deleting a chat, and
// changing your avatar all remove the database row but leave the file in R2.
// Those files are already unreachable -- /api/view only signs keys the database
// still holds -- so this is tidying storage, not closing a gap.
//
// Anything younger than an hour is left alone: a picture is uploaded a moment
// BEFORE its message is saved, so a fresh upload looks unreferenced for a beat.

import { env, objectUrl, r2, rpc } from "../api/_lib.js";

const DELETE = process.argv.includes("--delete");
const GRACE_MS = 60 * 60 * 1000;
const owner = process.env.CHAT_OWNER_NAME;
const password = process.env.CHAT_OWNER_PASSWORD;
if (!owner || !password) {
  console.error("Set CHAT_OWNER_NAME and CHAT_OWNER_PASSWORD in .env.local first.");
  process.exit(1);
}

const [acct] = await rpc("chat_login", { p_name: owner, p_password: password });
const inUse = new Set(
  (await rpc("chat_r2_keys", { p_name: acct.name, p_token: acct.token })).map((r) => r.key),
);

// Every object in the bucket, via S3's ListObjectsV2, a page at a time.
const client = r2();
const objects = [];
let token = null;
do {
  const url = new URL(`https://${env.accountId}.r2.cloudflarestorage.com/${env.bucket}`);
  url.searchParams.set("list-type", "2");
  if (token) url.searchParams.set("continuation-token", token);
  const res = await client.fetch(url);
  const xml = await res.text();
  if (!res.ok) throw new Error(`Listing the bucket failed (${res.status}): ${xml}`);
  for (const [, body] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = /<Key>([^<]*)<\/Key>/.exec(body)[1];
    const modified = new Date(/<LastModified>([^<]*)<\/LastModified>/.exec(body)[1]);
    objects.push({ key, modified });
  }
  token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
    ? (/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml) || [])[1]
    : null;
} while (token);

const now = Date.now();
const orphans = objects.filter((o) => !inUse.has(o.key) && now - o.modified.getTime() > GRACE_MS);
console.log(`${objects.length} files in R2, ${inUse.size} in use, ${orphans.length} unreferenced and over an hour old.`);

for (const o of orphans) {
  if (!DELETE) { console.log(`  would delete ${o.key}`); continue; }
  const res = await client.fetch(objectUrl(o.key), { method: "DELETE" });
  console.log(res.ok ? `  deleted      ${o.key}` : `  FAILED       ${o.key} (${res.status})`);
}
if (!DELETE && orphans.length) console.log("\nRun again with --delete to remove them.");
