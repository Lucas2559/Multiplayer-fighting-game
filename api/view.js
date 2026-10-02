// POST /api/view  { name, token, messages?: number[], avatars?: string[] }
//   -> { messages: { [id]: url }, avatars: { [lowercased name]: url } }
//
// Turns pictures into short-lived R2 links. The browser names the MESSAGES and
// PEOPLE it wants pictures for, never the storage keys: the keys are looked up
// here by calling the database as the user, so a picture in a chat they can't
// see is simply never returned, and an old key they kept from before they were
// removed is useless.
//
// Pictures still stored inline (data: URLs from before the move to R2) are
// left out -- the page already has those from its own database call.

import { HttpError, handler, keyOf, rpc, signView } from "./_lib.js";

const MAX_PER_CALL = 100;

export default handler(async ({ name, token, messages = [], avatars = [] }) => {
  if (!Array.isArray(messages) || !Array.isArray(avatars)) {
    throw new HttpError(400, "messages and avatars must be lists.");
  }
  if (messages.length > MAX_PER_CALL || avatars.length > MAX_PER_CALL) {
    throw new HttpError(400, `At most ${MAX_PER_CALL} of each per call.`);
  }
  const ids = messages.map(Number).filter(Number.isSafeInteger);

  // Both calls authenticate the user and apply the chat's access rules. A bad
  // session is refused by the database and surfaces as a 403 from rpc().
  const [msgRows, avRows] = await Promise.all([
    ids.length ? rpc("chat_images", { p_name: name, p_token: token, p_ids: ids }) : [],
    avatars.length ? rpc("chat_avatars", { p_name: name, p_token: token, p_names: avatars }) : [],
  ]);

  const out = { messages: {}, avatars: {} };
  for (const row of msgRows || []) {
    const key = keyOf(row.image);
    if (key) out.messages[row.id] = await signView(key);
  }
  for (const row of avRows || []) {
    const key = keyOf(row.avatar);
    if (key) out.avatars[String(row.name).toLowerCase()] = await signView(key);
  }
  return out;
});
