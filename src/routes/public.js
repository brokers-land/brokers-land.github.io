'use strict';
const express = require('express');
const { db } = require('../db');
const { PROVINCES, LAND_TYPES, flash } = require('../helpers');

const router = express.Router();

const firstImageSql = `(SELECT filename FROM land_images WHERE land_id = l.id ORDER BY sort_order, id LIMIT 1) AS cover`;
const totalWaSql = `(l.rai * 400 + l.ngan * 100 + l.wa)`;

function buildFilters(q) {
  const where = ['l.published = 1'];
  const params = [];
  if (q.q) {
    where.push('(l.title LIKE ? OR l.description LIKE ? OR l.district LIKE ? OR l.subdistrict LIKE ? OR l.address LIKE ?)');
    const like = `%${q.q}%`;
    params.push(like, like, like, like, like);
  }
  if (q.province) { where.push('l.province = ?'); params.push(q.province); }
  if (q.type) { where.push('l.land_type = ?'); params.push(q.type); }
  if (q.status) { where.push('l.status = ?'); params.push(q.status); }
  if (Number(q.min_price)) { where.push('l.price >= ?'); params.push(Number(q.min_price)); }
  if (Number(q.max_price)) { where.push('l.price <= ?'); params.push(Number(q.max_price)); }
  if (Number(q.min_rai)) { where.push(`${totalWaSql} >= ?`); params.push(Number(q.min_rai) * 400); }
  if (Number(q.max_rai)) { where.push(`${totalWaSql} <= ?`); params.push(Number(q.max_rai) * 400); }
  return { where: where.join(' AND '), params };
}

const SORTS = {
  newest: 'l.featured DESC, l.created_at DESC, l.id DESC',
  price_asc: 'CASE WHEN l.price > 0 THEN 0 ELSE 1 END, l.price ASC',
  price_desc: 'l.price DESC',
  area_desc: `${totalWaSql} DESC`,
  area_asc: `${totalWaSql} ASC`,
};

router.get('/', (req, res) => {
  const featured = db.prepare(`SELECT l.*, ${firstImageSql} FROM lands l
    WHERE l.published = 1 AND l.status != 'sold' ORDER BY l.featured DESC, l.created_at DESC LIMIT 6`).all();
  const stats = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
      COUNT(DISTINCT province) AS provinces
    FROM lands WHERE published = 1`).get();
  const provinces = db.prepare(`SELECT province, COUNT(*) AS c FROM lands
    WHERE published = 1 AND province != '' GROUP BY province ORDER BY c DESC LIMIT 8`).all();
  res.render('home', { title: null, featured, stats, provinces, PROVINCES, LAND_TYPES });
});

router.get('/lands', (req, res) => {
  const perPage = Math.max(1, Number(res.locals.settings.per_page) || 9);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const { where, params } = buildFilters(req.query);
  const order = SORTS[req.query.sort] || SORTS.newest;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM lands l WHERE ${where}`).get(...params).c;
  const lands = db.prepare(`SELECT l.*, ${firstImageSql} FROM lands l WHERE ${where}
    ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, perPage, (page - 1) * perPage);
  const usedProvinces = db.prepare(`SELECT DISTINCT province FROM lands WHERE published = 1 AND province != '' ORDER BY province`).all().map(r => r.province);
  res.render('lands', {
    title: 'ประกาศขายที่ดิน',
    lands, total, page, pages: Math.ceil(total / perPage), q: req.query,
    PROVINCES: usedProvinces.length ? usedProvinces : PROVINCES, LAND_TYPES,
  });
});

router.get('/lands/:id', (req, res, next) => {
  const land = db.prepare('SELECT * FROM lands WHERE id = ? AND published = 1').get(req.params.id);
  if (!land) return next();
  // นับยอดเข้าชม 1 ครั้งต่อ session
  req.session.viewed = req.session.viewed || [];
  if (!req.session.viewed.includes(land.id)) {
    db.prepare('UPDATE lands SET views = views + 1 WHERE id = ?').run(land.id);
    req.session.viewed.push(land.id);
    land.views += 1;
  }
  const images = db.prepare('SELECT * FROM land_images WHERE land_id = ? ORDER BY sort_order, id').all(land.id);
  const related = db.prepare(`SELECT l.*, ${firstImageSql} FROM lands l
    WHERE l.published = 1 AND l.id != ? AND l.province = ? AND l.status != 'sold'
    ORDER BY l.created_at DESC LIMIT 3`).all(land.id, land.province || '');
  res.render('land', { title: land.title, land, images, related, sent: req.query.sent === '1' });
});

router.post('/lands/:id/inquiry', (req, res, next) => {
  const land = db.prepare('SELECT id FROM lands WHERE id = ? AND published = 1').get(req.params.id);
  if (!land) return next();
  const ok = saveInquiry(req, land.id);
  res.redirect(`/lands/${land.id}${ok ? '?sent=1' : ''}#contact`);
});

router.get('/contact', (req, res) => {
  res.render('contact', { title: 'ติดต่อเรา', sent: req.query.sent === '1' });
});

router.post('/contact', (req, res) => {
  const ok = saveInquiry(req, null);
  res.redirect(ok ? '/contact?sent=1' : '/contact');
});

function saveInquiry(req, landId) {
  const { name, phone, email, message, website } = req.body;
  if (website) return true; // honeypot กันสแปมบอท
  const clean = (s, n) => String(s || '').trim().slice(0, n);
  if (!clean(name, 100) || (!clean(phone, 30) && !clean(email, 120))) {
    flash(req, 'error', 'กรุณากรอกชื่อ และเบอร์โทรหรืออีเมลอย่างน้อยหนึ่งช่อง');
    return false;
  }
  db.prepare('INSERT INTO inquiries (land_id, name, phone, email, message) VALUES (?,?,?,?,?)')
    .run(landId, clean(name, 100), clean(phone, 30), clean(email, 120), clean(message, 2000));
  return true;
}

module.exports = router;
