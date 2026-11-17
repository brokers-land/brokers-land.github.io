'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, getSettings, saveSettings, DEFAULT_SETTINGS } = require('../db');
const { verifyCsrf, flash, LAND_TYPES, DEED_TYPES, PROVINCES, STATUS } = require('../helpers');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const ALLOWED_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED_EXT[file.mimetype])),
});

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
}

router.use((req, res, next) => {
  res.locals.unread = req.session.user ? db.prepare('SELECT COUNT(*) AS c FROM inquiries WHERE is_read = 0').get().c : 0;
  next();
});

// ---------------- เข้าสู่ระบบ ----------------
const loginAttempts = new Map();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('admin/login', { title: 'เข้าสู่ระบบผู้ดูแล', error: null, next: req.query.next || '' });
});

router.post('/login', verifyCsrf, (req, res) => {
  const ip = req.ip;
  const rec = loginAttempts.get(ip) || { n: 0, until: 0 };
  const nextUrl = typeof req.body.next === 'string' && req.body.next.startsWith('/admin') ? req.body.next : '/admin';
  if (rec.until > Date.now()) {
    return res.status(429).render('admin/login', { title: 'เข้าสู่ระบบผู้ดูแล', error: 'พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอ 5 นาที', next: nextUrl });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body.username || '').trim());
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    rec.n += 1;
    if (rec.n >= 5) { rec.until = Date.now() + 5 * 60 * 1000; rec.n = 0; }
    loginAttempts.set(ip, rec);
    return res.status(401).render('admin/login', { title: 'เข้าสู่ระบบผู้ดูแล', error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', next: nextUrl });
  }
  loginAttempts.delete(ip);
  req.session.regenerate(err => {
    if (err) throw err;
    req.session.user = { id: user.id, username: user.username };
    res.redirect(nextUrl);
  });
});

