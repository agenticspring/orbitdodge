/* Headless automated playtest for OrbitDodge.
 * Loads the REAL ../index.html script (all of it, not just the logic block)
 * into a stubbed DOM/canvas environment and drives the full flow:
 *   title -> start -> play -> orbit switch -> collision -> dying ->
 *   gameover -> restart-guard -> restart, with 0 console errors.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.ok(scripts.length > 0, 'no <script> found in index.html');
const src = scripts.join('\n');

/* ---------- stubs ---------- */
const errors = [];
function makeCtx(el) {
  const grad = { addColorStop() {} };
  return new Proxy(
    { canvas: el },
    {
      get(t, k) {
        if (k === 'canvas') return el;
        if (k in t) return t[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
        if (k === 'measureText') return () => ({ width: 0 });
        return () => undefined; /* every other 2d method: no-op */
      },
      set(t, k, v) { t[k] = v; return true; },
    }
  );
}
function makeEl(tag, id) {
  const listeners = {};
  const classes = new Set();
  const el = {
    tag, id: id || null,
    style: {}, dataset: {}, children: [],
    textContent: '', innerHTML: '',
    width: 300, height: 150,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c) => (classes.has(c) ? classes.delete(c) : classes.add(c)),
      contains: (c) => classes.has(c),
    },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener: () => {},
    appendChild: (c) => { el.children.push(c); return c; },
    setAttribute: () => {},
    getAttribute: () => null,
    getContext: () => makeCtx(el),
    querySelector: () => makeEl('div'),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 720 }),
    _fire: (t, e) => {
      const evt = Object.assign({ preventDefault() {}, stopPropagation() {}, target: el }, e);
      (listeners[t] || []).forEach((f) => f(evt));
    },
  };
  return el;
}

let simNow = 100000;
const store = {};
const els = {};
const winListeners = {};
let rafCb = null;

const sandbox = {
  console: {
    log: () => {}, warn: () => {}, info: () => {},
    error: (...a) => errors.push(a.map(String).join(' ')),
  },
  performance: { now: () => simNow },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  cancelAnimationFrame: () => {},
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  navigator: {}, devicePixelRatio: 1,
  addEventListener: (t, f) => { (winListeners[t] = winListeners[t] || []).push(f); },
  removeEventListener: () => {},
  Math, JSON, Object, Array, parseFloat, isFinite, parseInt, String, Number, Boolean, Date, RegExp, Error,
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  getElementById: (id) => {
    if (!els[id]) {
      els[id] = makeEl('div', id);
      if (id === 'game') { els[id].width = 480; els[id].height = 720; }
    }
    return els[id];
  },
  createElement: (tag) => makeEl(tag),
  addEventListener: (t, f) => { (winListeners[t] = winListeners[t] || []).push(f); },
  removeEventListener: () => {},
  body: makeEl('body'),
  hidden: false,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'index.html<script>' });

/* drive rAF manually with a fixed 60fps step */
function frame(ms) {
  simNow = ms;
  const cb = rafCb; rafCb = null;
  assert.ok(cb, 'game did not schedule a frame');
  cb(ms);
}
function frames(n, startMs, stepMs = 16.7) {
  let t = startMs;
  for (let i = 0; i < n; i++) { frame(t); t += stepMs; }
  return t;
}
const G = () => sandbox.G;
const press = () => els.stage._fire('pointerdown');
const keySpace = () =>
  (winListeners.keydown || []).forEach((f) => f({ code: 'Space', preventDefault() {} }));

test('boot: title state, no errors, best line rendered', () => {
  frame(simNow); /* run the boot frame */
  assert.equal(G().state, 'title');
  assert.ok(els.titleBest.innerHTML.length > 0, 'title best line set');
  assert.equal(errors.length, 0, 'console errors at boot: ' + errors.join(' | '));
});

