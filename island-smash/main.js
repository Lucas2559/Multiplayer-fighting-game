// Island Smash — three.js renders, Rapier simulates. Blender only made the assets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import RAPIER from 'rapier';

const GAME_SECONDS = 90;
const FALL_Y = -6;          // below this, an object has fallen off the island
const POINTS = { Cottage: 5, Boulder: 1, Pine: 2, Tree: 2 };
const KNOCK = { Cottage: 5, Boulder: 7, Pine: 7, Tree: 7 };   // m/s given by a hammer hit
const DENSITY = { Cottage: 250, Boulder: 1400, Pine: 250, Tree: 250 };
const CHAIN_SPEED = 6.5;

await RAPIER.init();
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd9a07a, 35, 110);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);

// gradient sunset sky
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(400, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP;
      void main(){ float h = vP.y;
        vec3 low = vec3(.45,.25,.45), hor = vec3(1.,.5,.25), mid = vec3(1.,.75,.5), top = vec3(.15,.28,.6);
        vec3 c = h < -.05 ? mix(low, hor, smoothstep(-.6,-.05,h)) : h < .15 ? mix(hor, mid, smoothstep(-.05,.15,h)) : mix(mid, top, smoothstep(.15,.7,h));
        gl_FragColor = vec4(c,1.); }`,
  })));

scene.add(new THREE.HemisphereLight(0xffd6b0, 0x4a3050, 0.75));
const sun = new THREE.DirectionalLight(0xffc48a, 3.2);
sun.position.set(-14, 12, -10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// ---------------------------------------------------------------- physics world
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 60;
const events = new RAPIER.EventQueue(true);

// ---------------------------------------------------------------- load assets
const loader = new GLTFLoader();
const [island, player] = await Promise.all([
  loader.loadAsync('assets/island.glb'), loader.loadAsync('assets/player.glb'),
]);
$('loading').remove();

const kindOf = (name) => Object.keys(POINTS).find((k) => name.startsWith(k));
const breakables = [];              // { node, body, kind, home, homeQ, state }
const byCollider = new Map();       // collider handle -> breakable
let cottage = null;

function worldPoints(node, toLocal) {
  const pts = [];
  const v = new THREE.Vector3();
  node.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (toLocal) v.applyMatrix4(toLocal);
      pts.push(v.x, v.y, v.z);
    }
  });
  return new Float32Array(pts);
}

function addTrimesh(node) {
  node.traverse((m) => {
    if (!m.isMesh) return;
    const verts = worldPoints(m);
    const idx = m.geometry.index ? new Uint32Array(m.geometry.index.array) : undefined;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(0.9), body);
  });
}

island.scene.updateMatrixWorld(true);
for (const node of [...island.scene.children]) {
  const name = node.name;
  node.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  if (name === 'Hammer') { node.removeFromParent(); continue; }        // the player carries their own
  if (name === 'IslandTop' || name === 'IslandRock') { addTrimesh(node); continue; }
  if (name.startsWith('Cloud')) { node.traverse((m) => { if (m.isMesh) m.castShadow = false; }); continue; }
  if (name === 'Pond' || name === 'Stream') {
    node.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.material.transparent = true; m.material.opacity = 0.85; } });
    continue;
  }
  const kind = kindOf(name);
  if (!kind) continue;
  const toLocal = new THREE.Matrix4().compose(node.position, node.quaternion, new THREE.Vector3(1, 1, 1)).invert();
  const hull = worldPoints(node, toLocal);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
    .setTranslation(node.position.x, node.position.y, node.position.z)
    .setRotation(node.quaternion).setCcdEnabled(true));
  const col = world.createCollider(RAPIER.ColliderDesc.convexHull(hull)
    .setDensity(DENSITY[kind]).setFriction(0.7).setRestitution(0.2)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  const b = { node, body, col, kind, home: node.position.clone(), homeQ: node.quaternion.clone(), state: 'glued' };
  breakables.push(b);
  byCollider.set(col.handle, b);
  if (kind === 'Cottage') cottage = b;
}
scene.add(island.scene);

// warm light from the cottage windows (falls with the cottage)
if (cottage) {
  const glow = new THREE.PointLight(0xff9a40, 6, 6, 1.5);
  glow.position.set(0, 0.5, 0.9);
  cottage.node.add(glow);
}

// ---------------------------------------------------------------- player
const P = player.scene.getObjectByName('Player');
P.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
const part = (n) => P.getObjectByName(n);
const rig = { body: part('Body'), head: part('Head'), armL: part('ArmL'), armR: part('ArmR'), legL: part('LegL'), legR: part('LegR') };
scene.add(P);

const CAP_HALF = 0.28, CAP_R = 0.22, FOOT = CAP_HALF + CAP_R;
const pBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
const pCol = world.createCollider(RAPIER.ColliderDesc.capsule(CAP_HALF, CAP_R).setFriction(0), pBody);
const ctrl = world.createCharacterController(0.02);
ctrl.setUp({ x: 0, y: 1, z: 0 });
ctrl.setMaxSlopeClimbAngle(50 * Math.PI / 180);
ctrl.setMinSlopeSlideAngle(35 * Math.PI / 180);
ctrl.enableAutostep(0.35, 0.15, true);
ctrl.enableSnapToGround(0.35);
ctrl.setApplyImpulsesToDynamicBodies(true);

const SPAWN = new THREE.Vector3(-0.1, 4, 3.9);    // in front of the cottage door
const pl = { vy: 0, yaw: Math.PI, grounded: false, walk: 0, swing: -1, struck: false, dead: 0 };

function groundAt(x, z) {
  const hit = world.castRay(new RAPIER.Ray({ x, y: 20, z }, { x: 0, y: -1, z: 0 }), 40, true, undefined, undefined, pCol);
  return hit ? 20 - hit.timeOfImpact : 0;
}
function spawnPlayer() {
  const y = groundAt(SPAWN.x, SPAWN.z) + FOOT + 0.05;
  pBody.setTranslation({ x: SPAWN.x, y, z: SPAWN.z }, true);
  pBody.setNextKinematicTranslation({ x: SPAWN.x, y, z: SPAWN.z });
  pl.vy = 0; pl.yaw = Math.PI; camYaw = 0;
}

// ---------------------------------------------------------------- input
const keys = new Set();
let camYaw = 0, camPitch = 0.42, dragging = false, lastX = 0;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyF' || e.code === 'KeyJ') startSwing();
  if (e.code === 'KeyR' && game.state !== 'start') startGame();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 2) { dragging = true; lastX = e.clientX; }
  if (e.button === 0) startSwing();
});
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.006; lastX = e.clientX;
  camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.004, 0.15, 1.1);
});
addEventListener('wheel', (e) => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.004, 3, 12); });
let camDist = 6.5;

// ---------------------------------------------------------------- sound (synthesised)
let audio;
function sfx(kind) {
  if (!audio) return;
  const t = audio.currentTime, out = audio.createGain();
  out.connect(audio.destination);
  if (kind === 'whoosh') {
    const n = noiseSrc(0.25), f = audio.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2500, t + 0.2);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.25, t + 0.12); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(f).connect(out); n.start(t);
  } else {
    const o = audio.createOscillator();
    o.type = 'triangle';
    const base = kind === 'thunk' ? 110 : kind === 'chain' ? 330 : kind === 'score' ? 520 : 70;
    o.frequency.setValueAtTime(base * 1.6, t); o.frequency.exponentialRampToValueAtTime(base, t + 0.12);
    out.gain.setValueAtTime(kind === 'score' ? 0.18 : 0.5, t); out.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'score' ? 0.35 : 0.25));
    o.connect(out); o.start(t); o.stop(t + 0.4);
    if (kind === 'smash' || kind === 'thunk') { const n = noiseSrc(0.12), g = audio.createGain(); g.gain.value = 0.35; n.connect(g).connect(out); n.start(t); }
    if (kind === 'score') { const o2 = audio.createOscillator(); o2.frequency.value = base * 1.5; o2.connect(out); o2.start(t + 0.08); o2.stop(t + 0.35); }
  }
}
function noiseSrc(sec) {
  const buf = audio.createBuffer(1, audio.sampleRate * sec, audio.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = audio.createBufferSource(); s.buffer = buf; return s;
}

// ---------------------------------------------------------------- effects
const dust = [];
const dustGeo = new THREE.IcosahedronGeometry(0.07, 0);
const dustMat = new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 1, transparent: true });
function burst(p, color = 0xc9a27a, n = 14) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(dustGeo, dustMat.clone());
    m.material.color.set(color);
    m.position.copy(p);
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
    m.userData.life = 0.7;
    scene.add(m); dust.push(m);
  }
}
let shake = 0;

// chimney smoke
const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const smoke = [];
let chimneyLocal = null;
if (cottage) {   // highest vertex of the cottage is the top of the chimney
  const toLocal = new THREE.Matrix4().compose(cottage.node.position, cottage.node.quaternion, new THREE.Vector3(1, 1, 1)).invert();
  const pts = worldPoints(cottage.node, toLocal);
  let best = -1e9;
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] > best) { best = pts[i + 1]; chimneyLocal = new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]); }
}
let smokeT = 0;
function updateSmoke(dt) {
  smokeT += dt;
  if (chimneyLocal && cottage.state === 'glued' && smokeT > 0.35) {
    smokeT = 0;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xf2e6e6, transparent: true, depthWrite: false }));
    s.position.copy(cottage.node.localToWorld(chimneyLocal.clone()));
    s.userData.life = 0;
    scene.add(s); smoke.push(s);
  }
  for (let i = smoke.length - 1; i >= 0; i--) {
    const s = smoke[i]; s.userData.life += dt;
    const t = s.userData.life / 3;
    s.position.y += dt * 0.7; s.position.x += dt * 0.25;
    s.scale.setScalar(0.3 + t * 1.6);
    s.material.opacity = 0.75 * (1 - t);
    if (t >= 1) { scene.remove(s); smoke.splice(i, 1); }
  }
}

// floating text
function popup(text, worldPos, color = '#ffd966') {
  const el = document.createElement('div');
  el.className = 'pop'; el.textContent = text; el.style.color = color;
  document.body.appendChild(el);
  pops.push({ el, pos: worldPos ? worldPos.clone() : null, t: 0, slot: pops.filter((p) => !p.pos).length });
}
const pops = [];
function updatePops(dt) {
  const v = new THREE.Vector3();
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt;
    if (p.pos) {
      v.copy(p.pos).project(camera);
      p.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      p.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight - 40 - p.t * 50}px`;
    } else {
      p.el.style.left = '50%';
      p.el.style.top = `${110 + p.slot * 34 - p.t * 20}px`;
    }
    p.el.style.opacity = String(Math.max(0, 1 - p.t / 1.4));
    if (p.t > 1.4) { p.el.remove(); pops.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- game rules
const game = { state: 'start', score: 0, time: GAME_SECONDS, knocked: 0, chains: 0,
  best: Number((() => { try { return localStorage.getItem('islandSmashBest'); } catch { return 0; } })() || 0) };
$('best').textContent = game.best;

function unglue(b, vel, at, why = "?") {
  if (b.state === "gone") return;
  if (b.state === 'glued') {
    b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    b.state = 'loose';
  }
  const m = b.body.mass();
  const imp = { x: vel.x * m, y: vel.y * m, z: vel.z * m };
  if (at) b.body.applyImpulseAtPoint(imp, at, true); else b.body.applyImpulse(imp, true);
}

function startSwing() {
  if (game.state !== 'play' || pl.swing >= 0) return;
  pl.swing = 0; pl.struck = false;
  sfx('whoosh');
}

const SWING = { windup: 0.16, strike: 0.1, recover: 0.22 };
function strike() {
  // a ball in front of the player at hammer-head height
  const fwd = new THREE.Vector3(Math.sin(pl.yaw), 0, Math.cos(pl.yaw));
  const t = pBody.translation();
  const c = new THREE.Vector3(t.x, t.y - FOOT + 0.45, t.z).addScaledVector(fwd, 0.75);
  let best = null, bestD = Infinity;
  world.intersectionsWithShape(c, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(0.55), (col) => {
    const b = byCollider.get(col.handle);
    if (b && b.state !== 'gone') {
      const p = b.body.translation(), d = (p.x - c.x) ** 2 + (p.z - c.z) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    return true;
  });
  shake = 0.25;
  if (!best) { sfx('thunk'); burst(c, 0x8fae4a, 8); return; }
  const first = best.state === 'glued';
  const k = KNOCK[best.kind];
  const vel = fwd.clone().multiplyScalar(k).add(new THREE.Vector3(0, 2.2, 0));
  unglue(best, vel, { x: c.x, y: c.y + 0.25, z: c.z }, "hammer");
  sfx('smash'); burst(c, 0xc9a27a, 16);
  popup(first ? 'UNGLUED!' : 'WHACK!', c.clone().add(new THREE.Vector3(0, 0.8, 0)));
}

function handleCollisions() {
  events.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const a = byCollider.get(h1), b = byCollider.get(h2);
    if (!a || !b) return;
    for (const [mover, still] of [[a, b], [b, a]]) {
      if (mover.state !== 'loose' || still.state !== 'glued') continue;
      const v = mover.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed < CHAIN_SPEED) continue;
      unglue(still, { x: v.x * 0.4, y: Math.max(1.2, v.y * 0.3), z: v.z * 0.4 }, undefined, "chain:" + mover.node.name);
      game.chains++; game.score++;
      const p = still.body.translation();
      popup('CHAIN! +1', new THREE.Vector3(p.x, p.y + 1.2, p.z), '#9fdcff');
      sfx('chain'); burst(new THREE.Vector3(p.x, p.y + 0.4, p.z), 0x7fa04a, 10);
    }
  });
}

