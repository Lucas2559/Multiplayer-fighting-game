/* Nexus Canvas chat — Supabase client (single room, presence-based names) */

const COLORS = ["#7c6cf0", "#3fb98a", "#e0a44a", "#d16bd1", "#5aa9e6", "#e6685a"];
const ROOM = "main"; // this app is a single room; value written to the messages.channel column

function colorFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function initials(name) {
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?";
}

// ~500 KB cap so an avatar (sent to everyone over a realtime presence frame)
// stays well under the websocket message limit.
const MAX_UPLOAD_BYTES = 512 * 1024;
const PROFILE_KEY = "nexus.profile";

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; }
  catch { return {}; }
}
function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

// name(lowercased) -> avatar data URL, rebuilt from realtime presence on each sync.
const avatars = new Map();

// Paint an avatar box: a custom photo/GIF if we have one, else coloured initials.
function paintAvatar(el, name, color, avatarUrl) {
  if (avatarUrl) {
    el.classList.add("has-img");
    el.style.background = "#0d0f16";
    el.innerHTML = `<img src="${avatarUrl}" alt="" />`;
  } else {
    el.classList.remove("has-img");
    el.style.background = color;
    el.textContent = initials(name);
  }
}

// Re-skin every rendered avatar (messages + your own chip) from the current map.
function refreshAvatars() {
  for (const el of document.querySelectorAll(".avatar[data-name]")) {
    const name = el.dataset.name;
    paintAvatar(el, name, el.dataset.color, avatars.get(name.toLowerCase()) || null);
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
          return reject(new Error("That GIF is too big (max ~500 KB). Try a smaller one."));
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
  me: null, // { name, color, avatar }
  room: null, // active realtime channel
  lastRenderedName: null,
};

// ---- Elements ----
const $ = (id) => document.getElementById(id);
const gate = $("gate");
const app = $("app");

/* =================== Name picker =================== */
const gateBtn = () => $("gate-submit");
function resetGateBtn() {
  gateBtn().disabled = false;
  gateBtn().textContent = "Join chat →";
}
function showError(msg) {
  const err = $("gate-error");
  err.textContent = msg;
  err.hidden = false;
  resetGateBtn();
}

// Is `name` claimed by some OTHER client right now? (Our own stale presence from
// a reload doesn't count — it shares our CID.)
function nameTakenByOther(room, name) {
  const s = room.presenceState();
  const target = name.toLowerCase();
  for (const key in s)
    for (const p of s[key])
      if (String(p.name).toLowerCase() === target && p.cid !== CID) return true;
  return false;
}

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("gate-error").hidden = true;
  const raw = $("name-input").value.trim();
  const name = raw.replace(/^@+/, "").slice(0, 24);
  if (!name) return showError("Please enter a name.");
  if (!/^[a-zA-Z0-9_\- .]+$/.test(name))
    return showError("Use letters, numbers, spaces, _ - only.");

  gateBtn().disabled = true;
  gateBtn().textContent = "Joining…";
  const { color, avatar } = gateEditor.values(name);

  // Never leave a dead "chat" channel around from a failed attempt.
  if (state.room) {
    await sb.removeChannel(state.room);
    state.room = null;
  }

  const room = sb.channel("chat", {
    config: { presence: { key: CID } },
  });
  let synced = false;
  room
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
      (payload) => appendMessage(payload.new))
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

    if (nameTakenByOther(room, name))
      throw new Error("Someone's already chatting under that name. Pick another.");

    await room.track({ name, color, avatar, cid: CID });
    state.me = { name, color, avatar };
    state.room = room;
    saveProfile({ name, color, avatar });
    enterApp();
  } catch (ex) {
    await sb.removeChannel(room);
    showError(ex?.message || "Network error.");
  }
});

