const fs = require('fs');
const path = require('path');
// Node.js 22+ 内置的同步 SQLite 驱动，无需 Python 或本机编译工具链。
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { isPermanentlyBlockedAnime } = require('./services/content-policy');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
const db = new DatabaseSync(config.databasePath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS anime (
    id INTEGER PRIMARY KEY,
    title_romaji TEXT NOT NULL,
    title_native TEXT,
    title_english TEXT,
    title_chinese TEXT,
    prequel_id INTEGER,
    country_of_origin TEXT,
    description TEXT,
    description_chinese TEXT,
    description_chinese_source TEXT,
    cover_large TEXT,
    banner_image TEXT,
    format TEXT,
    status TEXT,
    season TEXT,
    season_year INTEGER,
    start_date TEXT,
    end_date TEXT,
    episodes INTEGER,
    duration INTEGER,
    genres TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    studios TEXT NOT NULL DEFAULT '[]',
    source TEXT,
    site_url TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_anime_season ON anime(season_year, season);
  CREATE INDEX IF NOT EXISTS idx_anime_status ON anime(status);
  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    records INTEGER NOT NULL DEFAULT 0,
    message TEXT
  );
`);

// 兼容已经创建过的数据库：新增字段时自动做一次轻量迁移。
const animeColumns = db.prepare('PRAGMA table_info(anime)').all();
if (!animeColumns.some(column => column.name === 'prequel_id')) {
  db.exec('ALTER TABLE anime ADD COLUMN prequel_id INTEGER');
}
if (!animeColumns.some(column => column.name === 'country_of_origin')) {
  db.exec('ALTER TABLE anime ADD COLUMN country_of_origin TEXT');
}
if (!animeColumns.some(column => column.name === 'description_chinese')) {
  db.exec('ALTER TABLE anime ADD COLUMN description_chinese TEXT');
}
if (!animeColumns.some(column => column.name === 'description_chinese_source')) {
  db.exec('ALTER TABLE anime ADD COLUMN description_chinese_source TEXT');
}
if (!animeColumns.some(column => column.name === 'tags')) {
  db.exec("ALTER TABLE anime ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
}

// 每次服务启动都清理永久下架系列，兼容升级前已经存在的本地数据库。
const blockedRows = db.prepare('SELECT id,title_romaji,title_native,title_english,title_chinese FROM anime').all()
  .filter(row => isPermanentlyBlockedAnime(row, false));
if (blockedRows.length) {
  const removeBlocked = db.prepare('DELETE FROM anime WHERE id = ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    blockedRows.forEach(row => removeBlocked.run(row.id));
    db.exec('COMMIT');
    console.log(`[content-policy] 已永久移除 ${blockedRows.length} 条黑名单作品`);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = db;
