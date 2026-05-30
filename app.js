/* ════════════════════════════════════════════════════════════
   Victory Velocity — Weekly Report Builder
   Zero-dependency app logic: state, persistence, multi-client /
   multi-week history, charts, voice dictation and rendering.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────── */
  var STORE_KEY = 'vv_reports_v2';
  var SCHEMA_VERSION = 2;
  var ENGINES = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Google AI Overviews', 'Bing Copilot', 'Grok'];
  var STATUSES = ['Not yet', 'Partial', 'Yes'];
  var METRICS = [
    { key: 'imp', label: 'Impressions',   dp: 0, suffix: '',  better: 'higher' },
    { key: 'clk', label: 'Clicks',        dp: 0, suffix: '',  better: 'higher' },
    { key: 'ctr', label: 'Avg. CTR',      dp: 2, suffix: '%', better: 'higher' },
    { key: 'pos', label: 'Avg. Position', dp: 1, suffix: '',  better: 'lower'  }
  ];
  var LIST_CONTAINERS = {
    spots: '#spotRows', work: '#workRows', priorities: '#priorityRows',
    highlights: '#highlightRows', blockers: '#blockerRows'
  };

  var CHECK_SVG = '<svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">' +
    '<polyline points="1,4.5 3.5,7 8,1.5" style="stroke:var(--paper)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var HANDLE = '<span class="drag-handle" draggable="true" title="Drag to reorder" aria-label="Reorder">⠿</span>';
  var ROW_ACTIONS = '<span class="row-actions">' +
    '<button class="row-btn dup" type="button" data-row-action="dup" title="Duplicate" aria-label="Duplicate">⧉</button>' +
    '<button class="row-btn del" type="button" data-row-action="del" title="Delete" aria-label="Delete">×</button></span>';

  /* ── Tiny helpers ──────────────────────────────────────── */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var _idc = 0;
  function uid() { _idc++; return 'id' + Date.now().toString(36) + '-' + _idc.toString(36) + Math.random().toString(36).slice(2, 5); }
  function str(v) { return v == null ? '' : String(v); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function h(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function nl2br(s) { return String(s).replace(/\n/g, '<br>'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function optionList(arr, sel) {
    return arr.map(function (o) { return '<option' + (o === sel ? ' selected' : '') + '>' + h(o) + '</option>'; }).join('');
  }
  function numOrNull(v) { if (v === '' || v == null) return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmtNum(val, dp) {
    var n = typeof val === 'number' ? val : parseFloat(val);
    if (val === '' || val == null || isNaN(n)) return '—';
    if (dp == null) dp = n % 1 === 0 ? 0 : 2;
    return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  /* ── Dates ─────────────────────────────────────────────── */
  function isoDate(d) {
    var x = new Date(d);
    return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
  }
  function mondayOf(d) {
    var x = new Date(d);
    var day = (x.getDay() + 6) % 7; // 0 = Monday
    x.setDate(x.getDate() - day);
    return isoDate(x);
  }
  function addDaysIso(iso, n) {
    var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d);
  }
  function weekRange(iso) {
    if (!iso) return { label: 'Week of —', short: 'Untitled week' };
    var start = new Date(iso + 'T00:00:00');
    if (isNaN(start.getTime())) return { label: 'Week of —', short: 'Untitled week' };
    var end = new Date(start); end.setDate(end.getDate() + 6);
    var sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    var sameYear = start.getFullYear() === end.getFullYear();
    var sStr = start.toLocaleDateString('en-US', sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
    var eStr = end.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'long', day: 'numeric' });
    var label = sStr + ' – ' + eStr + ', ' + end.getFullYear();
    var short = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' +
      end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + end.getFullYear();
    return { label: label, short: short };
  }

  /* ── Data model ────────────────────────────────────────── */
  function defaultWeek(weekStart) {
    var m = function () { return { w: '', b: '', bAuto: false }; };
    return {
      id: uid(), weekStart: weekStart || '', execSummary: '', notes: '',
      metrics: { imp: m(), clk: m(), ctr: m(), pos: m(), ctrAuto: false },
      spots: [], highlights: [], work: [],
      priorities: [{ id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }],
      blockers: []
    };
  }

  function demoState() {
    var wk = defaultWeek(mondayOf(new Date()));
    wk.spots = [
      { q: 'wedding flower donation Vancouver', engine: 'ChatGPT', status: 'Not yet', notes: '' },
      { q: 'wedding flower donation Vancouver', engine: 'Perplexity', status: 'Not yet', notes: '' },
      { q: 'what to do with wedding flowers after the wedding', engine: 'ChatGPT', status: 'Not yet', notes: '' },
      { q: 'flower donation nonprofit Vancouver', engine: 'Perplexity', status: 'Not yet', notes: '' },
      { q: 'how to donate event flowers', engine: 'Claude', status: 'Not yet', notes: '' }
    ].map(function (s) { return { id: uid(), q: s.q, engine: s.engine, status: s.status, notes: s.notes }; });
    wk.work = [
      'Added NonprofitOrganization + LocalBusiness schema',
      'Added FAQ schema (5 questions)',
      'Added visible service area section to homepage',
      'Published blog post #1',
      'Published blog post #2',
      'Reddit post in r/vancouver or r/weddingplanning'
    ].map(function (t) { return { id: uid(), text: t, done: false }; });
    wk.execSummary = '';
    var client = { id: uid(), name: 'Bloom & Give', domain: 'bloomandgive.ca', preparedBy: 'Victory Velocity', logo: null, weeks: [wk] };
    return {
      version: SCHEMA_VERSION,
      settings: { reportTheme: 'professional', sections: { highlights: true, blockers: true } },
      clients: [client], activeClientId: client.id, activeWeekId: wk.id
    };
  }

  /* ── Normalisation / migration ─────────────────────────── */
  function normSpots(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (s) {
      s = s || {};
      return {
        id: s.id || uid(), q: str(s.q),
        engine: ENGINES.indexOf(s.engine) >= 0 ? s.engine : (s.engine || 'ChatGPT'),
        status: STATUSES.indexOf(s.status) >= 0 ? s.status : 'Not yet',
        notes: str(s.notes)
      };
    });
  }
  function normWork(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (t) {
      return typeof t === 'string' ? { id: uid(), text: t, done: false }
        : { id: (t && t.id) || uid(), text: str(t && t.text), done: !!(t && t.done) };
    });
  }
  function normText(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (t) {
      return typeof t === 'string' ? { id: uid(), text: t } : { id: (t && t.id) || uid(), text: str(t && t.text) };
    });
  }
  function normalizeWeek(w) {
    w = w || {};
    var M = w.metrics || {};
    var mk = function (m) { return { w: str(m && m.w), b: str(m && m.b), bAuto: !!(m && m.bAuto) }; };
    return {
      id: w.id || uid(), weekStart: str(w.weekStart), execSummary: str(w.execSummary), notes: str(w.notes),
      metrics: { imp: mk(M.imp), clk: mk(M.clk), ctr: mk(M.ctr), pos: mk(M.pos), ctrAuto: !!M.ctrAuto },
      spots: normSpots(w.spots), highlights: normText(w.highlights), work: normWork(w.work),
      priorities: normText(w.priorities), blockers: normText(w.blockers)
    };
  }
  function normalizeClient(c) {
    if (!c || typeof c !== 'object') return null;
    var weeks = Array.isArray(c.weeks) ? c.weeks.map(normalizeWeek) : [];
    if (!weeks.length) weeks = [defaultWeek(mondayOf(new Date()))];
    return {
      id: c.id || uid(), name: str(c.name) || 'Untitled Client', domain: str(c.domain),
      preparedBy: str(c.preparedBy) || 'Victory Velocity', logo: c.logo || null, weeks: weeks
    };
  }
  function v1ToClient(o) {
    var wk = defaultWeek(o.week ? mondayOf(new Date(o.week + 'T00:00:00')) : mondayOf(new Date()));
    var setM = function (k, src) { if (src) { wk.metrics[k].w = str(src.w); wk.metrics[k].b = str(src.b); } };
    setM('imp', o.imp); setM('clk', o.clk); setM('ctr', o.ctr); setM('pos', o.pos);
    wk.spots = normSpots(o.spots); wk.work = normWork(o.work);
    if (Array.isArray(o.priorities)) wk.priorities = normText(o.priorities);
    wk.notes = str(o.notes);
    return { id: uid(), name: str(o.client) || 'Bloom & Give', domain: '', preparedBy: str(o.preparedBy) || 'Victory Velocity', logo: null, weeks: [wk] };
  }
  function normalize(data) {
    if (!data || typeof data !== 'object') return demoState();
    if (!Array.isArray(data.clients) && (data.spots || data.work || data.priorities || data.imp)) {
      data = { clients: [v1ToClient(data)], settings: data.settings };
    }
    var s = { version: SCHEMA_VERSION, settings: {}, clients: [], activeClientId: null, activeWeekId: null };
    s.settings.reportTheme = (data.settings && data.settings.reportTheme) === 'editorial' ? 'editorial' : 'professional';
    s.settings.sections = Object.assign({ highlights: true, blockers: true }, (data.settings && data.settings.sections) || {});
    s.clients = (Array.isArray(data.clients) ? data.clients : []).map(normalizeClient).filter(Boolean);
    if (!s.clients.length) return demoState();
    s.activeClientId = (s.clients.filter(function (c) { return c.id === data.activeClientId; })[0] || s.clients[0]).id;
    var cl = s.clients.filter(function (c) { return c.id === s.activeClientId; })[0];
    s.activeWeekId = (cl.weeks.filter(function (w) { return w.id === data.activeWeekId; })[0] || latestWeek(cl)).id;
    return s;
  }

  /* ── Persistence ───────────────────────────────────────── */
  var state = null;
  var saveTimer = null;
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (!raw) return demoState();
    try { return normalize(JSON.parse(raw)); } catch (e) { return demoState(); }
  }
  function scheduleSave() {
    setSaveState('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 350);
  }
  function doSave() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    setSaveState('saved');
  }
  function setSaveState(s) {
    var el = $('#saveState'); if (!el) return;
    if (s === 'saving') { el.textContent = 'Saving…'; el.classList.add('saving'); }
    else { el.textContent = 'Saved'; el.classList.remove('saving'); }
  }

  /* ── Active record accessors ───────────────────────────── */
  function currentClient() {
    return state.clients.filter(function (c) { return c.id === state.activeClientId; })[0] || state.clients[0];
  }
  function currentWeek() {
    var cl = currentClient();
    return cl.weeks.filter(function (w) { return w.id === state.activeWeekId; })[0] || cl.weeks[0];
  }
  function latestWeek(cl) {
    var ws = cl.weeks.slice().sort(function (a, b) { return (b.weekStart || '').localeCompare(a.weekStart || ''); });
    return ws[0] || cl.weeks[0];
  }
  function ensureActive() {
    if (!state.clients.length) { state = demoState(); return; }
    if (!state.clients.filter(function (c) { return c.id === state.activeClientId; })[0]) state.activeClientId = state.clients[0].id;
    var cl = currentClient();
    if (!cl.weeks.length) cl.weeks.push(defaultWeek(mondayOf(new Date())));
    if (!cl.weeks.filter(function (w) { return w.id === state.activeWeekId; })[0]) state.activeWeekId = latestWeek(cl).id;
  }

  /* ── Metric math ───────────────────────────────────────── */
  function deriveCTR(wk) {
    var c = numOrNull(wk.metrics.clk.w), i = numOrNull(wk.metrics.imp.w);
    if (c == null || i == null || i === 0) return '';
    return (c / i * 100).toFixed(2);
  }
  function metricNumber(wk, key) {
    if (key === 'ctr' && wk.metrics.ctrAuto) { var d = deriveCTR(wk); return d === '' ? null : parseFloat(d); }
    return numOrNull(wk.metrics[key].w);
  }
  function baselineNumber(wk, key) { return numOrNull(wk.metrics[key].b); }
  function historyValues(client, key, upto) {
    var ws = client.weeks.slice().filter(function (w) { return w.weekStart; })
      .sort(function (a, b) { return a.weekStart.localeCompare(b.weekStart); });
    if (upto) ws = ws.filter(function (w) { return w.weekStart <= upto; });
    return ws.map(function (w) { return metricNumber(w, key); }).slice(-8);
  }
  function metricView(def, wk, client) {
    var wNum = metricNumber(wk, def.key), bNum = baselineNumber(wk, def.key);
    var value = wNum == null ? '—' : (fmtNum(wNum, def.dp) + (def.suffix || ''));
    var dir = 'none', primary = '', secondary = '';
    var eps = 1e-9;
    var sgn = function (v) { return v > eps ? '+' : v < -eps ? '−' : '±'; };
    if (wNum != null && bNum != null) {
      var abs = wNum - bNum;
      var good = def.better === 'lower' ? abs < -eps : abs > eps;
      var bad = def.better === 'lower' ? abs > eps : abs < -eps;
      dir = good ? 'up' : bad ? 'down' : 'flat';
      var pct = bNum !== 0 ? (abs / Math.abs(bNum)) * 100 : null;
      if (def.key === 'ctr') {
        primary = sgn(abs) + Math.abs(abs).toFixed(2) + ' pp';
        secondary = pct == null ? 'vs baseline' : sgn(pct) + fmtNum(Math.abs(pct), 1) + '% vs baseline';
      } else if (def.key === 'pos') {
        primary = Math.abs(abs).toFixed(1) + ' pos';
        secondary = (good ? 'improved' : bad ? 'declined' : 'no change') + ' vs baseline';
      } else {
        primary = pct == null ? sgn(abs) + fmtNum(Math.abs(abs), 0) : sgn(pct) + fmtNum(Math.abs(pct), 1) + '%';
        secondary = sgn(abs) + fmtNum(Math.abs(abs), 0) + ' vs baseline';
      }
    } else if (wNum != null) {
      primary = 'no baseline';
    } else {
      primary = '—';
    }
    return {
      name: def.label, value: value, dir: dir, primary: primary, secondary: secondary,
      spark: sparklineSVG(historyValues(client, def.key, wk.weekStart), { dir: dir, better: def.better })
    };
  }

  /* ── GEO coverage ──────────────────────────────────────── */
  function coverage(wk) {
    var total = wk.spots.length;
    var yes = wk.spots.filter(function (s) { return s.status === 'Yes'; }).length;
    var part = wk.spots.filter(function (s) { return s.status === 'Partial'; }).length;
    return { total: total, yes: yes, part: part, no: total - yes - part };
  }
  function previousWeek(cl, wk) {
    if (!wk.weekStart) return null;
    var ws = cl.weeks.filter(function (w) { return w.weekStart && w.weekStart < wk.weekStart; })
      .sort(function (a, b) { return a.weekStart.localeCompare(b.weekStart); });
    return ws.length ? ws[ws.length - 1] : null;
  }

  /* ── Charts (inline SVG, no dependencies) ──────────────── */
  function sparklineSVG(values, opts) {
    opts = opts || {};
    var pts = values.filter(function (v) { return v != null && !isNaN(v); });
    var W = 160, H = 30, pad = 3;
    if (pts.length < 2) {
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
        '<text x="0" y="' + (H - 9) + '" class="spark-empty">+ track another week for trend</text></svg>';
    }
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), range = (max - min) || 1;
    var stepX = (W - pad * 2) / (pts.length - 1);
    var coords = pts.map(function (v, i) {
      var t = (v - min) / range;
      if (opts.better === 'lower') t = 1 - t; // lower is better → draw upward
      return [pad + i * stepX, pad + (1 - t) * (H - pad * 2)];
    });
    var line = coords.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ');
    var last = coords[coords.length - 1];
    var area = 'M' + coords[0][0].toFixed(1) + ' ' + (H - pad).toFixed(1) + ' ' +
      coords.map(function (c) { return 'L' + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ') +
      ' L' + last[0].toFixed(1) + ' ' + (H - pad).toFixed(1) + ' Z';
    var cls = opts.dir === 'up' ? 'up' : opts.dir === 'down' ? 'down' : '';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<path class="spark-area ' + cls + '" d="' + area + '"/>' +
      '<path class="spark-line ' + cls + '" vector-effect="non-scaling-stroke" d="' + line + '"/>' +
      '<circle class="spark-dot" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.2" vector-effect="non-scaling-stroke"/></svg>';
  }

  /* ── Binding read/write ────────────────────────────────── */
  function readBind(path) {
    var wk = currentWeek(), cl = currentClient();
    if (path.indexOf('@client.') === 0) return cl[path.slice(8)];
    if (path === 'metrics.ctrAuto') return wk.metrics.ctrAuto;
    if (path.indexOf('metrics.') === 0) { var p = path.slice(8).split('.'); return wk.metrics[p[0]][p[1]]; }
    return wk[path];
  }
  function applyBind(path, value) {
    var wk = currentWeek(), cl = currentClient();
    if (path.indexOf('@client.') === 0) { cl[path.slice(8)] = value; return; }
    if (path === 'metrics.ctrAuto') { wk.metrics.ctrAuto = !!value; return; }
    if (path.indexOf('metrics.') === 0) {
      var p = path.slice(8).split('.');
      wk.metrics[p[0]][p[1]] = value;
      if (p[1] === 'b') wk.metrics[p[0]].bAuto = false;
      return;
    }
    wk[path] = value;
  }
  function updateListField(name, id, field, value) {
    var it = currentWeek()[name].filter(function (x) { return x.id === id; })[0];
    if (it) it[field] = value;
  }

  /* ── List mutations ────────────────────────────────────── */
  function addItem(name) {
    var wk = currentWeek();
    if (name === 'spots') wk.spots.push({ id: uid(), q: '', engine: 'ChatGPT', status: 'Not yet', notes: '' });
    else if (name === 'work') wk.work.push({ id: uid(), text: '', done: false });
    else wk[name].push({ id: uid(), text: '' });
    scheduleSave(); renderList(name); renderPreview(); focusLastRow(name);
  }
  function deleteItem(name, id) {
    var wk = currentWeek();
    wk[name] = wk[name].filter(function (x) { return x.id !== id; });
    scheduleSave(); renderList(name); renderPreview();
  }
  function dupItem(name, id) {
    var wk = currentWeek(), i = -1;
    wk[name].forEach(function (x, idx) { if (x.id === id) i = idx; });
    if (i < 0) return;
    var copy = Object.assign({}, wk[name][i], { id: uid() });
    wk[name].splice(i + 1, 0, copy);
    scheduleSave(); renderList(name); renderPreview();
  }
  function moveItem(name, id, beforeId) {
    var arr = currentWeek()[name], from = -1;
    arr.forEach(function (x, idx) { if (x.id === id) from = idx; });
    if (from < 0) return;
    var it = arr.splice(from, 1)[0];
    // Find the drop target's index in the now-shortened array; default to end.
    var to = arr.length;
    for (var k = 0; k < arr.length; k++) { if (arr[k].id === beforeId) { to = k; break; } }
    arr.splice(to, 0, it);
    scheduleSave(); renderList(name); renderPreview();
  }

  /* ── Week / client mutations ───────────────────────────── */
  function newClientObj(name) {
    return { id: uid(), name: name, domain: '', preparedBy: 'Victory Velocity', logo: null, weeks: [defaultWeek(mondayOf(new Date()))] };
  }
  function setClient(id) {
    state.activeClientId = id;
    state.activeWeekId = latestWeek(currentClient()).id;
    scheduleSave(); renderAll();
  }
  function setWeek(id) { state.activeWeekId = id; scheduleSave(); renderAll(); }
  function newWeek() {
    var cl = currentClient(), latest = latestWeek(cl);
    var startIso = latest && latest.weekStart ? addDaysIso(latest.weekStart, 7) : mondayOf(new Date());
    var w = defaultWeek(startIso);
    if (latest) {
      var carried = latest.priorities.filter(function (p) { return (p.text || '').trim(); })
        .map(function (p) { return { id: uid(), text: p.text }; });
      w.priorities = carried.length ? carried : [{ id: uid(), text: '' }];
      w.spots = latest.spots.map(function (s) { return { id: uid(), q: s.q, engine: s.engine, status: 'Not yet', notes: '' }; });
      ['imp', 'clk', 'ctr', 'pos'].forEach(function (k) {
        var val = metricNumber(latest, k);
        w.metrics[k].b = val == null ? '' : String(val);
        w.metrics[k].bAuto = val != null;
      });
      w.metrics.ctrAuto = latest.metrics.ctrAuto;
    }
    cl.weeks.push(w); state.activeWeekId = w.id; scheduleSave(); renderAll();
  }
  function dupWeek() {
    var cl = currentClient(), cur = currentWeek();
    var copy = clone(cur); copy.id = uid();
    ['spots', 'work', 'priorities', 'highlights', 'blockers'].forEach(function (n) {
      copy[n].forEach(function (it) { it.id = uid(); });
    });
    copy.weekStart = cur.weekStart ? addDaysIso(cur.weekStart, 7) : '';
    cl.weeks.push(copy); state.activeWeekId = copy.id; scheduleSave(); renderAll();
  }
  function delWeek() {
    var cl = currentClient();
    if (cl.weeks.length <= 1) {
      if (!confirm('Clear this week? It is the only one for this client.')) return;
      var w = defaultWeek(mondayOf(new Date())); cl.weeks = [w]; state.activeWeekId = w.id;
    } else {
      if (!confirm('Delete this week permanently?')) return;
      cl.weeks = cl.weeks.filter(function (w) { return w.id !== state.activeWeekId; });
      state.activeWeekId = latestWeek(cl).id;
    }
    scheduleSave(); renderAll();
  }

  /* ── Render: form ──────────────────────────────────────── */
  function fillForm() {
    var wk = currentWeek();
    $$('[data-bind]').forEach(function (el) {
      var val = readBind(el.getAttribute('data-bind'));
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val == null ? '' : val;
    });
    var ctrW = $('#f-ctr-w');
    if (wk.metrics.ctrAuto) { ctrW.value = deriveCTR(wk); ctrW.disabled = true; } else { ctrW.disabled = false; }
    ['imp', 'clk', 'ctr', 'pos'].forEach(function (k) {
      var b = $('[data-auto="' + k + '"]'); if (b) b.hidden = !wk.metrics[k].bAuto;
    });
    renderLogoPreview();
  }
  function renderLogoPreview() {
    var cl = currentClient(), p = $('#logoPreview');
    if (cl.logo) { p.hidden = false; p.innerHTML = '<img src="' + cl.logo + '" alt="logo">'; }
    else { p.hidden = true; p.innerHTML = ''; }
  }
  function spotRowForm(s) {
    return '<tr data-list="spots" data-id="' + s.id + '"><td class="drag">' + HANDLE + '</td>' +
      '<td><input type="text" data-field="q" value="' + h(s.q) + '" placeholder="Search query…"></td>' +
      '<td><select data-field="engine">' + optionList(ENGINES, s.engine) + '</select></td>' +
      '<td><select data-field="status">' + optionList(STATUSES, s.status) + '</select></td>' +
      '<td><input type="text" data-field="notes" value="' + h(s.notes) + '" placeholder="Notes…"></td>' +
      '<td>' + ROW_ACTIONS + '</td></tr>';
  }
  function workRowForm(it) {
    return '<div class="lrow" data-list="work" data-id="' + it.id + '">' + HANDLE +
      '<input type="checkbox" class="check-input" data-field="done"' + (it.done ? ' checked' : '') + ' aria-label="Mark done">' +
      '<input type="text" data-field="text" value="' + h(it.text) + '" placeholder="Task description…">' + ROW_ACTIONS + '</div>';
  }
  function priorityRowForm(it, i) {
    return '<div class="lrow" data-list="priorities" data-id="' + it.id + '">' + HANDLE +
      '<span class="priority-num">' + pad2(i + 1) + '</span>' +
      '<input type="text" data-field="text" value="' + h(it.text) + '" placeholder="Priority…">' + ROW_ACTIONS + '</div>';
  }
  function textRowForm(name, it) {
    var ph = name === 'highlights' ? 'Win or highlight…' : 'Blocker or risk…';
    return '<div class="lrow" data-list="' + name + '" data-id="' + it.id + '">' + HANDLE +
      '<input type="text" data-field="text" value="' + h(it.text) + '" placeholder="' + ph + '">' + ROW_ACTIONS + '</div>';
  }
  function renderList(name) {
    var c = $(LIST_CONTAINERS[name]); if (!c) return;
    var arr = currentWeek()[name];
    if (name === 'spots') c.innerHTML = arr.map(spotRowForm).join('');
    else if (name === 'work') c.innerHTML = arr.map(workRowForm).join('');
    else if (name === 'priorities') c.innerHTML = arr.map(priorityRowForm).join('');
    else c.innerHTML = arr.map(function (it) { return textRowForm(name, it); }).join('');
  }
  function focusLastRow(name) {
    var c = $(LIST_CONTAINERS[name]); if (!c) return;
    var rows = $$('[data-id]', c), last = rows[rows.length - 1];
    if (last) { var inp = last.querySelector('input[data-field="text"],input[data-field="q"]'); if (inp) inp.focus(); }
  }

  /* ── Render: workspace switchers ───────────────────────── */
  function renderWorkspace() {
    var cl = currentClient();
    $('#ws-client').innerHTML = state.clients.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === state.activeClientId ? ' selected' : '') + '>' + h(c.name) + '</option>';
    }).join('');
    var weeks = cl.weeks.slice().sort(function (a, b) { return (b.weekStart || '').localeCompare(a.weekStart || ''); });
    $('#ws-week').innerHTML = weeks.map(function (w) {
      return '<option value="' + w.id + '"' + (w.id === state.activeWeekId ? ' selected' : '') + '>' + h(weekRange(w.weekStart).short) + '</option>';
    }).join('');
    var wk = currentWeek();
    $('#ws-range').textContent = weekRange(wk.weekStart).label + '  ·  ' + cl.weeks.length + ' week' + (cl.weeks.length !== 1 ? 's' : '') + ' tracked';
  }

  /* ── Render: report preview ────────────────────────────── */
  function section(title, inner) { return '<section class="rpt-section"><h2>' + title + '</h2>' + inner + '</section>'; }
  function dash() { return '<span style="color:var(--faint)">—</span>'; }
  function bulletLi(text) { return '<li class="rpt-li"><span class="rpt-bullet">—</span><span>' + h(text) + '</span></li>'; }
  function emptyLi(msg) { return '<li class="rpt-empty">' + h(msg) + '</li>'; }
  function workReport(it) {
    return '<li class="rpt-li' + (it.done ? ' done' : '') + '"><span class="rpt-check' + (it.done ? ' done' : '') + '">' +
      (it.done ? CHECK_SVG : '') + '</span><span>' + (h(it.text) || dash()) + '</span></li>';
  }
  function priReport(p, i) { return '<li class="rpt-li"><span class="rpt-num">' + pad2(i + 1) + '</span><span>' + h(p.text) + '</span></li>'; }
  function spotRowReport(s) {
    var cls = s.status === 'Yes' ? 'badge-yes' : s.status === 'Partial' ? 'badge-part' : 'badge-no';
    return '<tr><td class="spot-q">' + (h(s.q) || dash()) + '</td><td class="spot-engine">' + h(s.engine) + '</td>' +
      '<td><span class="status-badge ' + cls + '">' + h(s.status) + '</span></td><td class="spot-notes">' + h(s.notes) + '</td></tr>';
  }
  function covBarSegments(cov) {
    if (!cov.total) return '<span class="cov-seg no" style="flex:1"></span>';
    var html = '';
    if (cov.yes) html += '<span class="cov-seg yes" style="flex:' + cov.yes + '"></span>';
    if (cov.part) html += '<span class="cov-seg part" style="flex:' + cov.part + '"></span>';
    if (cov.no) html += '<span class="cov-seg no" style="flex:' + cov.no + '"></span>';
    return html;
  }
  function coverageTrend(cov, prev) {
    if (!prev) return '';
    var d = cov.yes - coverage(prev).yes;
    if (d === 0) return '<span class="trend">±0 vs last week</span>';
    var cls = d > 0 ? 'up' : 'down';
    return '<span class="trend ' + cls + '">' + (d > 0 ? '▲' : '▼') + ' ' + Math.abs(d) + ' vs last week</span>';
  }
  function renderPreview() {
    var cl = currentClient(), wk = currentWeek(), range = weekRange(wk.weekStart);
    var prepBy = (cl.preparedBy || '').trim() || 'Victory Velocity';
    var domain = (cl.domain || '').trim();
    var logo = cl.logo ? '<div class="rpt-logo"><img src="' + cl.logo + '" alt="' + h(cl.name) + ' logo"></div>' : '';

    var kpis = METRICS.map(function (def) {
      var v = metricView(def, wk, cl);
      var arrow = v.dir === 'up' ? '▲' : v.dir === 'down' ? '▼' : v.dir === 'flat' ? '■' : '';
      var delta = v.dir === 'none'
        ? '<span class="base">' + h(v.primary || '—') + '</span>'
        : '<span class="arr">' + arrow + '</span> <span class="pct">' + h(v.primary) + '</span> <span class="base">' + h(v.secondary) + '</span>';
      return '<div class="kpi"><div class="kpi-name">' + h(v.name) + '</div><div class="kpi-val">' + h(v.value) +
        '</div><div class="kpi-delta ' + v.dir + '">' + delta + '</div><div class="kpi-spark">' + v.spark + '</div></div>';
    }).join('');

    var cov = coverage(wk), prev = previousWeek(cl, wk);
    var geoSpots = wk.spots.length ? wk.spots.map(spotRowReport).join('')
      : '<tr><td colspan="4" class="rpt-empty">No queries tracked yet.</td></tr>';

    var workItems = wk.work.filter(function (w) { return (w.text || '').trim(); });
    var workHtml = workItems.length ? workItems.map(workReport).join('') : emptyLi('No work logged this week.');
    var priItems = wk.priorities.filter(function (p) { return (p.text || '').trim(); });
    var priHtml = priItems.length ? priItems.map(priReport).join('') : emptyLi('No priorities set.');
    var hlItems = wk.highlights.filter(function (x) { return (x.text || '').trim(); });
    var blItems = wk.blockers.filter(function (x) { return (x.text || '').trim(); });

    var showHl = state.settings.sections.highlights !== false;
    var showBl = state.settings.sections.blockers !== false;
    var execSec = (wk.execSummary || '').trim() ? section('Executive Summary', '<p class="rpt-lede">' + nl2br(h(wk.execSummary)) + '</p>') : '';
    var hlSec = showHl && hlItems.length ? section('Highlights / Wins', '<ul class="rpt-list">' + hlItems.map(function (x) { return bulletLi(x.text); }).join('') + '</ul>') : '';
    var blSec = showBl && blItems.length ? section('Blockers / Risks', '<ul class="rpt-list">' + blItems.map(function (x) { return bulletLi(x.text); }).join('') + '</ul>') : '';
    var notesSec = (wk.notes || '').trim() ? section('Notes &amp; Observations', '<p class="rpt-notes">' + nl2br(h(wk.notes)) + '</p>') : '';

    $('#preview').innerHTML =
      '<header class="rpt-head"><div class="rpt-topline">' + logo + '<div class="rpt-brand">Victory Velocity</div></div>' +
      '<div class="rpt-kicker">GEO · Weekly Performance Report</div>' +
      '<h1 class="rpt-title">' + (h(cl.name) || 'Client') + '</h1>' +
      '<div class="rpt-sub">' + h(range.label) + '</div>' +
      '<div class="rpt-meta">' + (domain ? h(domain) + ' · ' : '') + 'Prepared by ' + h(prepBy) + '</div></header>' +
      execSec +
      '<section class="rpt-section"><h2>Search Performance</h2><div class="kpi-grid">' + kpis + '</div></section>' +
      '<section class="rpt-section"><h2>GEO Visibility — AI Engine Citations</h2>' +
        '<div class="geo-summary"><div class="geo-score"><span class="num">' + cov.yes + '</span><span class="den">/ ' + cov.total + '</span><span class="lab">queries cited</span></div>' +
        '<div class="geo-cov"><div class="cov-bar">' + covBarSegments(cov) + '</div>' +
        '<div class="cov-legend"><span class="yes"><i></i>Cited</span><span class="part"><i></i>Partial</span><span class="no">Not yet</span>' + coverageTrend(cov, prev) + '</div></div></div>' +
        '<table class="rpt-spot"><thead><tr><th style="width:42%">Query</th><th style="width:16%">Engine</th><th style="width:14%">Cited?</th><th>Notes</th></tr></thead><tbody>' + geoSpots + '</tbody></table></section>' +
      hlSec +
      '<section class="rpt-section"><h2>Work Completed This Week</h2><ul class="rpt-list">' + workHtml + '</ul></section>' +
      '<section class="rpt-section"><h2>Next Week Priorities</h2><ul class="rpt-list">' + priHtml + '</ul></section>' +
      blSec + notesSec +
      '<footer class="rpt-foot"><span>Prepared by ' + h(prepBy) + ' · ' + h(domain || 'victoryvelocity.ca') + '</span><span>' + h(range.label) + '</span></footer>';

    document.title = (cl.name || 'Client') + ' — Weekly Report — ' + (range.short !== 'Untitled week' ? range.short : '(set week)');
  }

  /* ── Theme / sections ──────────────────────────────────── */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-report-theme', t);
    $('#themeProfessional').classList.toggle('active', t === 'professional');
    $('#themeEditorial').classList.toggle('active', t === 'editorial');
  }
  function setTheme(t) { state.settings.reportTheme = t; applyTheme(t); scheduleSave(); }
  function applySections() {
    ['highlights', 'blockers'].forEach(function (name) {
      var sec = $('[data-optional="' + name + '"]'); if (!sec) return;
      var visible = state.settings.sections[name] !== false;
      sec.classList.toggle('collapsed', !visible);
      var t = $('.toggle-sec', sec); if (t) t.textContent = visible ? 'hide' : 'show';
    });
  }
  function toggleSection(name) {
    var sec = $('[data-optional="' + name + '"]');
    var collapsed = sec.classList.toggle('collapsed');
    state.settings.sections[name] = !collapsed;
    var t = $('.toggle-sec', sec); if (t) t.textContent = collapsed ? 'show' : 'hide';
    scheduleSave(); renderPreview();
  }

  /* ── Voice dictation (Web Speech API) ──────────────────── */
  var recog = null, voiceTarget = null, voiceBase = '', voiceFinal = '', voiceBtn = null;
  function getSR() { return (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition); }
  function voiceSupported() { return !!getSR(); }
  function showVoiceHud(on) { var hud = $('#voiceHud'); if (hud) hud.hidden = !on; if (on) $('#voiceText').textContent = 'Listening…'; }
  function startVoice(target, btn) {
    var SR = getSR(); if (!SR || !target) return;
    if (voiceTarget) stopVoice();
    voiceTarget = target;
    voiceBase = target.value ? target.value.replace(/\s*$/, '') + ' ' : '';
    voiceFinal = ''; voiceBtn = btn || null;
    recog = new SR(); recog.continuous = true; recog.interimResults = true; recog.lang = 'en-US';
    recog.onresult = onVoiceResult;
    recog.onerror = function () { stopVoice(); };
    recog.onend = function () { if (voiceTarget) stopVoice(); };
    try { recog.start(); } catch (e) {}
    showVoiceHud(true);
    if (btn) btn.classList.add('listening');
    var v = $('#btnVoice'); if (v) v.setAttribute('aria-pressed', 'true');
  }
  function onVoiceResult(e) {
    var interim = '';
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var r = e.results[i];
      if (r.isFinal) voiceFinal += r[0].transcript; else interim += r[0].transcript;
    }
    if (voiceTarget) { voiceTarget.value = (voiceBase + voiceFinal + interim).replace(/^\s+/, ''); commitFromElement(voiceTarget); }
    $('#voiceText').textContent = interim || (voiceFinal ? '…' + voiceFinal.slice(-44) : 'Listening…');
  }
  function stopVoice() {
    if (recog) { try { recog.stop(); } catch (e) {} recog = null; }
    if (voiceBtn) voiceBtn.classList.remove('listening');
    voiceBtn = null; voiceTarget = null;
    showVoiceHud(false);
    var v = $('#btnVoice'); if (v) v.setAttribute('aria-pressed', 'false');
  }
  function setupVoiceAvailability() {
    if (voiceSupported()) return;
    $$('.mic-btn').forEach(function (b) { b.hidden = true; });
    var v = $('#btnVoice');
    if (v) { v.disabled = true; v.style.opacity = '0.4'; v.title = 'Voice dictation is not supported in this browser (try Chrome, Edge or Safari)'; }
  }

  /* ── Field commit (shared by typing + voice) ───────────── */
  function commitFromElement(el) {
    if (el.hasAttribute('data-bind')) {
      applyBind(el.getAttribute('data-bind'), el.type === 'checkbox' ? el.checked : el.value);
    } else {
      var row = el.closest('[data-id]');
      if (row) updateListField(row.dataset.list, row.dataset.id, el.getAttribute('data-field'), el.type === 'checkbox' ? el.checked : el.value);
    }
    scheduleSave(); renderPreview();
  }
  function postProcess(el) {
    var p = el.getAttribute('data-bind'); if (!p) return;
    if (p === 'metrics.ctrAuto' || p === 'metrics.imp.w' || p === 'metrics.clk.w') {
      var wk = currentWeek(), ctrW = $('#f-ctr-w');
      if (wk.metrics.ctrAuto) { ctrW.value = deriveCTR(wk); ctrW.disabled = true; } else { ctrW.disabled = false; }
    }
    if (/^metrics\.(imp|clk|ctr|pos)\.b$/.test(p)) {
      var k = p.split('.')[1], badge = $('[data-auto="' + k + '"]'); if (badge) badge.hidden = true;
    }
  }

  /* ── Import / export ───────────────────────────────────── */
  function download(text, filename) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function downloadBackup() { download(JSON.stringify(state, null, 2), 'vv-reports-backup-' + isoDate(new Date()) + '.json'); }
  function exportReport() {
    var cl = currentClient(), wk = currentWeek();
    var payload = { type: 'vv-report', client: { name: cl.name, domain: cl.domain, preparedBy: cl.preparedBy, logo: cl.logo }, week: wk, exported: new Date().toISOString() };
    var safe = (cl.name || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
    download(JSON.stringify(payload, null, 2), safe + '-' + (wk.weekStart || 'report') + '.json');
  }
  function handleImport(data) {
    if (data && Array.isArray(data.clients)) {
      if (!confirm('Replace ALL current data with this backup? Your current reports will be overwritten.')) return;
      state = normalize(data); applyTheme(state.settings.reportTheme); applySections(); scheduleSave(); renderAll();
    } else if (data && (data.week || data.type === 'vv-report')) {
      var wk = normalizeWeek(data.week || data);
      var cl = currentClient(); cl.weeks.push(wk); state.activeWeekId = wk.id; scheduleSave(); renderAll();
    } else {
      alert('Unrecognised file format.');
    }
  }
  function doDataAction(action) {
    if (action === 'save-all') downloadBackup();
    else if (action === 'load-all') { $('#importFile').click(); }
    else if (action === 'export-report') exportReport();
    else if (action === 'reset-demo') {
      if (!confirm('Reset everything to the demo report? This erases all saved data.')) return;
      state = demoState(); applyTheme(state.settings.reportTheme); applySections(); scheduleSave(); renderAll();
    }
  }

  /* ── Event wiring ──────────────────────────────────────── */
  function bindEvents() {
    var formPanel = $('#formPanel');

    function onFormInput(e) {
      var el = e.target;
      if (el.matches('[data-bind]')) {
        var p = el.getAttribute('data-bind');
        applyBind(p, el.type === 'checkbox' ? el.checked : el.value);
        postProcess(el);
        scheduleSave(); renderPreview();
        if (p === '@client.preparedBy' || p === '@client.domain' || p === 'weekStart') renderWorkspace();
        return;
      }
      var row = el.closest('[data-id]');
      if (row && el.matches('[data-field]')) {
        updateListField(row.dataset.list, row.dataset.id, el.getAttribute('data-field'), el.type === 'checkbox' ? el.checked : el.value);
        scheduleSave(); renderPreview();
      }
    }
    formPanel.addEventListener('input', onFormInput);
    formPanel.addEventListener('change', onFormInput);

    formPanel.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var el = e.target;
      if (el.matches('input[data-field="text"]')) {
        var row = el.closest('[data-id]');
        if (row) { e.preventDefault(); addItem(row.dataset.list); }
      }
    });

    formPanel.addEventListener('click', function (e) {
      var add = e.target.closest('[data-add]'); if (add) { addItem(add.getAttribute('data-add')); return; }
      var tog = e.target.closest('[data-toggle]'); if (tog) { toggleSection(tog.getAttribute('data-toggle')); return; }
      var act = e.target.closest('[data-row-action]');
      if (act) {
        var row = act.closest('[data-id]');
        if (row) {
          if (act.dataset.rowAction === 'del') deleteItem(row.dataset.list, row.dataset.id);
          else dupItem(row.dataset.list, row.dataset.id);
        }
      }
    });

    /* Drag & drop reordering */
    var dragData = null;
    function clearDrop() { $$('.drop-target').forEach(function (x) { x.classList.remove('drop-target'); }); }
    formPanel.addEventListener('dragstart', function (e) {
      var handle = e.target.closest('.drag-handle'); if (!handle) return;
      var row = handle.closest('[data-id]'); if (!row) return;
      dragData = { list: row.dataset.list, id: row.dataset.id };
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', row.dataset.id); } catch (_) {}
    });
    formPanel.addEventListener('dragover', function (e) {
      if (!dragData) return;
      var row = e.target.closest('[data-id]');
      if (!row || row.dataset.list !== dragData.list) return;
      e.preventDefault(); clearDrop(); row.classList.add('drop-target');
    });
    formPanel.addEventListener('drop', function (e) {
      if (!dragData) return;
      var row = e.target.closest('[data-id]'); clearDrop();
      if (row && row.dataset.list === dragData.list && row.dataset.id !== dragData.id) {
        e.preventDefault(); moveItem(dragData.list, dragData.id, row.dataset.id);
      }
    });
    formPanel.addEventListener('dragend', function () {
      clearDrop(); $$('.dragging').forEach(function (x) { x.classList.remove('dragging'); }); dragData = null;
    });

    /* Per-field mic buttons */
    document.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mic]'); if (!m) return;
      var t = $(m.getAttribute('data-mic'));
      if (!t) return;
      if (voiceTarget === t) stopVoice();
      else { t.focus(); startVoice(t, m); }
    });

    /* Workspace controls */
    $('#ws-client').addEventListener('change', function (e) { setClient(e.target.value); });
    $('#ws-week').addEventListener('change', function (e) { setWeek(e.target.value); });
    $('#ws-client-new').addEventListener('click', function () {
      var name = prompt('New client name:', '');
      if (name && name.trim()) {
        var c = newClientObj(name.trim());
        state.clients.push(c); state.activeClientId = c.id; state.activeWeekId = c.weeks[0].id;
        scheduleSave(); renderAll();
      }
    });
    $('#ws-client-rename').addEventListener('click', function () {
      var cl = currentClient(); var name = prompt('Rename client:', cl.name);
      if (name && name.trim()) { cl.name = name.trim(); scheduleSave(); renderWorkspace(); renderPreview(); }
    });
    $('#ws-client-del').addEventListener('click', function () {
      if (state.clients.length <= 1) { alert('At least one client is required.'); return; }
      var cl = currentClient();
      if (!confirm('Delete client “' + cl.name + '” and all of its weeks?')) return;
      state.clients = state.clients.filter(function (c) { return c.id !== cl.id; });
      state.activeClientId = state.clients[0].id; state.activeWeekId = latestWeek(state.clients[0]).id;
      scheduleSave(); renderAll();
    });
    $('#ws-week-new').addEventListener('click', newWeek);
    $('#ws-week-dup').addEventListener('click', dupWeek);
    $('#ws-week-del').addEventListener('click', delWeek);

    /* Logo */
    $('#f-logo').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () { currentClient().logo = r.result; scheduleSave(); renderLogoPreview(); renderPreview(); };
      r.readAsDataURL(f);
    });
    $('#f-logo-clear').addEventListener('click', function () {
      currentClient().logo = null; $('#f-logo').value = ''; scheduleSave(); renderLogoPreview(); renderPreview();
    });

    /* Theme */
    $('#themeProfessional').addEventListener('click', function () { setTheme('professional'); });
    $('#themeEditorial').addEventListener('click', function () { setTheme('editorial'); });

    /* Voice toggle */
    $('#btnVoice').addEventListener('click', function () {
      if (voiceTarget) { stopVoice(); return; }
      var t = document.activeElement;
      var ok = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text')) &&
        (t.hasAttribute('data-bind') || t.closest('[data-id]'));
      if (!ok) { t = $('#f-notes'); t.focus(); }
      startVoice(t, $('#btnVoice'));
    });
    $('#voiceStop').addEventListener('click', stopVoice);

    /* Data menu */
    var dataBtn = $('#btnData'), dataMenu = $('#dataMenu');
    dataBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !dataMenu.hidden;
      dataMenu.hidden = open; dataBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    document.addEventListener('click', function () {
      if (!dataMenu.hidden) { dataMenu.hidden = true; dataBtn.setAttribute('aria-expanded', 'false'); }
    });
    dataMenu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]'); if (!b) return;
      e.stopPropagation(); dataMenu.hidden = true; dataBtn.setAttribute('aria-expanded', 'false');
      doDataAction(b.dataset.action);
    });
    $('#importFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try { handleImport(JSON.parse(r.result)); } catch (err) { alert('Could not read that file — is it valid JSON?'); }
        e.target.value = '';
      };
      r.readAsText(f);
    });

    /* Print */
    $('#btnPrint').addEventListener('click', function () { window.print(); });

    /* Mobile view tabs */
    $$('#mobileTabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#main').setAttribute('data-mobile-view', b.dataset.tab);
        $$('#mobileTabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
    });
  }

  /* ── Boot ──────────────────────────────────────────────── */
  function renderAll() {
    ensureActive();
    renderWorkspace();
    fillForm();
    renderList('spots'); renderList('work'); renderList('priorities'); renderList('highlights'); renderList('blockers');
    renderPreview();
  }
  function init() {
    state = load();
    ensureActive();
    applyTheme(state.settings.reportTheme);
    applySections();
    bindEvents();
    setupVoiceAvailability();
    renderAll();
    doSave(); // persist first-run seed / migration so a reload is stable
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  /* Export pure helpers for Node-based unit tests */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      weekRange: weekRange, mondayOf: mondayOf, addDaysIso: addDaysIso, isoDate: isoDate,
      deriveCTR: deriveCTR, metricNumber: metricNumber, metricView: metricView,
      coverage: coverage, normalize: normalize, demoState: demoState, defaultWeek: defaultWeek,
      fmtNum: fmtNum, sparklineSVG: sparklineSVG, historyValues: historyValues, METRICS: METRICS
    };
  }
})();
