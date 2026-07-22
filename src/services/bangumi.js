const { items: bangumiItems } = require('bangumi-data');
const db = require('../db');

const updateChineseTitle = db.prepare(`
  UPDATE anime
  SET title_chinese = @title, updated_at = @updatedAt
  WHERE id = @id AND (title_chinese IS NULL OR title_chinese = '')
`);

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

// 只索引标题与简体中文译名。bangumi-data 中的站点、播放和资源字段不会被读取。
const titleIndex = new Map();
for (const item of bangumiItems) {
  const chineseTitle = item.titleTranslate?.['zh-Hans']?.[0];
  if (!chineseTitle) continue;
  const aliases = [item.title, ...Object.values(item.titleTranslate || {}).flat()];
  for (const alias of aliases) {
    const key = normalize(alias);
    if (!key) continue;
    if (!titleIndex.has(key)) titleIndex.set(key, []);
    titleIndex.get(key).push({ title: chineseTitle, begin: item.begin });
  }
}

function chooseTitle(item) {
  const candidates = new Map();
  for (const alias of [item.title_native, item.title_romaji, item.title_english]) {
    for (const candidate of titleIndex.get(normalize(alias)) || []) {
      const key = `${candidate.title}|${candidate.begin || ''}`;
      candidates.set(key, candidate);
    }
  }
  if (!candidates.size) return null;
  const ranked = [...candidates.values()].map(candidate => {
    let score = 100;
    if (item.start_date && candidate.begin) {
      const dayDifference = Math.abs(new Date(item.start_date) - new Date(candidate.begin)) / 86400000;
      if (dayDifference <= 14) score += 40;
      else if (dayDifference <= 180) score += 15;
      else if (dayDifference > 500) score -= 35;
    }
    return { ...candidate, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0].title;
}

async function enrichChineseTitles(items, onProgress = null) {
  const findTitle = db.prepare('SELECT title_chinese FROM anime WHERE id = ?');
  const pending = items.filter(item => !findTitle.get(item.id)?.title_chinese);
  let updated = 0;
  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    const title = chooseTitle(item);
    if (title) {
      updateChineseTitle.run({ id: item.id, title, updatedAt: new Date().toISOString() });
      updated += 1;
    }
    if (onProgress && (index + 1) % 100 === 0) onProgress(index + 1, pending.length, updated);
  }
  return { checked: pending.length, updated };
}

module.exports = { enrichChineseTitles };
