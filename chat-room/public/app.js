/* Nexus Canvas chat — Supabase client (single room, presence-based names) */

const COLORS = ["#7c6cf0", "#3fb98a", "#e0a44a", "#d16bd1", "#5aa9e6", "#e6685a"];

// The room keeps only this many messages: the database deletes the oldest one
// as each new message past the cap arrives (see chat_message_limit() in
// supabase/schema.sql — keep the two in step). Open tabs trim their own list to
// match, so what you see is what's still stored.
const MAX_MESSAGES = 500;

function colorFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function initials(name) {
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?";
}

// Avatars are stored in the database and fetched with chat_avatars(), NOT sent
// over realtime presence, which caps out around a megabyte. That's what lets a
// GIF be this big. Presence carries only a short hash so other tabs know when
// someone's picture has changed and needs re-fetching.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PROFILE_KEY = "nexus.profile";

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; }
  catch { return {}; }
}
function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

// Your logged-in account: { name, token }. The token is the session secret the
// database handed us at login; every write is checked against it server-side.
const SESSION_KEY = "nexus.session";
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}
function saveSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

// name(lowercased) -> { h, url }. `h` is a cheap hash of the picture, so a tab
// can tell someone's avatar changed without shipping the picture itself over
// presence. Filled by ensureAvatars() from the database.
const avatars = new Map();
const avatarUrl = (name) => {
  const e = avatars.get(String(name).toLowerCase());
  return (e && e.url) || null;
};

function hashAvatar(url) {
  if (!url) return "";
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h * 33) ^ url.charCodeAt(i)) >>> 0;
  return h.toString(36) + "." + url.length.toString(36);
}

// Fetch any avatar we don't have, or whose hash has moved on. `wants` maps a
// lowercased name to the hash we expect, or null when we simply don't know.
let avatarFetch = null;
async function ensureAvatars(wants) {
  const need = [];
  for (const [key, h] of wants) {
    const have = avatars.get(key);
    if (!have || (h && have.h !== h)) need.push(key);
  }
  if (!need.length || !state.me) return;
  // One request at a time; a later sync will pick up anything missed.
  if (avatarFetch) return;
  avatarFetch = (async () => {
    try {
      const { data, error } = await sb.rpc("chat_avatars", {
        p_name: state.me.name, p_token: state.me.token, p_names: need,
      });
      if (error) throw new Error(error.message);
      const seen = new Set();
      for (const row of data || []) {
        const key = String(row.name).toLowerCase();
        seen.add(key);
        avatars.set(key, { h: hashAvatar(row.avatar), url: row.avatar || null });
      }
      // Remember the misses too, so we don't ask again every render.
      for (const key of need) if (!seen.has(key)) avatars.set(key, { h: "", url: null });
      refreshAvatars();
    } catch (e) {
      // Not worth a banner: a missing picture is cosmetic.
      console.warn("avatars:", e.message);
    } finally {
      avatarFetch = null;
    }
  })();
}

// Every name currently on screen, so we can fetch pictures for all of them.
function avatarWantsFromDom() {
  const wants = new Map();
  for (const el of document.querySelectorAll(".avatar[data-name]"))
    wants.set(el.dataset.name.toLowerCase(), null);
  return wants;
}

// Paint an avatar box: a custom photo/GIF if we have one, else coloured initials.
function paintAvatar(el, name, color, url) {
  const letters = () => {
    el.classList.remove("has-img");
    el.style.background = color;
    el.textContent = initials(name);
  };
  if (!url) return letters();

  el.classList.add("has-img");
  el.style.background = "#0d0f16";
  el.innerHTML = "";
  const img = document.createElement("img");
  img.alt = "";
  // A picture that won't load (corrupt, or too big for the browser to decode)
  // would otherwise leave an empty box — put the initials back instead.
  img.addEventListener("error", letters);
  img.src = url;
  el.appendChild(img);
}

// Re-skin every rendered avatar (messages + your own chip) from the current map.
function refreshAvatars() {
  for (const el of document.querySelectorAll(".avatar[data-name]")) {
    const name = el.dataset.name;
    paintAvatar(el, name, el.dataset.color, avatarUrl(name));
  }
  const me = document.getElementById("me-avatar");
  if (state.me && me) paintAvatar(me, state.me.name, state.me.color, state.me.avatar || null);
}

