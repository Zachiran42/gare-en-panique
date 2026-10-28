/* Gare en panique — original game code, MIT. No network or external assets. */
(function () {
  'use strict';
  const X = 46, Y = 83, CELL = 47;
  const colors = ['#71dfd5', '#f8bd70', '#dd9acb'];
  const names = ['LAGON', 'SOLEIL', 'ROSE'];
  const rows = [1, 5, 3];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const point = (x, y) => ({ x: X + (x + 0.5) * CELL, y: Y + (y + 0.5) * CELL });
  function round(c, x, y, w, h, r, fill, stroke) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = 1; c.strokeStyle = stroke; c.stroke(); }
  }
  function text(c, str, x, y, size, color, align) {
    c.fillStyle = color || '#f5f1e9'; c.font = `600 ${size}px system-ui, sans-serif`;
    c.textAlign = align || 'left'; c.fillText(str, x, y);
  }
  function branch(route) {
    const row = rows[route], path = [];
    if (row !== 3) path.push([2, row === 1 ? 2 : 4], [2, row]);
    for (let x = 3; x <= 6; x++) path.push([x, row]);
    path.push([6.75, row]); return path;
  }
  window.createGame = function (api) {
    const p = api.progress;
    p.level = Number.isInteger(p.level) ? clamp(p.level, 1, 999) : 1;
    p.best = Number.isFinite(p.best) ? Math.max(0, p.best) : 0;
    let s, touch = null, pulse = 0;
    function hud() { api.hud('LIVRAISONS', s.delivered + '/' + s.target, 'NIVEAU', s.level, 'EN ATTENTE', s.queue.length + '/5'); }
    function newTrain() {
      return { id: s.nextId++, color: Math.floor(Math.random() * 3), speed: Math.random() < 0.3 ? 1.24 : 0.87 };
    }
    function reset() {
      s = { level: p.level, route: 2, target: 8 + Math.min(p.level - 1, 8) * 2, delivered: 0,
        queue: [], trains: [], scheduled: 0, nextId: 1, time: 0, spawn: 0, lastDispatch: -9, finished: false };
      for (let i = 0; i < 2; i++) { s.queue.push(newTrain()); s.scheduled++; }
      touch = null; pulse = 0; hud();
      api.toast('Tournez l’aiguillage vers le bon quai, puis touchez Départ.'); api.save();
    }
    function position(t) {
      const a = t.path[t.segment], b = t.path[Math.min(t.segment + 1, t.path.length - 1)];
      return { x: a[0] + (b[0] - a[0]) * t.fraction, y: a[1] + (b[1] - a[1]) * t.fraction,
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    function finish(won, reason) {
      if (s.finished) return; s.finished = true;
      const score = s.delivered * 100 + (won ? Math.max(0, 300 - Math.floor(s.time)) : 0);
      p.best = Math.max(p.best, score); api.save();
      api.end(won ? 'Service impeccable !' : 'Service interrompu', reason || 'Tous les trains ont trouvé leur quai. Prêt pour plus de trafic ?', score, won);
    }
    function rotate(direction) {
      if (s.finished) return;
      if (s.trains.some(t => { const pos = position(t); return Math.hypot(pos.x - 2, pos.y - 3) < 0.42; })) {
        api.toast('Un train occupe l’aiguillage. Attendez son passage.'); pulse = 0.3; return;
      }
      s.route = (s.route + (direction || 1) + 3) % 3;
      api.toast('Direction : quai ' + names[s.route] + '.'); api.save();
    }
    function dispatch() {
      if (s.finished || !s.queue.length) return;
      if (s.time - s.lastDispatch < 1.4) { api.toast('Laissez un peu d’espace entre les trains.'); return; }
      const train = s.queue.shift();
      train.path = [[-1, 3], [0, 3], [1, 3], [2, 3]]; train.segment = 0; train.fraction = 0; train.routed = false;
      s.trains.push(train); s.lastDispatch = s.time; hud(); api.save();
    }
    function update(dt) {
      if (!s || s.finished) return;
      dt = clamp(Number(dt) || 0, 0, 0.12); s.time += dt; if (s.scheduled < s.target) s.spawn += dt; pulse = Math.max(0, pulse - dt);
      const interval = Math.max(3.1, 5.4 - (s.level - 1) * 0.2);
      if (s.scheduled < s.target && s.spawn >= interval) {
        s.spawn -= interval; s.scheduled++;
        if (s.queue.length >= 5) { finish(false, 'La file est pleine. Faites partir les trains avant l’arrivée du suivant.'); return; }
        s.queue.push(newTrain()); hud(); api.save();
      }
      const arrived = [];
      for (const train of s.trains) {
        let distance = train.speed * dt;
        while (distance > 0) {
          const a = train.path[train.segment], b = train.path[train.segment + 1];
          if (!b) break;
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const left = (1 - train.fraction) * length;
          if (distance < left) { train.fraction += distance / length; distance = 0; }
          else {
            distance -= left; train.segment++; train.fraction = 0;
            if (train.segment === train.path.length - 1) {
              if (!train.routed) { train.route = s.route; train.routed = true; train.path.push(...branch(s.route)); }
              else {
                if (train.route !== train.color) { finish(false, 'Un train ' + names[train.color] + ' est arrivé au quai ' + names[train.route] + '. Réglez l’aiguillage avant son passage.'); return; }
                arrived.push(train.id); s.delivered++; hud(); break;
              }
            }
          }
        }
      }
      if (arrived.length) { s.trains = s.trains.filter(t => !arrived.includes(t.id)); api.save(); }
      for (let i = 0; i < s.trains.length; i++) for (let j = i + 1; j < s.trains.length; j++) {
        const a = position(s.trains[i]), b = position(s.trains[j]);
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.53) { finish(false, 'Collision ! Les express rattrapent les trains lents. Espacez leurs départs.'); return; }
      }
      if (s.delivered >= s.target) finish(true);
    }
    function rail(c, path, color, width) {
      c.beginPath(); path.forEach((v, i) => { const pos = point(v[0], v[1]); if (!i) c.moveTo(pos.x, pos.y); else c.lineTo(pos.x, pos.y); });
      c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
    }
    function trainShape(c, x, y, angle, color, express, scale) {
      c.save(); c.translate(x, y); c.rotate(angle); c.scale(scale || 1, scale || 1);
      round(c, -16, -11, 32, 22, 6, color, '#ffffff55');
      round(c, 5, -7, 7, 14, 3, '#20313b');
      c.fillStyle = '#2a3940'; c.fillRect(-9, -7, 8, 14);
      c.fillStyle = '#fff0b9'; c.fillRect(13, -6, 3, 4); c.fillRect(13, 2, 3, 4);
      if (express) { c.strokeStyle = '#fff7df'; c.lineWidth = 2; c.beginPath(); c.moveTo(-7, -4); c.lineTo(-3, 0); c.lineTo(-7, 4); c.stroke(); }
      c.restore();
    }
    function draw(c) {
      if (!s) return;
      c.fillStyle = '#101e2a'; c.fillRect(0, 0, 420, 600);
      const bg = c.createLinearGradient(0, 0, 420, 600); bg.addColorStop(0, '#213747'); bg.addColorStop(1, '#101c29');
      c.fillStyle = bg; c.fillRect(0, 0, 420, 600);
      text(c, 'POSTE D’AIGUILLAGE ' + String(s.level).padStart(2, '0'), 26, 27, 12, '#7eddd2');
      text(c, 'Un train. Le bon quai.', 26, 52, 22);
      text(c, 'Tournez le cercle lumineux pour choisir la voie.', 26, 75, 12, '#a7bec8');
      round(c, 15, 95, 390, 328, 17, '#142b36', '#345260');
      for (let i = 0; i < 28; i++) {
        const x = 28 + (i * 83) % 365, y = 109 + (i * 47) % 295;
        c.fillStyle = '#244350'; c.beginPath(); c.arc(x, y, i % 3 === 0 ? 3 : 1.5, 0, Math.PI * 2); c.fill();
      }
      const initial = [[-1, 3], [0, 3], [1, 3], [2, 3]];
      const lines = [initial, ...[0, 1, 2].map(route => [[2, 3], ...branch(route)])];
      for (const line of lines) { rail(c, line, '#0a1721', 15); rail(c, line, '#6c858d', 9); rail(c, line, '#1b3039', 4); }
      for (const row of [1, 3, 5]) for (let col = 3; col <= 6; col++) {
        const pnt = point(col, row); c.fillStyle = '#a0a798'; c.fillRect(pnt.x - 2, pnt.y - 9, 4, 18);
      }
      rail(c, [[2, 3], ...branch(s.route)], colors[s.route] + '66', 4);
      const sw = point(2, 3);
      c.fillStyle = pulse ? '#ff8e7766' : colors[s.route] + '33'; c.beginPath(); c.arc(sw.x, sw.y, 31, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#193b48'; c.strokeStyle = colors[s.route]; c.lineWidth = 2; c.beginPath(); c.arc(sw.x, sw.y, 22, 0, Math.PI * 2); c.fill(); c.stroke();
      const out = s.route === 0 ? [2, 2.65] : s.route === 1 ? [2, 3.35] : [2.35, 3];
      rail(c, [[1.66, 3], [2, 3], out], colors[s.route], 5);
      text(c, 'TOUCHER', sw.x, sw.y + 48, 9, '#c4d4d6', 'center');
      for (let col = 0; col < 3; col++) {
        const pnt = point(6.75, rows[col]);
        round(c, pnt.x - 15, pnt.y - 26, 29, 52, 6, colors[col] + '33', colors[col]);
        text(c, String(col + 1), pnt.x, pnt.y + 6, 18, colors[col], 'center');
        text(c, names[col], pnt.x - 3, pnt.y - 33, 9, colors[col], 'right');
      }
      for (const train of s.trains) {
        const pos = position(train), pnt = point(pos.x, pos.y);
        trainShape(c, pnt.x, pnt.y, pos.angle, colors[train.color], train.speed > 1);
      }
      const interval = Math.max(3.1, 5.4 - (s.level - 1) * 0.2);
      text(c, s.scheduled < s.target ? 'PROCHAINE ARRIVÉE  ' + Math.ceil(interval - s.spawn) + ' s' : 'DERNIERS TRAINS EN SERVICE', 27, 448, 11, '#a7bec8');
      text(c, 'Voie : ' + names[s.route], 392, 448, 12, colors[s.route], 'right');
      for (let i = 0; i < 5; i++) {
        const x = 26 + i * 75, train = s.queue[i];
        round(c, x, 461, 67, 63, 10, i === 0 ? '#294653' : '#1c323f', i === 0 ? '#6d8d94' : '#314d5b');
        if (train) {
          trainShape(c, x + 34, 484, 0, colors[train.color], train.speed > 1, 0.9);
          text(c, names[train.color], x + 34, 507, 10, colors[train.color], 'center');
          text(c, train.speed > 1 ? 'EXPRESS' : 'LOCAL', x + 34, 519, 8, '#a7bec8', 'center');
        } else text(c, '·', x + 34, 499, 23, '#4a6572', 'center');
      }
      const ready = s.queue.length > 0 && s.time - s.lastDispatch >= 1.4;
      round(c, 26, 540, 236, 46, 12, ready ? '#86e2cf' : '#34545e');
      text(c, 'DÉPART DU PREMIER TRAIN', 144, 569, 13, ready ? '#15313a' : '#a8c5c8', 'center');
      round(c, 275, 540, 119, 46, 12, '#294653', '#52717e');
      text(c, 'TOURNER ↻', 334, 569, 13, '#f2eee5', 'center');
    }
    function pointer(type, x, y) {
      if (type === 'down') { touch = { x, y }; return; }
      if (type === 'cancel') { touch = null; return; }
      if (type !== 'up' || !touch || !s || s.finished) return;
      if (Math.hypot(x - touch.x, y - touch.y) > 24) { touch = null; return; }
      touch = null;
      const sw = point(2, 3);
      if (Math.hypot(x - sw.x, y - sw.y) < 42 || x >= 275 && x <= 394 && y >= 540 && y <= 590) rotate(1);
      else if (x >= 26 && x <= 262 && y >= 540 && y <= 590) dispatch();
    }
    function key(k, down) {
      if (!down || !s || s.finished) return;
      const key = String(k).toLowerCase();
      if (key === ' ' || key === 'space' || key === 'enter') dispatch();
      else if (key === 'arrowleft' || key === 'a' || key === 'q') rotate(-1);
      else if (key === 'arrowright' || key === 'd' || key === 'arrowup' || key === 'arrowdown') rotate(1);
    }
    function snapshot() { return JSON.parse(JSON.stringify(s)); }
    function validTrain(t, active) {
      const base = t && Number.isInteger(t.id) && t.id > 0 && Number.isInteger(t.color) && t.color >= 0 && t.color < 3 && (t.speed === 0.87 || t.speed === 1.24);
      if (!base || !active) return base;
      return Array.isArray(t.path) && t.path.length >= 4 && t.path.length <= 12 &&
        t.path.every(v => Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && v[0] >= -1 && v[0] <= 7 && Number.isFinite(v[1]) && v[1] >= 0 && v[1] <= 6) &&
        Number.isInteger(t.segment) && t.segment >= 0 && t.segment < t.path.length - 1 && Number.isFinite(t.fraction) && t.fraction >= 0 && t.fraction < 1 &&
        typeof t.routed === 'boolean' && (!t.routed || Number.isInteger(t.route) && t.route >= 0 && t.route < 3) &&
        t.path.every((v, i) => !i || Math.hypot(v[0] - t.path[i - 1][0], v[1] - t.path[i - 1][1]) > 0);
    }
    function restore(data) {
      const valid = data && !data.finished && Number.isInteger(data.level) && data.level >= 1 && data.level <= 999 &&
        Number.isInteger(data.route) && data.route >= 0 && data.route < 3 && Number.isInteger(data.target) && data.target >= 8 && data.target <= 24 &&
        Number.isInteger(data.delivered) && data.delivered >= 0 && data.delivered < data.target &&
        Number.isInteger(data.scheduled) && data.scheduled >= 2 && data.scheduled <= data.target && Number.isInteger(data.nextId) && data.nextId > 0 &&
        Number.isFinite(data.time) && data.time >= 0 && Number.isFinite(data.spawn) && data.spawn >= 0 && data.spawn < 6 &&
        Number.isFinite(data.lastDispatch) && data.lastDispatch <= data.time &&
        Array.isArray(data.queue) && data.queue.length <= 5 && data.queue.every(t => validTrain(t, false)) &&
        Array.isArray(data.trains) && data.trains.length <= 24 && data.trains.every(t => validTrain(t, true)) &&
        data.queue.length + data.trains.length + data.delivered === data.scheduled;
      if (!valid) { reset(); return false; }
      s = JSON.parse(JSON.stringify(data)); touch = null; pulse = 0; hud(); return true;
    }
    function next() { p.level = Math.min(999, Math.max(p.level, s.level + 1)); reset(); }
    return { reset, update, draw, pointer, key, snapshot, restore, next };
  };
}());