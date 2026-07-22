const fs = require('fs');
const path = require('path');
// Node.js 22+ 内置的同步 SQLite 驱动，无需 Python 或本机编译工具链。
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

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

module.exports = db;