// Turn a chosen file into a data URL. GIFs pass through untouched so they keep
// animating; other images are centre-cropped to a small square to shrink the
// payload. Rejects non-images and anything over the size cap.
function processImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (file.type === "image/gif") {
        if (file.size > MAX_UPLOAD_BYTES)
          return reject(new Error("That GIF is too big (max 5 MB). Try a smaller one."));
        return resolve(dataUrl); // keep every frame — never run a GIF through a canvas
      }
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const c = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        c.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = () => reject(new Error("That image could not be loaded."));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// Reusable colour/photo editor wired over a set of elements. `nameFn` supplies
// the current name for the initials fallback and the auto colour.
function makeEditor({ preview, swatches, colorInput, uploadBtn, fileInput, clearBtn, nameFn }) {
  const ed = { color: null, avatar: null };

  for (const col of COLORS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.style.background = col;
    b.addEventListener("click", () => { ed.color = col; render(); });
    swatches.appendChild(b);
  }
  colorInput.addEventListener("input", () => { ed.color = colorInput.value; render(); });
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    try { ed.avatar = await processImageFile(f); render(); }
    catch (e) { banner(e.message); }
  });
  clearBtn.addEventListener("click", () => { ed.avatar = null; render(); });

  function render() {
    const name = nameFn() || "?";
    const color = ed.color || colorFor(name);
    paintAvatar(preview, name, color, ed.avatar);
    clearBtn.hidden = !ed.avatar;
    [...swatches.children].forEach((b, i) => b.classList.toggle("sel", ed.color === COLORS[i]));
    if (ed.color) colorInput.value = ed.color;
  }

  return {
    render,
    set(v) { ed.color = v.color || null; ed.avatar = v.avatar || null; render(); },
    values(name) { return { color: ed.color || colorFor(name), avatar: ed.avatar }; },
  };
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function banner(text) {
  const b = document.createElement("div");
  b.className = "banner";
  b.textContent = text;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 4000);
}

// ---- Supabase client ----
const cfg = window.SUPABASE_CONFIG || {};
if (!window.supabase || !window.supabase.createClient) {
  banner("Could not load the Supabase library (vendor/supabase.js). Run via `npm start`, not file://.");
  throw new Error("supabase library missing");
}
if (!cfg.url || cfg.url.startsWith("YOUR_")) {
  banner("Supabase is not configured yet — edit public/config.js with your project URL and anon key.");
}
const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
});

// Every account/message write goes through a database function (see
// supabase/schema.sql) rather than a table, so password hashes and session
// tokens never reach the browser. Errors come back as the plpgsql message.
async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const m = error.message || "";
    if (error.code === "PGRST202" || /could not find the function|does not exist/i.test(m))
      throw new Error(
        "Accounts aren't set up in Supabase yet — run supabase/schema.sql in the SQL editor."
      );
    throw new Error(m || "Server error.");
  }
  return Array.isArray(data) ? data[0] || null : data;
}

// Surface any otherwise-silent async failure.
window.addEventListener("unhandledrejection", (e) => {
  banner("Error: " + (e.reason?.message || e.reason || "unknown"));
});

// Stable per-tab client id. Survives reloads (sessionStorage) so you can always
// reclaim your own name after refreshing, but a genuine second tab/user cannot.
const CID = (() => {
  let id = sessionStorage.getItem("nexus.cid");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
    sessionStorage.setItem("nexus.cid", id);
  }
  return id;
})();

// ---- App state ----
const state = {
  me: null, // { name, color, avatar, token }
  chat: null, // { code, name } — the chat you're looking at
  channel: null, // its active realtime channel
  rooms: [], // chats in your switcher
  lastRenderedName: null,
};

// Which chat to reopen next time. Per-account so two people sharing a browser
// don't land in each other's last room.
const lastChatKey = (name) => "nexus.lastChat." + name.toLowerCase();

// ---- Elements ----
const $ = (id) => document.getElementById(id);
const gate = $("gate");
const app = $("app");

/* =================== Log in / sign up =================== */
let gateMode = "login"; // or "signup"

const gateBtn = () => $("gate-submit");
function resetGateBtn() {
  gateBtn().disabled = false;
  gateBtn().textContent = gateMode === "signup" ? "Create account →" : "Log in →";
}
function showError(msg) {
  const err = $("gate-error");
  err.textContent = msg;
  err.hidden = false;
  resetGateBtn();
}

