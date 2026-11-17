'use strict';
const crypto = require('crypto');

// 1 ไร่ = 4 งาน = 400 ตารางวา, 1 งาน = 100 ตารางวา, 1 ตารางวา = 4 ตารางเมตร
function totalWa(land) {
  return (Number(land.rai) || 0) * 400 + (Number(land.ngan) || 0) * 100 + (Number(land.wa) || 0);
}

function fmtNumber(n, digits = 0) {
  return Number(n || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function fmtArea(land) {
  const parts = [];
  if (Number(land.rai)) parts.push(`${fmtNumber(land.rai)} ไร่`);
  if (Number(land.ngan)) parts.push(`${fmtNumber(land.ngan)} งาน`);
  if (Number(land.wa)) parts.push(`${fmtNumber(land.wa, 2)} ตร.ว.`);
  return parts.length ? parts.join(' ') : '-';
}

function fmtPrice(n) {
  n = Number(n) || 0;
  if (!n) return 'สอบถามราคา';
  return `${fmtNumber(n)} บาท`;
}

function fmtPriceShort(n) {
  n = Number(n) || 0;
  if (!n) return 'สอบถามราคา';
  if (n >= 1e6) return `${fmtNumber(n / 1e6, 2)} ล้านบาท`;
  return `${fmtNumber(n)} บาท`;
}

function pricePerWa(land) {
  const w = totalWa(land);
  if (!w || !Number(land.price)) return 0;
  return Number(land.price) / w;
}

function pricePerRai(land) {
  const w = totalWa(land);
  if (!w || !Number(land.price)) return 0;
  return (Number(land.price) / w) * 400;
}

const STATUS = {
  available: { label: 'พร้อมขาย', cls: 'available' },
  reserved: { label: 'ติดจอง', cls: 'reserved' },
  sold: { label: 'ขายแล้ว', cls: 'sold' },
};

const LAND_TYPES = ['ที่ดินเปล่า', 'ที่อยู่อาศัย', 'สวน/เกษตร', 'นา/ไร่', 'พาณิชยกรรม', 'อุตสาหกรรม', 'ริมน้ำ/ชายทะเล', 'อื่น ๆ'];
const DEED_TYPES = ['โฉนด (น.ส.4จ.)', 'น.ส.3ก.', 'น.ส.3', 'ส.ป.ก. 4-01', 'ภ.บ.ท.5', 'อื่น ๆ'];

const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา',
  'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก',
  'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน',
  'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา',
  'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต',
  'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี',
  'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี',
  'อุบลราชธานี',
];

function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}

function verifyCsrf(req, res, next) {
  const token = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!token || !req.session.csrf || token !== req.session.csrf) {
    return res.status(403).send('คำขอไม่ถูกต้อง (CSRF) กรุณารีเฟรชหน้าแล้วลองใหม่');
  }
  next();
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

module.exports = {
  totalWa, fmtNumber, fmtArea, fmtPrice, fmtPriceShort, pricePerWa, pricePerRai,
  STATUS, LAND_TYPES, DEED_TYPES, PROVINCES, csrfToken, verifyCsrf, flash,
};
