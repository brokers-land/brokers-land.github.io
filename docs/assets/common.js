/* ฟังก์ชันที่ใช้ร่วมกันระหว่างหน้าเว็บและหน้า admin */
(function () {
  'use strict';
  var STATUS = { available: 'พร้อมขาย', reserved: 'ติดจอง', sold: 'ขายแล้ว' };
  var TYPES = ['ที่ดินเปล่า', 'ที่อยู่อาศัย', 'สวน/เกษตร', 'นา/ไร่', 'พาณิชยกรรม', 'อุตสาหกรรม', 'ริมน้ำ/ชายทะเล', 'อื่น ๆ'];
  var DEEDS = ['โฉนด (น.ส.4จ.)', 'น.ส.3ก.', 'น.ส.3', 'ส.ป.ก. 4-01', 'ภ.บ.ท.5', 'อื่น ๆ'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function fmt(v, d) { return n(v).toLocaleString('th-TH', { maximumFractionDigits: d || 0 }); }
  // 1 ไร่ = 4 งาน = 400 ตารางวา, 1 ตารางวา = 4 ตารางเมตร
  function totalWa(l) { return n(l.rai) * 400 + n(l.ngan) * 100 + n(l.wa); }
  function deedNotation(l) { return fmt(l.rai) + '-' + fmt(l.ngan) + '-' + fmt(l.wa, 2); }
  function priceShort(v) { v = n(v); if (!v) return 'สอบถามราคา'; return v >= 1e6 ? fmt(v / 1e6, 2) + ' ล้านบาท' : fmt(v) + ' บาท'; }
  function perWa(l) { var w = totalWa(l); return w && n(l.price) ? n(l.price) / w : 0; }
  function locText(l) { return [l.subdistrict && 'ต.' + l.subdistrict, l.district && 'อ.' + l.district, l.province && 'จ.' + l.province].filter(Boolean).join(' '); }
  function code(l) { return '#' + String(l.id).padStart(4, '0'); }
  function hasCoords(l) { return l.lat !== '' && l.lng !== '' && l.lat != null && l.lng != null && isFinite(Number(l.lat)) && isFinite(Number(l.lng)); }
  function safeHttps(u) { return /^https:\/\/[^\s"'<>]+$/i.test(u || '') ? u : ''; }

  // รูปที่อัปโหลดเก็บเป็นไฟล์ใน uploads/ ; รูปที่ยังไม่บันทึก (ในหน้า admin) เป็น data URL
  function imgSrc(img) {
    if (typeof img === 'string' && /^uploads\/[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(img)) return img;
    if (img && typeof img === 'object' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(img.data || '')) return img.data;
    return '';
  }

  // ภาพแทนเมื่อยังไม่มีรูป: ผังแปลงที่ดิน
  function plotSvg(l) {
    var seed = (n(l.id) * 9301 + 49297) % 233280, r = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var pts = [[60 + r() * 30, 40 + r() * 20], [300 + r() * 40, 30 + r() * 30], [330 + r() * 30, 170 + r() * 30], [70 + r() * 40, 190 + r() * 20]];
    var poly = pts.map(function (p) { return p[0].toFixed(0) + ',' + p[1].toFixed(0); }).join(' ');
    var grid = '';
    for (var x = 0; x <= 400; x += 25) grid += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="250" />';
    for (var y = 0; y <= 250; y += 25) grid += '<line x1="0" y1="' + y + '" x2="400" y2="' + y + '" />';
    var marks = pts.map(function (p) { return '<rect x="' + (p[0] - 4).toFixed(0) + '" y="' + (p[1] - 4).toFixed(0) + '" width="8" height="8" style="fill:var(--sold)" />'; }).join('');
    return '<svg viewBox="0 0 400 250" role="img" aria-label="ผังแปลงที่ดิน"><rect width="400" height="250" style="fill:var(--field-soft)"/>' +
      '<g style="stroke:var(--line)" stroke-width="1">' + grid + '</g>' +
      '<polygon points="' + poly + '" style="fill:color-mix(in srgb, var(--field) 18%, transparent);stroke:var(--field)" stroke-width="2" stroke-dasharray="6 4"/>' + marks +
      '<text x="200" y="125" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="22" style="fill:var(--field)">' + esc(deedNotation(l)) + '</text>' +
      '<text x="200" y="150" text-anchor="middle" font-size="12" style="fill:var(--ink-2)">ไร่-งาน-ตร.ว.</text></svg>';
  }
  function cover(l) { var s = l.images && l.images.length ? imgSrc(l.images[0]) : ''; return s ? '<img src="' + esc(s) + '" alt="" loading="lazy">' : plotSvg(l); }

  function card(l, S) {
    var pw = perWa(l), show = S.showPrice !== false;
    return '<a class="card" href="#land-' + n(l.id) + '"><div class="thumb">' + cover(l) +
      '<span class="chip ' + esc(l.status) + '">' + (STATUS[l.status] || '') + '</span>' +
      (l.sample ? '<span class="tag">ตัวอย่าง</span>' : (l.featured ? '<span class="tag">แนะนำ</span>' : '')) + '</div>' +
      '<div class="card-b"><h3>' + esc(l.title) + '</h3><div class="loc">' + esc(locText(l) || '-') + '</div>' +
      '<div class="deed"><span class="num">' + esc(deedNotation(l)) + '</span><span>ไร่-งาน-ตร.ว.</span>' + (l.type ? '<span>· ' + esc(l.type) + '</span>' : '') + '</div>' +
      '<div class="price">' + (show ? '<b>' + priceShort(l.price) + '</b>' + (pw ? '<small class="num">' + fmt(pw) + ' บ./ตร.ว.</small>' : '') : '<b>สอบถามราคา</b>') + '</div></div></a>';
  }

  function logo() {
    return '<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="9" style="fill:var(--field)"/><path d="M8 25 L14 10 L29 13 L27 26 Z" fill="none" style="stroke:var(--field-ink)" stroke-width="2" stroke-dasharray="3 2"/><rect x="12" y="8" width="4" height="4" style="fill:var(--field-ink)"/><rect x="25" y="24" width="4" height="4" style="fill:var(--field-ink)"/></svg>';
  }

  function header(S, navHtml, home) {
    return '<header class="top"><div class="wrap">' +
      '<a class="brand" href="' + (home || '#') + '">' + logo() + '<span><b>' + esc(S.siteName) + '</b><small>' + esc(S.tagline) + '</small></span></a>' +
      '<nav>' + navHtml + '</nav></div></header>';
  }

  function footer(S) {
    var items = [];
    if (S.phone) items.push('โทร <span class="num">' + esc(S.phone) + '</span>');
    if (S.line) items.push('LINE ' + esc(S.line));
    if (S.email) items.push('อีเมล ' + esc(S.email));
    if (S.address) items.push(esc(S.address));
    if (safeHttps(S.facebook)) items.push('<a href="' + esc(S.facebook) + '" target="_blank" rel="noopener">Facebook</a>');
    return '<footer><div class="wrap"><div><h3>' + esc(S.siteName) + '</h3><p>' + esc(S.about) + '</p></div>' +
      '<div><h3>ติดต่อ</h3><ul>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul></div></div></footer>';
  }

  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500);
  }

  window.BL = {
    STATUS: STATUS, TYPES: TYPES, DEEDS: DEEDS, esc: esc, n: n, fmt: fmt, totalWa: totalWa, deedNotation: deedNotation,
    priceShort: priceShort, perWa: perWa, locText: locText, code: code, hasCoords: hasCoords, safeHttps: safeHttps,
    imgSrc: imgSrc, plotSvg: plotSvg, cover: cover, card: card, header: header, footer: footer, toast: toast
  };
})();