// Login shows just name + password; signup also asks to confirm it and lets you
// pick the colour/photo the account is created with.
function setGateMode(mode) {
  gateMode = mode;
  const signup = mode === "signup";
  $("tab-login").classList.toggle("sel", !signup);
  $("tab-signup").classList.toggle("sel", signup);
  $("gate-title").textContent = signup ? "Create an account" : "Welcome back";
  $("gate-hint").textContent = signup
    ? "Your name is registered with this password and stays yours."
    : "Sign in with the name and password you registered.";
  $("confirm-field").hidden = !signup;
  $("claim-field").hidden = !signup;
  $("gate-profile").hidden = !signup;
  $("gate-profile-hint").hidden = !signup;
  $("pass-input").setAttribute("autocomplete", signup ? "new-password" : "current-password");
  $("gate-error").hidden = true;
  resetGateBtn();
  if (signup) gateEditor.render();
}
$("tab-login").addEventListener("click", () => setGateMode("login"));
$("tab-signup").addEventListener("click", () => setGateMode("signup"));

// Take an authenticated account ({ name, color, avatar, token }) into the app.
async function joinRoom(acct) {
  const me = {
    name: acct.name,
    color: acct.color || colorFor(acct.name),
    avatar: acct.avatar || null,
    token: acct.token,
  };
  state.me = me;
  saveSession({ name: me.name, token: me.token });
  saveProfile({ name: me.name, color: me.color, avatar: me.avatar });
  await enterApp();
}

// Subscribe to one chat: its own realtime channel, its own history, its own
// presence roster. Called on entry and on every chat switch.
async function openChat(chat) {
  // Never leave a dead channel around from a previous chat or failed attempt.
  if (state.channel) {
    await sb.removeChannel(state.channel);
    state.channel = null;
  }
  // join/create hand back only { code, name }; the switcher row also carries
  // is_owner and can_clear, so prefer it when we have it.
  state.chat = state.rooms.find((r) => r.code === chat.code) || chat;
  state.lastRenderedName = null;
  $("messages").innerHTML = "";
  renderChatHeader();

  const room = sb.channel("chat:" + chat.code, {
    config: { presence: { key: CID } },
  });
  let synced = false;
  room
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: "channel=eq." + chat.code },
      (payload) => appendMessage(payload.new))
    // DELETE carries only the primary key (the table's replica identity), so it
    // can't be filtered by channel — we just drop that id if this tab shows it.
    .on("postgres_changes",
      { event: "DELETE", schema: "public", table: "messages" },
      (payload) => removeMessage(payload.old && payload.old.id))
    .on("presence", { event: "sync" }, () => { synced = true; renderOnline(room); });

  try {
    // Subscribe, with a timeout so we never hang forever on "Joining…".
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to chat.")), 10000);
      room.subscribe((status, err) => {
        if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          clearTimeout(timer);
          reject(err || new Error("Could not connect. Check your Supabase config."));
        }
      });
    });

    // Wait for the first presence sync so the roster is populated (max ~1.5s).
    for (let i = 0; i < 15 && !synced; i++) await new Promise((r) => setTimeout(r, 100));

    // Deliberately no "already open elsewhere" check. Back when a name was
    // claimed live by presence, two tabs would have fought over it; now the
    // account owns the name outright, so a second tab is just a second tab.
    const { name, color } = state.me;
    await room.track({ name, color, avh: state.me.avh || "", cid: CID });
    state.channel = room;
    try { localStorage.setItem(lastChatKey(name), chat.code); } catch {}
    await loadHistory();
    renderOnline(room);
  } catch (ex) {
    await sb.removeChannel(room);
    state.channel = null;
    throw ex;
  }
}

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("gate-error").hidden = true;
  const raw = $("name-input").value.trim();
  const name = raw.replace(/^@+/, "").slice(0, 24);
  const pass = $("pass-input").value;
  if (!name) return showError("Please enter a name.");
  // Keep this in step with chat_check_name() in supabase/schema.sql.
  if (!/^[a-zA-Z0-9_.() -]+$/.test(name))
    return showError("Use letters, numbers, spaces and _ - . ( ) only.");
  if (!pass) return showError("Please enter your password.");
  if (gateMode === "signup") {
    if (pass.length < 4) return showError("Your password needs at least 4 characters.");
    if (pass !== $("confirm-input").value) return showError("Those passwords don't match.");
  }

  gateBtn().disabled = true;
  gateBtn().textContent = gateMode === "signup" ? "Creating…" : "Logging in…";

  try {
    let acct;
    if (gateMode === "signup") {
      const { color, avatar } = gateEditor.values(name);
      acct = await rpc("chat_signup", {
        p_name: name, p_password: pass, p_color: color, p_avatar: avatar,
        p_claim: $("claim-input").value.trim() || null,
      });
    } else {
      acct = await rpc("chat_login", { p_name: name, p_password: pass });
    }
    const renamed = acct.name.toLowerCase() !== name.toLowerCase();
    $("pass-input").value = "";
    $("confirm-input").value = "";
    $("claim-input").value = "";
    await joinRoom(acct);
    if (renamed) banner("Signed in as @" + acct.name + ".");
  } catch (ex) {
    showError(ex?.message || "Network error.");
  }
});