router.post('/logout', verifyCsrf, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.use(requireAuth);

// ---------------- แดชบอร์ด ----------------
router.get('/', (req, res) => {
  const stats = db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,
    SUM(CASE WHEN status='reserved' THEN 1 ELSE 0 END) AS reserved,
    SUM(CASE WHEN status='sold' THEN 1 ELSE 0 END) AS sold,
    COALESCE(SUM(views),0) AS views FROM lands`).get();
  const inquiries = db.prepare(`SELECT i.*, l.title AS land_title FROM inquiries i
    LEFT JOIN lands l ON l.id = i.land_id ORDER BY i.created_at DESC, i.id DESC LIMIT 5`).all();
  const popular = db.prepare('SELECT id, title, views, status FROM lands ORDER BY views DESC LIMIT 5').all();
  res.render('admin/dashboard', { title: 'แดชบอร์ด', stats, inquiries, popular });
});

// ---------------- จัดการประกาศที่ดิน ----------------
router.get('/lands', (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.query.q) { where += ' AND (title LIKE ? OR province LIKE ? OR district LIKE ?)'; const l = `%${req.query.q}%`; params.push(l, l, l); }
  if (req.query.status) { where += ' AND status = ?'; params.push(req.query.status); }
  const lands = db.prepare(`SELECT l.*, (SELECT filename FROM land_images WHERE land_id = l.id ORDER BY sort_order, id LIMIT 1) AS cover,
    (SELECT COUNT(*) FROM land_images WHERE land_id = l.id) AS image_count
    FROM lands l WHERE ${where} ORDER BY l.updated_at DESC, l.id DESC`).all(...params);
  res.render('admin/lands', { title: 'ประกาศที่ดินทั้งหมด', lands, q: req.query });
});

function landForm(res, land, images, title) {
  res.render('admin/land-form', { title, land, images, LAND_TYPES, DEED_TYPES, PROVINCES, STATUS });
}

router.get('/lands/new', (req, res) => {
  landForm(res, { status: 'available', published: 1, rai: 0, ngan: 0, wa: 0 }, [], 'เพิ่มประกาศที่ดิน');
});

function readLand(body) {
  const num = (v, d = 0) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
  const numOrNull = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const str = (v, n = 500) => String(v || '').trim().slice(0, n);
  return {
    title: str(body.title, 200),
    land_type: str(body.land_type, 50),
    deed_type: str(body.deed_type, 50),
    province: str(body.province, 50),
    district: str(body.district, 100),
    subdistrict: str(body.subdistrict, 100),
    address: str(body.address, 300),
    rai: Math.max(0, Math.floor(num(body.rai))),
    ngan: Math.min(3, Math.max(0, Math.floor(num(body.ngan)))),
    wa: Math.min(99.99, Math.max(0, num(body.wa))),
    price: Math.max(0, num(String(body.price || '').replace(/,/g, ''))),
    road_access: str(body.road_access, 300),
    utilities: str(body.utilities, 300),
    description: str(body.description, 10000),
    lat: numOrNull(body.lat),
    lng: numOrNull(body.lng),
    status: STATUS[body.status] ? body.status : 'available',
    featured: body.featured ? 1 : 0,
    published: body.published ? 1 : 0,
  };
}

function addImages(landId, files) {
  if (!files || !files.length) return;
  let order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM land_images WHERE land_id = ?').get(landId).m;
  const ins = db.prepare('INSERT INTO land_images (land_id, filename, sort_order) VALUES (?,?,?)');
  for (const f of files) ins.run(landId, f.filename, ++order);
}

function removeFiles(files) {
  for (const f of files || []) fs.unlink(path.join(UPLOAD_DIR, path.basename(f.filename)), () => {});
}

router.post('/lands', upload.array('images', 20), verifyCsrf, (req, res) => {
  const d = readLand(req.body);
  if (!d.title) {
    removeFiles(req.files);
    flash(req, 'error', 'กรุณากรอกชื่อประกาศ');
    return res.redirect('/admin/lands/new');
  }
  const r = db.prepare(`INSERT INTO lands (title, land_type, deed_type, province, district, subdistrict, address,
    rai, ngan, wa, price, road_access, utilities, description, lat, lng, status, featured, published)
    VALUES (@title, @land_type, @deed_type, @province, @district, @subdistrict, @address,
    @rai, @ngan, @wa, @price, @road_access, @utilities, @description, @lat, @lng, @status, @featured, @published)`).run(d);
  addImages(r.lastInsertRowid, req.files);
  flash(req, 'success', 'บันทึกประกาศเรียบร้อยแล้ว');
  res.redirect(`/admin/lands/${r.lastInsertRowid}/edit`);
});

router.get('/lands/:id/edit', (req, res, next) => {
  const land = db.prepare('SELECT * FROM lands WHERE id = ?').get(req.params.id);
  if (!land) return next();
  const images = db.prepare('SELECT * FROM land_images WHERE land_id = ? ORDER BY sort_order, id').all(land.id);
  landForm(res, land, images, 'แก้ไขประกาศ');
});

router.post('/lands/:id', upload.array('images', 20), verifyCsrf, (req, res, next) => {
  const land = db.prepare('SELECT id FROM lands WHERE id = ?').get(req.params.id);
  if (!land) { removeFiles(req.files); return next(); }
  const d = readLand(req.body);
  if (!d.title) {
    removeFiles(req.files);
    flash(req, 'error', 'กรุณากรอกชื่อประกาศ');
    return res.redirect(`/admin/lands/${land.id}/edit`);
  }
  db.prepare(`UPDATE lands SET title=@title, land_type=@land_type, deed_type=@deed_type, province=@province,
    district=@district, subdistrict=@subdistrict, address=@address, rai=@rai, ngan=@ngan, wa=@wa, price=@price,
    road_access=@road_access, utilities=@utilities, description=@description, lat=@lat, lng=@lng,
    status=@status, featured=@featured, published=@published, updated_at=datetime('now','localtime')
    WHERE id=@id`).run({ ...d, id: land.id });
  addImages(land.id, req.files);
  flash(req, 'success', 'อัปเดตประกาศเรียบร้อยแล้ว');
  res.redirect(`/admin/lands/${land.id}/edit`);
});

router.post('/lands/:id/delete', verifyCsrf, (req, res) => {
  const images = db.prepare('SELECT filename FROM land_images WHERE land_id = ?').all(req.params.id);
  db.prepare('DELETE FROM lands WHERE id = ?').run(req.params.id);
  removeFiles(images);
  flash(req, 'success', 'ลบประกาศเรียบร้อยแล้ว');
  res.redirect('/admin/lands');
});

router.post('/lands/:id/status', verifyCsrf, (req, res) => {
  if (STATUS[req.body.status]) {
    db.prepare("UPDATE lands SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(req.body.status, req.params.id);
  }
  res.redirect('/admin/lands');
});

router.post('/images/:id/delete', verifyCsrf, (req, res) => {
  const img = db.prepare('SELECT * FROM land_images WHERE id = ?').get(req.params.id);
  if (img) {
    db.prepare('DELETE FROM land_images WHERE id = ?').run(img.id);
    removeFiles([img]);
    flash(req, 'success', 'ลบรูปภาพแล้ว');
    return res.redirect(`/admin/lands/${img.land_id}/edit#images`);
  }
  res.redirect('/admin/lands');
});