/* =================== Chat =================== */
// The legacy schema has a foreign key messages.name -> handles(name). If that
// table still exists, make sure a row for this name is present so inserts pass.
// This is NOT the old locking behaviour: there's no gate, no uniqueness read
// from here — it only satisfies a leftover constraint. Best fixed for real by
// dropping the FK (see README), which makes this a harmless no-op.
async function ensureHandle() {
  const { name, color } = state.me;
  const { error } = await sb
    .from("handles")
    .upsert({ name, name_key: name.toLowerCase(), color }, { ignoreDuplicates: true });
  // 42P01 = table doesn't exist (fresh schema) — expected, ignore.
  if (error && error.code !== "42P01") console.warn("ensureHandle:", error.message);
}

async function enterApp() {
  gate.hidden = true;
  app.hidden = false;

  $("composer-handle").textContent = "@" + state.me.name;
  $("composer-input").focus();

  // Show your own avatar right away, before the first presence sync lands.
  if (state.me.avatar) avatars.set(state.me.name.toLowerCase(), state.me.avatar);
  refreshAvatars();

  await ensureHandle();
  await loadHistory();
  renderOnline(state.room);
}

async function loadHistory() {
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return banner("Could not load history: " + error.message);
  for (const m of data) appendMessage(m, true);
  scrollToBottom();
}

function appendMessage(m, quiet) {
  const box = $("messages");
  const ts = m.created_at ? new Date(m.created_at).getTime() : Date.now();
  const grouped = state.lastRenderedName === m.name;
  state.lastRenderedName = m.name;

  const el = document.createElement("div");
  el.className = "msg" + (grouped ? " grouped" : "");
  el.innerHTML = `
    <div class="avatar" data-name="${escapeHtml(m.name)}" data-color="${escapeHtml(m.color)}"></div>
    <div class="msg-body">
      <div class="msg-head">
        <span class="msg-name" style="color:${m.color}">${escapeHtml(m.name)}</span>
        <span class="msg-time">${fmtTime(ts)}</span>
      </div>
      <div class="msg-text">${escapeHtml(m.body)}</div>
    </div>`;
  paintAvatar(el.querySelector(".avatar"), m.name, m.color, avatars.get(String(m.name).toLowerCase()) || null);
  box.appendChild(el);
  if (!quiet) scrollToBottom();
}

// Rebuild the online count AND the presence-derived avatar map on every sync,
// then re-skin everything so avatar changes propagate live to all clients.
function renderOnline(room) {
  const s = room.presenceState();
  const cids = new Set();
  avatars.clear();
  for (const key in s)
    for (const p of s[key]) {
      cids.add(p.cid || key);
      if (p.avatar) avatars.set(String(p.name).toLowerCase(), p.avatar);
    }
  $("online-count").innerHTML = `<span class="dot"></span>${cids.size} online`;
  refreshAvatars();
}

/* =================== Composer =================== */
$("composer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("composer-input");
  const body = input.value.trim();
  if (!body) return;
  input.value = "";
  const { error } = await sb.from("messages").insert({
    channel: ROOM, // single room; kept so the legacy NOT NULL column is satisfied
    name: state.me.name,
    color: state.me.color,
    body,
  });
  if (error) {
    banner("Message failed: " + error.message);
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
  $("profile-modal").hidden = false;
});
$("profile-cancel").addEventListener("click", closeProfileModal);
$("profile-modal").addEventListener("click", (e) => {
  if (e.target === $("profile-modal")) closeProfileModal();
});
$("profile-save").addEventListener("click", async () => {
  const { color, avatar } = modalEditor.values(state.me.name);
  state.me.color = color;
  state.me.avatar = avatar;
  saveProfile({ name: state.me.name, color, avatar });

  const key = state.me.name.toLowerCase();
  if (avatar) avatars.set(key, avatar);
  else avatars.delete(key);
  refreshAvatars();
  closeProfileModal();

  // Re-broadcast so everyone else sees the new colour/photo immediately.
  try { await state.room.track({ name: state.me.name, color, avatar, cid: CID }); }
  catch (e) { banner("Could not update profile: " + (e.message || e)); }
});

$("name-input").focus();
