const fs = require('fs');
const path = require('path');
const { items: bangumiItems } = require('bangumi-data');
const config = require('../config');
const db = require('../db');
const { translateText } = require('./translate');

const overridePath = path.resolve(__dirname, '../../data/title-overrides.json');
const titleOverrides = fs.existsSync(overridePath) ? JSON.parse(fs.readFileSync(overridePath, 'utf8')) : {};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const updateChineseTitle = db.prepare(`
  UPDATE anime
  SET title_chinese = @title, updated_at = @updatedAt
  WHERE id = @id AND (title_chinese IS NULL OR title_chinese = '')
`);
const applyOverrideTitle = db.prepare(`
  UPDATE anime
  SET title_chinese = @title, updated_at = @updatedAt
  WHERE id = @id AND title_chinese IS NOT @title
`);
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

// 只索引标题与简体中文译名。数据包中的站点、播放和资源字段不会被读取。
const titleIndex = new Map();
const franchiseAliases = [];
for (const item of bangumiItems) {
  const chineseTitle = item.titleTranslate?.['zh-Hans']?.[0];
  if (!chineseTitle) continue;
  const aliases = [item.title, ...Object.values(item.titleTranslate || {}).flat()];
  for (const alias of aliases) {
    const key = normalize(alias);
    if (!key) continue;
    if (!titleIndex.has(key)) titleIndex.set(key, []);
    titleIndex.get(key).push({ title: chineseTitle, begin: item.begin });
    if (String(alias).length >= 3) {
      franchiseAliases.push({ alias: String(alias).normalize('NFKC'), title: chineseTitle });
    }
  }
}
franchiseAliases.sort((a, b) => b.alias.length - a.alias.length);

function chooseOfficialTitle(item) {
  const candidates = new Map();
  for (const alias of [item.title_native, item.title_romaji, item.title_english]) {
    for (const candidate of titleIndex.get(normalize(alias)) || []) {
      candidates.set(`${candidate.title}|${candidate.begin || ''}`, candidate);
    }
  }
  if (!candidates.size) return null;
  return [...candidates.values()].map(candidate => {
    let score = 100;
    if (item.start_date && candidate.begin) {
      const dayDifference = Math.abs(new Date(item.start_date) - new Date(candidate.begin)) / 86400000;
      if (dayDifference <= 14) score += 40;
      else if (dayDifference <= 180) score += 15;
      else if (dayDifference > 500) score -= 35;
    }
    return { ...candidate, score };
  }).sort((a, b) => b.score - a.score)[0].title;
}

function chooseNativeChineseTitle(item) {
  if (!['CN', 'TW'].includes(item.country_of_origin) || !item.title_native) return null;
  return /\p{Script=Han}/u.test(item.title_native) ? item.title_native.trim() : null;
}

const chineseNumbers = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const numberToChinese = number => number <= 10 ? Object.keys(chineseNumbers).find(key => chineseNumbers[key] === number) : String(number);

function seasonNumber(...titles) {
  for (const title of titles.filter(Boolean)) {
    const arabic = title.match(/\bseason\s*(\d{1,2})\b/i)
      || title.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i)
      || title.match(/第\s*(\d{1,2})\s*[季期]/u)
      || title.match(/(?:^|[\s:_-])(\d{1,2})\s*$/u);
    if (arabic && Number(arabic[1]) >= 2 && Number(arabic[1]) <= 20) return Number(arabic[1]);
    const ordinal = title.match(/\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season\b/i);
    if (ordinal) return ['second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth'].indexOf(ordinal[1].toLowerCase()) + 2;
    const chinese = title.match(/第\s*([一二三四五六七八九十])\s*[季期]/);
    if (chinese) return chineseNumbers[chinese[1]];
    const roman = title.match(/(?:^|[\s:_-])(II|III|IV|V|VI|VII|VIII|IX|X)\s*$/i);
    if (roman) return ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].indexOf(roman[1].toUpperCase()) + 2;
  }
  return null;
}

function partNumber(...titles) {
  for (const title of titles.filter(Boolean)) {
    const normalizedTitle = String(title).normalize('NFKC');
    const match = normalizedTitle.match(/\bpart\s*(\d{1,2})\b/i)
      || normalizedTitle.match(/第?\s*(\d{1,2})\s*(?:クール|部分|篇)/u);
    if (match && Number(match[1]) >= 2 && Number(match[1]) <= 20) return Number(match[1]);
  }
  return null;
}

