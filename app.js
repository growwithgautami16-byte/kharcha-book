(function () {
  var CATS = window.CATEGORIES;
  var PEOPLE = window.PEOPLE || {};
  var NAMES = Object.keys(PEOPLE).map(function (k) { return PEOPLE[k]; });
  var N1 = NAMES[0] || 'Gautami', N2 = NAMES[1] || 'Akash';
  var EVERYDAY = window.EVERYDAY || [];
  var PAYERS = ['Joint account', N1, N2];
  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function rs(n) { return (n < 0 ? '-' : '') + '₹' + inr.format(Math.round(Math.abs(n))); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function mkOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function mIdx(mk) { return parseInt(mk.slice(0, 4), 10) * 12 + parseInt(mk.slice(5, 7), 10) - 1; }
  function mFromIdx(i) { return Math.floor(i / 12) + '-' + pad((i % 12) + 1); }
  function monthName(mk) { return new Date(+mk.slice(0, 4), +mk.slice(5, 7) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function shortDay(d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  function nameOf(email) { return PEOPLE[(email || '').toLowerCase()] || PEOPLE[email] || (email ? email.split('@')[0] : ''); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  var t0 = new Date();
  var S = {
    year: t0.getFullYear(), month: t0.getMonth(), today: ymd(t0),
    expenses: [], curExp: [], weekExp: [], settle: [], recurring: [], goals: [], budgets: {}, skips: {},
    split: Number(window.SPLIT && window.SPLIT.first), editing: false, confirm: null, paid: 'Joint account',
    tab: 'month', mode: lsGet('kb-mode') === 'one' ? 'one' : 'day', weekOff: 0,
    user: null, u: {}, recLoaded: false, skipLoaded: false, gen: {}
  };
  if (!(S.split >= 0 && S.split <= 100)) S.split = 50;
  CATS.forEach(function (c) { S.budgets[c.n] = c.b; });

  if (!window.FIREBASE_CONFIG || window.FIREBASE_CONFIG.apiKey === 'PASTE_HERE') {
    document.body.innerHTML = '<div class="wrap" style="padding-top:40px"><h1>Kharcha Book</h1><div class="banner">Setup is not finished: paste your Firebase config into config.js, then upload the folder again.</div></div>';
    return;
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}

  function monthKey() { return S.year + '-' + pad(S.month + 1); }
  function monthLabel() { return monthName(monthKey()); }
  function budgetOf(n) { return Number(S.budgets[n]) || 0; }
  function curMk() { return mkOf(new Date()); }
  function catOptions() { return CATS.map(function (c) { return '<option>' + esc(c.n) + '</option>'; }).join(''); }
  function payOptions() { return PAYERS.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join(''); }
  function sub(name, q, fn, err) {
    if (S.u[name]) S.u[name]();
    S.u[name] = q.onSnapshot(fn, err || function () {});
  }

  /* ---------- month tab ---------- */
  function renderTotals() {
    var spent = 0, joint = 0, bud = 0;
    S.expenses.forEach(function (e) { spent += e.amount; if (e.paidFrom === 'Joint account') joint += e.amount; });
    CATS.forEach(function (c) { bud += budgetOf(c.n); });
    var left = bud - spent;
    $('totals').innerHTML =
      '<div class="tot dark"><div class="label">Spent</div><b class="num">' + rs(spent) + '</b></div>' +
      '<div class="tot"><div class="label">Monthly budget</div><b class="num">' + rs(bud) + '</b></div>' +
      '<div class="tot"><div class="label">' + (left >= 0 ? 'Left' : 'Over') + '</div><b class="num" style="color:' + (left >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + rs(Math.abs(left)) + '</b></div>' +
      '<div class="tot"><div class="label">From joint account</div><b class="num">' + rs(joint) + '</b></div>';
  }

  function renderBars() {
    var byCat = {};
    S.expenses.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    var html = '';
    CATS.forEach(function (c) {
      var spent = byCat[c.n] || 0, b = budgetOf(c.n), cap = b * (c.every || 1);
      var pct = cap > 0 ? Math.min(100, spent / cap * 100) : (spent > 0 ? 100 : 0);
      var cls = cap > 0 ? (spent > cap ? 'over' : (spent > cap * 0.85 ? 'warn' : '')) : (spent > 0 ? 'warn' : '');
      var sub;
      if (cap <= 0) sub = spent > 0 ? 'No budget set for this line' : 'No budget set';
      else if (spent > cap) sub = rs(spent - cap) + ' over';
      else sub = rs(cap - spent) + ' left';
      if (c.every) sub += ' · bill comes every ' + c.every + ' months (' + rs(cap) + ' each time)';
      html += '<div class="bar ' + cls + '"><div style="font-weight:600">' + esc(c.n) + '</div>' +
        '<div class="num">' + rs(spent) + ' <span class="muted">of ' +
        (S.editing ? '<input type="number" inputmode="numeric" min="0" step="50" data-cat="' + esc(c.n) + '" value="' + b + '" aria-label="Monthly budget for ' + esc(c.n) + '">' : rs(b)) +
        '</span></div><div class="track"><div class="fill" style="width:' + pct + '%"></div></div><div class="sub">' + esc(sub) + '</div></div>';
    });
    $('bars').innerHTML = html;
    $('editbudgets').textContent = S.editing ? 'Done' : 'Edit budgets';
  }

  function renderList() {
    var list = $('list');
    if (!S.expenses.length) {
      list.innerHTML = '<div class="empty">No entries for ' + esc(monthLabel()) + ' yet.<br>Add the first one above. Both of you see the same list.</div>';
      $('sumbtn').hidden = true; $('summary').hidden = true;
      return;
    }
    $('sumbtn').hidden = false;
    var sorted = S.expenses.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    var groups = {}, order = [];
    sorted.forEach(function (e) { if (!groups[e.date]) { groups[e.date] = []; order.push(e.date); } groups[e.date].push(e); });
    var html = '';
    order.forEach(function (d) {
      var tot = groups[d].reduce(function (s, e) { return s + e.amount; }, 0);
      var dl = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      html += '<div class="day"><div class="dayhead"><span>' + esc(dl) + '</span><span class="num">' + rs(tot) + '</span></div>';
      groups[d].forEach(function (e) {
        html += '<div class="row"><div><div class="what">' + esc(e.category) + (e.note ? ' · <span style="font-weight:400">' + esc(e.note) + '</span>' : '') + '</div>' +
          '<div class="meta"><span class="pill">' + esc(e.paidFrom) + '</span>' + (e.rec ? '<span class="pill">auto-added</span>' : '') + (e.by ? 'added by ' + esc(nameOf(e.by)) : '') + '</div></div>' +
          '<div class="amt num">' + rs(e.amount) + '</div><div class="acts">' +
          (S.confirm === 'e:' + e.id
            ? '<span class="confirm">Delete? <button type="button" class="yes" data-del="' + esc(e.id) + '">Yes</button><button type="button" data-cancel="1">No</button></span>'
            : '<button type="button" class="link" data-ask="' + esc(e.id) + '">Delete</button>') +
          '</div></div>';
      });
      html += '</div>';
    });
    list.innerHTML = html;
  }

  function summary() {
    var byCat = {}, byPay = {}, spent = 0, bud = 0;
    S.expenses.forEach(function (e) { spent += e.amount; byCat[e.category] = (byCat[e.category] || 0) + e.amount; byPay[e.paidFrom] = (byPay[e.paidFrom] || 0) + e.amount; });
    CATS.forEach(function (c) { bud += budgetOf(c.n); });
    var lines = [];
    lines.push(monthLabel() + ': ' + rs(spent) + ' spent against a ' + rs(bud) + ' budget (' + (spent <= bud ? rs(bud - spent) + ' left' : rs(spent - bud) + ' over') + ').');
    var over = CATS.map(function (c) { var cap = budgetOf(c.n) * (c.every || 1); return { n: c.n, d: (byCat[c.n] || 0) - cap, cap: cap }; })
      .filter(function (x) { return x.cap > 0 && x.d > 0; }).sort(function (a, b) { return b.d - a.d; });
    if (over.length) lines.push('Over budget: ' + over.slice(0, 3).map(function (x) { return x.n + ' by ' + rs(x.d); }).join(', ') + '.');
    else lines.push('Every budget line is within its limit so far.');
    var top = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0];
    if (top) lines.push('Biggest line: ' + top + ' at ' + rs(byCat[top]) + '.');
    lines.push('Paid from: ' + Object.keys(byPay).map(function (k) { return k + ' ' + rs(byPay[k]); }).join(', ') + '.');
    var nw = new Date();
    var day = (S.year === nw.getFullYear() && S.month === nw.getMonth()) ? nw.getDate() : new Date(S.year, S.month + 1, 0).getDate();
    var dim = new Date(S.year, S.month + 1, 0).getDate();
    var flex = EVERYDAY.reduce(function (s, n) { return s + (byCat[n] || 0); }, 0);
    var flexBud = EVERYDAY.reduce(function (s, n) { return s + budgetOf(n); }, 0);
    if (flexBud > 0 && day >= 7) lines.push('Everyday spending: ' + rs(flex) + ' of ' + rs(flexBud) + ' after ' + day + ' of ' + dim + ' days' + (flex / flexBud > day / dim + 0.1 ? ', spending faster than the month. Slow down a little this week.' : ', on pace.'));
    $('summary').textContent = lines.join('\n');
    $('summary').hidden = false;
  }

  /* ---------- adding expenses ---------- */
  function setMode(m) {
    S.mode = m; lsSet('kb-mode', m);
    $('dayform').hidden = m !== 'day'; $('form').hidden = m !== 'one';
    each($('mode').children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === m ? 'true' : 'false'); });
  }
  function dayRowHtml() {
    return '<div class="drow">' +
      '<label class="field"><span>Amount (₹)</span><input class="d-amt" type="number" inputmode="decimal" min="1" step="any" placeholder="450"></label>' +
      '<label class="field"><span>Category</span><select class="d-cat">' + catOptions() + '</select></label>' +
      '<label class="field wide"><span>Paid from</span><select class="d-paid">' + payOptions() + '</select></label>' +
      '<label class="field wide"><span>Note (optional)</span><input class="d-note" type="text" maxlength="120"></label></div>';
  }
  function resetRows() {
    var h = ''; for (var i = 0; i < 4; i++) h += dayRowHtml();
    $('drows').innerHTML = h; updateDayTotal();
  }
  function updateDayTotal() {
    var tot = 0, n = 0;
    each($('drows').querySelectorAll('.d-amt'), function (i) { var v = parseFloat(i.value); if (v > 0) { tot += v; n++; } });
    $('daytotal').textContent = n ? n + (n === 1 ? ' entry' : ' entries') + ' · ' + rs(tot) : '';
  }
  function gotoMonthOf(date) {
    var y = +date.slice(0, 4), m = +date.slice(5, 7) - 1;
    if (y !== S.year || m !== S.month) { S.year = y; S.month = m; subscribeMonth(); }
  }
  function saveDay(ev) {
    ev.preventDefault();
    var date = $('dday').value, msg = $('daymsg');
    msg.className = 'msg';
    if (!date) { msg.className = 'msg err'; msg.textContent = 'Pick a day.'; return; }
    var recs = [], total = 0, base = Date.now();
    each($('drows').querySelectorAll('.drow'), function (row) {
      var amt = parseFloat(row.querySelector('.d-amt').value);
      if (!(amt > 0)) return;
      amt = Math.round(amt * 100) / 100; total += amt;
      recs.push({ amount: amt, category: row.querySelector('.d-cat').value, paidFrom: row.querySelector('.d-paid').value, note: row.querySelector('.d-note').value.trim(), date: date, month: date.slice(0, 7), createdAt: base + recs.length, by: (S.user && S.user.email) || '' });
    });
    if (!recs.length) { msg.className = 'msg err'; msg.textContent = 'Enter at least one amount.'; return; }
    var batch = db.batch();
    recs.forEach(function (r) { batch.set(db.collection('expenses').doc(), r); });
    batch.commit().catch(function (e) {
      msg.className = 'msg err';
      msg.textContent = e && e.code === 'permission-denied' ? 'Not saved: this login is not allowed to write.' : 'Not saved. Try again.';
    });
    resetRows();
    msg.textContent = 'Saved ' + recs.length + (recs.length === 1 ? ' entry' : ' entries') + ' (' + rs(total) + ') for ' + shortDay(new Date(date + 'T00:00:00')) + '.';
    gotoMonthOf(date);
  }
  function addExpense(ev) {
    ev.preventDefault();
    var amt = parseFloat($('amount').value), msg = $('addmsg');
    msg.className = 'msg';
    if (!(amt > 0)) { msg.className = 'msg err'; msg.textContent = 'Enter an amount above zero.'; return; }
    var date = $('date').value; if (!date) { msg.className = 'msg err'; msg.textContent = 'Pick a date.'; return; }
    var rec = { amount: Math.round(amt * 100) / 100, category: $('category').value, paidFrom: S.paid, note: $('note').value.trim(), date: date, month: date.slice(0, 7), createdAt: Date.now(), by: (S.user && S.user.email) || '' };
    db.collection('expenses').add(rec).catch(function (e) {
      msg.className = 'msg err';
      msg.textContent = e && e.code === 'permission-denied' ? 'Not saved: this login is not allowed to write.' : 'Not saved. Try again.';
    });
    $('amount').value = ''; $('note').value = '';
    msg.textContent = 'Added ' + rs(rec.amount) + ' to ' + rec.category + '.';
    gotoMonthOf(date);
  }
  function removeExpense(id) {
    S.confirm = null;
    db.collection('expenses').doc(id).delete().catch(function () { $('addmsg').className = 'msg err'; $('addmsg').textContent = 'Could not delete. Try again.'; });
    if (id.indexOf('rec_') === 0) { // keep a deleted auto-added bill from coming back
      var o = {}; o[id.slice(4)] = true;
      db.collection('settings').doc('skips').set(o, { merge: true }).catch(function () {});
    }
    renderList();
  }
  function saveBudgets() { db.collection('settings').doc('budgets').set(Object.assign({}, S.budgets)).catch(function () {}); }

  /* ---------- week tab ---------- */
  function weekRange(off) {
    var d = new Date(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7);
    var e = new Date(d); e.setDate(e.getDate() + 6);
    return { s: d, e: e, start: ymd(d), end: ymd(e) };
  }
  function renderWeek() {
    var r = weekRange(S.weekOff), nw = new Date();
    $('weektitle').textContent = shortDay(r.s) + ' to ' + shortDay(r.e);
    $('wnext').disabled = S.weekOff >= 0;
    var spent = 0, ev = 0, byCat = {}, byDay = {};
    S.weekExp.forEach(function (e) {
      spent += e.amount; byCat[e.category] = (byCat[e.category] || 0) + e.amount; byDay[e.date] = true;
      if (EVERYDAY.indexOf(e.category) >= 0) ev += e.amount;
    });
    var dim = new Date(r.s.getFullYear(), r.s.getMonth() + 1, 0).getDate();
    var allow = EVERYDAY.reduce(function (s, n) { return s + budgetOf(n); }, 0) * 7 / dim;
    var left = allow - ev;
    var html = '<div class="tot dark"><div class="label">Spent this week</div><b class="num">' + rs(spent) + '</b></div>' +
      '<div class="tot"><div class="label">Everyday spending</div><b class="num">' + rs(ev) + '</b>' + (allow > 0 ? '<small>of about ' + rs(allow) + ' a week</small>' : '') + '</div>';
    if (allow > 0) html += '<div class="tot"><div class="label">' + (left >= 0 ? 'Everyday left' : 'Everyday over') + '</div><b class="num" style="color:' + (left >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + rs(Math.abs(left)) + '</b></div>';
    $('weektotals').innerHTML = html;

    // days with nothing logged
    var last = new Date(r.e), todayD = new Date(nw.getFullYear(), nw.getMonth(), nw.getDate());
    if (todayD < last) { last = new Date(todayD); if (nw.getHours() < 20) last.setDate(last.getDate() - 1); }
    var miss = [];
    for (var d = new Date(r.s); d <= last; d.setDate(d.getDate() + 1)) {
      var key = ymd(d); if (!byDay[key]) miss.push({ key: key, label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) });
    }
    $('missing').innerHTML = miss.length
      ? '<div class="muted" style="margin-bottom:10px">Tap a day to add what you spent. Skip it if there was no spending.</div><div class="chips">' + miss.map(function (m) { return '<button type="button" class="chip" data-logday="' + m.key + '">' + esc(m.label) + '</button>'; }).join('') + '</div>'
      : '<div class="muted">Every day so far has something logged.</div>';

    // where it went
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    $('weekcats').innerHTML = cats.length ? cats.map(function (c) {
      var pct = spent > 0 ? byCat[c] / spent * 100 : 0;
      return '<div class="bar"><div style="font-weight:600">' + esc(c) + '</div><div class="num">' + rs(byCat[c]) + '</div><div class="track"><div class="fill" style="width:' + pct + '%"></div></div><div class="sub">' + Math.round(pct) + '% of the week</div></div>';
    }).join('') : '<div class="muted">Nothing logged this week yet.</div>';

    // budget watch (always for the real current month)
    var cm = curMk(), byC = {}, w = '';
    S.curExp.forEach(function (e) { byC[e.category] = (byC[e.category] || 0) + e.amount; });
    CATS.forEach(function (c) {
      var cap = budgetOf(c.n) * (c.every || 1), sp = byC[c.n] || 0;
      if (cap > 0 && sp > cap * 0.85) {
        var pct = Math.min(100, sp / cap * 100);
        w += '<div class="bar ' + (sp > cap ? 'over' : 'warn') + '"><div style="font-weight:600">' + esc(c.n) + '</div><div class="num">' + rs(sp) + ' <span class="muted">of ' + rs(cap) + '</span></div><div class="track"><div class="fill" style="width:' + pct + '%"></div></div><div class="sub">' + (sp > cap ? rs(sp - cap) + ' over' : rs(cap - sp) + ' left') + '</div></div>';
      }
    });
    var evMtd = 0, evBud = EVERYDAY.reduce(function (s, n) { return s + budgetOf(n); }, 0);
    EVERYDAY.forEach(function (n) { evMtd += byC[n] || 0; });
    var dm = new Date(nw.getFullYear(), nw.getMonth() + 1, 0).getDate(), pace = '';
    if (evBud > 0) pace = '<div class="muted" style="margin-top:10px">Everyday spending in ' + esc(monthName(cm)) + ': ' + rs(evMtd) + ' of ' + rs(evBud) + ' after ' + nw.getDate() + ' of ' + dm + ' days' + (evMtd / evBud > nw.getDate() / dm + 0.1 ? ', ahead of the month. Slow down a little.' : ', on pace.') + '</div>';
    $('watch').innerHTML = (w ? '<div style="display:flex;flex-direction:column;gap:14px">' + w + '</div>' : '<div class="muted">No budget line is close to its limit in ' + esc(monthName(cm)) + '.</div>') + pace;
  }

  /* ---------- settle tab ---------- */
  function renderSettle() {
    var pg = 0, pa = 0;
    S.expenses.forEach(function (e) { if (e.paidFrom === N1) pg += e.amount; else if (e.paidFrom === N2) pa += e.amount; });
    var P = pg + pa, sh1 = S.split / 100, share1 = P * sh1, share2 = P - share1;
    var bal = pg - share1; // positive: N2 owes N1
    S.settle.forEach(function (s) { if (s.from === N2 && s.to === N1) bal -= s.amount; else if (s.from === N1 && s.to === N2) bal += s.amount; });
    var debtor = bal > 0 ? N2 : N1, creditor = bal > 0 ? N1 : N2, amt = Math.abs(bal);
    var head = amt < 1
      ? '<div class="big" style="color:var(--ok)">All settled for ' + esc(monthLabel()) + '</div>'
      : '<div class="big">' + esc(debtor) + ' owes ' + esc(creditor) + ' ' + rs(amt) + '</div>';
    var html = head + '<div class="kv">' +
      '<span class="k">Paid from ' + esc(N1) + "'s own account</span><span class=\"v num\">" + rs(pg) + '</span>' +
      '<span class="k">Paid from ' + esc(N2) + "'s own account</span><span class=\"v num\">" + rs(pa) + '</span>' +
      '<span class="k">Total paid from own accounts</span><span class="v num">' + rs(P) + '</span>' +
      '<span class="k">' + esc(N1) + "'s share (" + S.split + '%)</span><span class="v num">' + rs(share1) + '</span>' +
      '<span class="k">' + esc(N2) + "'s share (" + (100 - S.split) + '%)</span><span class="v num">' + rs(share2) + '</span></div>' +
      '<div class="muted">Only expenses paid from ' + esc(N1) + ' or ' + esc(N2) + ' count here. Payments from the joint account are already shared.</div>';
    if (amt >= 1) {
      html += '<form id="payform" class="form" autocomplete="off"><label class="field"><span>Amount paid (₹)</span><input id="payamt" type="number" inputmode="decimal" min="1" step="any" value="' + Math.round(amt) + '"></label>' +
        '<div style="display:flex;align-items:flex-end"><button class="primary" type="submit">' + esc(debtor) + ' paid ' + esc(creditor) + '</button></div></form><span class="msg" id="paymsg" role="status"></span>';
    }
    $('settlebox').innerHTML = html;
    $('splitlabel').textContent = N1 + "'s share of shared costs (%)";
    if (document.activeElement !== $('splitpct')) $('splitpct').value = S.split;
    $('splitnote').textContent = N2 + ' covers the other ' + (100 - S.split) + '%. Both of you see the same number.';
    var list = S.settle.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    $('payments').innerHTML = list.length ? list.map(function (s) {
      return '<div class="row"><div><div class="what">' + esc(s.from) + ' paid ' + esc(s.to) + '</div><div class="meta">' + esc(shortDay(new Date(s.date + 'T00:00:00'))) + (s.by ? ' · added by ' + esc(nameOf(s.by)) : '') + '</div></div><div class="amt num">' + rs(s.amount) + '</div><div class="acts">' +
        (S.confirm === 's:' + s.id ? '<span class="confirm">Delete? <button type="button" class="yes" data-sdel="' + esc(s.id) + '">Yes</button><button type="button" data-cancel="1">No</button></span>' : '<button type="button" class="link" data-sask="' + esc(s.id) + '">Delete</button>') + '</div></div>';
    }).join('') : '<div class="muted">No payments recorded for ' + esc(monthLabel()) + '.</div>';
  }
  function recordPayment(ev) {
    ev.preventDefault();
    var a = parseFloat($('payamt').value), msg = $('paymsg');
    if (!(a > 0)) { msg.className = 'msg err'; msg.textContent = 'Enter an amount above zero.'; return; }
    var pg = 0, pa = 0;
    S.expenses.forEach(function (e) { if (e.paidFrom === N1) pg += e.amount; else if (e.paidFrom === N2) pa += e.amount; });
    var bal = pg - (pg + pa) * S.split / 100;
    S.settle.forEach(function (s) { if (s.from === N2 && s.to === N1) bal -= s.amount; else if (s.from === N1 && s.to === N2) bal += s.amount; });
    var from = bal > 0 ? N2 : N1, to = bal > 0 ? N1 : N2;
    var nw = new Date(), mk = monthKey();
    var date = mkOf(nw) === mk ? ymd(nw) : ymd(new Date(S.year, S.month + 1, 0));
    db.collection('settlements').add({ from: from, to: to, amount: Math.round(a * 100) / 100, date: date, month: mk, createdAt: Date.now(), by: (S.user && S.user.email) || '' }).catch(function () {
      var m = $('paymsg'); if (m) { m.className = 'msg err'; m.textContent = 'Not saved. Try again.'; }
    });
  }

  /* ---------- bills tab ---------- */
  function isDue(b, mk) {
    var every = Number(b.every) || 1, start = b.start || '0000-01';
    var i = mIdx(mk), s = mIdx(start);
    return i >= s && (i - s) % every === 0;
  }
  function nextDue(b) {
    var nw = new Date(), cm = curMk(), dim = new Date(nw.getFullYear(), nw.getMonth() + 1, 0).getDate();
    var day = Math.min(Number(b.day) || 1, dim);
    for (var i = 0; i < 25; i++) {
      var mk = mFromIdx(mIdx(cm) + i);
      if (isDue(b, mk) && !(i === 0 && nw.getDate() >= day)) return mk;
    }
    return '';
  }
  function renderBills() {
    var list = S.recurring.slice().sort(function (a, b) { return (a.day || 1) - (b.day || 1); });
    $('billlist').innerHTML = list.length ? list.map(function (b) {
      var every = Number(b.every) || 1, nd = nextDue(b);
      var rep = every === 1 ? 'Every month' : (every === 12 ? 'Every year' : 'Every ' + every + ' months');
      return '<div class="billrow"><div><div class="name">' + esc(b.label || b.category) + '</div><div class="meta">' + esc(b.category) + ' · ' + rep + ' · paid from ' + esc(b.paidFrom) + (nd ? ' · next in ' + esc(monthName(nd)) : '') + '</div></div>' +
        '<div class="amt num" style="font-weight:700">' + rs(b.amount) + '</div>' +
        '<div class="ctl"><label>Amount ₹ <input class="inl" type="number" inputmode="decimal" min="1" step="any" data-bamt="' + esc(b.id) + '" value="' + b.amount + '"></label>' +
        '<label>Day <input class="inl sm" type="number" inputmode="numeric" min="1" max="31" data-bday="' + esc(b.id) + '" value="' + (b.day || 1) + '"></label>' +
        (S.confirm === 'b:' + b.id ? '<span class="confirm">Remove? <button type="button" class="yes" data-bdel="' + esc(b.id) + '">Yes</button><button type="button" data-cancel="1">No</button></span>' : '<button type="button" class="link" data-bask="' + esc(b.id) + '">Remove</button>') + '</div></div>';
    }).join('') : '<div class="empty">No recurring bills yet.</div>';
    $('usualwrap').hidden = list.length > 0;
  }
  function generate() {
    if (!S.recLoaded || !S.skipLoaded || !S.user) return;
    var nw = new Date(), mk = mkOf(nw), dim = new Date(nw.getFullYear(), nw.getMonth() + 1, 0).getDate();
    S.recurring.forEach(function (b) {
      if (!isDue(b, mk)) return;
      var day = Math.min(Number(b.day) || 1, dim);
      if (nw.getDate() < day) return;
      var key = b.id + '_' + mk;
      if (S.skips[key] || S.gen[key]) return;
      S.gen[key] = true;
      var ref = db.collection('expenses').doc('rec_' + key);
      ref.get().then(function (snap) {
        if (snap.exists) return;
        return ref.set({ amount: Number(b.amount), category: b.category, paidFrom: b.paidFrom, note: b.label || '', date: mk + '-' + pad(day), month: mk, createdAt: Date.now(), by: S.user.email || '', rec: true });
      }).catch(function () { S.gen[key] = false; });
    });
  }
  function addBill(ev) {
    ev.preventDefault();
    var amt = parseFloat($('bamt').value), day = parseInt($('bday').value, 10), msg = $('billmsg');
    msg.className = 'msg';
    if (!(amt > 0)) { msg.className = 'msg err'; msg.textContent = 'Enter the amount.'; return; }
    if (!(day >= 1 && day <= 31)) { msg.className = 'msg err'; msg.textContent = 'Day must be between 1 and 31.'; return; }
    var rec = { category: $('bcat').value, label: $('blabel').value.trim(), amount: Math.round(amt * 100) / 100, day: day, every: parseInt($('bevery').value, 10), start: $('bstart').value || curMk(), paidFrom: $('bpaid').value, createdAt: Date.now(), by: (S.user && S.user.email) || '' };
    db.collection('recurring').add(rec).catch(function () { msg.className = 'msg err'; msg.textContent = 'Not saved. Try again.'; });
    $('bamt').value = ''; $('blabel').value = '';
    msg.textContent = 'Added. If its day has already passed this month, it is added to the book now.';
  }
  function addUsual() {
    var cm = curMk(), batch = db.batch(), n = 0;
    (window.USUAL_BILLS || []).forEach(function (u) {
      var c = CATS.filter(function (x) { return x.n === u.cat; })[0];
      if (!c) return;
      var amount = (Number(c.b) || 0) * (c.every || 1);
      if (!(amount > 0)) return;
      var every = c.every || 1;
      batch.set(db.collection('recurring').doc(), { category: c.n, label: '', amount: amount, day: u.day || 1, every: every, start: every > 1 ? mFromIdx(mIdx(cm) + 1) : cm, paidFrom: u.paid || 'Joint account', createdAt: Date.now() + n, by: (S.user && S.user.email) || '' });
      n++;
    });
    if (n) batch.commit().catch(function () {});
  }

  /* ---------- goals tab ---------- */
  function renderGoals() {
    var list = S.goals.slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    $('goallist').innerHTML = list.length ? list.map(function (g) {
      var pct = g.target > 0 ? Math.max(0, Math.min(100, g.saved / g.target * 100)) : 0;
      var rem = g.target - g.saved, line;
      if (rem <= 0) line = 'Goal reached.';
      else {
        line = rs(rem) + ' to go';
        if (g.monthly > 0) { var n = Math.ceil(rem / g.monthly), t = new Date(); t.setMonth(t.getMonth() + n); line += ' · at ' + rs(g.monthly) + ' a month, about ' + n + (n === 1 ? ' month' : ' months') + ' (' + t.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) + ')'; }
      }
      var last = g.lastAmount ? 'Last change: ' + (g.lastAmount > 0 ? '+' : '-') + rs(Math.abs(g.lastAmount)) + (g.lastBy ? ' by ' + nameOf(g.lastBy) : '') : '';
      return '<div class="goal"><div class="gh"><span class="gname">' + esc(g.name) + '</span><span class="num" style="font-weight:700">' + rs(g.saved) + ' <span class="muted" style="font-weight:400">of ' + rs(g.target) + '</span></span></div>' +
        '<div class="bar ' + (rem <= 0 ? 'good' : '') + '"><div class="track"><div class="fill" style="width:' + pct + '%"></div></div><div class="sub">' + esc(line) + (last ? '<br>' + esc(last) : '') + '</div></div>' +
        '<div class="dep"><input id="gi-' + esc(g.id) + '" type="number" inputmode="decimal" min="1" step="any" placeholder="Amount ₹" aria-label="Amount for ' + esc(g.name) + '">' +
        '<button class="ghost" type="button" data-gadd="' + esc(g.id) + '">Add money</button><button class="ghost" type="button" data-gtake="' + esc(g.id) + '">Take out</button>' +
        (S.confirm === 'g:' + g.id ? '<span class="confirm">Remove goal? <button type="button" class="yes" data-gdel="' + esc(g.id) + '">Yes</button><button type="button" data-cancel="1">No</button></span>' : '<button type="button" class="link" data-gask="' + esc(g.id) + '">Remove</button>') + '</div></div>';
    }).join('') : '<div class="empty">No goals yet. Add the first one below, like an emergency fund or a holiday.</div>';
  }
  function addGoal(ev) {
    ev.preventDefault();
    var name = $('gname').value.trim(), target = parseFloat($('gtarget').value), monthly = parseFloat($('gmonthly').value) || 0, msg = $('goalmsg');
    msg.className = 'msg';
    if (!name || !(target > 0)) { msg.className = 'msg err'; msg.textContent = 'Enter a name and a target.'; return; }
    db.collection('goals').add({ name: name, target: target, monthly: monthly, saved: 0, createdAt: Date.now(), by: (S.user && S.user.email) || '' }).catch(function () { msg.className = 'msg err'; msg.textContent = 'Not saved. Try again.'; });
    $('gname').value = ''; $('gtarget').value = ''; $('gmonthly').value = '';
    msg.textContent = 'Goal added.';
  }
  function moveMoney(id, sign) {
    var inp = $('gi-' + id), a = parseFloat(inp && inp.value);
    if (!(a > 0)) { if (inp) inp.focus(); return; }
    var d = Math.round(a * 100) / 100 * sign;
    db.collection('goals').doc(id).update({ saved: firebase.firestore.FieldValue.increment(d), lastAmount: d, lastBy: (S.user && S.user.email) || '', lastAt: Date.now() }).catch(function () {});
    inp.value = '';
  }

  /* ---------- data ---------- */
  function toExp(snap) {
    var d = snap.data() || {};
    return { id: snap.id, amount: Number(d.amount) || 0, category: d.category || 'Other', paidFrom: d.paidFrom || 'Joint account', note: d.note || '', date: d.date || '', createdAt: d.createdAt || 0, by: d.by || '', rec: !!d.rec };
  }
  function withId(snap) { var d = snap.data() || {}; d.id = snap.id; return d; }
  function expErr(err) {
    var m = $('addmsg');
    m.className = 'msg err';
    m.textContent = err && err.code === 'permission-denied' ? 'This login is not allowed to see the book. Check the emails in firestore.rules.' : 'Could not load entries. Check your connection.';
  }
  function subscribeMonth() {
    S.confirm = null; $('summary').hidden = true;
    S.expenses = []; S.settle = []; renderAll();
    sub('month', db.collection('expenses').where('month', '==', monthKey()), function (q) { S.expenses = q.docs.map(toExp); renderAll(); }, expErr);
    sub('settle', db.collection('settlements').where('month', '==', monthKey()), function (q) { S.settle = q.docs.map(withId); renderSettle(); });
  }
  function subscribeWeek() {
    var r = weekRange(S.weekOff);
    S.weekExp = []; renderWeek();
    sub('week', db.collection('expenses').where('date', '>=', r.start).where('date', '<=', r.end), function (q) { S.weekExp = q.docs.map(toExp); renderWeek(); });
  }
  function subscribeCur() {
    sub('cur', db.collection('expenses').where('month', '==', curMk()), function (q) { S.curExp = q.docs.map(toExp); renderWeek(); });
  }
  function renderAll() {
    $('monthname').textContent = monthLabel();
    renderTotals(); renderBars(); renderList(); renderSettle();
  }

  function startApp(user) {
    S.user = user;
    $('loginview').hidden = true; $('appview').hidden = false; $('tabbar').hidden = false;
    $('who').textContent = 'Signed in as ' + nameOf(user.email);
    sub('budgets', db.collection('settings').doc('budgets'), function (snap) {
      if (snap.exists) { var d = snap.data(); CATS.forEach(function (c) { if (typeof d[c.n] === 'number') S.budgets[c.n] = d[c.n]; }); renderTotals(); renderBars(); renderWeek(); }
    });
    sub('split', db.collection('settings').doc('split'), function (snap) {
      if (snap.exists && typeof snap.data().first === 'number') { S.split = snap.data().first; renderSettle(); }
    });
    sub('skips', db.collection('settings').doc('skips'), function (snap) {
      S.skips = snap.exists ? snap.data() : {}; S.skipLoaded = true; generate();
    }, function () { S.skipLoaded = true; });
    sub('recurring', db.collection('recurring'), function (q) {
      S.recurring = q.docs.map(withId); S.recLoaded = true; renderBills(); generate();
    });
    sub('goals', db.collection('goals'), function (q) { S.goals = q.docs.map(withId); renderGoals(); });
    subscribeMonth(); subscribeWeek(); subscribeCur();
    showTab(lsGet('kb-tab') || 'month');
  }
  function stopApp() {
    Object.keys(S.u).forEach(function (k) { if (S.u[k]) S.u[k](); }); S.u = {};
    S.recLoaded = S.skipLoaded = false; S.gen = {};
    $('appview').hidden = true; $('tabbar').hidden = true; $('loginview').hidden = false;
  }

  /* ---------- tabs ---------- */
  var TABS = ['month', 'week', 'settle', 'bills', 'goals'];
  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = 'month';
    S.tab = name; S.confirm = null; lsSet('kb-tab', name);
    TABS.forEach(function (t) { $('tab-' + t).hidden = t !== name; });
    each($('tabbar').children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
    $('monthnav').hidden = !(name === 'month' || name === 'settle');
    renderAll(); renderWeek(); renderBills(); renderGoals();
    window.scrollTo(0, 0);
  }

  /* ---------- wiring ---------- */
  $('category').innerHTML = catOptions();
  $('bcat').innerHTML = catOptions();
  $('bpaid').innerHTML = payOptions();
  $('bstart').value = curMk();
  $('date').value = S.today; $('dday').value = S.today;
  resetRows(); setMode(S.mode);
  $('prev').onclick = function () { S.month--; if (S.month < 0) { S.month = 11; S.year--; } subscribeMonth(); };
  $('next').onclick = function () { S.month++; if (S.month > 11) { S.month = 0; S.year++; } subscribeMonth(); };
  $('wprev').onclick = function () { S.weekOff--; subscribeWeek(); };
  $('wnext').onclick = function () { if (S.weekOff < 0) { S.weekOff++; subscribeWeek(); } };
  $('tabbar').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) showTab(b.getAttribute('data-tab')); });
  $('mode').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) setMode(b.getAttribute('data-v')); });
  $('form').addEventListener('submit', addExpense);
  $('dayform').addEventListener('submit', saveDay);
  $('addrow').onclick = function () { $('drows').insertAdjacentHTML('beforeend', dayRowHtml()); };
  $('drows').addEventListener('input', updateDayTotal);
  $('paid').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    S.paid = b.getAttribute('data-v');
    each($('paid').children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
  });
  $('editbudgets').onclick = function () { S.editing = !S.editing; renderBars(); };
  $('bars').addEventListener('change', function (ev) {
    var c = ev.target.getAttribute && ev.target.getAttribute('data-cat'); if (!c) return;
    S.budgets[c] = Math.max(0, Number(ev.target.value) || 0);
    renderTotals(); saveBudgets();
  });
  function confirmClicks(ev) {
    var t = ev.target, g = function (a) { return t.getAttribute && t.getAttribute(a); };
    if (g('data-ask')) { S.confirm = 'e:' + g('data-ask'); renderList(); }
    else if (g('data-del')) removeExpense(g('data-del'));
    else if (g('data-sask')) { S.confirm = 's:' + g('data-sask'); renderSettle(); }
    else if (g('data-sdel')) { S.confirm = null; db.collection('settlements').doc(g('data-sdel')).delete().catch(function () {}); renderSettle(); }
    else if (g('data-bask')) { S.confirm = 'b:' + g('data-bask'); renderBills(); }
    else if (g('data-bdel')) { S.confirm = null; db.collection('recurring').doc(g('data-bdel')).delete().catch(function () {}); renderBills(); }
    else if (g('data-gask')) { S.confirm = 'g:' + g('data-gask'); renderGoals(); }
    else if (g('data-gdel')) { S.confirm = null; db.collection('goals').doc(g('data-gdel')).delete().catch(function () {}); renderGoals(); }
    else if (g('data-gadd')) moveMoney(g('data-gadd'), 1);
    else if (g('data-gtake')) moveMoney(g('data-gtake'), -1);
    else if (g('data-cancel')) { S.confirm = null; renderList(); renderSettle(); renderBills(); renderGoals(); }
    else if (g('data-logday')) { var d = g('data-logday'); showTab('month'); setMode('day'); $('dday').value = d; $('dday').scrollIntoView(); }
  }
  ['list', 'payments', 'billlist', 'goallist', 'missing'].forEach(function (id) { $(id).addEventListener('click', confirmClicks); });
  $('settlebox').addEventListener('submit', function (ev) { if (ev.target.id === 'payform') recordPayment(ev); });
  $('splitpct').addEventListener('change', function () {
    var n = Math.round(Number($('splitpct').value)); if (!(n >= 0 && n <= 100)) n = S.split;
    S.split = n; $('splitpct').value = n; renderSettle();
    db.collection('settings').doc('split').set({ first: n }).catch(function () {});
  });
  $('billform').addEventListener('submit', addBill);
  $('usual').onclick = addUsual;
  $('billlist').addEventListener('change', function (ev) {
    var t = ev.target, id = t.getAttribute('data-bamt') || t.getAttribute('data-bday'); if (!id) return;
    var v = Number(t.value);
    if (t.getAttribute('data-bamt')) { if (v > 0) db.collection('recurring').doc(id).update({ amount: Math.round(v * 100) / 100 }).catch(function () {}); }
    else { v = Math.round(v); if (v >= 1 && v <= 31) db.collection('recurring').doc(id).update({ day: v }).catch(function () {}); }
  });
  $('goalform').addEventListener('submit', addGoal);
  $('sumbtn').onclick = summary;
  $('signout').onclick = function () { auth.signOut(); };
  $('loginform').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var m = $('loginmsg'); m.className = 'msg'; m.textContent = 'Signing in…'; $('loginbtn').disabled = true;
    auth.signInWithEmailAndPassword($('email').value.trim(), $('password').value).then(function () {
      m.textContent = ''; $('loginbtn').disabled = false;
    }, function (e) {
      $('loginbtn').disabled = false; m.className = 'msg err';
      m.textContent = (e && (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found')) ? 'Email or password is wrong.' : 'Could not sign in. Check your connection and try again.';
    });
  });
  function net() { $('offline').hidden = navigator.onLine; }
  window.addEventListener('online', net); window.addEventListener('offline', net); net();

  // A new day started while the app was open (or the phone was asleep).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !S.user) return;
    var td = ymd(new Date());
    if (td !== S.today) {
      S.today = td; $('date').value = td; $('dday').value = td;
      S.gen = {}; subscribeCur(); subscribeWeek(); generate();
    }
  });

  auth.onAuthStateChanged(function (user) { if (user) startApp(user); else stopApp(); });
})();