router.post('/images/:id/cover', verifyCsrf, (req, res) => {
  const img = db.prepare('SELECT * FROM land_images WHERE id = ?').get(req.params.id);
  if (!img) return res.redirect('/admin/lands');
  const min = db.prepare('SELECT MIN(sort_order) AS m FROM land_images WHERE land_id = ?').get(img.land_id).m;
  db.prepare('UPDATE land_images SET sort_order = ? WHERE id = ?').run(min - 1, img.id);
  flash(req, 'success', 'ตั้งเป็นรูปหน้าปกแล้ว');
  res.redirect(`/admin/lands/${img.land_id}/edit#images`);
});

// ---------------- ข้อความติดต่อ ----------------
router.get('/inquiries', (req, res) => {
  const inquiries = db.prepare(`SELECT i.*, l.title AS land_title FROM inquiries i
    LEFT JOIN lands l ON l.id = i.land_id ORDER BY i.is_read ASC, i.created_at DESC, i.id DESC`).all();
  res.render('admin/inquiries', { title: 'ข้อความจากผู้สนใจ', inquiries });
});

router.post('/inquiries/:id/read', verifyCsrf, (req, res) => {
  db.prepare('UPDATE inquiries SET is_read = 1 - is_read WHERE id = ?').run(req.params.id);
  res.redirect('/admin/inquiries');
});

router.post('/inquiries/:id/delete', verifyCsrf, (req, res) => {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'ลบข้อความแล้ว');
  res.redirect('/admin/inquiries');
});

// ---------------- ตั้งค่าเว็บไซต์ ----------------
router.get('/settings', (req, res) => {
  res.render('admin/settings', { title: 'ตั้งค่าเว็บไซต์', s: getSettings() });
});

router.post('/settings', verifyCsrf, (req, res) => {
  const data = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key === 'show_price') continue;
    if (req.body[key] !== undefined) data[key] = String(req.body[key]).trim().slice(0, 3000);
  }
  data.show_price = req.body.show_price ? '1' : '0';
  if (!/^#[0-9a-fA-F]{6}$/.test(data.primary_color || '')) data.primary_color = DEFAULT_SETTINGS.primary_color;
  const pp = parseInt(data.per_page, 10);
  data.per_page = String(pp >= 3 && pp <= 60 ? pp : 9);
  if (data.facebook_url && !/^https?:\/\//i.test(data.facebook_url)) data.facebook_url = '';
  saveSettings(data);
  flash(req, 'success', 'บันทึกการตั้งค่าเรียบร้อยแล้ว');
  res.redirect('/admin/settings');
});

// ---------------- บัญชีผู้ดูแล ----------------
router.get('/account', (req, res) => {
  const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY id').all();
  res.render('admin/account', { title: 'บัญชีผู้ดูแลระบบ', users });
});

router.post('/account/password', verifyCsrf, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const { current_password, new_password, confirm_password } = req.body;
  if (!user || !bcrypt.compareSync(String(current_password || ''), user.password_hash)) {
    flash(req, 'error', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  } else if (String(new_password || '').length < 8) {
    flash(req, 'error', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  } else if (new_password !== confirm_password) {
    flash(req, 'error', 'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
  } else {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), user.id);
    flash(req, 'success', 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
  }
  res.redirect('/admin/account');
});

router.post('/account/users', verifyCsrf, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    flash(req, 'error', 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษหรือตัวเลข 3-30 ตัวอักษร');
  } else if (password.length < 8) {
    flash(req, 'error', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  } else if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    flash(req, 'error', 'มีชื่อผู้ใช้นี้อยู่แล้ว');
  } else {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, bcrypt.hashSync(password, 10));
    flash(req, 'success', `เพิ่มผู้ดูแล ${username} แล้ว`);
  }
  res.redirect('/admin/account');
});

router.post('/account/users/:id/delete', verifyCsrf, (req, res) => {
  if (Number(req.params.id) === req.session.user.id) {
    flash(req, 'error', 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้');
  } else {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.user.id') = ?").run(Number(req.params.id));
    flash(req, 'success', 'ลบผู้ดูแลแล้ว');
  }
  res.redirect('/admin/account');
});

module.exports = router;
