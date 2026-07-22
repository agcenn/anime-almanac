const express = require('express');
const db = require('../db');
const router = express.Router();

const decodeRow = row => row && ({ ...row, genres: JSON.parse(row.genres), studios: JSON.parse(row.studios) });

router.get('/', (req, res) => {
  const { year, season, status, format, q = '', page = '1', limit = '24' } = req.query;
  const where = [], params = {};
  if (year) { where.push('season_year = @year'); params.year = Number(year); }
  if (season) { where.push('season = @season'); params.season = String(season).toUpperCase(); }
  if (status === 'archive') where.push("status IN ('FINISHED','RELEASING')");
  if (status === 'upcoming') where.push("status IN ('NOT_YET_RELEASED','HIATUS')");
  if (format) { where.push('format = @format'); params.format = String(format).toUpperCase(); }
  if (q.trim()) {
    where.push('(title_romaji LIKE @q OR title_native LIKE @q OR title_english LIKE @q OR title_chinese LIKE @q)');
    params.q = `%${q.trim()}%`;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const filterParams = { ...params };
  const take = Math.min(Math.max(Number(limit) || 24, 1), 60);
  const current = Math.max(Number(page) || 1, 1);
  params.limit = take; params.offset = (current - 1) * take;
  const items = db.prepare(`SELECT * FROM anime ${clause} ORDER BY CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,start_date DESC LIMIT @limit OFFSET @offset`).all(params).map(decodeRow);
  const total = db.prepare(`SELECT COUNT(*) total FROM anime ${clause}`).get(filterParams).total;
  res.json({ items, pagination: { page: current, limit: take, total, pages: Math.ceil(total / take) } });
});

router.get('/meta', (_req, res) => {
  const years = db.prepare('SELECT DISTINCT season_year year FROM anime WHERE season_year IS NOT NULL ORDER BY year DESC').all().map(row => row.year);
  const lastSync = db.prepare("SELECT finished_at,status,records FROM sync_log ORDER BY id DESC LIMIT 1").get() || null;
  res.json({ years, seasons: ['WINTER','SPRING','SUMMER','FALL'], formats: ['TV','TV_SHORT','MOVIE','OVA','ONA','SPECIAL'], lastSync });
});

router.get('/:id', (req, res) => {
  const item = decodeRow(db.prepare('SELECT * FROM anime WHERE id = ?').get(Number(req.params.id)));
  if (!item) return res.status(404).json({ error: '未找到该番剧' });
  res.json(item);
});

module.exports = router;
