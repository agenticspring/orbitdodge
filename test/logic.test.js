/* Unit tests for the PURE game logic of OrbitDodge.
 * The logic block is extracted VERBATIM from ../index.html between the
 * LOGIC_START / LOGIC_END marker comments, so these tests run
 * against the actual production code, not a copy.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\*__LOGIC_START__\*\/([\s\S]*?)\/\*__LOGIC_END__\*\//);
assert.ok(m, 'logic block markers not found in index.html');
const loader = new Function(
  m[1] + '\nreturn {normAngle,angDiff,collide,shipTargetRadius,difficultyAt,makeAsteroid,lerpR,W,H,CX,CY,R_IN,R_OUT,SHIP_R,TAU};'
);
const L = loader();

/* deterministic rng (LCG) */
function seeded(s) {
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('constants: portrait 480x720 playfield, two distinct orbits', () => {
  assert.equal(L.W, 480);
  assert.equal(L.H, 720);
  assert.ok(L.R_OUT > L.R_IN, 'outer orbit must be wider than inner');
  assert.ok(L.CX === 240 && L.CY === 405);
});

test('normAngle wraps into [-PI, PI]', () => {
  assert.ok(approx(L.normAngle(0), 0));
  assert.ok(approx(L.normAngle(3 * Math.PI), Math.PI));
  assert.ok(approx(L.normAngle(-3 * Math.PI), -Math.PI));
  assert.ok(approx(L.normAngle(7.5), 7.5 - 2 * Math.PI));
  const v = L.normAngle(12345.678);
  assert.ok(v >= -Math.PI && v <= Math.PI, 'out of range: ' + v);
});

test('angDiff handles wrap-around correctly', () => {
  assert.ok(approx(L.angDiff(0.1, -0.1), 0.2));
  assert.ok(approx(L.angDiff(0, Math.PI), Math.PI));
  assert.ok(approx(L.angDiff(Math.PI - 0.05, -Math.PI + 0.05), 0.1),
    'angles near the PI/-PI seam must be close');
  assert.ok(approx(L.angDiff(1.0, 1.0), 0));
});

test('collide: circle-circle hit detection', () => {
  assert.equal(L.collide(0, 0, 10, 5, 0, 10), true, 'overlapping circles');
  assert.equal(L.collide(0, 0, 10, 100, 0, 10), false, 'far apart');
  assert.equal(L.collide(0, 0, 10, 20, 0, 10), false, 'exactly touching = no hit (strict <)');
  assert.equal(L.collide(0, 0, 10, 19.9, 0, 10), true, 'just inside = hit');
  assert.equal(L.collide(100, 100, 5, 103, 104, 5), true, 'diagonal overlap');
});

test('shipTargetRadius maps orbit index to orbit radius', () => {
  assert.equal(L.shipTargetRadius(0), L.R_IN);
  assert.equal(L.shipTargetRadius(1), L.R_OUT);
});

test('difficultyAt: ramps up, clamps sanely', () => {
  const d0 = L.difficultyAt(0);
  const d30 = L.difficultyAt(30);
  const d120 = L.difficultyAt(120);
  assert.ok(approx(d0.spawnInterval, 1.35));
  assert.ok(approx(d0.astSpeed, 0.85));
  assert.ok(d30.spawnInterval < d0.spawnInterval, 'spawn interval shrinks');
  assert.ok(d30.astSpeed > d0.astSpeed, 'asteroid speed grows');
  assert.ok(approx(d120.spawnInterval, 0.42), 'spawn interval clamped at floor');
  assert.ok(d120.astSpeed <= 2.4, 'asteroid speed clamped at ceiling');
  assert.ok(d120.shipSpeed > d0.shipSpeed, 'ship speed creeps up slightly');
  assert.ok(d0.shipSpeed > 0 && d0.astSpeed > 0 && d0.spawnInterval > 0, 'all positive at t=0');
});

test('makeAsteroid: fair spawn on far side, sane shape params', () => {
  const rng = seeded(42);
  for (let k = 0; k < 200; k++) {
    const orbit = k % 2;
    const a = L.makeAsteroid(orbit, 1.0, rng);
    assert.equal(a.orbit, orbit);
    const gap = L.angDiff(a.angle, 1.0);
    assert.ok(gap > Math.PI - 1.15, 'spawn must be far from ship, got gap=' + gap);
    assert.ok(a.r >= 11 && a.r <= 21, 'radius in range');
    assert.ok(a.verts >= 7 && a.verts <= 10, 'vertex count in range');
    assert.ok(a.dir === 1 || a.dir === -1);
    assert.ok(a.speedMul >= 0.75 && a.speedMul <= 1.35);
  }
});

test('makeAsteroid: deterministic with seeded rng', () => {
  const a1 = L.makeAsteroid(0, 0.5, seeded(7));
  const a2 = L.makeAsteroid(0, 0.5, seeded(7));
  assert.deepEqual(a1, a2);
});

test('lerpR: moves toward target, snaps, never overshoots', () => {
  assert.ok(approx(L.lerpR(100, 200, 0.016), 100 + 520 * 0.016));
  assert.equal(L.lerpR(199, 200, 0.016), 200, 'snaps when within one step');
  assert.equal(L.lerpR(200, 200, 0.016), 200);
  assert.ok(approx(L.lerpR(300, 200, 0.016), 300 - 520 * 0.016), 'moves down too');
  const v = L.lerpR(100, 200, 10);
  assert.equal(v, 200, 'huge dt must not overshoot');
});