// Reloading shouldn't log you out: resume the stored session if it's still valid.
async function resumeSession() {
  const sess = loadSession();
  if (!sess || !sess.name || !sess.token) return;
  gateBtn().disabled = true;
  gateBtn().textContent = "Resuming…";
  try {
    const acct = await rpc("chat_session", { p_name: sess.name, p_token: sess.token });
    if (!acct) { saveSession(null); return resetGateBtn(); }
    await joinRoom(acct);
  } catch {
    saveSession(null);
    resetGateBtn();
  }
}

/* =================== Chat =================== */
async function enterApp() {
  $("composer-handle").textContent = "@" + state.me.name;

  // The built-in account gets the visibility controls. Its name is the only
  // thing about it that isn't secret, so asking for it is safe.
  try {
    const { data } = await sb.rpc("chat_dev_name");
    state.me.isStaff = String(data || "").toLowerCase() === state.me.name.toLowerCase();
  } catch { state.me.isStaff = false; }

  // Show your own avatar right away, before anyone else's has been fetched.
  state.me.avh = hashAvatar(state.me.avatar);
  avatars.set(state.me.name.toLowerCase(), { h: state.me.avh, url: state.me.avatar || null });
  refreshAvatars();

  await loadRooms();
  let want = null;
  try { want = localStorage.getItem(lastChatKey(state.me.name)); } catch {}
  const chat = state.rooms.find((r) => r.code === want) || state.rooms[0]
            || { code: "main", name: "Main room" };
  // Only swap the gate for the chat once the chat is actually open. Doing it
  // first meant any failure in here left an empty, dead screen with no way back.
  await openChat(chat);
  gate.hidden = true;
  app.hidden = false;
  $("composer-input").focus();
}

/* =================== Chats =================== */
// The switcher only lists chats you're in: the main room, ones you made, and
// ones you've joined with a code.
async function loadRooms() {
  try {
    const { data, error } = await sb.rpc("chat_my_rooms", {
      p_name: state.me.name, p_token: state.me.token,
    });
    if (error) throw new Error(error.message);
    state.rooms = data || [];
  } catch (ex) {
    banner("Could not load your chats: " + ex.message);
    if (!state.rooms.length) state.rooms = [{ code: "main", name: "Main room" }];
  }
  renderRoomList();
}

function renderRoomList() {
  const sel = $("room-select");
  sel.innerHTML = "";
  for (const r of state.rooms) {
    const o = document.createElement("option");
    o.value = r.code;
    o.textContent = r.name;
    sel.appendChild(o);
  }
  if (state.chat) sel.value = state.chat.code;
}

function renderChatHeader() {
  renderRoomList();
  const mayClear = !!(state.chat && state.chat.can_clear);
  $("people-btn").hidden = !(state.chat && state.chat.can_manage);
  $("clear-btn").hidden = !mayClear;
  // The Main room is where everyone lands, so it can never be deleted.
  $("delete-btn").hidden = !(mayClear && state.chat.code !== "main");
  const code = $("room-code");
  // The main room is where everyone starts, so its code isn't worth sharing.
  if (state.chat && state.chat.code !== "main") {
    code.hidden = false;
    code.textContent = state.chat.code;
  } else {
    code.hidden = true;
  }
}

// Switching chats can fail (a deleted room, a dropped connection); fall back to
// the chat we were in rather than leaving an empty screen.
async function switchChat(chat) {
  const previous = state.chat;
  try {
    await openChat(chat);
  } catch (ex) {
    banner("Could not open that chat: " + ex.message);
    if (previous && previous.code !== chat.code) await openChat(previous).catch(() => {});
    else renderChatHeader();
  }
}

$("room-select").addEventListener("change", async (e) => {
  const chat = state.rooms.find((r) => r.code === e.target.value);
  if (chat && (!state.chat || chat.code !== state.chat.code)) await switchChat(chat);
});

