/* หน้าผู้ดูแล: แก้ไขประกาศและตั้งค่า แล้วบันทึกลง GitHub (GitHub Pages จะอัปเดตเว็บให้เอง) */
(function () {
  'use strict';
  var B = window.BL, esc = B.esc, n = B.n, fmt = B.fmt;
  var CFG = window.BL_CONFIG || {};
  var API = 'https://api.github.com';
  var DIR = CFG.dir ? CFG.dir.replace(/\/+$/, '') + '/' : '';
  var DATA_PATH = DIR + 'data/site.json';
  var TOKEN_KEY = 'bl-admin-token';

  var app = document.getElementById('app');
  var token = '';
  var STATE = null, S = null, dataSha = null;
  var ui = { tab: 'lands', edit: false, draft: null, busy: false, error: '' };

  // ---------- GitHub API ----------
  function gh(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.message || r.status); e.status = r.status; throw e; } return j; });
    });
  }
  var repoPath = '/repos/' + encodeURIComponent(CFG.owner) + '/' + encodeURIComponent(CFG.repo);

  function b64ToText(b64) {
    var bin = atob(b64.replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function loadData() {
    return gh('GET', repoPath + '/contents/' + DATA_PATH + '?ref=' + encodeURIComponent(CFG.branch)).then(function (f) {
      dataSha = f.sha;
      STATE = JSON.parse(b64ToText(f.content));
      S = STATE.settings;
    });
  }

  // บันทึกทุกอย่างใน 1 commit: site.json + รูปใหม่ + ลบรูปที่ไม่ใช้แล้ว
  function commit(next, newImages, removedPaths, message) {
    var head, baseTree;
    var branch = encodeURIComponent(CFG.branch);
    return gh('GET', repoPath + '/git/ref/heads/' + branch).then(function (r) {
      head = r.object.sha;
      return gh('GET', repoPath + '/git/commits/' + head);
    }).then(function (c) {
      baseTree = c.tree.sha;
      // ตรวจว่าไม่มีใครแก้ข้อมูลไปก่อนหน้า
      return gh('GET', repoPath + '/contents/' + DATA_PATH + '?ref=' + head);
    }).then(function (f) {
      if (f.sha !== dataSha) { var e = new Error('conflict'); e.conflict = true; throw e; }
      return Promise.all(newImages.map(function (img) {
        return gh('POST', repoPath + '/git/blobs', { content: img.data.split(',')[1], encoding: 'base64' }).then(function (b) {
          return { path: DIR + img.path, mode: '100644', type: 'blob', sha: b.sha };
        });
      }));
    }).then(function (entries) {
      entries.push({ path: DATA_PATH, mode: '100644', type: 'blob', content: JSON.stringify(next, null, 1) + '\n' });
      removedPaths.forEach(function (p) { entries.push({ path: DIR + p, mode: '100644', type: 'blob', sha: null }); });
      return gh('POST', repoPath + '/git/trees', { base_tree: baseTree, tree: entries });
    }).then(function (tree) {
      return gh('POST', repoPath + '/git/commits', { message: message, tree: tree.sha, parents: [head] });
    }).then(function (c) {
      return gh('PATCH', repoPath + '/git/refs/heads/' + branch, { sha: c.sha, force: false });
    }).then(function () {
      return loadData();
    });
  }

  function imagePaths(state) {
    var s = {};
    state.lands.forEach(function (l) { (l.images || []).forEach(function (i) { if (typeof i === 'string') s[i] = 1; }); });
    return s;
  }

  // หลังบันทึก: เช็กหน้าเว็บจริงจนกว่าจะเห็นข้อมูลชุดใหม่ แล้วแจ้ง admin
  var watchTimer = null;
  function setLive(state, text) {
    var el = document.getElementById('live');
    ui.live = { state: state, text: text };
    if (el) { el.className = 'note' + (state === 'err' ? ' err' : ''); el.textContent = text; el.hidden = !text; }
  }
  function watchLive(rev) {
    clearTimeout(watchTimer);
    var started = Date.now();
    setLive('wait', 'กำลังอัปเดตหน้าเว็บ… (ปกติ 1–2 นาที)');
    (function check() {
      fetch('data/site.json?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.rev === rev) { setLive('ok', '✓ หน้าเว็บอัปเดตแล้ว ลูกค้าเห็นข้อมูลใหม่แล้ว'); B.toast('หน้าเว็บอัปเดตแล้ว'); watchTimer = setTimeout(function () { setLive('', ''); }, 15000); return; }
        throw new Error('old');
      }).catch(function () {
        if (Date.now() - started > 6 * 60 * 1000) { setLive('err', 'หน้าเว็บยังไม่อัปเดต ลองรีเฟรชหน้าเว็บอีกครั้งในอีกสักครู่'); return; }
        watchTimer = setTimeout(check, 6000);
      });
    })();
  }

  function save(next, msg, commitMsg) {
    next.rev = Date.now();
    // รูปใหม่ (ยังเป็น data URL) → แปลงเป็นไฟล์ใน uploads/
    var newImages = [];
    next.lands.forEach(function (l) {
      l.images = (l.images || []).map(function (img) {
        if (img && typeof img === 'object') { newImages.push(img); return img.path; }
        return img;
      });
    });
    var before = imagePaths(STATE), after = imagePaths(next);
    var removed = Object.keys(before).filter(function (p) { return !after[p] && /^uploads\/[\w.-]+$/.test(p); });
    ui.busy = true; ui.error = ''; render();
    return commit(next, newImages, removed, commitMsg || msg).then(function () {
      ui.busy = false; ui.edit = false; ui.draft = null; render(); window.scrollTo(0, 0);
      B.toast(msg);
      watchLive(next.rev);
    }, function (err) {
      ui.busy = false;
      if (err.conflict) ui.error = 'มีการแก้ไขข้อมูลจากที่อื่นก่อนหน้านี้ กด "โหลดข้อมูลล่าสุด" แล้วแก้ไขอีกครั้ง';
      else if (err.status === 401) { logout(); ui.error = 'Token หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่'; }
      else if (err.status === 403 || err.status === 404) ui.error = 'Token นี้ไม่มีสิทธิ์เขียนลง repository ' + CFG.owner + '/' + CFG.repo + ' (ต้องเปิดสิทธิ์ Contents: Read and write)';
      else if (err.status === 422) ui.error = 'บันทึกไม่สำเร็จเพราะ branch ถูกแก้ไขพร้อมกัน ลองกดบันทึกอีกครั้ง';
      else ui.error = 'บันทึกไม่สำเร็จ: ' + err.message;
      render();
    });
  }

  // ---------- login ----------
  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t, remember) { try { sessionStorage.setItem(TOKEN_KEY, t); if (remember) localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function logout() { token = ''; try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // ---------- หน้าเข้าสู่ระบบ ----------
  var ICON = {
    key: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="7" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.6 9.4L16.5 2.5M13.5 5.5l2 2M15.5 3.5l1.8 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    eyeOff: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 3l14 14M8.2 4.3A8.6 8.6 0 0110 4c5.5 0 8.5 6 8.5 6a14 14 0 01-2.6 3.3M5.2 6.1A14 14 0 001.5 10s3 6 8.5 6a8 8 0 003.3-.7M8.2 8.3a2.6 2.6 0 003.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    alert: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14" r="1.1" fill="currentColor"/></svg>',
    plot: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 18L7 5l13 3-2 12z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3 2"/><rect x="5.5" y="3.5" width="3" height="3" fill="currentColor"/><rect x="16.5" y="18.5" width="3" height="3" fill="currentColor"/></svg>',
    tag: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.6" fill="currentColor"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    ext: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L7 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  var pub = null; // ชื่อเว็บจากหน้าเว็บจริง (ใช้แสดงในหน้าเข้าสู่ระบบ)

  function loginPage(err) {
    var name = (pub && pub.siteName) || 'Brokers Land', tagline = (pub && pub.tagline) || 'นายหน้าซื้อขายที่ดิน';
    var busy = ui.loginBusy;
    var steps = [
      ['เปิดหน้าสร้าง Token บน GitHub', 'กดปุ่มด้านล่าง แล้วตั้งชื่ออะไรก็ได้ เช่น brokers-land-admin'],
      ['Resource owner เลือก <b>' + esc(CFG.owner) + '</b>', 'ถ้ายังเป็นชื่อบัญชีส่วนตัว Token จะใช้กับเว็บนี้ไม่ได้'],
      ['Repository access เลือก <b>Only select repositories</b>', 'แล้วเลือก <code>' + esc(CFG.repo) + '</code>'],
      ['Permissions เลือก <b>Contents: Read and write</b>', 'จากนั้นกด Generate token แล้วคัดลอกมาวาง']
    ];
    return '<div class="auth">' +
      '<aside class="auth-side"><canvas id="auth-contours" aria-hidden="true"></canvas><div class="auth-side-in">' +
        '<a class="auth-brand" href="./"><span class="auth-logo">' + ICON.plot + '</span><span><b>' + esc(name) + '</b><small>' + esc(tagline) + '</small></span></a>' +
        '<div class="auth-pitch"><span class="auth-eyebrow">ระบบผู้ดูแล</span><h1>จัดการประกาศที่ดิน<br>ได้จากทุกที่</h1>' +
        '<ul class="auth-feats">' +
          '<li><span>' + ICON.plot + '</span><div><b>ลงประกาศพร้อมรูปและพิกัด</b><small>ใส่ขนาดเป็นไร่-งาน-ตร.ว. ระบบคิดราคาต่อตารางวาให้</small></div></li>' +
          '<li><span>' + ICON.tag + '</span><div><b>อัปเดตสถานะในคลิกเดียว</b><small>พร้อมขาย · ติดจอง · ขายแล้ว พร้อมวันที่ขาย</small></div></li>' +
          '<li><span>' + ICON.bolt + '</span><div><b>ลูกค้าเห็นภายใน 1–2 นาที</b><small>บันทึกลง GitHub แล้วหน้าเว็บอัปเดตเอง</small></div></li>' +
        '</ul></div>' +
        '<div class="auth-repo">เชื่อมกับ <span class="num">' + esc(CFG.owner + '/' + CFG.repo) + '</span></div>' +
      '</div></aside>' +
      '<main class="auth-main"><form class="auth-card" id="loginform" novalidate>' +
        '<div class="auth-head"><h2>เข้าสู่ระบบ</h2><p>วาง GitHub Token เพื่อแก้ไขข้อมูลบนเว็บ</p></div>' +
        (err ? '<div class="auth-err" role="alert">' + ICON.alert + '<span>' + esc(err) + '</span></div>' : '') +
        '<label class="auth-label" for="tok">GitHub Token' + B.info('รหัสที่อนุญาตให้หน้านี้บันทึกข้อมูลลง GitHub ห้ามส่งให้คนอื่น') + '</label>' +
        '<div class="auth-input' + (err ? ' invalid' : '') + '">' + ICON.key +
          '<input id="tok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…" value="' + esc(ui.loginDraft || '') + '"' + (busy ? ' disabled' : '') + (err ? ' aria-invalid="true"' : '') + '>' +
          '<button type="button" class="auth-eye" data-eye aria-label="แสดง Token" data-tip="แสดง / ซ่อน Token">' + ICON.eye + '</button>' +
        '</div>' +
        '<label class="auth-switch"><input type="checkbox" id="remember"' + (ui.loginRemember ? ' checked' : '') + '><span class="sw" aria-hidden="true"></span>' +
          '<span><b>จำไว้ในเครื่องนี้</b><small>ครั้งหน้าเข้าได้เลย · ใช้เฉพาะเครื่องส่วนตัว</small></span></label>' +
        '<button class="btn auth-submit" type="submit"' + (busy ? ' disabled aria-busy="true"' : '') + '>' + (busy ? '<span class="spin" aria-hidden="true"></span>กำลังตรวจสอบ…' : 'เข้าสู่ระบบ') + '</button>' +
        '<details class="auth-help"' + (ui.helpOpen ? ' open' : '') + '><summary>ยังไม่มี Token? ดูวิธีสร้าง (ทำครั้งเดียว)</summary>' +
          '<ol class="auth-steps">' + steps.map(function (st) { return '<li><b>' + st[0] + '</b><small>' + st[1] + '</small></li>'; }).join('') + '</ol>' +
          '<a class="btn ghost auth-gh" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">สร้าง Token บน GitHub ' + ICON.ext + '</a>' +
        '</details>' +
        '<a class="auth-back" href="./">← กลับหน้าเว็บ</a>' +
      '</form></main></div>';
  }

  function drawAuthContours() {
    var c = document.getElementById('auth-contours'); if (!c) return;
    var w = c.clientWidth, h = c.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = w * dpr; c.height = h * dpr;
    var g = c.getContext('2d'); g.scale(dpr, dpr); g.strokeStyle = 'rgba(255,255,255,.14)';
    var cx = w * 0.85, cy = h * 0.82;
    for (var k = 1; k <= 26; k++) {
      g.beginPath();
      for (var a = 0; a <= Math.PI * 2 + 0.01; a += 0.06) {
        var rr = k * 24 * (1 + 0.16 * Math.sin(a * 3 + k * 0.5) + 0.07 * Math.cos(a * 5 - k * 0.3));
        var x = cx + Math.cos(a) * rr * 1.4, y = cy + Math.sin(a) * rr;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  window.addEventListener('resize', drawAuthContours);
  fetch('data/site.json?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
    pub = d.settings; if (!STATE && document.getElementById('loginform') && !ui.loginBusy) render();
  }).catch(function () {});

  function tryLogin(t, manual) {
    token = t; ui.busy = true; ui.loginBusy = !!manual; ui.loginError = ''; render();
    return gh('GET', repoPath).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) { var e = new Error('no push'); e.status = 403; throw e; }
      if (!CFG.branch) CFG.branch = repo.default_branch;
      return loadData();
    }).then(function () { ui.busy = false; ui.loginBusy = false; ui.loginDraft = ''; render(); return true; }, function (err) {
      ui.busy = false; ui.loginBusy = false; logout();
      ui.loginError = err.status === 401 ? 'Token ไม่ถูกต้องหรือหมดอายุ ลองคัดลอกใหม่ให้ครบ หรือสร้าง Token ใหม่'
        : (err.status === 403 || err.status === 404) ? 'Token นี้ยังไม่มีสิทธิ์แก้ไข ' + CFG.owner + '/' + CFG.repo + ' ตรวจว่าเลือก Resource owner เป็น ' + CFG.owner + ' และเปิด Contents: Read and write แล้ว'
        : 'เชื่อมต่อ GitHub ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง';
      render(); var f = document.getElementById('tok'); if (f) f.focus();
      return false;
    });
  }

  // ---------- render ----------
  function page(body) {
    var s = S || { siteName: 'Brokers Land', tagline: 'ระบบผู้ดูแล' };
    var nav = '<a class="btn ghost sm" href="./" target="_blank" rel="noopener">ดูหน้าเว็บ</a>' + (token && STATE ? '<button class="btn ghost sm" data-logout>ออกจากระบบ</button>' : '');
    return '<div class="adminbar"><div class="wrap"><span>ระบบผู้ดูแล · บันทึกลง GitHub</span></div></div>' + B.header(s, nav, 'admin.html') + body;
  }

  function render() {
    if (token && ui.busy && !STATE && !ui.loginBusy) { app.innerHTML = page('<section class="wrap" style="padding-top:20px">' + B.skTable(5) + '</section>'); return; }
    if (!token || !STATE || ui.loginBusy) { document.body.classList.add('is-auth'); app.innerHTML = loginPage(ui.loginError); drawAuthContours(); return; }
    document.body.classList.remove('is-auth');
    var lv = ui.live || {};
    var body = '<section class="wrap">' +
      '<div id="live" class="note' + (lv.state === 'err' ? ' err' : '') + '" style="margin-top:16px"' + (lv.text ? '' : ' hidden') + '>' + esc(lv.text || '') + '</div>' +
      (ui.error ? '<div class="note err" style="margin-top:16px">' + esc(ui.error) + '</div>' : '') +
      '<div class="tabs"><button class="btn ghost" data-tab="lands" aria-pressed="' + (ui.tab === 'lands') + '">ประกาศที่ดิน</button>' +
      '<button class="btn ghost" data-tab="site" aria-pressed="' + (ui.tab === 'site') + '">ตั้งค่าเว็บไซต์</button>' +
      '<button class="btn ghost sm" data-reload data-tip="ดึงข้อมูลล่าสุดจาก GitHub (ถ้ามีคนแก้จากเครื่องอื่น)">โหลดข้อมูลล่าสุด</button></div>' +
      (ui.loading ? B.skTable(5) : ui.tab === 'site' ? siteForm() : (ui.edit ? landForm() : landTable())) + '</section>';
    app.innerHTML = page(body);
    if (ui.edit) updateCalc();
  }

  function opts(list, cur, all) { return '<option value="">' + all + '</option>' + list.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); }
  function statusOpts(cur) { return Object.keys(B.STATUS).map(function (k) { return '<option data-dot="' + k + '" value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + B.STATUS[k] + '</option>'; }).join(''); }

  function landTable() {
    var dis = ui.busy ? ' disabled' : '';
    var rows = STATE.lands.slice().sort(function (a, b) { return b.id - a.id; }).map(function (l) {
      return '<tr><td>' + B.cover(l) + '</td><td><b>' + esc(l.title) + '</b><br><small class="muted"><span class="num">' + B.code(l) + '</span> · ' + (l.images || []).length + ' รูป' + (l.featured ? ' · แนะนำ' : '') + (l.published ? '' : ' · ซ่อนอยู่') + (l.sample ? ' · ตัวอย่าง' : '') + '</small></td>' +
        '<td>' + esc([l.district, l.province].filter(Boolean).join(', ') || '-') + '</td><td class="num"><span class="has-tip" data-tip="' + esc(B.areaTip(l)) + '">' + esc(B.deedNotation(l)) + '</span></td><td>' + B.priceShort(l.price) + '</td>' +
        '<td><select data-status="' + l.id + '" aria-label="สถานะ" data-tip="เปลี่ยนสถานะแล้วบันทึกทันที"' + dis + '>' + statusOpts(l.status) + '</select>' +
        (l.status === 'sold' && l.soldDate ? '<small class="muted" style="display:block;margin-top:4px">ขายเมื่อ ' + esc(B.fmtDate(l.soldDate)) + '</small>' : '') + '</td>' +
        '<td><div class="acts"><a class="btn ghost sm" href="./#land-' + l.id + '" target="_blank" rel="noopener" data-tip="เปิดหน้าประกาศแบบที่ลูกค้าเห็น">ดู</a><button class="btn sm" data-edit="' + l.id + '"' + dis + '>แก้ไข</button><button class="btn danger sm" data-del="' + l.id + '" data-tip="กดสองครั้งเพื่อยืนยันการลบ"' + dis + '>ลบ</button></div></td></tr>';
    }).join('');
    return (ui.busy ? '<div class="note">กำลังบันทึกลง GitHub…</div>' : '') +
      '<div style="margin-bottom:14px"><button class="btn" data-edit="new"' + dis + '>+ เพิ่มประกาศที่ดิน</button></div>' +
      '<div class="tablewrap"><table class="list"><thead><tr><th></th><th>ประกาศ</th><th>ที่ตั้ง</th><th>ไร่-งาน-ตร.ว.</th><th>ราคา</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7" class="muted" style="text-align:center;padding:32px">ยังไม่มีประกาศ กด "เพิ่มประกาศที่ดิน" เพื่อเริ่ม</td></tr>') + '</tbody></table></div>' +
      '<p class="muted" style="font-size:.9rem;padding-bottom:40px">ทุกการบันทึกจะเก็บลง GitHub และหน้าเว็บจะอัปเดตภายใน 1–2 นาที</p>';
  }

  function blankLand() { return { id: null, title: '', type: '', deed: '', province: '', district: '', subdistrict: '', address: '', rai: 0, ngan: 0, wa: 0, price: 0, road: '', utilities: '', desc: '', lat: '', lng: '', status: 'available', featured: false, published: true, images: [], listed: today(), soldDate: '' }; }
  function field(id, label, v, extra) { return '<label for="' + id + '"><span class="lbl">' + label + '</span><input id="' + id + '" value="' + esc(v == null ? '' : v) + '" ' + (extra || '') + '></label>'; }
  function sel(id, label, list, cur) { return '<label for="' + id + '"><span class="lbl">' + label + '</span><select id="' + id + '">' + opts(list, cur, '- เลือก -') + '</select></label>'; }

  function landForm() {
    var d = ui.draft;
    var imgs = d.images.map(function (img, i) {
      return '<figure><img src="' + esc(B.imgSrc(img)) + '" alt="">' + (i === 0 ? '<span class="cover">รูปปก</span>' : '') + '<figcaption>' +
        (i ? '<button type="button" class="btn ghost sm" data-cover="' + i + '" data-tip="ใช้รูปนี้เป็นรูปแรกบนการ์ดประกาศ">ตั้งเป็นปก</button>' : '') + '<button type="button" class="btn danger sm" data-rmimg="' + i + '">ลบ</button></figcaption></figure>';
    }).join('');
    var mapPreview = B.hasCoords(d) ? '<iframe class="map" loading="lazy" title="ตัวอย่างแผนที่" src="https://maps.google.com/maps?q=' + n(d.lat).toFixed(6) + ',' + n(d.lng).toFixed(6) + '&z=15&output=embed"></iframe>' : '';
    return '<form class="formgrid" id="landform"><div class="form">' +
      '<div class="panel form"><h2>' + (d.id ? 'แก้ไขประกาศ <span class="num muted">' + B.code(d) + '</span>' : 'เพิ่มประกาศที่ดิน') + '</h2>' +
      field('l-title', 'ชื่อประกาศ *', d.title, 'required maxlength="200" placeholder="เช่น ที่ดินเปล่าติดถนนใหญ่ ใกล้ตัวเมือง"') +
      '<div class="cols two">' + sel('l-type', 'ประเภทที่ดิน', B.TYPES, d.type) + sel('l-deed', 'เอกสารสิทธิ์', B.DEEDS, d.deed) + '</div></div>' +
      '<div class="panel form"><h2>ขนาดและราคา</h2><div class="cols">' +
      field('l-rai', 'ไร่', d.rai, 'type="number" min="0" step="1" data-calc') +
      field('l-ngan', 'งาน (0–3)' + B.info('1 งาน = 100 ตารางวา · 4 งาน = 1 ไร่') + '', d.ngan, 'type="number" min="0" max="3" step="1" data-calc') +
      field('l-wa', 'ตารางวา (0–99)' + B.info('ใส่เศษที่ไม่ถึง 1 งาน เช่น 50 หรือ 30.5 ถ้าเกิน 100 ให้ปัดขึ้นเป็นงาน') + '', d.wa, 'type="number" min="0" max="99.99" step="0.01" data-calc') + '</div>' +
      field('l-price', 'ราคาขายรวม (บาท)' + B.info('ราคาทั้งแปลง ระบบคำนวณราคาต่อตารางวาและต่อไร่ให้เอง') + '', d.price || '', 'type="number" min="0" step="1" placeholder="เว้นว่าง = สอบถามราคา" data-calc') +
      '<div class="calc" id="calc" aria-live="polite"></div></div>' +
      '<div class="panel form"><h2>ที่ตั้ง</h2><div class="cols">' +
      field('l-province', 'จังหวัด', d.province) + field('l-district', 'อำเภอ/เขต', d.district) + field('l-subdistrict', 'ตำบล/แขวง', d.subdistrict) + '</div>' +
      field('l-address', 'ถนน / ซอย / จุดสังเกต', d.address) +
      '<label for="l-gmaps"><span class="lbl">พิกัดจาก Google Maps' + B.info('ใน Google Maps กดค้างที่ตำแหน่งที่ดิน แล้วคัดลอกตัวเลขพิกัดหรือแชร์ลิงก์มาวาง') + '</span><span class="hint">วางลิงก์ Google Maps หรือพิกัดแบบ 13.7563, 100.5018 แล้วระบบจะแยกละติจูด/ลองจิจูดให้</span><input id="l-gmaps" placeholder="วางลิงก์หรือพิกัดที่นี่"></label>' +
      '<div class="cols two">' + field('l-lat', 'ละติจูด', d.lat, 'type="number" step="any"') + field('l-lng', 'ลองจิจูด', d.lng, 'type="number" step="any"') + '</div>' +
      '<div id="mappreview">' + mapPreview + '</div></div>' +
      '<div class="panel form"><h2>รายละเอียดเพิ่มเติม</h2>' +
      field('l-road', 'ทางเข้า-ออก / หน้ากว้าง', d.road, 'placeholder="เช่น ติดถนนลาดยาง หน้ากว้าง 40 ม."') +
      field('l-utilities', 'สาธารณูปโภค', d.utilities, 'placeholder="เช่น ไฟฟ้า, ประปา"') +
      '<label for="l-desc">คำอธิบาย<textarea id="l-desc" rows="6">' + esc(d.desc) + '</textarea></label></div>' +
      '<div class="panel form"><h2>รูปภาพ</h2><label for="l-files">เพิ่มรูป<span class="hint">ระบบย่อรูปให้อัตโนมัติ รูปแรกคือรูปปก</span><input id="l-files" type="file" accept="image/*" multiple></label>' +
      (imgs ? '<div class="imgs">' + imgs + '</div>' : '<p class="muted" style="margin:0">ยังไม่มีรูป หน้าเว็บจะแสดงผังแปลงแทน</p>') + '</div>' +
      '</div><div><div class="panel form contact"><h2>การเผยแพร่</h2>' +
      '<label for="l-status">สถานะ<select id="l-status">' + statusOpts(d.status) + '</select></label>' +
      '<label for="l-listed"><span class="lbl">วันที่ลงประกาศ</span><input type="hidden" id="l-listed" value="' + esc(d.listed || d.updated || '') + '" data-datepicker data-label="วันที่ลงประกาศ"></label>' +
      '<label for="l-soldDate" id="sold-wrap"' + (d.status === 'sold' ? '' : ' hidden') + '><span class="lbl">วันที่ขายได้' + B.info('ใส่อัตโนมัติเป็นวันนี้เมื่อเปลี่ยนสถานะเป็นขายแล้ว แก้ได้') + '</span><input type="hidden" id="l-soldDate" value="' + esc(d.soldDate || '') + '" data-datepicker data-clearable data-label="วันที่ขายได้" data-placeholder="ยังไม่ระบุ"></label>' +
      '<label class="check"><input type="checkbox" id="l-published"' + (d.published ? ' checked' : '') + '> แสดงบนหน้าเว็บ' + B.info('เอาติ๊กออกเพื่อซ่อนประกาศจากลูกค้า แต่ยังเก็บไว้ในหน้านี้') + '</label>' +
      '<label class="check"><input type="checkbox" id="l-featured"' + (d.featured ? ' checked' : '') + '> ประกาศแนะนำ' + B.info('ขึ้นก่อนประกาศอื่นและมีป้าย แนะนำ บนการ์ด') + '</label>' +
      '<button class="btn" type="submit"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy ? 'กำลังบันทึก…' : 'บันทึกและเผยแพร่') + '</button>' +
      '<button class="btn ghost" type="button" data-cancel' + (ui.busy ? ' disabled' : '') + '>ยกเลิก</button></div></div></form>';
  }

  function siteForm() {
    return '<form class="formgrid" id="siteform"><div class="form">' +
      '<div class="panel form"><h2>ข้อมูลเว็บไซต์</h2>' +
      field('s-siteName', 'ชื่อเว็บไซต์ / ชื่อบริษัท', S.siteName, 'required maxlength="80"') + field('s-tagline', 'สโลแกน', S.tagline, 'maxlength="120"') +
      field('s-heroTitle', 'หัวข้อใหญ่หน้าแรก', S.heroTitle, 'maxlength="120"') +
      '<label for="s-heroSub">ข้อความใต้หัวข้อ<textarea id="s-heroSub" rows="3">' + esc(S.heroSub) + '</textarea></label>' +
      '<label for="s-about">เกี่ยวกับเรา (ท้ายเว็บ)<textarea id="s-about" rows="3">' + esc(S.about) + '</textarea></label></div>' +
      '<div class="panel form"><h2>ช่องทางติดต่อ</h2><div class="cols two">' +
      field('s-phone', 'เบอร์โทร', S.phone) + field('s-line', 'LINE ID', S.line, 'placeholder="@yourline"') +
      field('s-email', 'อีเมล', S.email, 'type="email"') + field('s-facebook', 'ลิงก์ Facebook', S.facebook, 'type="url" placeholder="https://facebook.com/..."') + '</div>' +
      field('s-formUrl', 'ลิงก์ฟอร์มสอบถาม (ถ้ามี เช่น Google Form)' + B.info('ลูกค้ากดปุ่ม กรอกฟอร์มสอบถาม แล้วคำตอบจะไปอยู่ใน Google Sheets ของคุณแบบส่วนตัว') + '', S.formUrl, 'type="url" placeholder="https://forms.gle/..."') +
      field('s-address', 'ที่อยู่สำนักงาน', S.address) + '</div></div>' +
      '<div><div class="panel form contact"><h2>การแสดงผล</h2>' +
      '<label class="check"><input type="checkbox" id="s-showPrice"' + (S.showPrice !== false ? ' checked' : '') + '> แสดงราคาบนหน้าเว็บ</label>' +
      '<span class="hint muted" style="font-size:.85rem">ถ้าไม่เลือก ทุกประกาศจะแสดง "สอบถามราคา"</span>' +
      '<button class="btn" type="submit"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า') + '</button></div></div></form>';
  }

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function readDraft() {
    var d = ui.draft; if (!d || !document.getElementById('l-title')) return;
    d.title = val('l-title').slice(0, 200); d.type = val('l-type'); d.deed = val('l-deed');
    d.rai = Math.max(0, Math.floor(n(val('l-rai')))); d.ngan = Math.min(3, Math.max(0, Math.floor(n(val('l-ngan'))))); d.wa = Math.min(99.99, Math.max(0, n(val('l-wa'))));
    d.price = Math.max(0, n(val('l-price')));
    d.province = val('l-province'); d.district = val('l-district'); d.subdistrict = val('l-subdistrict'); d.address = val('l-address');
    var la = val('l-lat'), lo = val('l-lng');
    d.lat = la === '' ? '' : n(la); d.lng = lo === '' ? '' : n(lo);
    d.road = val('l-road'); d.utilities = val('l-utilities');
    d.desc = document.getElementById('l-desc').value.slice(0, 8000);
    d.status = B.STATUS[val('l-status')] ? val('l-status') : 'available';
    d.listed = val('l-listed'); d.soldDate = val('l-soldDate');
    if (d.status === 'sold' && !d.soldDate) d.soldDate = today();
    d.published = document.getElementById('l-published').checked; d.featured = document.getElementById('l-featured').checked;
  }
  function updateCalc() {
    var c = document.getElementById('calc'); if (!c) return;
    var l = { rai: n(val('l-rai')), ngan: n(val('l-ngan')), wa: n(val('l-wa')), price: n(val('l-price')) };
    var w = B.totalWa(l), s = 'รวม ' + fmt(w, 2) + ' ตร.ว. (' + fmt(w * 4, 2) + ' ตร.ม. หรือ ' + fmt(w / 400, 2) + ' ไร่)';
    if (w && l.price) s += ' · เฉลี่ย ' + fmt(l.price / w) + ' บ./ตร.ว. · ' + fmt(l.price / w * 400) + ' บ./ไร่';
    c.textContent = s;
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        var name = 'uploads/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
        resolve({ path: name, data: cv.toDataURL('image/jpeg', 0.8) });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('อ่านรูปไม่ได้')); };
      img.src = url;
    });
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function cloneState() { return JSON.parse(JSON.stringify(STATE)); }
  function findLand(id) { for (var i = 0; i < STATE.lands.length; i++) if (STATE.lands[i].id === id) return STATE.lands[i]; return null; }

  // ---------- events ----------
  app.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = e.target.id;
    if (id === 'loginform') {
      var t = val('tok'), remember = document.getElementById('remember').checked;
      ui.loginDraft = t; ui.loginRemember = remember;
      var hd = document.querySelector('.auth-help'); ui.helpOpen = !!(hd && hd.open);
      if (!t) { ui.loginError = 'กรุณาวาง GitHub Token ก่อนกดเข้าสู่ระบบ'; render(); document.getElementById('tok').focus(); return; }
      if (!/^(github_pat_|ghp_|gho_|ghu_)[A-Za-z0-9_]{20,}$/.test(t)) { ui.loginError = 'รูปแบบ Token ไม่ถูกต้อง Token ของ GitHub ขึ้นต้นด้วย github_pat_ ลองคัดลอกใหม่ให้ครบ'; render(); document.getElementById('tok').focus(); return; }
      tryLogin(t, true).then(function (ok) { if (ok) setToken(t, remember); });
    } else if (id === 'landform') {
      readDraft(); var d = ui.draft;
      if (!d.title) { ui.error = 'กรุณากรอกชื่อประกาศ'; render(); return; }
      var next = cloneState(), item = JSON.parse(JSON.stringify(d));
      item.updated = today(); delete item.sample;
      var isNew = !item.id;
      if (isNew) { item.id = next.nextId++; next.lands.push(item); }
      else next.lands = next.lands.map(function (x) { return x.id === item.id ? item : x; });
      save(next, 'บันทึกประกาศแล้ว', (isNew ? 'Add listing ' : 'Update listing ') + B.code(item));
    } else if (id === 'siteform') {
      var next2 = cloneState(), s = next2.settings;
      ['siteName', 'tagline', 'heroTitle', 'phone', 'line', 'email', 'facebook', 'formUrl', 'address'].forEach(function (k) { s[k] = val('s-' + k).slice(0, 300); });
      s.heroSub = document.getElementById('s-heroSub').value.trim().slice(0, 600);
      s.about = document.getElementById('s-about').value.trim().slice(0, 1500);
      s.showPrice = document.getElementById('s-showPrice').checked;
      if (!B.safeHttps(s.facebook)) s.facebook = '';
      if (!B.safeHttps(s.formUrl)) s.formUrl = '';
      if (!s.siteName) s.siteName = 'Brokers Land';
      save(next2, 'บันทึกการตั้งค่าแล้ว', 'Update site settings');
    }
  });

  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.status) {
      var next = cloneState(), lid = Number(t.dataset.status);
      next.lands.forEach(function (l) { if (l.id === lid) { l.status = t.value; l.updated = today(); if (t.value === 'sold' && !l.soldDate) l.soldDate = today(); } });
      save(next, 'เปลี่ยนสถานะแล้ว', 'Set ' + B.code({ id: lid }) + ' status to ' + t.value);
    } else if (t.id === 'l-files' && t.files && t.files.length) {
      readDraft();
      var files = Array.prototype.slice.call(t.files).filter(function (f) { return /^image\//.test(f.type); });
      Promise.all(files.map(shrink)).then(function (list) { ui.draft.images = ui.draft.images.concat(list); render(); },
        function () { ui.error = 'มีรูปที่อ่านไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG'; render(); });
    } else if (t.id === 'l-status') {
      var sw = document.getElementById('sold-wrap'), sd = document.getElementById('l-soldDate');
      if (sw) sw.hidden = t.value !== 'sold';
      if (t.value === 'sold' && sd && !sd.value) { sd.value = today(); window.UI.syncDate(sd); }
    } else if (t.id === 'l-lat' || t.id === 'l-lng') {
      readDraft(); var mp = document.getElementById('mappreview'); if (mp) { var d = ui.draft; mp.innerHTML = B.hasCoords(d) ? '<iframe class="map" loading="lazy" title="ตัวอย่างแผนที่" src="https://maps.google.com/maps?q=' + n(d.lat).toFixed(6) + ',' + n(d.lng).toFixed(6) + '&z=15&output=embed"></iframe>' : ''; }
    }
  });

  app.addEventListener('input', function (e) {
    if (e.target.hasAttribute('data-calc')) updateCalc();
    if (e.target.id === 'l-gmaps') {
      var v = e.target.value, m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(v) || /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(v) || /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(v);
      if (m) {
        document.getElementById('l-lat').value = Number(m[1]).toFixed(6); document.getElementById('l-lng').value = Number(m[2]).toFixed(6);
        document.getElementById('l-lat').dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.hasAttribute('data-eye')) {
      var inp = document.getElementById('tok'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.innerHTML = show ? ICON.eyeOff : ICON.eye; b.setAttribute('aria-label', show ? 'ซ่อน Token' : 'แสดง Token'); inp.focus(); return;
    }
    if (b.hasAttribute('data-logout')) { logout(); STATE = null; ui.loginError = ''; render(); return; }
    if (b.hasAttribute('data-reload')) { ui.error = ''; ui.loading = true; ui.edit = false; render(); loadData().then(function () { ui.loading = false; render(); B.toast('โหลดข้อมูลล่าสุดแล้ว'); }, function (er) { ui.loading = false; ui.error = 'โหลดข้อมูลไม่สำเร็จ: ' + er.message; render(); }); return; }
    if (b.dataset.tab) { ui.tab = b.dataset.tab; ui.edit = false; ui.error = ''; render(); return; }
    if (b.dataset.edit) {
      ui.edit = true; ui.error = '';
      ui.draft = b.dataset.edit === 'new' ? blankLand() : JSON.parse(JSON.stringify(findLand(Number(b.dataset.edit))));
      render(); window.scrollTo(0, 0); return;
    }
    if (b.hasAttribute('data-cancel')) { ui.edit = false; ui.draft = null; ui.error = ''; render(); return; }
    if (b.dataset.del) {
      if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'ยืนยันลบ'; setTimeout(function () { if (b.isConnected) { b.classList.remove('armed'); b.textContent = 'ลบ'; } }, 4000); return; }
      var id = Number(b.dataset.del), next = cloneState();
      next.lands = next.lands.filter(function (l) { return l.id !== id; });
      save(next, 'ลบประกาศแล้ว', 'Delete listing ' + B.code({ id: id })); return;
    }
    if (b.dataset.cover) { readDraft(); var im = ui.draft.images.splice(Number(b.dataset.cover), 1)[0]; ui.draft.images.unshift(im); render(); return; }
    if (b.dataset.rmimg) { readDraft(); ui.draft.images.splice(Number(b.dataset.rmimg), 1); render(); return; }
  });

  // ---------- start ----------
  token = getToken();
  if (token) tryLogin(token); else render();
})();
