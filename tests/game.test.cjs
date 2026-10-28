'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function setup(slug, progress = {}) {
  let seed = 16571;
  const math = Object.create(Math); math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = { window: {}, Math: math };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'docs/game.js'), 'utf8'), sandbox);
  const events = [];
  const api = { progress, hud() {}, toast() {}, save() {}, end(...args) { events.push(args); } };
  const game = sandbox.window.createGame(api); game.reset();
  return { game, progress, events };
}
function tick(game, seconds) { for (let i = 0; i < Math.ceil(seconds * 10); i++) game.update(0.1); }
function click(game, x, y) { game.pointer('down', x, y); game.pointer('up', x, y); }
function clone(s) { return JSON.parse(JSON.stringify(s)); }
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get(target, key) { if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient; return target[key] || (() => {}); }, set(target, key, val) { target[key] = val; return true; } });
const test = require('node:test');
test('gare: route matching delivers train to correct dock', () => {
  const { game, events } = setup('gare-en-panique'); const color = game.snapshot().queue[0].color;
  while (game.snapshot().route !== color) game.key('ArrowRight', true);
  game.key('Enter', true); tick(game, 13); assert.equal(game.snapshot().delivered, 1); assert.equal(events.length, 0);
});
test('gare: wrong dock ends service exactly once', () => {
  const { game, events } = setup('gare-en-panique'); const color = game.snapshot().queue[0].color;
  while (game.snapshot().route === color) game.key('ArrowRight', true);
  game.key('Enter', true); tick(game, 16); assert.equal(events.length, 1); assert.equal(events[0][3], false); assert.match(events[0][1], /quai/);
});
test('gare: queue overflow is a clear loss', () => {
  const { game, events } = setup('gare-en-panique'); tick(game, 35); assert.equal(events.length, 1); assert.equal(events[0][3], false); assert.match(events[0][1], /file est pleine/);
});
test('gare: express can catch local when departures are too close', () => {
  const { game, events } = setup('gare-en-panique'); const s = game.snapshot();
  s.route = 2; s.queue[0].color = 2; s.queue[0].speed = 0.87; s.queue[1].color = 2; s.queue[1].speed = 1.24; game.restore(s);
  game.key('Enter', true); tick(game, 1.5); game.key('Enter', true); tick(game, 5);
  assert.equal(events.length, 1); assert.match(events[0][1], /Collision/);
});
test('gare: final delivery wins and next level persists', () => {
  const { game, progress, events } = setup('gare-en-panique'); const s = game.snapshot();
  s.route = 2; s.delivered = 7; s.scheduled = 8; s.queue = [s.queue[0]]; s.queue[0].color = 2; s.queue[0].speed = 0.87; game.restore(s);
  game.key('Enter', true); tick(game, 10); assert.equal(events.length, 1); assert.equal(events[0][3], true);
  game.next(); assert.equal(progress.level, 2); assert.equal(game.snapshot().target, 10);
});
test('gare: active train saves round trip and draw is pure', () => {
  const one = setup('gare-en-panique'); one.game.key('Enter', true); tick(one.game, 2); const save = one.game.snapshot();
  const two = setup('gare-en-panique', clone(one.progress)); assert.equal(two.game.restore(save), true); assert.deepEqual(clone(two.game.snapshot()), clone(save));
  const before = JSON.stringify(two.game.snapshot()); two.game.draw(context); two.game.draw(context); assert.equal(JSON.stringify(two.game.snapshot()), before);
  const bad = two.game.snapshot(); bad.trains[0].path[1] = bad.trains[0].path[0]; assert.equal(two.game.restore(bad), false);
});