function startGame() {
  for (const b of breakables) {
    b.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    b.body.setTranslation(b.home, true);
    b.body.setRotation(b.homeQ, true);
    b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.body.setEnabled(true);
    b.node.visible = true;
    b.node.position.copy(b.home); b.node.quaternion.copy(b.homeQ);
    b.state = 'glued'; b.scored = false;
  }
  Object.assign(game, { state: 'play', score: 0, time: GAME_SECONDS, knocked: 0, chains: 0 });
  spawnPlayer();
  pl.swing = -1;
  for (const id of ['start', 'over']) $(id).classList.add('hidden');
  for (const id of ['hud', 'help']) $(id).classList.remove('hidden');
}

function endGame(cleared) {
  game.state = 'over';
  if (game.score > game.best) {
    game.best = game.score;
    try { localStorage.setItem('islandSmashBest', String(game.best)); } catch {}
    $('best').textContent = game.best;
  }
  $('overTitle').textContent = cleared ? 'ISLAND CLEARED!' : "TIME'S UP!";
  $('overStats').innerHTML = `Score <b>${game.score}</b> · ${game.knocked} things overboard · ${game.chains} chain reactions<br>Best: ${game.best}`;
  $('over').classList.remove('hidden');
}

for (const id of ['play', 'again']) $(id).addEventListener('click', (e) => {
  e.stopPropagation();
  if (!audio) { try { audio = new AudioContext(); } catch {} }
  startGame();
});

