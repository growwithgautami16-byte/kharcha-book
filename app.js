(function () {
  var CATS = window.CATEGORIES;
  var PEOPLE = window.PEOPLE || {};
  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function rs(n) { return '₹' + inr.format(Math.round(n)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nameOf(email) { return PEOPLE[(email || '').toLowerCase()] || PEOPLE[email] || (email ? email.split('@')[0] : ''); }

  var now = new Date();
  var S = { year: now.getFullYear(), month: now.getMonth(), expenses: [], budgets: {}, editing: false, confirmId: null, paid: 'Joint account', unsub: null, unsubB: null, user: null };
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
  function monthLabel() { return new Date(S.year, S.month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
  function budgetOf(n) { return Number(S.budgets[n]) || 0; }

  /* ---------- rendering ---------- */
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
          '<div class="meta"><span class="pill">' + esc(e.paidFrom) + '</span>' + (e.by ? 'added by ' + esc(nameOf(e.by)) : '') + '</div></div>' +
          '<div class="amt num">' + rs(e.amount) + '</div><div class="acts">' +
          (S.confirmId === e.id
            ? '<span class="confirm">Delete? <button type="button" class="yes" data-del="' + esc(e.id) + '">Yes</button><button type="button" data-cancel="1">No</button></span>'
            : '<button type="button" class="link" data-ask="' + esc(e.id) + '">Delete</button>') +
          '</div></div>';
      });
      html += '</div>';
    });
    list.innerHTML = html;
  }

  function renderAll() {
    $('monthname').textContent = monthLabel();
    renderTotals(); renderBars(); renderList();
  }

  /* ---------- month summary (worked out on the phone, no AI needed) ---------- */
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
    var day = (S.year === now.getFullYear() && S.month === now.getMonth()) ? now.getDate() : new Date(S.year, S.month + 1, 0).getDate();
    var dim = new Date(S.year, S.month + 1, 0).getDate();
    var flex = ['Groceries', 'Eating out'].reduce(function (s, n) { return s + (byCat[n] || 0); }, 0);
    var flexBud = budgetOf('Groceries') + budgetOf('Eating out');
    if (flexBud > 0 && day >= 7) lines.push('Groceries and eating out: ' + rs(flex) + ' of ' + rs(flexBud) + ' after ' + day + ' of ' + dim + ' days' + (flex / flexBud > day / dim + 0.1 ? ', spending faster than the month. Slow down a little this week.' : ', on pace.'));
    $('summary').textContent = lines.join('\n');
    $('summary').hidden = false;
  }

  /* ---------- data ---------- */
  function toExp(snap) {
    var d = snap.data() || {};
    return { id: snap.id, amount: Number(d.amount) || 0, category: d.category || 'Other', paidFrom: d.paidFrom || 'Joint account', note: d.note || '', date: d.date || '', createdAt: d.createdAt || 0, by: d.by || '' };
  }
  function subscribe() {
    if (S.unsub) { S.unsub(); S.unsub = null; }
    S.confirmId = null; $('summary').hidden = true;
    S.expenses = []; renderAll();
    S.unsub = db.collection('expenses').where('month', '==', monthKey()).onSnapshot(function (q) {
      S.expenses = q.docs.map(toExp); renderAll();
    }, function (err) {
      $('addmsg').className = 'msg err';
      $('addmsg').textContent = err && err.code === 'permission-denied' ? 'This login is not allowed to see the book. Check the emails in firestore.rules.' : 'Could not load entries. Check your connection.';
    });
  }

  function addExpense(ev) {
    ev.preventDefault();
    var amt = parseFloat($('amount').value), msg = $('addmsg');
    msg.className = 'msg';
    if (!(amt > 0)) { msg.className = 'msg err'; msg.textContent = 'Enter an amount above zero.'; return; }
    var date = $('date').value; if (!date) { msg.className = 'msg err'; msg.textContent = 'Pick a date.'; return; }
    var rec = { amount: Math.round(amt * 100) / 100, category: $('category').value, paidFrom: S.paid, note: $('note').value.trim(), date: date, month: date.slice(0, 7), createdAt: Date.now(), by: (S.user && S.user.email) || '' };
    // Firestore saves locally first and syncs, so we don't wait for the server.
    db.collection('expenses').add(rec).catch(function (e) {
      msg.className = 'msg err';
      msg.textContent = e && e.code === 'permission-denied' ? 'Not saved: this login is not allowed to write.' : 'Not saved. Try again.';
    });
    $('amount').value = ''; $('note').value = '';
    msg.textContent = 'Added ' + rs(rec.amount) + ' to ' + rec.category + '.';
    var y = +date.slice(0, 4), m = +date.slice(5, 7) - 1;
    if (y !== S.year || m !== S.month) { S.year = y; S.month = m; subscribe(); }
  }

  function removeExpense(id) {
    S.confirmId = null;
    db.collection('expenses').doc(id).delete().catch(function () { $('addmsg').className = 'msg err'; $('addmsg').textContent = 'Could not delete. Try again.'; });
    renderList();
  }

  function saveBudgets() { db.collection('settings').doc('budgets').set(Object.assign({}, S.budgets)).catch(function () {}); }

  function startApp(user) {
    S.user = user;
    $('loginview').hidden = true; $('appview').hidden = false;
    $('who').textContent = 'Signed in as ' + nameOf(user.email);
    if (S.unsubB) S.unsubB();
    S.unsubB = db.collection('settings').doc('budgets').onSnapshot(function (snap) {
      if (snap.exists) { var d = snap.data(); CATS.forEach(function (c) { if (typeof d[c.n] === 'number') S.budgets[c.n] = d[c.n]; }); renderTotals(); renderBars(); }
    }, function () {});
    subscribe();
  }
  function stopApp() {
    if (S.unsub) S.unsub(); if (S.unsubB) S.unsubB(); S.unsub = S.unsubB = null;
    $('appview').hidden = true; $('loginview').hidden = false;
  }

  /* ---------- wiring ---------- */
  $('category').innerHTML = CATS.map(function (c) { return '<option>' + esc(c.n) + '</option>'; }).join('');
  $('date').value = ymd(now);
  $('prev').onclick = function () { S.month--; if (S.month < 0) { S.month = 11; S.year--; } subscribe(); };
  $('next').onclick = function () { S.month++; if (S.month > 11) { S.month = 0; S.year++; } subscribe(); };
  $('form').addEventListener('submit', addExpense);
  $('paid').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    S.paid = b.getAttribute('data-v');
    Array.prototype.forEach.call($('paid').children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
  });
  $('editbudgets').onclick = function () { S.editing = !S.editing; renderBars(); };
  $('bars').addEventListener('change', function (ev) {
    var c = ev.target.getAttribute && ev.target.getAttribute('data-cat'); if (!c) return;
    S.budgets[c] = Math.max(0, Number(ev.target.value) || 0);
    renderTotals(); saveBudgets();
  });
  $('list').addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.getAttribute('data-ask')) { S.confirmId = t.getAttribute('data-ask'); renderList(); }
    else if (t.getAttribute('data-cancel')) { S.confirmId = null; renderList(); }
    else if (t.getAttribute('data-del')) { removeExpense(t.getAttribute('data-del')); }
  });
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

  auth.onAuthStateChanged(function (user) { if (user) startApp(user); else stopApp(); });
})();