test('tap on title starts the game', () => {
  press();
  assert.equal(G().state, 'playing');
  assert.ok(els.title.classList.contains('hidden'), 'title overlay hidden');
  assert.equal(G().asteroids.length, 0);
  assert.equal(errors.length, 0);
});

test('ship survives, score accrues, difficulty spawns asteroids', () => {
  frames(200, simNow); /* ~3.3s of play */
  assert.equal(G().state, 'playing', 'ship should still be alive on empty-ish field');
  assert.ok(G().time > 3.0, 'time accrued: ' + G().time);
  assert.ok(Math.abs(G().score - G().time) < 1e-9, 'score == seconds survived');
  assert.ok(G().asteroids.length > 0, 'asteroids spawned');
  assert.ok(els.score.textContent.includes('s'), 'HUD score shows seconds');
});

test('tap/space switches orbit (core mechanic)', () => {
  const before = G().orbit;
  press();
  assert.equal(G().orbit, 1 - before, 'pointer switches orbit');
  keySpace();
  assert.equal(G().orbit, before, 'space switches orbit back');
  /* radius lerps toward the new target over frames */
  frames(30, simNow);
  const target = sandbox.shipTargetRadius(G().orbit);
  assert.ok(Math.abs(G().shipR - target) < 1, 'ship radius converged to target orbit');
});

test('collision -> dying -> game over, best persisted', () => {
  /* park an asteroid exactly on the ship */
  G().shipAngle = 1.0;
  G().shipR = sandbox.shipTargetRadius(G().orbit);
  G().asteroids.push({ orbit: G().orbit, angle: 1.0, dir: 0, r: 15, spin: 0, rot: 0, verts: 8, wob: 1, speedMul: 0 });
  const scoreBeforeDeath = G().score;
  frame(simNow + 16.7); simNow += 16.7;
  assert.equal(G().state, 'dying', 'collision triggers dying state');
  assert.ok(G().particles.length > 20, 'death particle burst spawned');
  frames(80, simNow); /* >1s dying animation */
  assert.equal(G().state, 'gameover');
  assert.ok(!els.over.classList.contains('hidden'), 'game-over overlay shown');
  const shown = parseFloat(els.overScore.textContent);
  assert.ok(Math.abs(shown - G().score) < 0.05, 'final score shown, got ' + els.overScore.textContent);
  assert.ok(parseFloat(store.orbitdodge_best_v1) > 0, 'best score persisted to localStorage');
  assert.ok(els.newBest.classList.contains('show'), 'new-best badge shown on record run');
  assert.equal(errors.length, 0, 'console errors during death flow: ' + errors.join(' | '));
});

test('restart guard blocks instant tap, then restart works', () => {
  press(); /* immediate tap — must be ignored */
  assert.equal(G().state, 'gameover', 'instant tap after game over is ignored');
  simNow += 700; /* wait out the 600ms guard */
  press();
  assert.equal(G().state, 'playing', 'tap after guard restarts');
  assert.equal(G().score, 0, 'score reset');
  assert.equal(G().asteroids.length, 0, 'asteroids cleared');
  assert.ok(els.over.classList.contains('hidden'), 'game-over overlay hidden');
});

test('mute toggle flips state without errors', () => {
  assert.equal(G().muted, false);
  els.muteBtn._fire('pointerdown');
  assert.equal(G().muted, true);
  assert.equal(els.muteBtn.textContent, '🔇');
  els.muteBtn._fire('pointerdown');
  assert.equal(G().muted, false);
  assert.equal(els.muteBtn.textContent, '🔊');
  assert.equal(errors.length, 0);
});

test('second run: switch orbit then survive a while, still no errors', () => {
  press(); /* switch orbit mid-run */
  frames(300, simNow);
  /* ship may or may not have died; either state is a valid game outcome */
  assert.ok(['playing', 'dying', 'gameover'].includes(G().state));
  assert.equal(errors.length, 0, 'ZERO console errors across the whole playtest: ' + errors.join(' | '));
});