// ---------------------------------------------------------------- per-frame updates
function updatePlayer(dt) {
  if (keys.has('KeyQ')) camYaw += dt * 2;
  if (keys.has('KeyE')) camYaw -= dt * 2;
  const playing = game.state === 'play';
  // movement relative to camera
  let ix = 0, iz = 0;
  if (playing) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix -= 1;
  }
  const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const move = fwd.multiplyScalar(iz).addScaledVector(right, -ix);
  const moving = move.lengthSq() > 0;
  if (moving) {
    move.normalize();
    const target = Math.atan2(move.x, move.z);
    let d = target - pl.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    pl.yaw += d * Math.min(1, dt * 12);
  }
  const speed = pl.swing >= 0 ? 1.6 : 3.6;
  if (pl.grounded) {
    pl.vy = -1;
    if (playing && keys.has('Space')) { pl.vy = 5.2; pl.grounded = false; }
  } else pl.vy -= 9.81 * 1.6 * dt;
  const desired = { x: move.x * speed * dt, y: pl.vy * dt, z: move.z * speed * dt };
  ctrl.computeColliderMovement(pCol, desired);
  const m = ctrl.computedMovement();
  const t = pBody.translation();
  pBody.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
  pl.grounded = ctrl.computedGrounded();
  if (pl.grounded && pl.vy > 0 && m.y <= 0) pl.vy = 0;

  // fell off?
  if (t.y < -14 && playing) {
    game.score = Math.max(0, game.score - 3);
    popup('Oops! −3', null, '#ff8a75');
    spawnPlayer();
  }

  // place and animate the model
  P.position.set(t.x, t.y - FOOT, t.z);
  P.rotation.y = pl.yaw;
  if (moving && pl.grounded) pl.walk += dt * 11; else pl.walk *= 0.85;
  const s = Math.sin(pl.walk);
  rig.legL.rotation.x = s * 0.7;
  rig.legR.rotation.x = -s * 0.7;
  rig.armL.rotation.x = -s * 0.5;
  rig.body.position.y = 0.34 + Math.abs(Math.cos(pl.walk)) * 0.03;
  if (!pl.grounded) { rig.legL.rotation.x = -0.5; rig.legR.rotation.x = 0.3; }

  // hammer swing on the right arm: idle -> wind-up overhead -> smash down -> recover
  const IDLE = -0.6, UP = -2.9, DOWN = 0.35;
  if (pl.swing >= 0) {
    pl.swing += dt;
    const { windup, strike: st, recover } = SWING;
    let a;
    if (pl.swing < windup) a = THREE.MathUtils.lerp(IDLE, UP, easeOut(pl.swing / windup));
    else if (pl.swing < windup + st) {
      a = THREE.MathUtils.lerp(UP, DOWN, easeIn((pl.swing - windup) / st));
    } else {
      if (!pl.struck) { pl.struck = true; strike(); }
      a = THREE.MathUtils.lerp(DOWN, IDLE, easeOut((pl.swing - windup - st) / recover));
      if (pl.swing > windup + st + recover) pl.swing = -1;
    }
    rig.armR.rotation.x = a;
    rig.body.rotation.x = a > 0 ? a * 0.35 : 0;
  } else {
    rig.armR.rotation.x = IDLE + s * 0.15;
    rig.body.rotation.x = 0;
  }
}
const easeIn = (x) => x * x, easeOut = (x) => 1 - (1 - x) * (1 - x);

