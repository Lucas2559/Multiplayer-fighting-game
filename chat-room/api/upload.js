// POST /api/upload  { name, token, kind: "msg" | "avatar", type, size }
//   -> { key, ref, url }
//
// Hands a logged-in user a link to PUT one picture straight into R2. The bytes
// go browser -> R2 and never pass through Vercel or the database; afterwards
// the page stores `ref` (r2:<key>) on the message or the account.
//
// The key is chosen here, never by the browser, so nobody can overwrite
// somebody else's picture or write outside the two folders.

import crypto from "node:crypto";
import { HttpError, KINDS, MAX_BYTES, TYPES, handler, requireSession, signUpload } from "./_lib.js";

export default handler(async ({ name, token, kind, type, size }) => {
  await requireSession(name, token);

  if (!KINDS.has(kind)) throw new HttpError(400, "Unknown kind of picture.");
  const ext = TYPES[type];
  if (!ext) throw new HttpError(400, "That kind of file can't be sent — use a GIF, PNG, JPEG or WebP.");
  if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, "Missing file size.");
  if (size > MAX_BYTES) throw new HttpError(413, "That picture is too big (max 5 MB).");

  const key = `${kind}/${crypto.randomUUID()}.${ext}`;
  return { key, ref: `r2:${key}`, url: await signUpload(key, type, size) };
});