// Click the code chip to copy it.
$("room-code").addEventListener("click", async () => {
  const code = state.chat && state.chat.code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    banner("Copied " + code + " — share it so people can join.");
  } catch {
    banner("This chat's code is " + code);
  }
});

async function loadHistory() {
  // Newest first so we get the current window, then flip it for rendering.
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .eq("channel", state.chat.code)
    .order("id", { ascending: false })
    .limit(MAX_MESSAGES);
  if (error) return banner("Could not load history: " + error.message);
  for (const m of data.slice().reverse()) appendMessage(m, true);
  scrollToBottom();
  ensureAvatars(avatarWantsFromDom());
}

// You can always delete your own messages. Owning the chat (or being one of
// the built-in accounts) lets you delete anyone's — the database enforces this
// too, this only decides whether the button is worth showing.
function canDelete(m) {
  if (!state.me) return false;
  if (String(m.name) === state.me.name) return true;
  return !!(state.chat && state.chat.can_clear);
}

function removeMessage(id) {
  if (id == null) return;
  const el = $("messages").querySelector(`.msg[data-id="${id}"]`);
  if (el) el.remove();
}

function appendMessage(m, quiet) {
  const box = $("messages");
  const ts = m.created_at ? new Date(m.created_at).getTime() : Date.now();
  const grouped = state.lastRenderedName === m.name;
  state.lastRenderedName = m.name;

  const el = document.createElement("div");
  el.className = "msg" + (grouped ? " grouped" : "") + (canDelete(m) ? " can-del" : "");
  el.dataset.id = m.id;
  el.innerHTML = `
    <div class="avatar" data-name="${escapeHtml(m.name)}" data-color="${escapeHtml(m.color)}"></div>
    <div class="msg-body">
      <div class="msg-head">
        <span class="msg-name" style="color:${m.color}">${escapeHtml(m.name)}</span>
        <span class="msg-time">${fmtTime(ts)}</span>
      </div>
      <div class="msg-text">${escapeHtml(m.body)}</div>
    </div>
    <button class="msg-del" title="Delete this message" aria-label="Delete">&times;</button>`;
  paintAvatar(el.querySelector(".avatar"), m.name, m.color, avatarUrl(m.name));
  box.appendChild(el);
  while (box.childElementCount > MAX_MESSAGES) box.firstElementChild.remove();
  const key = String(m.name).toLowerCase();
  if (!quiet && !avatars.has(key)) ensureAvatars(new Map([[key, null]]));
  if (!quiet) scrollToBottom();
}

// Rebuild the online count AND the presence-derived avatar map on every sync,
// then re-skin everything so avatar changes propagate live to all clients.
function renderOnline(room) {
  const s = room.presenceState();
  const cids = new Set();
  const wants = avatarWantsFromDom(); // everyone whose message is on screen
  for (const key in s)
    for (const p of s[key]) {
      cids.add(p.cid || key);
      // Someone online tells us the hash of their current picture, so a change
      // is noticed even though the picture itself never crosses the websocket.
      wants.set(String(p.name).toLowerCase(), p.avh || null);
    }
  $("online-count").innerHTML = `<span class="dot"></span>${cids.size} online`;
  refreshAvatars();
  ensureAvatars(wants);
}

/* =================== People & access =================== */
// Only the built-in account may change visibility; a chat owner sees the
// person list but not the radio buttons. The database enforces both.
function peopleError(msg) {
  const el = $("people-error");
  el.textContent = msg;
  el.hidden = false;
}

async function renderPeople() {
  const list = $("people-list");
  list.innerHTML = "";
  let rows = [];
  try {
    const { data, error } = await sb.rpc("chat_room_people", {
      p_name: state.me.name, p_token: state.me.token, p_code: state.chat.code,
    });
    if (error) throw new Error(error.message);
    rows = data || [];
  } catch (ex) {
    return peopleError(ex.message);
  }

  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "people-empty";
    li.textContent = "Nobody yet — only people with the code can get in.";
    return list.appendChild(li);
  }

  for (const r of rows) {
    const li = document.createElement("li");
    li.className = "people-row";
    const who = document.createElement("div");
    who.className = "people-who";
    who.textContent = r.name;
    if (!r.registered) {
      const tag = document.createElement("span");
      tag.className = "people-tag";
      // The name is held for them until they sign up with this code.
      tag.textContent = r.claim_code ? "invite " + r.claim_code : "not signed up yet";
      who.appendChild(tag);
    }
    const rm = document.createElement("button");
    rm.className = "mini-btn ghost";
    rm.textContent = "Remove";
    rm.addEventListener("click", async () => {
      rm.disabled = true;
      try {
        await rpc("chat_revoke", {
          p_name: state.me.name, p_token: state.me.token,
          p_code: state.chat.code, p_who: r.name, p_perm: r.perm,
        });
        await renderPeople();
      } catch (ex) {
        peopleError(ex.message);
        rm.disabled = false;
      }
    });
    li.append(who, rm);
    list.appendChild(li);
  }
}

