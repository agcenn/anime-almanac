const config = require('../config');

const QUERY = `
query AnimePage($page: Int!, $perPage: Int!, $start: FuzzyDateInt!, $end: FuzzyDateInt!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, sort: START_DATE, startDate_greater: $start, startDate_lesser: $end) {
      id title { romaji english native } description(asHtml: false)
      coverImage { large } bannerImage format status season seasonYear
      startDate { year month day } endDate { year month day }
      episodes duration genres source siteUrl
      studios(isMain: true) { nodes { name } }
    }
  }
}`;

const fuzzy = (date) => Number(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`);
const isoDate = (value) => value?.year ? `${value.year}-${String(value.month || 1).padStart(2, '0')}-${String(value.day || 1).padStart(2, '0')}` : null;

async function request(variables, attempt = 0) {
  const response = await fetch(config.anilistEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables }),
    signal: AbortSignal.timeout(30000)
  });
  if (response.status === 429 && attempt < 3) {
    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    return request(variables, attempt + 1);
  }
  if (!response.ok) throw new Error(`AniList 请求失败：HTTP ${response.status}`);
  const json = await response.json();
  if (json.errors) throw new Error(json.errors.map(item => item.message).join('; '));
  return json.data.Page;
}

// 同步最近 8 年至未来 3 年，兼顾资料库与已公布的远期企划。
async function fetchAnime() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear() - 8, 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 3, 11, 31));
  const all = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await request({ page, perPage: 50, start: fuzzy(start) - 1, end: fuzzy(end) + 1 });
    all.push(...result.media);
    if (!result.pageInfo.hasNextPage) break;
  }
  return all.map(item => ({
    id: item.id,
    title_romaji: item.title.romaji,
    title_native: item.title.native,
    title_english: item.title.english,
    // AniList 不保证中文标题；展示时按 native/romaji 回退，不凭空翻译。
    title_chinese: null,
    description: item.description,
    cover_large: item.coverImage?.large,
    banner_image: item.bannerImage,
    format: item.format,
    status: item.status,
    season: item.season,
    season_year: item.seasonYear,
    start_date: isoDate(item.startDate),
    end_date: isoDate(item.endDate),
    episodes: item.episodes,
    duration: item.duration,
    genres: JSON.stringify(item.genres || []),
    studios: JSON.stringify(item.studios?.nodes?.map(node => node.name) || []),
    source: item.source,
    site_url: item.siteUrl,
    updated_at: new Date().toISOString()
  }));
}

module.exports = { fetchAnime };
