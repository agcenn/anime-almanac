const config = require('../config');

const QUERY = `
query AnimePage($page: Int!, $perPage: Int!, $start: FuzzyDateInt!, $end: FuzzyDateInt!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, isAdult: false, genre_not_in: ["Ecchi", "Hentai"], sort: START_DATE, startDate_greater: $start, startDate_lesser: $end) {
      id title { romaji english native } description(asHtml: false)
      coverImage { extraLarge large } bannerImage format status season seasonYear countryOfOrigin
      startDate { year month day } endDate { year month day }
      episodes duration genres source siteUrl
      studios(isMain: true) { nodes { name } }
      relations {
        edges {
          relationType
          node { id title { romaji english native } startDate { year month day } format countryOfOrigin }
        }
      }
    }
  }
}`;

const fuzzy = (date) => Number(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`);
const isoDate = (value) => value?.year ? `${value.year}-${String(value.month || 1).padStart(2, '0')}-${String(value.day || 1).padStart(2, '0')}` : null;

async function request(variables) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(config.anilistEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables }),
        signal: AbortSignal.timeout(config.anilistTimeoutMs)
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`AniList 暂时不可用：HTTP ${response.status}`);
      } else {
        if (!response.ok) throw new Error(`AniList 请求失败：HTTP ${response.status}`);
        const json = await response.json();
        if (json.errors) throw new Error(json.errors.map(item => item.message).join('; '));
        return json.data.Page;
      }
    } catch (error) {
      lastError = error;
    }
    // 对限流、服务端错误和临时网络超时做指数退避，最多重试四次。
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 2000 * (2 ** attempt)));
  }
  throw lastError;
}

// 同步最近 8 年至未来 3 年，兼顾资料库与已公布的远期企划。
async function fetchAnime() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear() - config.syncHistoryYears, 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 3, 11, 31));
  const all = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await request({ page, perPage: 50, start: fuzzy(start) - 1, end: fuzzy(end) + 1 });
    all.push(...result.media);
    if (!result.pageInfo.hasNextPage) break;
  }
  return all
    .filter(item => !item.genres?.some(genre => genre === 'Ecchi' || genre === 'Hentai'))
    .map(item => ({
    id: item.id,
    title_romaji: item.title.romaji,
    title_native: item.title.native,
    title_english: item.title.english,
    // PREQUEL 是 AniList 给出的直接前作关系，比只比较相似标题更可靠。
    prequel_id: item.relations?.edges?.find(edge => edge.relationType === 'PREQUEL')?.node?.id || null,
    country_of_origin: item.countryOfOrigin,
    // AniList 不保证中文标题；稍后由 Bangumi 的正式 name_cn 字段补充。
    title_chinese: null,
    description: item.description,
    // 优先使用 AniList 的最高分辨率封面；旧作品缺图时再回退到 large。
    cover_large: item.coverImage?.extraLarge || item.coverImage?.large,
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
      updated_at: new Date().toISOString(),
      // 仅在本轮译名推断中使用；写入 SQLite 前会被移除。
      prequel: (() => {
        const node = item.relations?.edges?.find(edge => edge.relationType === 'PREQUEL')?.node;
        return node ? {
          id: node.id,
          title_romaji: node.title?.romaji,
          title_native: node.title?.native,
          title_english: node.title?.english,
          start_date: isoDate(node.startDate),
          format: node.format,
          country_of_origin: node.countryOfOrigin
        } : null;
      })()
    }));
}

module.exports = { fetchAnime };