function updateBreakables() {
  for (const b of breakables) {
    if (b.state !== 'loose') continue;
    const p = b.body.translation(), q = b.body.rotation();
    b.node.position.set(p.x, p.y, p.z);
    b.node.quaternion.set(q.x, q.y, q.z, q.w);
    if (!b.scored && p.y < FALL_Y) {
      b.scored = true;
      if (game.state === 'play') {
        const pts = POINTS[b.kind];
        game.score += pts; game.knocked++;
        popup(`+${pts}  ${b.kind} overboard!`, null, '#8dff9e');
        sfx('score');
      }
    }
    if (p.y < -80) { b.state = 'gone'; b.body.setEnabled(false); b.node.visible = false; }
  }
}

const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const t = pBody.translation();
  camTarget.lerp(new THREE.Vector3(t.x, Math.max(t.y, -4) + 0.6, t.z), Math.min(1, dt * 8));
  const off = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch)).multiplyScalar(camDist);
  camera.position.copy(camTarget).add(off);
  if (shake > 0) {
    camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(shake * 0.4));
    shake = Math.max(0, shake - dt);
  }
  camera.lookAt(camTarget);
}

function updateDust(dt) {
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i]; d.userData.life -= dt;
    d.userData.v.y -= 9 * dt;
    d.position.addScaledVector(d.userData.v, dt);
    d.material.opacity = Math.max(0, d.userData.life / 0.7);
    if (d.userData.life <= 0) { scene.remove(d); d.material.dispose(); dust.splice(i, 1); }
  }
}

