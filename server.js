'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const fs = require('fs');
const { db, getSettings, DATA_DIR } = require('./src/db');
const SqliteStore = require('./src/session-store');
const helpers = require('./src/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

// ใช้ SESSION_SECRET จาก env ถ้ามี ไม่เช่นนั้นสร้างและเก็บไว้ในโฟลเดอร์ data (ผู้ดูแลจะไม่หลุดเมื่อรีสตาร์ท)
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, '.session-secret');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch {}
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist'), { maxAge: '30d' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '30d' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(
  session({
    store: new SqliteStore(db),
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === '1',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// ส่งค่าที่ใช้บ่อยไปให้ทุก template
app.use((req, res, next) => {
  res.locals.settings = getSettings();
  res.locals.h = helpers;
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.csrf = () => helpers.csrfToken(req);
  next();
});

app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/public'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'ไม่พบหน้าที่ต้องการ', message: 'ขออภัย ไม่พบหน้าที่คุณกำลังค้นหา' });
});

app.use((err, req, res, next) => {
  console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์รูปภาพมีขนาดใหญ่เกินไป (สูงสุด 8MB ต่อไฟล์)' : err.userMessage || 'เกิดข้อผิดพลาดในระบบ';
  res.status(err.status || 500).render('error', { title: 'เกิดข้อผิดพลาด', message });
});

app.listen(PORT, () => {
  console.log(`Brokers Land กำลังทำงานที่ http://localhost:${PORT}`);
  console.log(`หน้าผู้ดูแลระบบ: http://localhost:${PORT}/admin`);
});
