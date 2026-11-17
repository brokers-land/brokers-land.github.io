'use strict';
const session = require('express-session');

// เก็บ session ไว้ใน SQLite เพื่อให้ไม่หลุดเมื่อรีสตาร์ทเซิร์ฟเวอร์
class SqliteStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.getStmt = db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare(
      'INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires'
    );
    this.delStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.cleanStmt = db.prepare('DELETE FROM sessions WHERE expires < ?');
    setInterval(() => this.cleanStmt.run(Date.now()), 60 * 60 * 1000).unref();
  }
  _expires(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : Date.now() + 24 * 60 * 60 * 1000;
  }
  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try { this.setStmt.run(sid, JSON.stringify(sess), this._expires(sess)); cb && cb(null); } catch (e) { cb && cb(e); }
  }
  destroy(sid, cb) {
    try { this.delStmt.run(sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

module.exports = SqliteStore;