function seriesBase(value) {
  return normalize(String(value || '')
    .replace(/\b(?:season|part)\s*\d+\b/gi, '')
    .replace(/\b\d+(?:st|nd|rd|th)\s*season\b/gi, '')
    .replace(/\b(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season\b/gi, '')
    .replace(/第\s*[0-9一二三四五六七八九十]+\s*[季期]/g, '')
    .replace(/(?:^|[\s:_-])(?:[2-9]|1\d|20|II|III|IV|V|VI|VII|VIII|IX|X)\s*$/gi, ''));
}

function stripChineseSeason(title) {
  return String(title).replace(/\s*第\s*[0-9一二三四五六七八九十]+\s*[季期].*$/u, '').trim();
}

function inferSeriesTitle(item, knownRows) {
  if (!['TV', 'TV_SHORT', 'ONA'].includes(item.format)) return null;
  const currentBases = [item.title_romaji, item.title_native, item.title_english]
    .map(seriesBase).filter(base => base.length >= 4);
  const storedPrequel = item.prequel_id ? knownRows.find(row => row.id === item.prequel_id) : null;
  const prequelDetails = item.prequel || storedPrequel;
  const relatedPrequel = prequelDetails ? {
    ...prequelDetails,
    title_chinese: storedPrequel?.title_chinese
      || chooseOfficialTitle(prequelDetails)
      || chooseNativeChineseTitle(prequelDetails)
  } : null;
  const directPrequel = relatedPrequel?.title_chinese ? relatedPrequel : null;
  if (!currentBases.length && !directPrequel) return null;
  const earlier = knownRows.filter(row => {
    if (!row.title_chinese || !row.start_date || !item.start_date || row.start_date >= item.start_date) return false;
    const previousBases = [row.title_romaji, row.title_native, row.title_english]
      .map(seriesBase).filter(base => base.length >= 4);
    return previousBases.some(previousBase => currentBases.includes(previousBase));
  }).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  const previous = directPrequel || earlier[0];
  if (!previous) return null;
  const explicit = seasonNumber(item.title_romaji, item.title_native, item.title_english);
  const previousSeason = seasonNumber(previous.title_romaji, previous.title_native, previous.title_chinese) || 1;
  const nextSeason = explicit || previousSeason + 1;
  const currentPart = partNumber(item.title_romaji, item.title_native, item.title_english);
  if (currentPart && nextSeason === previousSeason) {
    const partLabel = currentPart === 2 ? ' 后半篇' : ` 第${currentPart}部分`;
    return `${stripChineseSeason(previous.title_chinese)} 第${numberToChinese(nextSeason)}季${partLabel}`;
  }
  if (nextSeason <= previousSeason || nextSeason > 20) return null;
  return `${stripChineseSeason(previous.title_chinese)} 第${numberToChinese(nextSeason)}季`;
}

function findFranchisePrefix(item) {
  for (const source of [item.title_native, item.title_romaji, item.title_english].filter(Boolean)) {
    const normalizedSource = String(source).normalize('NFKC');
    for (const candidate of franchiseAliases) {
      if (!normalizedSource.toLowerCase().startsWith(candidate.alias.toLowerCase())) continue;
      const suffix = normalizedSource.slice(candidate.alias.length);
      if (!/^[\s:：~～!！／/\-]/u.test(suffix)) continue;
      const cleanSuffix = suffix.replace(/^[\s:：~～!！／/\-]+/u, '').trim();
      if (cleanSuffix.length < 2) continue;
      return { chinese: stripChineseSeason(candidate.title), suffix: cleanSuffix };
    }
  }
  return null;
}

async function translateTitle(item) {
  // AniList 有英文名时优先翻译语义更稳定的英文；无英文名再回退到日/韩原名。
  const source = item.title_english || item.title_native || item.title_romaji;
  if (!source) return null;
  const franchise = findFranchisePrefix(item);
  if (franchise) {
    const explicitSeason = seasonNumber(item.title_romaji, item.title_native, item.title_english);
    if (explicitSeason) return `${franchise.chinese} 第${numberToChinese(explicitSeason)}季`;
    const translatedSuffix = await translateText(franchise.suffix);
    if (translatedSuffix) return `${franchise.chinese}：${translatedSuffix}`;
  }
  return translateText(source);
}

async function enrichChineseTitles(items, onProgress = null) {
  const findTitle = db.prepare('SELECT title_chinese FROM anime WHERE id = ?');
  let appliedOverrides = 0;
  for (const item of items) {
    const overrideValue = titleOverrides[item.id];
    if (typeof overrideValue !== 'string' || !overrideValue.trim()) continue;
    appliedOverrides += Number(applyOverrideTitle.run({
      id: item.id,
      title: overrideValue.trim(),
      updatedAt: new Date().toISOString()
    }).changes);
  }
  const knownRows = db.prepare('SELECT id,title_romaji,title_native,title_english,title_chinese,start_date,format,country_of_origin FROM anime WHERE title_chinese IS NOT NULL').all();
  const pending = items.filter(item => !findTitle.get(item.id)?.title_chinese)
    .sort((a, b) => String(a.start_date || '9999').localeCompare(String(b.start_date || '9999')));
  const stats = { checked: pending.length, official: 0, native: 0, inferred: 0, overridden: appliedOverrides, machine: 0 };

  const unresolved = [];
  for (const item of pending) {
    const official = chooseOfficialTitle(item);
    const native = !official ? chooseNativeChineseTitle(item) : null;
    const inferred = !official && !native ? inferSeriesTitle(item, knownRows) : null;
    const overrideValue = titleOverrides[item.id];
    const overridden = !official && !native && !inferred && typeof overrideValue === 'string' ? overrideValue.trim() : null;
    const title = official || native || inferred || overridden;
    if (title) {
      updateChineseTitle.run({ id: item.id, title, updatedAt: new Date().toISOString() });
      if (official) stats.official += 1;
      else if (native) stats.native += 1;
      else if (inferred) stats.inferred += 1;
      else stats.overridden += 1;
      knownRows.push({ ...item, title_chinese: title });
    } else unresolved.push(item);
  }

  let consecutiveFailures = 0;
  if (config.titleTranslationEnabled) {
    for (let index = 0; index < unresolved.length; index += 1) {
      const item = unresolved[index];
      try {
        const title = await translateTitle(item);
        if (title) {
          updateChineseTitle.run({ id: item.id, title, updatedAt: new Date().toISOString() });
          stats.machine += 1;
        }
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures += 1;
        // 网络不可达时快速结束，避免定时同步被数百个超时请求拖住。
        if (consecutiveFailures >= 3) break;
      }
      if (onProgress && (index + 1) % 25 === 0) onProgress(index + 1, unresolved.length, stats.official + stats.native + stats.inferred + stats.overridden + stats.machine);
      await wait(config.titleTranslationDelayMs);
    }
  }
  stats.updated = stats.official + stats.native + stats.inferred + stats.overridden + stats.machine;
  return stats;
}

module.exports = { enrichChineseTitles };