// idle attract mode: slow orbit before the first game
function attractCamera(time) {
  const a = time * 0.00012;
  camera.position.set(Math.sin(a) * 19, 6, Math.cos(a) * 19);
  camera.lookAt(0, -0.5, 0);
}

// ---------------------------------------------------------------- main loop
spawnPlayer();
$('start').classList.remove('hidden');
const clock = new THREE.Clock();
let acc = 0, hudTick = 0;
renderer.setAnimationLoop((time) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  updatePlayer(dt);
  acc += dt;
  let steps = 0;
  while (acc >= world.timestep && steps < 4) { world.step(events); handleCollisions(); acc -= world.timestep; steps++; }
  updateBreakables();
  updateSmoke(dt);
  updateDust(dt);
  if (game.state === 'start') attractCamera(time); else updateCamera(dt);
  updatePops(dt);

  if (game.state === 'play') {
    game.time -= dt;
    const remaining = breakables.filter((b) => !b.scored).length;
    if (game.time <= 0) { game.time = 0; endGame(false); }
    else if (remaining === 0) endGame(true);
  }
  if ((hudTick += dt) > 0.1) {
    hudTick = 0;
    $('score').textContent = game.score;
    $('time').textContent = Math.ceil(game.time);
    $('timeWrap').classList.toggle('warn', game.time <= 10);
  }
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