function openPeople() {
  if (!state.chat) return;
  $("people-error").hidden = true;
  $("people-name").value = "";
  $("people-chat").textContent = `"${state.chat.name}"` +
    (state.chat.code === "main" ? "" : ` · code ${state.chat.code}`);

  const staff = !!(state.me && state.me.isStaff);
  $("vis-block").hidden = !staff;
  if (staff) {
    const v = state.chat.visibility || "hidden";
    for (const r of document.querySelectorAll('input[name="vis"]')) r.checked = r.value === v;
    $("vis-note").textContent = state.chat.code === "main"
      ? "The Main room is where everyone lands, so this has no effect on it."
      : "";
  }
  $("people-modal").hidden = false;
  renderPeople();
}
function closePeople() { $("people-modal").hidden = true; }

$("people-btn").addEventListener("click", openPeople);
$("people-close").addEventListener("click", closePeople);
$("people-modal").addEventListener("click", (e) => {
  if (e.target === $("people-modal")) closePeople();
});
$("people-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("people-grant").click();
});

$("people-grant").addEventListener("click", async () => {
  $("people-error").hidden = true;
  const who = $("people-name").value.trim().replace(/^@+/, "");
  if (!who) return peopleError("Type the name of the person to let in.");
  const btn = $("people-grant");
  btn.disabled = true;
  try {
    const r = await rpc("chat_grant", {
      p_name: state.me.name, p_token: state.me.token,
      p_code: state.chat.code, p_who: who, p_perm: "see",
    });
    $("people-name").value = "";
    await renderPeople();
    if (r && !r.registered && r.claim_code) {
      banner(`${r.name} has no account yet — give them invite code ${r.claim_code}.`);
    }
  } catch (ex) {
    peopleError(ex.message);
  } finally {
    btn.disabled = false;
  }
});

for (const radio of document.querySelectorAll('input[name="vis"]')) {
  radio.addEventListener("change", async () => {
    if (!radio.checked || !state.chat) return;
    try {
      await rpc("chat_set_visibility", {
        p_name: state.me.name, p_token: state.me.token,
        p_code: state.chat.code, p_visibility: radio.value,
      });
      state.chat.visibility = radio.value;
      await loadRooms();
      banner(`"${state.chat.name}" is now ${radio.value}.`);
    } catch (ex) {
      peopleError(ex.message);
    }
  });
}

/* =================== Deleting =================== */
$("messages").addEventListener("click", async (e) => {
  const btn = e.target.closest(".msg-del");
  if (!btn) return;
  const el = btn.closest(".msg");
  const id = Number(el.dataset.id);
  btn.disabled = true;
  try {
    await rpc("chat_delete_message", {
      p_name: state.me.name, p_token: state.me.token, p_id: id,
    });
    el.remove(); // other tabs get the realtime DELETE
  } catch (ex) {
    banner("Could not delete: " + ex.message);
    btn.disabled = false;
  }
});

$("clear-btn").addEventListener("click", async () => {
  if (!state.chat) return;
  if (!confirm(`Delete every message in "${state.chat.name}"?\n\nThis cannot be undone.`)) return;
  try {
    const n = await rpc("chat_clear_room", {
      p_name: state.me.name, p_token: state.me.token, p_code: state.chat.code,
    });
    $("messages").innerHTML = "";
    state.lastRenderedName = null;
    banner(n === 1 ? "1 message deleted." : n + " messages deleted.");
  } catch (ex) {
    banner("Could not clear the chat: " + ex.message);
  }
});

