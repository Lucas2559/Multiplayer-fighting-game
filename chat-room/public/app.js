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
  me: null, // { name, color }
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

// Number of distinct clients currently connected.
function onlineCount(room) {
  const s = room.presenceState();
  const cids = new Set();
  for (const key in s) for (const p of s[key]) cids.add(p.cid || key);
  return cids.size;
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
  const color = colorFor(name);

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

    await room.track({ name, color, cid: CID });
    state.me = { name, color };
    state.room = room;
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
    <div class="avatar" style="background:${m.color}">${initials(m.name)}</div>
    <div class="msg-body">
      <div class="msg-head">
        <span class="msg-name" style="color:${m.color}">${escapeHtml(m.name)}</span>
        <span class="msg-time">${fmtTime(ts)}</span>
      </div>
      <div class="msg-text">${escapeHtml(m.body)}</div>
    </div>`;
  box.appendChild(el);
  if (!quiet) scrollToBottom();
}

function renderOnline(room) {
  const count = onlineCount(room);
  $("online-count").innerHTML = `<span class="dot"></span>${count} online`;
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

$("name-input").focus();
