// Shared by the chat room's Vercel functions. Files starting with "_" are not
// routes, so this is never reachable as /api/_lib.
//
// The functions hold the R2 credentials, which must never reach a browser, and
// act on the user's behalf against Supabase with the PUBLIC key -- they call
// the same access-checked database functions the page does, as that user.
// Nothing here can see more than the person asking could.

import { AwsClient } from "aws4fetch";

// Everything a deploy needs, read once. Missing values surface as a clear
// error from need() rather than as a confusing failure deep in a request.
export const env = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
};

export function need(...names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    throw new HttpError(500, "Picture storage is not configured on the server (missing " +
      missing.join(", ") + ").");
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Same caps the page enforces before it ever asks.
export const MAX_BYTES = 5 * 1024 * 1024;
export const TYPES = {
  "image/gif": "gif",
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};
export const KINDS = new Set(["msg", "avatar"]);

// How long a link stays usable. An upload link only has to outlive one PUT; a
// viewing link is cached by the page, which asks again well before it lapses.
export const UPLOAD_SECONDS = 300;
export const VIEW_SECONDS = 3600;

// Call a database function as the user, with the public key. A Postgres
// "raise exception" comes back as a 4xx with its message, which we pass on.
export async function rpc(fn, args, fetchImpl = fetch) {
  need("supabaseUrl", "supabaseKey");
  const res = await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.supabaseKey,
      Authorization: `Bearer ${env.supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.message) || `Database error (${res.status}).`;
    throw new HttpError(res.status >= 500 ? 502 : 403, msg);
  }
  return data;
}

// Is this name + token a live session? chat_session() answers with the account
// row, or nothing at all.
export async function requireSession(name, token, fetchImpl = fetch) {
  if (typeof name !== "string" || typeof token !== "string" || !name || !token) {
    throw new HttpError(401, "Log in first.");
  }
  const rows = await rpc("chat_session", { p_name: name, p_token: token }, fetchImpl);
  if (!Array.isArray(rows) || !rows.length) {
    throw new HttpError(401, "Your session expired — please log in again.");
  }
  return rows[0];
}

// Exported for the maintenance scripts, which talk to R2 directly with the
// secret key. The /api functions only ever hand out signed links.
export function r2() {
  need("accountId", "accessKeyId", "secretAccessKey", "bucket");
  return new AwsClient({
    accessKeyId: env.accessKeyId,
    secretAccessKey: env.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

export function objectUrl(key) {
  return `https://${env.accountId}.r2.cloudflarestorage.com/${env.bucket}/${key}`;
}

// A link that lets the browser PUT exactly this file and nothing else.
// Content-Type and Content-Length are both signed, so the link cannot be reused
// for a different kind of file or a bigger one.
export async function signUpload(key, type, size) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_SECONDS));
  const signed = await r2().sign(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": type, "Content-Length": String(size) },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

// A link that lets the browser GET one object for a while.
export async function signView(key) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(VIEW_SECONDS));
  const signed = await r2().sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

// `r2:msg/<uuid>.gif` -> `msg/<uuid>.gif`; anything else (an old inline
// data: URL, or nothing) -> null.
export function keyOf(stored) {
  return typeof stored === "string" && stored.startsWith("r2:") ? stored.slice(3) : null;
}

// Shared request/response plumbing for the classic (req, res) signature.
export function handler(fn) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Use POST." });
    }
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      return res.status(200).json(await fn(body));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return res.status(status).json({ error: e.message || "Server error." });
    }
  };
}