$("delete-btn").addEventListener("click", async () => {
  if (!state.chat) return;
  if (!confirm(`Delete the chat "${state.chat.name}" and all its messages?\n\nEveryone in it loses it. This cannot be undone.`)) return;
  const gone = state.chat.name;
  try {
    await rpc("chat_delete_room", {
      p_name: state.me.name, p_token: state.me.token, p_code: state.chat.code,
    });
    await loadRooms();
    const fallback = state.rooms.find((r) => r.code === "main") || state.rooms[0];
    state.chat = null;
    if (fallback) await switchChat(fallback);
    banner(`Deleted "${gone}".`);
  } catch (ex) {
    banner("Could not delete the chat: " + ex.message);
  }
});

/* =================== Composer =================== */
$("composer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("composer-input");
  const body = input.value.trim();
  if (!body) return;
  input.value = "";
  // chat_post checks the session token and posts under the account's stored
  // name + colour, so nobody can speak as somebody else.
  try {
    await rpc("chat_post", {
      p_name: state.me.name, p_token: state.me.token,
      p_code: state.chat.code, p_body: body,
    });
  } catch (ex) {
    banner("Message failed: " + ex.message);
    input.value = body;
  }
});

/* =================== Utils =================== */
function scrollToBottom() {
  const box = $("messages");
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =================== Profile editors =================== */
// Gate editor — restores your last colour/photo and previews as you type a name.
const saved = loadProfile();
const gateEditor = makeEditor({
  preview: $("gate-avatar"),
  swatches: $("gate-swatches"),
  colorInput: $("gate-color"),
  uploadBtn: $("gate-upload"),
  fileInput: $("gate-file"),
  clearBtn: $("gate-clear"),
  nameFn: () => $("name-input").value.trim().replace(/^@+/, ""),
});
if (saved.name) $("name-input").value = saved.name;
gateEditor.set({ color: saved.color, avatar: saved.avatar });
$("name-input").addEventListener("input", () => gateEditor.render());

// In-app editor — change your colour/photo live from the top bar.
const modalEditor = makeEditor({
  preview: $("pm-avatar"),
  swatches: $("pm-swatches"),
  colorInput: $("pm-color"),
  uploadBtn: $("pm-upload"),
  fileInput: $("pm-file"),
  clearBtn: $("pm-clear"),
  nameFn: () => (state.me ? state.me.name : "?"),
});

function closeProfileModal() { $("profile-modal").hidden = true; }
$("profile-btn").addEventListener("click", () => {
  modalEditor.set({ color: state.me.color, avatar: state.me.avatar });
  $("acct-name").value = "";
  $("acct-pass").value = "";
  $("acct-master").value = "";
  $("acct-msg").hidden = true;
  $("profile-modal").hidden = false;
});
$("profile-cancel").addEventListener("click", closeProfileModal);
$("profile-modal").addEventListener("click", (e) => {
  if (e.target === $("profile-modal")) closeProfileModal();
});
// One Save for the whole dialog. The picture and colour always save; the name
// and password only if you actually typed one, which is the only case that
// needs the admin password.
$("profile-save").addEventListener("click", async () => {
  $("acct-msg").hidden = true;
  const { color, avatar } = modalEditor.values(state.me.name);
  const newName = $("acct-name").value.trim().replace(/^@+/, "").slice(0, 24);
  const newPass = $("acct-pass").value;
  const master = $("acct-master").value;
  const changingAccount = !!(newName || newPass);

  if (changingAccount && !master)
    return acctMsg("Enter the admin password to change your name or password.");

  const btn = $("profile-save");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    // Picture and colour first: chat_update_profile is keyed on the current
    // name, which a rename below would change out from under it.
    await rpc("chat_update_profile", {
      p_name: state.me.name, p_token: state.me.token, p_color: color, p_avatar: avatar,
    });
    state.me.color = color;
    state.me.avatar = avatar;
    state.me.avh = hashAvatar(avatar);
    avatars.set(state.me.name.toLowerCase(), { h: state.me.avh, url: avatar || null });
    saveProfile({ name: state.me.name, color, avatar });

    if (changingAccount) {
      const acct = await rpc("chat_update_account", {
        p_name: state.me.name,
        p_master: master,
        p_new_name: newName || null,
        p_new_password: newPass || null,
      });
      const oldKey = state.me.name.toLowerCase();
      state.me.name = acct.name;
      state.me.token = acct.token; // a password change rotates it
      saveSession({ name: state.me.name, token: state.me.token });
      saveProfile({ name: state.me.name, color, avatar });
      $("composer-handle").textContent = "@" + state.me.name;
      avatars.delete(oldKey);
      avatars.set(state.me.name.toLowerCase(), { h: state.me.avh, url: avatar || null });
    }

    refreshAvatars();
    if (state.channel) {
      // Re-announce so everyone else picks up the new name/colour, and the new
      // hash tells them to re-fetch the picture.
      await state.channel.track({
        name: state.me.name, color: state.me.color, avh: state.me.avh || "", cid: CID,
      });
    }
    $("acct-name").value = "";
    $("acct-pass").value = "";
    $("acct-master").value = "";
    closeProfileModal();
    banner(changingAccount
      ? (newName ? `Saved — you're now @${state.me.name}.` : "Saved — password changed.")
      : "Profile saved.");
  } catch (ex) {
    acctMsg(ex.message || "Could not save.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
});

/* =================== Account (name / password) =================== */
function acctMsg(text, ok) {
  const el = $("acct-msg");
  el.textContent = text;
  el.classList.toggle("ok", !!ok);
  el.hidden = false;
}

$("acct-logout").addEventListener("click", async () => {
  saveSession(null);
  if (state.channel) {
    await sb.removeChannel(state.channel);
    state.channel = null;
  }
  location.reload();
});

/* =================== Join / create a chat =================== */
function modalError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.hidden = false;
}

// ---- Join with a code ----
function openCodeModal() {
  $("code-input").value = "";
  $("code-error").hidden = true;
  $("code-modal").hidden = false;
  $("code-input").focus();
}
function closeCodeModal() { $("code-modal").hidden = true; }

$("join-btn").addEventListener("click", openCodeModal);
$("code-cancel").addEventListener("click", closeCodeModal);
$("code-modal").addEventListener("click", (e) => {
  if (e.target === $("code-modal")) closeCodeModal();
});
$("code-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("code-join").click();
});

