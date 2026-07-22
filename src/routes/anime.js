const express = require('express');
const db = require('../db');
const config = require('../config');
const router = express.Router();

const parseJson = value => { try { return JSON.parse(value || '[]'); } catch { return []; } };
const decodeRow = row => row && ({ ...row, genres: parseJson(row.genres), tags: parseJson(row.tags), studios: parseJson(row.studios) });

function releaseWindow(now = new Date()) {
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: config.syncTimezone,
    year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const { year, month } = dateParts;
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  const currentMonth = season === 'WINTER' ? 1 : season === 'SPRING' ? 4 : season === 'SUMMER' ? 7 : 10;
  const nextMonth = season === 'WINTER' ? 4 : season === 'SPRING' ? 7 : season === 'SUMMER' ? 10 : 1;
  const nextYear = season === 'FALL' ? year + 1 : year;
  return {
    year,
    season,
    currentStart: `${year}-${String(currentMonth).padStart(2, '0')}-01`,
    futureStart: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  };
}

router.get('/', (req, res) => {
  const { year, season, status, scope, origin, format, q = '', page = '1', limit = '24' } = req.query;
  // 防御性过滤：即使旧数据库尚未重新同步，也不向页面返回 Ecchi 条目。
  const where = [
    `genres NOT LIKE '%"Ecchi"%'`,
    `genres NOT LIKE '%"Hentai"%'`,
    `tags NOT LIKE '%"Kids"%'`,
    `tags NOT LIKE '%"Educational"%'`
  ], params = {};
  if (year) { where.push('season_year = @year'); params.year = Number(year); }
  if (season) { where.push('season = @season'); params.season = String(season).toUpperCase(); }
  if (status === 'archive') where.push("status IN ('FINISHED','RELEASING')");
  if (status === 'upcoming' && !scope) where.push("status IN ('NOT_YET_RELEASED','HIATUS')");
  const window = releaseWindow();
  if (scope === 'current') {
    where.push("start_date >= @currentStart AND start_date < @futureStart AND status IN ('RELEASING','NOT_YET_RELEASED','HIATUS')");
    params.currentStart = window.currentStart;
    params.futureStart = window.futureStart;
  }
  if (scope === 'future') {
    where.push("status IN ('NOT_YET_RELEASED','HIATUS') AND (start_date >= @futureStart OR start_date IS NULL)");
    params.futureStart = window.futureStart;
  }
  if (String(origin).toLowerCase() === 'jp') where.push("country_of_origin = 'JP'");
  if (String(origin).toLowerCase() === 'cn') where.push("country_of_origin IN ('CN','TW','HK')");
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
  res.json({ years, seasons: ['WINTER','SPRING','SUMMER','FALL'], formats: ['TV','TV_SHORT','MOVIE','OVA','ONA','SPECIAL'], currentQuarter: releaseWindow(), lastSync });
});

router.get('/:id', (req, res) => {
  const item = decodeRow(db.prepare('SELECT * FROM anime WHERE id = ?').get(Number(req.params.id)));
  if (!item) return res.status(404).json({ error: '未找到该番剧' });
  res.json(item);
});

module.exports = router;
