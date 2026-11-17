/* ชุด UI แบบ custom: dropdown, datepicker, tooltip และภาพโหลดรูป
   ใช้กับทั้งหน้าเว็บและหน้า admin — ทำงานอัตโนมัติกับ element ที่ถูกวาดใหม่ทุกครั้ง */
(function () {
  'use strict';
  var MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  var CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEVRON = '<svg class="dd-chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CAL = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var uid = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toIso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function fmtDate(s, long) { var d = parseIso(s); if (!d) return ''; return d.getDate() + ' ' + (long ? MONTHS : MONTHS_SHORT)[d.getMonth()] + ' ' + (d.getFullYear() + 543); }

  // วางกล่องลอย (popover) ใต้ปุ่ม ถ้าที่ไม่พอให้เปิดขึ้นด้านบน
  function place(pop, anchor, matchWidth) {
    var r = anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    if (matchWidth) pop.style.minWidth = Math.max(r.width, 160) + 'px';
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.left), vw - w - 8);
    var below = vh - r.bottom - 8, above = r.top - 8;
    var up = h > below && above > below;
    pop.style.left = left + 'px';
    pop.style.top = (up ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    pop.style.maxHeight = Math.max(160, (up ? above : below) - 6) + 'px';
    pop.classList.toggle('up', up);
  }

  var active = null; // popover ที่เปิดอยู่ { el, anchor, close }
  function closeActive(focusBack) {
    if (!active) return;
    var a = active; active = null;
    a.el.remove(); a.anchor.setAttribute('aria-expanded', 'false');
    a.anchor.classList.remove('open');
    if (focusBack && a.anchor.isConnected) a.anchor.focus();
  }
  document.addEventListener('pointerdown', function (e) {
    if (active && !active.el.contains(e.target) && !active.anchor.contains(e.target)) closeActive(false);
  }, true);
  window.addEventListener('resize', function () { closeActive(false); });
  window.addEventListener('scroll', function (e) {
    if (active && !(e.target instanceof Node && active.el.contains(e.target))) { if (active.anchor.isConnected) place(active.el, active.anchor, active.match); else closeActive(false); }
  }, true);

  // ---------------- Dropdown ----------------
  function enhanceSelect(sel) {
    if (sel.dataset.ui || sel.multiple || sel.hasAttribute('data-native')) return;
    sel.dataset.ui = '1';
    var wrap = document.createElement('span'); wrap.className = 'dd';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    if (!sel.id) sel.id = 'dd-sel-' + (++uid);
    btn.id = sel.id + '-btn';
    if (sel.dataset.tip) { btn.dataset.tip = sel.dataset.tip; sel.removeAttribute('data-tip'); }
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel); wrap.appendChild(btn);
    sel.classList.add('dd-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel._ddBtn = btn; btn._sel = sel;
    syncSelect(sel);
  }
  function labelFor(sel) {
    var l = sel.getAttribute('aria-label');
    if (!l && sel.labels && sel.labels[0]) {
      var lab = sel.labels[0], src = lab.querySelector('.lbl') || lab;
      l = Array.prototype.filter.call(src.childNodes, function (nd) { return nd.nodeType === 3; }).map(function (nd) { return nd.textContent; }).join(' ').trim();
    }
    return l || '';
  }
  function dotFor(opt) { return opt && opt.dataset.dot ? '<span class="dot dot-' + esc(opt.dataset.dot) + '"></span>' : ''; }
  function syncSelect(sel) {
    var btn = sel._ddBtn; if (!btn) return;
    var opt = sel.options[sel.selectedIndex];
    var text = opt ? opt.textContent : '';
    btn.innerHTML = dotFor(opt) + '<span class="dd-val' + (!sel.value ? ' placeholder' : '') + '">' + esc(text) + '</span>' + CHEVRON;
    btn.disabled = sel.disabled;
    var lab = labelFor(sel);
    btn.setAttribute('aria-label', (lab ? lab + ': ' : '') + text);
    btn.dataset.value = sel.value;
  }
  function openSelect(btn) {
    var sel = btn._sel; if (!sel || sel.disabled) return;
    if (active && active.anchor === btn) { closeActive(true); return; }
    closeActive(false);
    var list = document.createElement('div');
    list.className = 'pop dd-list'; list.setAttribute('role', 'listbox'); list.tabIndex = -1;
    list.id = btn.id + '-list';
    var lab = labelFor(sel); if (lab) list.setAttribute('aria-label', lab);
    var opts = Array.prototype.slice.call(sel.options);
    list.innerHTML = opts.map(function (o, i) {
      return '<div class="dd-opt' + (o.selected ? ' sel' : '') + (o.disabled ? ' dis' : '') + (o.value === '' ? ' placeholder' : '') + '" role="option" id="' + list.id + '-' + i + '" data-i="' + i + '" aria-selected="' + o.selected + '"' + (o.disabled ? ' aria-disabled="true"' : '') + '>' +
        dotFor(o) + '<span>' + esc(o.textContent) + '</span>' + (o.selected ? CHECK : '') + '</div>';
    }).join('');
    document.body.appendChild(list);
    btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-controls', list.id); btn.classList.add('open');
    active = { el: list, anchor: btn, match: true, close: closeActive };
    place(list, btn, true);
    var cur = Math.max(0, sel.selectedIndex);
    setActiveOpt(list, cur);
    var selEl = list.children[cur]; if (selEl) selEl.scrollIntoView({ block: 'nearest' });
    list.focus({ preventScroll: true });

    var typed = '', typedAt = 0;
    list.addEventListener('keydown', function (e) {
      var i = +list.dataset.active, n = opts.length, k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); var step = k === 'ArrowDown' ? 1 : -1; var j = i; do { j = (j + step + n) % n; } while (opts[j].disabled && j !== i); setActiveOpt(list, j); }
      else if (k === 'Home' || k === 'End') { e.preventDefault(); setActiveOpt(list, k === 'Home' ? 0 : n - 1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(sel, i); }
      else if (k === 'Escape') { e.preventDefault(); closeActive(true); }
      else if (k === 'Tab') { closeActive(false); }
      else if (k.length === 1) {
        var now = Date.now(); typed = (now - typedAt > 700 ? '' : typed) + k.toLowerCase(); typedAt = now;
        for (var x = 1; x <= n; x++) { var y = (i + x) % n; if (opts[y].textContent.toLowerCase().indexOf(typed) === 0) { setActiveOpt(list, y); break; } }
      }
    });
    list.addEventListener('click', function (e) {
      var o = e.target.closest('.dd-opt'); if (!o || o.classList.contains('dis')) return;
      choose(sel, +o.dataset.i);
    });
    list.addEventListener('pointermove', function (e) {
      var o = e.target.closest('.dd-opt'); if (o && !o.classList.contains('dis')) setActiveOpt(list, +o.dataset.i, true);
    });
  }
  function setActiveOpt(list, i, noScroll) {
    var prev = list.querySelector('.dd-opt.act'); if (prev) prev.classList.remove('act');
    var el = list.children[i]; if (!el) return;
    el.classList.add('act'); list.dataset.active = i;
    list.setAttribute('aria-activedescendant', el.id);
    if (!noScroll) el.scrollIntoView({ block: 'nearest' });
  }
  function choose(sel, i) {
    var opt = sel.options[i]; if (!opt || opt.disabled) return;
    var changed = sel.selectedIndex !== i, btnId = sel._ddBtn && sel._ddBtn.id;
    sel.selectedIndex = i; syncSelect(sel);
    closeActive(true);
    if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    refocus(btnId);
  }

  // ---------------- Datepicker ----------------
  // ใช้กับ <input type="hidden" data-datepicker data-placeholder="..." data-clearable> ค่าที่เก็บเป็น YYYY-MM-DD
  function enhanceDate(inp) {
    if (inp.dataset.ui) return;
    inp.dataset.ui = '1';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dp-btn'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.id = (inp.id || 'dp-' + (++uid)) + '-btn';
    if (inp.dataset.tip) btn.dataset.tip = inp.dataset.tip;
    inp.parentNode.insertBefore(btn, inp.nextSibling);
    inp._dpBtn = btn; btn._inp = inp;
    syncDate(inp);
  }
  function syncDate(inp) {
    var btn = inp._dpBtn; if (!btn) return;
    var v = inp.value, ph = inp.dataset.placeholder || 'เลือกวันที่';
    btn.innerHTML = CAL + '<span class="dd-val' + (v ? '' : ' placeholder') + '">' + esc(v ? fmtDate(v, true) : ph) + '</span>' +
      (v && inp.hasAttribute('data-clearable') ? '<span class="dp-clear" role="button" tabindex="-1" aria-label="ล้างวันที่" data-tip="ล้างวันที่">×</span>' : '');
    var lab = inp.dataset.label || '';
    btn.setAttribute('aria-label', (lab ? lab + ': ' : '') + (v ? fmtDate(v, true) : ph));
  }
  function setDate(inp, v) {
    if (inp.value === v) { syncDate(inp); return; }
    inp.value = v; syncDate(inp);
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    refocus(inp._dpBtn && inp._dpBtn.id);
  }
  // หน้าอาจถูกวาดใหม่หลังเลือกค่า: ย้ายโฟกัสกลับไปที่ปุ่มตัวใหม่ (สำหรับผู้ใช้คีย์บอร์ด)
  function refocus(id) {
    if (!id) return;
    Promise.resolve().then(function () {
      enhance(document);
      var el = document.getElementById(id);
      if (el && (document.activeElement === document.body || !document.activeElement || !document.activeElement.isConnected)) el.focus({ preventScroll: true });
    });
  }
  function openDate(btn) {
    var inp = btn._inp;
    if (active && active.anchor === btn) { closeActive(true); return; }
    closeActive(false);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var selected = parseIso(inp.value);
    var focus = selected || today;
    var view = new Date(focus.getFullYear(), focus.getMonth(), 1);
    var pop = document.createElement('div');
    pop.className = 'pop dp'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', inp.dataset.label || 'เลือกวันที่');
    document.body.appendChild(pop);
    btn.setAttribute('aria-expanded', 'true'); btn.classList.add('open');
    active = { el: pop, anchor: btn, match: false, close: closeActive };

    function draw(focusDay) {
      var y = view.getFullYear(), m = view.getMonth();
      var start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
      var cells = '';
      for (var i = 0; i < 42; i++) {
        var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        var iso = toIso(d), cls = 'dp-day';
        if (d.getMonth() !== m) cls += ' out';
        if (+d === +today) cls += ' today';
        if (selected && +d === +selected) cls += ' sel';
        var isFocus = +d === +focus;
        cells += '<button type="button" class="' + cls + '" data-d="' + iso + '" tabindex="' + (isFocus ? 0 : -1) + '" aria-label="' + esc(fmtDate(iso, true)) + '"' + (selected && +d === +selected ? ' aria-pressed="true"' : '') + '>' + d.getDate() + '</button>';
      }
      pop.innerHTML =
        '<div class="dp-head">' +
        '<button type="button" class="dp-nav" data-nav="-12" aria-label="ปีก่อนหน้า" data-tip="ปีก่อนหน้า">«</button>' +
        '<button type="button" class="dp-nav" data-nav="-1" aria-label="เดือนก่อนหน้า" data-tip="เดือนก่อนหน้า">‹</button>' +
        '<div class="dp-title" aria-live="polite">' + MONTHS[m] + ' ' + (y + 543) + '</div>' +
        '<button type="button" class="dp-nav" data-nav="1" aria-label="เดือนถัดไป" data-tip="เดือนถัดไป">›</button>' +
        '<button type="button" class="dp-nav" data-nav="12" aria-label="ปีถัดไป" data-tip="ปีถัดไป">»</button></div>' +
        '<div class="dp-grid" role="grid">' + DAYS.map(function (d, i) { return '<span class="dp-dow' + (i === 0 ? ' sun' : '') + '">' + d + '</span>'; }).join('') + cells + '</div>' +
        '<div class="dp-foot"><button type="button" class="btn ghost sm" data-today>วันนี้</button>' +
        (inp.hasAttribute('data-clearable') ? '<button type="button" class="btn ghost sm" data-clear>ล้างค่า</button>' : '') + '</div>';
      place(pop, btn, false);
      if (focusDay) { var f = pop.querySelector('.dp-day[tabindex="0"]'); if (f) f.focus({ preventScroll: true }); }
    }
    function move(days) {
      focus = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + days);
      if (focus.getMonth() !== view.getMonth() || focus.getFullYear() !== view.getFullYear()) view = new Date(focus.getFullYear(), focus.getMonth(), 1);
      draw(true);
    }
    function shiftMonth(n) {
      view = new Date(view.getFullYear(), view.getMonth() + n, 1);
      var last = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      focus = new Date(view.getFullYear(), view.getMonth(), Math.min(focus.getDate(), last));
    }
    pop.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.nav) { shiftMonth(+t.dataset.nav); draw(false); t = pop.querySelector('[data-nav="' + t.dataset.nav + '"]'); if (t) t.focus(); return; }
      if (t.hasAttribute('data-today')) { setDate(inp, toIso(today)); closeActive(true); return; }
      if (t.hasAttribute('data-clear')) { setDate(inp, ''); closeActive(true); return; }
      if (t.dataset.d) { setDate(inp, t.dataset.d); closeActive(true); }
    });
    pop.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'Escape') { e.preventDefault(); closeActive(true); return; }
      if (!e.target.classList.contains('dp-day')) return;
      var map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (map[k]) { e.preventDefault(); move(map[k]); }
      else if (k === 'PageUp' || k === 'PageDown') { e.preventDefault(); shiftMonth(k === 'PageUp' ? -1 : 1); draw(true); }
      else if (k === 'Home') { e.preventDefault(); move(-focus.getDay()); }
      else if (k === 'End') { e.preventDefault(); move(6 - focus.getDay()); }
    });
    draw(true);
  }

  // ---------------- Tooltip ----------------
  var tip = null, tipTarget = null, tipTimer = null;
  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'tip'; tip.id = 'ui-tip'; tip.setAttribute('role', 'tooltip');
    tip.innerHTML = '<div class="tip-body"></div><span class="tip-arrow"></span>';
    document.body.appendChild(tip);
    return tip;
  }
  function showTip(el) {
    var text = el.getAttribute('data-tip'); if (!text) return;
    var t = ensureTip();
    if (tipTarget && tipTarget !== el) tipTarget.removeAttribute('aria-describedby');
    tipTarget = el;
    t.querySelector('.tip-body').textContent = text;
    t.classList.add('show');
    el.setAttribute('aria-describedby', 'ui-tip');
    var r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth;
    var cx = r.left + r.width / 2;
    var left = Math.min(Math.max(8, cx - w / 2), vw - w - 8);
    var below = r.top - h - 10 < 8;
    t.style.left = left + 'px';
    t.style.top = (below ? r.bottom + 10 : r.top - h - 10) + 'px';
    t.classList.toggle('below', below);
    t.querySelector('.tip-arrow').style.left = Math.min(Math.max(12, cx - left), w - 12) + 'px';
  }
  function hideTip() {
    clearTimeout(tipTimer);
    if (tip) tip.classList.remove('show');
    if (tipTarget) tipTarget.removeAttribute('aria-describedby');
    tipTarget = null;
  }
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse') return;
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (!el || el === tipTarget) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { if (el.isConnected) showTip(el); }, 150);
  });
  document.addEventListener('pointerout', function (e) {
    if (e.pointerType !== 'mouse') return;
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hideTip();
  });
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (el && el.matches(':focus-visible')) showTip(el); else if (tipTarget) hideTip();
  });
  document.addEventListener('focusout', function () { hideTip(); });
  window.addEventListener('scroll', hideTip, true);

  // ---------------- คลิก / คีย์บอร์ด ----------------
  document.addEventListener('click', function (e) {
    var t = e.target;
    var clear = t.closest && t.closest('.dp-clear');
    if (clear) { e.preventDefault(); e.stopPropagation(); var b = clear.closest('.dp-btn'); if (b) setDate(b._inp, ''); return; }
    var dd = t.closest && t.closest('.dd-btn');
    if (dd) { hideTip(); openSelect(dd); return; }
    var dp = t.closest && t.closest('.dp-btn');
    if (dp) { hideTip(); openDate(dp); return; }
    // ไอคอน (i): แตะเพื่อดูคำอธิบายบนมือถือ
    var info = t.closest && t.closest('.info[data-tip]');
    if (info) { e.preventDefault(); if (tipTarget === info) hideTip(); else showTip(info); return; }
    if (tipTarget && !(tipTarget.contains(t))) hideTip();
    // คลิกที่ข้อความ label ของ dropdown ให้เปิด dropdown
    var lab = t.closest && t.closest('label');
    if (lab && lab.control && lab.control._ddBtn && !t.closest('.dd')) { e.preventDefault(); lab.control._ddBtn.focus(); }
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key === 'Escape') hideTip();
    if (t.classList && (t.classList.contains('dd-btn') || t.classList.contains('dp-btn')) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault(); if (t.classList.contains('dd-btn')) openSelect(t); else openDate(t);
    }
    if (t.classList && t.classList.contains('info') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showTip(t); }
  });

  // ---------------- รูปภาพ: ค่อย ๆ แสดงเมื่อโหลดเสร็จ (ระหว่างนั้นเห็น skeleton) ----------------
  document.addEventListener('load', function (e) { if (e.target.tagName === 'IMG') e.target.classList.add('loaded'); }, true);
  document.addEventListener('error', function (e) { if (e.target.tagName === 'IMG') e.target.classList.add('loaded', 'broken'); }, true);

  // ---------------- ปรับ element ใหม่ทุกครั้งที่หน้าเปลี่ยน ----------------
  function enhance(root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll('select:not([data-ui])'), enhanceSelect);
    Array.prototype.forEach.call(root.querySelectorAll('input[data-datepicker]:not([data-ui])'), enhanceDate);
    Array.prototype.forEach.call(root.querySelectorAll('img:not(.loaded)'), function (img) { if (img.complete && img.naturalWidth) img.classList.add('loaded'); });
    if (active && !active.anchor.isConnected) closeActive(false);
    if (tipTarget && !tipTarget.isConnected) hideTip();
  }
  var queued = false;
  new MutationObserver(function () {
    if (queued) return; queued = true;
    Promise.resolve().then(function () { queued = false; enhance(document); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') enhance(document); else document.addEventListener('DOMContentLoaded', function () { enhance(document); });

  window.UI = { enhance: enhance, fmtDate: fmtDate, toIso: toIso, syncSelect: syncSelect, syncDate: syncDate, hideTip: hideTip };
})();
