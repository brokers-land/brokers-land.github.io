/* หน้าเว็บสำหรับผู้เข้าชม */
(function () {
  'use strict';
  var B = window.BL, esc = B.esc, n = B.n, fmt = B.fmt;
  var app = document.getElementById('app');
  var STATE = null, S = null;
  var ui = { q: '', province: '', type: '', status: '', minP: '', maxP: '', minR: '', maxR: '', sort: 'new' };

  function visible() { return STATE.lands.filter(function (l) { return l.published; }); }
  function provinces() { var s = {}; visible().forEach(function (l) { if (l.province) s[l.province] = 1; }); return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'th'); }); }
  function opts(list, cur, all) { return '<option value="">' + all + '</option>' + list.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); }

  function filtered() {
    var q = ui.q.trim().toLowerCase();
    var list = visible().filter(function (l) {
      if (q && [l.title, l.province, l.district, l.subdistrict, l.address, l.desc, l.type].join(' ').toLowerCase().indexOf(q) < 0) return false;
      if (ui.province && l.province !== ui.province) return false;
      if (ui.type && l.type !== ui.type) return false;
      if (ui.status && l.status !== ui.status) return false;
      if (n(ui.minP) && n(l.price) < n(ui.minP) * 1e6) return false;
      if (n(ui.maxP) && n(l.price) > n(ui.maxP) * 1e6) return false;
      if (n(ui.minR) && B.totalWa(l) < n(ui.minR) * 400) return false;
      if (n(ui.maxR) && B.totalWa(l) > n(ui.maxR) * 400) return false;
      return true;
    });
    var order = { available: 0, reserved: 1, sold: 2 };
    var sorts = {
      'new': function (a, b) { return (b.featured - a.featured) || (order[a.status] - order[b.status]) || (b.id - a.id); },
      'p-asc': function (a, b) { return (n(a.price) || Infinity) - (n(b.price) || Infinity); },
      'p-desc': function (a, b) { return n(b.price) - n(a.price); },
      'a-desc': function (a, b) { return B.totalWa(b) - B.totalWa(a); },
      'a-asc': function (a, b) { return B.totalWa(a) - B.totalWa(b); }
    };
    return list.sort(sorts[ui.sort] || sorts['new']);
  }

  function route() {
    var m = /^#land-(\d+)$/.exec(location.hash);
    return m ? { view: 'land', id: Number(m[1]) } : { view: 'home' };
  }

  function render() {
    var r = route();
    var nav = '<a class="btn ghost sm" href="#">ประกาศทั้งหมด</a>' + (S.phone ? '<a class="btn sm num" href="tel:' + esc(String(S.phone).replace(/[^0-9+]/g, '')) + '" data-tip="กดเพื่อโทรหาเรา">โทร ' + esc(S.phone) + '</a>' : '');
    document.title = (r.view === 'land' && findLand(r.id) ? findLand(r.id).title + ' | ' : '') + S.siteName;
    app.innerHTML = B.header(S, nav) + (r.view === 'land' ? landPage(r.id) : homePage()) + B.footer(S);
    if (r.view === 'home') drawContours();
  }

  function findLand(id) { for (var i = 0; i < STATE.lands.length; i++) if (STATE.lands[i].id === id && STATE.lands[i].published) return STATE.lands[i]; return null; }

  function homePage() {
    var all = visible(), avail = all.filter(function (l) { return l.status === 'available'; }).length;
    return '<section class="hero"><canvas id="contours" aria-hidden="true"></canvas><div class="wrap">' +
      '<h1>' + esc(S.heroTitle) + '</h1><p>' + esc(S.heroSub) + '</p>' +
      '<form class="search" id="search" role="search">' +
      '<input id="f-q" type="search" placeholder="ค้นหา เช่น ติดถนน, อำเภอ, ตำบล" value="' + esc(ui.q) + '" aria-label="คำค้นหา">' +
      '<select id="f-province" aria-label="จังหวัด">' + opts(provinces(), ui.province, 'ทุกจังหวัด') + '</select>' +
      '<select id="f-type" aria-label="ประเภทที่ดิน">' + opts(B.TYPES, ui.type, 'ทุกประเภท') + '</select>' +
      '<button class="btn" type="submit">ค้นหาที่ดิน</button></form>' +
      '<div class="stats"><div><b class="num">' + all.length + '</b><span>ประกาศทั้งหมด</span></div><div><b class="num">' + avail + '</b><span>พร้อมขาย</span></div><div><b class="num">' + provinces().length + '</b><span>จังหวัด</span></div></div>' +
      '</div></section><section class="wrap" id="results">' + resultsHtml() + '</section>';
  }

  function resultsHtml() {
    var list = filtered();
    var bar = '<div class="bar">' +
      '<label>สถานะ <select id="f-status"><option value="">ทั้งหมด</option>' + Object.keys(B.STATUS).map(function (k) { return '<option data-dot="' + k + '" value="' + k + '"' + (ui.status === k ? ' selected' : '') + '>' + B.STATUS[k] + '</option>'; }).join('') + '</select></label>' +
      '<label>ราคา (ล้าน) <input id="f-minP" type="number" min="0" step="0.1" placeholder="ต่ำสุด" value="' + esc(ui.minP) + '"> – <input id="f-maxP" type="number" min="0" step="0.1" placeholder="สูงสุด" value="' + esc(ui.maxP) + '"></label>' +
      '<label>ขนาด (ไร่) <input id="f-minR" type="number" min="0" step="0.25" placeholder="ต่ำสุด" value="' + esc(ui.minR) + '"> – <input id="f-maxR" type="number" min="0" step="0.25" placeholder="สูงสุด" value="' + esc(ui.maxR) + '"></label>' +
      '<label>เรียง <select id="f-sort">' + [['new', 'แนะนำ/ล่าสุด'], ['p-asc', 'ราคาต่ำ → สูง'], ['p-desc', 'ราคาสูง → ต่ำ'], ['a-desc', 'ขนาดใหญ่ → เล็ก'], ['a-asc', 'ขนาดเล็ก → ใหญ่']].map(function (o) { return '<option value="' + o[0] + '"' + (ui.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<span class="count">พบ <span class="num">' + list.length + '</span> ประกาศ</span></div>';
    var cards = list.length ? list.map(function (l) { return B.card(l, S); }).join('') : '<div class="empty">ไม่พบที่ดินตามเงื่อนไขที่ค้นหา</div>';
    return bar + '<div class="grid">' + cards + '</div>';
  }

  function contactRow(label, value) {
    return '<div class="row"><div><small>' + label + '</small><b>' + esc(value) + '</b></div><button class="btn ghost sm" data-copy="' + esc(value) + '" data-tip="คัดลอก' + esc(label) + 'ไปวางในแอปอื่น">คัดลอก</button></div>';
  }

  function landPage(id) {
    var l = findLand(id);
    if (!l) return '<section class="wrap"><div class="empty" style="margin-block:40px">ไม่พบประกาศนี้ <a href="#">กลับหน้าแรก</a></div></section>';
    var imgs = (l.images || []).map(B.imgSrc).filter(Boolean);
    var pw = B.perWa(l), w = B.totalWa(l), show = S.showPrice !== false;
    var gal = '<div class="gal-main" id="gal-main">' + (imgs.length ? '<img src="' + esc(imgs[0]) + '" alt="' + esc(l.title) + '">' : B.plotSvg(l)) + '</div>';
    if (imgs.length > 1) gal += '<div class="gal-thumbs">' + imgs.map(function (s, i) { return '<button type="button" data-gal="' + esc(s) + '" aria-current="' + (i === 0) + '" aria-label="รูปที่ ' + (i + 1) + '"><img src="' + esc(s) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>';
    var listed = l.listed || l.updated;
    var rows = [['รหัสประกาศ', B.code(l)], ['ประเภทที่ดิน', l.type], ['เอกสารสิทธิ์', l.deed, B.DEED_TIP[l.deed]], ['จังหวัด', l.province], ['อำเภอ/เขต', l.district], ['ตำบล/แขวง', l.subdistrict], ['ที่ตั้ง/ถนน', l.address], ['ทางเข้า-ออก', l.road], ['สาธารณูปโภค', l.utilities], ['ลงประกาศเมื่อ', listed ? B.fmtDate(listed, true) : '']]
      .filter(function (r, i) { return i < 6 || r[1]; })
      .map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + esc(r[1] || '-') + (r[2] ? B.info(r[2]) : '') + '</td></tr>'; }).join('');
    var map = '';
    if (B.hasCoords(l)) {
      var ll = n(l.lat).toFixed(6) + ',' + n(l.lng).toFixed(6);
      map = '<div class="panel"><h2>แผนที่ตั้ง</h2><iframe class="map" loading="lazy" title="แผนที่" src="https://maps.google.com/maps?q=' + ll + '&z=15&output=embed"></iframe>' +
        '<a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + ll + '">เปิดใน Google Maps</a></div>';
    }
    var contact = '<aside class="panel contact"><h2>สนใจที่ดินแปลงนี้</h2><p class="muted" style="margin:0 0 4px">แจ้งรหัส <b class="num">' + B.code(l) + '</b> เมื่อติดต่อ</p>' +
      (S.phone ? contactRow('โทรศัพท์', S.phone) : '') + (S.line ? contactRow('LINE', S.line) : '') + (S.email ? contactRow('อีเมล', S.email) : '') +
      (S.phone ? '<a class="btn block" href="tel:' + esc(String(S.phone).replace(/[^0-9+]/g, '')) + '">โทรหาเรา</a>' : '') +
      (S.line ? '<a class="btn ghost block" target="_blank" rel="noopener" href="https://line.me/R/ti/p/' + encodeURIComponent(S.line) + '">เพิ่มเพื่อนทาง LINE</a>' : '') +
      (B.safeHttps(S.facebook) ? '<a class="btn ghost block" target="_blank" rel="noopener" href="' + esc(S.facebook) + '">ทักทาง Facebook</a>' : '') +
      (B.safeHttps(S.formUrl) ? '<a class="btn ghost block" target="_blank" rel="noopener" href="' + esc(S.formUrl) + '">กรอกฟอร์มสอบถาม</a>' : '') +
      '</aside>';
    var related = visible().filter(function (x) { return x.id !== l.id && x.province === l.province && x.status !== 'sold'; }).slice(0, 3);
    return '<section class="wrap"><nav class="crumbs"><a href="#">ประกาศทั้งหมด</a>' + (l.province ? ' / ' + esc(l.province) : '') + ' / <span class="num">' + B.code(l) + '</span></nav>' +
      '<div class="dhead"><div><span class="chip static ' + esc(l.status) + '" data-tip="' + esc(B.STATUS_TIP[l.status] || '') + '">' + (B.STATUS[l.status] || '') + '</span>' + (l.sample ? ' <span class="muted">· ประกาศตัวอย่าง</span>' : '') +
      '<h1>' + esc(l.title) + '</h1><div class="muted">' + esc(B.locText(l) || '-') + (l.address ? ' · ' + esc(l.address) : '') + '</div></div>' +
      '<div class="dprice">' + (show ? '<b>' + (n(l.price) ? fmt(l.price) + ' บาท' : 'สอบถามราคา') + '</b>' + (pw ? '<small class="num has-tip" data-tip="' + esc(B.perWaTip(l)) + '">' + fmt(pw) + ' บ./ตร.ว. · ' + fmt(pw * 400) + ' บ./ไร่</small>' : '') : '<b>สอบถามราคา</b>') + '</div></div>' +
      '<div class="dgrid"><div>' + gal +
      '<div class="panel" style="margin-top:20px"><h2>ขนาดที่ดิน' + B.info('1 ไร่ = 4 งาน = 400 ตารางวา · 1 งาน = 100 ตารางวา · 1 ตารางวา = 4 ตารางเมตร') + '</h2><div class="area">' +
      '<div data-tip="1 ไร่ = 400 ตร.ว. = 1,600 ตร.ม."><b>' + fmt(l.rai) + '</b><span>ไร่</span></div><div data-tip="1 งาน = 100 ตร.ว. = 400 ตร.ม."><b>' + fmt(l.ngan) + '</b><span>งาน</span></div><div data-tip="1 ตารางวา = 4 ตร.ม. (2 × 2 เมตร)"><b>' + fmt(l.wa, 2) + '</b><span>ตารางวา</span></div>' +
      '<div data-tip="' + esc(B.areaTip(l)) + '"><b>' + fmt(w, 2) + '</b><span>ตร.ว. รวม · ' + fmt(w * 4, 2) + ' ตร.ม.</span></div></div><table class="spec">' + rows + '</table></div>' +
      (l.desc ? '<div class="panel"><h2>รายละเอียด</h2><div class="desc">' + esc(l.desc) + '</div></div>' : '') + map +
      '</div>' + contact + '</div>' +
      (related.length ? '<h2 style="margin-bottom:14px">ที่ดินอื่นใน' + esc(l.province) + '</h2><div class="grid">' + related.map(function (x) { return B.card(x, S); }).join('') + '</div>' : '') +
      '</section>';
  }

  function drawContours() {
    var c = document.getElementById('contours'); if (!c) return;
    var w = c.clientWidth, h = c.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = w * dpr; c.height = h * dpr;
    var g = c.getContext('2d'); g.scale(dpr, dpr);
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--contour') || 'rgba(255,255,255,.13)';
    var cx = w * 0.82, cy = h * 0.35;
    for (var k = 1; k <= 22; k++) {
      g.beginPath();
      for (var a = 0; a <= Math.PI * 2 + 0.01; a += 0.06) {
        var rr = k * 26 * (1 + 0.18 * Math.sin(a * 3 + k * 0.4) + 0.08 * Math.cos(a * 5 - k * 0.3));
        var x = cx + Math.cos(a) * rr * 1.5, y = cy + Math.sin(a) * rr;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function refreshResults() { var r = document.getElementById('results'); if (r) r.innerHTML = resultsHtml(); }

  app.addEventListener('submit', function (e) {
    if (e.target.id !== 'search') return;
    e.preventDefault();
    ui.q = val('f-q'); ui.province = val('f-province'); ui.type = val('f-type');
    refreshResults(); document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
  });
  app.addEventListener('change', function (e) {
    var map = { 'f-status': 'status', 'f-minP': 'minP', 'f-maxP': 'maxP', 'f-minR': 'minR', 'f-maxR': 'maxR', 'f-sort': 'sort', 'f-province': 'province', 'f-type': 'type' };
    if (map[e.target.id]) { ui[map[e.target.id]] = e.target.value; refreshResults(); }
  });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.gal) {
      var gm = document.getElementById('gal-main'); gm.innerHTML = '<img src="' + esc(b.dataset.gal) + '" alt="">'; window.UI && window.UI.enhance(gm);
      Array.prototype.forEach.call(document.querySelectorAll('.gal-thumbs button'), function (x) { x.setAttribute('aria-current', String(x === b)); });
    } else if (b.dataset.copy) {
      var done = function () { b.textContent = 'คัดลอกแล้ว'; setTimeout(function () { b.textContent = 'คัดลอก'; }, 1500); };
      var fallback = function () { var r = document.createRange(); r.selectNodeContents(b.parentNode.querySelector('b')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      try { navigator.clipboard.writeText(b.dataset.copy).then(done, fallback); } catch (er) { fallback(); }
    }
  });
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });
  window.addEventListener('resize', function () { if (route().view === 'home') drawContours(); });

  // โหลดข้อมูลล่าสุด และโหลดใหม่ทุกครั้งที่กลับมาดูหน้านี้ (ราคา/สถานะที่ admin แก้จะขึ้นทันที)
  var lastJson = '', loading = false;
  function load(first) {
    if (loading) return; loading = true;
    fetch('data/site.json?v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (text) {
        loading = false;
        if (text === lastJson) return;
        var data = JSON.parse(text);
        lastJson = text; STATE = data; S = data.settings;
        if (first) { render(); return; }
        var y = window.scrollY, r = document.getElementById('results');
        if (route().view === 'home' && r) r.innerHTML = resultsHtml(); else render();
        window.scrollTo(0, y);
      })
      .catch(function () { loading = false; if (first) app.innerHTML = '<div class="loading">โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง</div>'; });
  }
  app.innerHTML = B.skHome();
  load(true);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && STATE) load(false); });
  window.addEventListener('pageshow', function (e) { if (e.persisted && STATE) load(false); });
  window.addEventListener('focus', function () { if (STATE) load(false); });
  setInterval(function () { if (STATE && document.visibilityState === 'visible') load(false); }, 60000);
})();
