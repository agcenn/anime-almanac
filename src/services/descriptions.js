const config = require('../config');
const db = require('../db');
const { hasChineseText, translateText } = require('./translate');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const genreLabels = {
  Action: '动作', Adventure: '冒险', Comedy: '喜剧', Drama: '剧情', Fantasy: '奇幻',
  Horror: '恐怖', 'Mahou Shoujo': '魔法少女', Mecha: '机甲', Music: '音乐', Mystery: '悬疑',
  Psychological: '心理', Romance: '恋爱', 'Sci-Fi': '科幻', 'Slice of Life': '日常',
  Sports: '运动', Supernatural: '超自然', Thriller: '惊悚'
};
const formatLabels = { TV: '电视动画', TV_SHORT: '短篇动画', MOVIE: '动画电影', OVA: 'OVA', ONA: '网络动画', SPECIAL: '特别篇', MUSIC: '音乐动画' };
const sourceLabels = { ORIGINAL: '原创企划', MANGA: '漫画', LIGHT_NOVEL: '轻小说', NOVEL: '小说', VIDEO_GAME: '游戏', WEB_NOVEL: '网络小说', OTHER: '其他作品' };

function decodeEntities(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function metadataSummary(item) {
  const title = item.title_chinese || item.title_native || item.title_romaji || '该作品';
  const origin = ['CN', 'TW', 'HK'].includes(item.country_of_origin) ? '国创'
    : item.country_of_origin === 'JP' ? '日本' : item.country_of_origin === 'KR' ? '韩国' : '';
  const format = formatLabels[item.format] || '动画作品';
  const studios = parseList(item.studios);
  const genres = parseList(item.genres).map(genre => genreLabels[genre] || genre).slice(0, 4);
  const [year, month, day] = String(item.start_date || '').split('-');
  const date = year ? `${year}年${month}月${day}日` : null;
  const facts = [];
  if (studios.length) facts.push(`由${studios.slice(0, 2).join('、')}负责制作`);
  if (date) facts.push(`计划于${date}开播`);
  if (item.source) facts.push(`改编或源自${sourceLabels[item.source] || item.source}`);
  const genreSentence = genres.length ? `作品题材包括${genres.join('、')}。` : '';
  return `《${title}》是一部${origin}${format}。${facts.length ? `${facts.join('，')}。` : ''}${genreSentence}剧情概要将在公开中文资料完善后继续更新。`;
}

// 按 UTF-8 字节数切段，尽量在句末断开，满足翻译接口的单段限制。
function splitForTranslation(source, maxBytes = 430) {
  const sentences = decodeEntities(source).match(/[^。！？.!?]+[。！？.!?]*/gu) || [];
  const chunks = [];
  let current = '';
  const pushCurrent = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
  for (const sentence of sentences) {
    if (Buffer.byteLength(current + sentence, 'utf8') <= maxBytes) {
      current += sentence;
      continue;
    }
    pushCurrent();
    let fragment = '';
    for (const character of sentence) {
      if (Buffer.byteLength(fragment + character, 'utf8') > maxBytes) {
        if (fragment.trim()) chunks.push(fragment.trim());
        fragment = character;
      } else fragment += character;
    }
    current = fragment;
  }
  pushCurrent();
  return chunks;
}

const updateDescription = db.prepare(`
  UPDATE anime
  SET description_chinese = @description, description_chinese_source = @source
  WHERE id = @id
`);

async function translateDescription(item) {
  const original = decodeEntities(item.description)
    .replace(/\n*\(Source:[^)]+\)/gi, '')
    .replace(/\n*Notes?:[\s\S]*$/i, '')
    .slice(0, config.descriptionTranslationMaxChars)
    .trim();
  if (!original) return null;
  if (hasChineseText(original)) return original;
  const chunks = splitForTranslation(original);
  const translated = [];
  for (const chunk of chunks) {
    const result = await translateText(chunk);
    if (!result) return null;
    translated.push(result);
    await wait(config.titleTranslationDelayMs);
  }
  const combined = translated.join('\n\n');
  return /\p{Script=Han}/u.test(combined) ? combined : null;
}

async function enrichChineseDescriptions(items, options = {}) {
  const batchSize = options.batchSize ?? config.descriptionTranslationBatchSize;
  const findRow = db.prepare(`
    SELECT id,title_romaji,title_native,title_chinese,description,description_chinese,
      description_chinese_source,country_of_origin,format,start_date,genres,studios,source
    FROM anime WHERE id = ?
  `);
  const rows = items.map(item => findRow.get(item.id)).filter(Boolean);
  let translated = 0, originalChinese = 0, generated = 0, attempts = 0, consecutiveFailures = 0;
  let translationAvailable = config.descriptionTranslationEnabled;

  for (const row of rows) {
    if (row.description_chinese_source === 'TRANSLATED' || row.description_chinese_source === 'ORIGINAL_ZH') continue;
    let description = null;
    let source = null;
    const cleaned = decodeEntities(row.description);
    if (hasChineseText(cleaned)) {
      description = cleaned;
      source = 'ORIGINAL_ZH';
      originalChinese += 1;
    } else if (translationAvailable && cleaned && attempts < batchSize) {
      attempts += 1;
      try {
        description = await translateDescription(row);
        if (description) {
          source = 'TRANSLATED';
          translated += 1;
        }
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) translationAvailable = false;
      }
    }
    if (!description) {
      description = metadataSummary(row);
      source = 'GENERATED';
      generated += 1;
    }
    updateDescription.run({ id: row.id, description, source });
    if (options.onProgress && (translated + originalChinese + generated) % 25 === 0) {
      options.onProgress(translated + originalChinese + generated, rows.length);
    }
  }
  return { checked: rows.length, translated, originalChinese, generated, attempts };
}

module.exports = { enrichChineseDescriptions, metadataSummary };
