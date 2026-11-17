'use strict';
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'brokers-land.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS lands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  land_type TEXT,
  deed_type TEXT,
  province TEXT,
  district TEXT,
  subdistrict TEXT,
  address TEXT,
  rai INTEGER DEFAULT 0,
  ngan INTEGER DEFAULT 0,
  wa REAL DEFAULT 0,
  price REAL DEFAULT 0,
  road_access TEXT,
  utilities TEXT,
  description TEXT,
  lat REAL,
  lng REAL,
  status TEXT DEFAULT 'available',
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS land_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  land_id INTEGER NOT NULL REFERENCES lands(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  land_id INTEGER REFERENCES lands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  message TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expires INTEGER NOT NULL
);
`);

// ---------- ค่าตั้งต้นของเว็บไซต์ (แก้ไขได้ในหน้า Admin > ตั้งค่า) ----------
const DEFAULT_SETTINGS = {
  site_name: 'Brokers Land',
  tagline: 'นายหน้าซื้อขายที่ดินมืออาชีพ',
  hero_title: 'ค้นหาที่ดินที่ใช่สำหรับคุณ',
  hero_subtitle: 'รวมประกาศขายที่ดินทั่วประเทศ ตรวจสอบเอกสารสิทธิ์ ราคายุติธรรม พร้อมดูแลทุกขั้นตอนการโอน',
  phone: '081-234-5678',
  line_id: '@brokersland',
  email: 'contact@example.com',
  facebook_url: '',
  office_address: 'กรุงเทพมหานคร',
  about_text: 'เราคือทีมนายหน้าที่ดินที่มีประสบการณ์ ช่วยเจ้าของที่ดินขายได้เร็ว และช่วยผู้ซื้อหาที่ดินตรงความต้องการ พร้อมให้คำปรึกษาด้านเอกสารสิทธิ์ ภาษี และการโอนกรรมสิทธิ์',
  primary_color: '#1f7a4d',
  per_page: '9',
  show_price: '1',
  footer_text: '',
};

const getSettingStmt = db.prepare('SELECT key, value FROM settings');
const upsertSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
}

function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of getSettingStmt.all()) out[row.key] = row.value;
  return out;
}

function saveSettings(obj) {
  db.exec('BEGIN');
  try {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        upsertSettingStmt.run(key, String(obj[key] ?? ''));
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- ผู้ดูแลระบบเริ่มต้น ----------
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
    username,
    bcrypt.hashSync(password, 10)
  );
  console.log(`[setup] สร้างผู้ดูแลระบบ: ${username} / ${password}  (กรุณาเปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ)`);
}

// ---------- ข้อมูลตัวอย่าง (ครั้งแรกเท่านั้น) ----------
const landCount = db.prepare('SELECT COUNT(*) AS c FROM lands').get().c;
if (landCount === 0 && process.env.SEED_SAMPLE !== '0') {
  const ins = db.prepare(`INSERT INTO lands
    (title, land_type, deed_type, province, district, subdistrict, address, rai, ngan, wa, price,
     road_access, utilities, description, lat, lng, status, featured)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('ที่ดินเปล่าติดถนนลาดยาง ใกล้ตัวเมืองเชียงใหม่', 'ที่ดินเปล่า', 'โฉนด (น.ส.4จ.)',
    'เชียงใหม่', 'สันทราย', 'หนองจ๊อม', 'ถนนเชียงใหม่-แม่โจ้', 2, 1, 50, 4500000,
    'ติดถนนลาดยาง กว้าง 8 เมตร หน้ากว้าง 40 เมตร', 'ไฟฟ้า, ประปา',
    'ที่ดินถมแล้ว เหมาะสำหรับสร้างบ้านพักอาศัย หรือทำโครงการบ้านจัดสรร\nเดินทางสะดวก ห่างตัวเมืองเชียงใหม่เพียง 15 นาที ใกล้มหาวิทยาลัยแม่โจ้',
    18.8530, 99.0130, 'available', 1);
  ins.run('สวนทุเรียนพร้อมบ้านพัก วิวภูเขา จันทบุรี', 'สวน/เกษตร', 'โฉนด (น.ส.4จ.)',
    'จันทบุรี', 'มะขาม', 'ท่าหลวง', '', 15, 0, 0, 12000000,
    'ทางลูกรังเข้าจากถนนหลัก 300 เมตร', 'ไฟฟ้า, บ่อน้ำ, ระบบน้ำสปริงเกอร์',
    'สวนทุเรียนหมอนทองอายุ 8 ปี จำนวนประมาณ 300 ต้น ให้ผลผลิตแล้ว\nมีบ้านพักคนงานและโรงเก็บอุปกรณ์',
    12.6800, 102.2000, 'available', 1);
  ins.run('ที่ดินแปลงเล็ก ทำเลทอง ใกล้รถไฟฟ้า นนทบุรี', 'ที่อยู่อาศัย', 'โฉนด (น.ส.4จ.)',
    'นนทบุรี', 'บางบัวทอง', 'เสาธงหิน', 'ซอยกาญจนาภิเษก', 0, 1, 20, 3600000,
    'ติดซอยคอนกรีต กว้าง 6 เมตร', 'ไฟฟ้า, ประปา, ท่อระบายน้ำ',
    'ที่ดินรูปสี่เหลี่ยมผืนผ้า ถมสูงกว่าถนน เหมาะปลูกบ้านหรือทาวน์โฮม\nใกล้สถานีรถไฟฟ้าสายสีม่วง 1.5 กม.',
    13.8840, 100.4100, 'reserved', 0);
}

module.exports = { db, getSettings, saveSettings, DEFAULT_SETTINGS, DATA_DIR };