$("code-join").addEventListener("click", async () => {
  $("code-error").hidden = true;
  const code = $("code-input").value.trim();
  if (!code) return modalError("code-error", "Enter a code.");

  const btn = $("code-join");
  btn.disabled = true;
  btn.textContent = "Joining…";
  try {
    // chat_join_room adds you to the chat and hands back its real code + name,
    // so a lowercase or mistyped-case code still works.
    const chat = await rpc("chat_join_room", {
      p_name: state.me.name, p_token: state.me.token, p_code: code,
    });
    closeCodeModal();
    await loadRooms();
    await switchChat({ code: chat.code, name: chat.name });
    banner("Joined " + chat.name + ".");
  } catch (ex) {
    modalError("code-error", ex.message || "Could not join that chat.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Join →";
  }
});

// ---- Create a chat ----
let createdCode = null;
function openNewModal() {
  createdCode = null;
  $("new-input").value = "";
  $("new-input").disabled = false;
  $("new-error").hidden = true;
  $("new-done").hidden = true;
  $("new-create").hidden = false;
  $("new-cancel").textContent = "Cancel";
  $("new-modal").hidden = false;
  $("new-input").focus();
}
async function closeNewModal() {
  $("new-modal").hidden = true;
  // Made one? Go straight into it.
  if (createdCode) {
    const chat = state.rooms.find((r) => r.code === createdCode);
    createdCode = null;
    if (chat) await switchChat(chat);
  }
}

$("new-btn").addEventListener("click", openNewModal);
$("new-cancel").addEventListener("click", closeNewModal);
$("new-modal").addEventListener("click", (e) => {
  if (e.target === $("new-modal")) closeNewModal();
});
$("new-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("new-create").click();
});
$("new-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("new-code").textContent);
    banner("Code copied.");
  } catch {
    banner("Write it down: " + $("new-code").textContent);
  }
});

$("new-create").addEventListener("click", async () => {
  $("new-error").hidden = true;
  const name = $("new-input").value.trim();
  if (!name) return modalError("new-error", "Give your chat a name.");

  const btn = $("new-create");
  btn.disabled = true;
  btn.textContent = "Creating…";
  try {
    const chat = await rpc("chat_create_room", {
      p_name: state.me.name, p_token: state.me.token, p_room_name: name,
    });
    await loadRooms();
    // Show the code before leaving the modal — it's the only way in for others.
    createdCode = chat.code;
    $("new-code").textContent = chat.code;
    $("new-done").hidden = false;
    $("new-input").disabled = true;
    btn.hidden = true;
    $("new-cancel").textContent = "Open chat →";
  } catch (ex) {
    modalError("new-error", ex.message || "Could not create that chat.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create →";
  }
});

/* =================== Boot =================== */
setGateMode("login");
$("name-input").focus();
resumeSession();
