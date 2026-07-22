const db = require('../db');
const { fetchAnime } = require('./anilist');
const { enrichChineseTitles } = require('./bangumi');
const { enrichChineseDescriptions } = require('./descriptions');

const upsert = db.prepare(`
  INSERT INTO anime (id,title_romaji,title_native,title_english,title_chinese,prequel_id,country_of_origin,description,description_chinese,description_chinese_source,cover_large,banner_image,format,status,season,season_year,start_date,end_date,episodes,duration,genres,tags,studios,source,site_url,updated_at)
  VALUES (@id,@title_romaji,@title_native,@title_english,@title_chinese,@prequel_id,@country_of_origin,@description,@description_chinese,@description_chinese_source,@cover_large,@banner_image,@format,@status,@season,@season_year,@start_date,@end_date,@episodes,@duration,@genres,@tags,@studios,@source,@site_url,@updated_at)
  ON CONFLICT(id) DO UPDATE SET
    title_romaji=excluded.title_romaji,title_native=excluded.title_native,title_english=excluded.title_english,prequel_id=excluded.prequel_id,country_of_origin=excluded.country_of_origin,
    description=excluded.description,cover_large=excluded.cover_large,banner_image=excluded.banner_image,
    format=excluded.format,status=excluded.status,season=excluded.season,season_year=excluded.season_year,
    start_date=excluded.start_date,end_date=excluded.end_date,episodes=excluded.episodes,duration=excluded.duration,
    genres=excluded.genres,tags=excluded.tags,studios=excluded.studios,source=excluded.source,site_url=excluded.site_url,updated_at=excluded.updated_at
`);
// 内置 node:sqlite 没有 transaction 包装器，显式事务仍可确保批量写入原子性。
function writeBatch(items) {
  db.exec('BEGIN IMMEDIATE');
  try {
    items.forEach(({ prequel: _prequel, ...databaseItem }) => upsert.run(databaseItem));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function removeExcluded(ids) {
  if (!ids.length) return 0;
  const remove = db.prepare('DELETE FROM anime WHERE id = ?');
  let removed = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    ids.forEach(id => { removed += Number(remove.run(id).changes); });
    db.exec('COMMIT');
    return removed;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

let running = false;
async function syncAnime() {
  if (running) return { skipped: true, message: '已有同步任务运行中' };
  running = true;
  const log = db.prepare("INSERT INTO sync_log (started_at,status) VALUES (?, 'RUNNING')").run(new Date().toISOString());
  try {
    const { items, excludedIds } = await fetchAnime();
    writeBatch(items);
    const removed = removeExcluded(excludedIds);
    const chineseTitles = await enrichChineseTitles(items);
    const chineseDescriptions = await enrichChineseDescriptions(items);
    db.prepare("UPDATE sync_log SET finished_at=?,status='SUCCESS',records=? WHERE id=?").run(new Date().toISOString(), items.length, log.lastInsertRowid);
    return { records: items.length, removed, chineseTitles, chineseDescriptions };
  } catch (error) {
    db.prepare("UPDATE sync_log SET finished_at=?,status='FAILED',message=? WHERE id=?").run(new Date().toISOString(), error.message, log.lastInsertRowid);
    throw error;
  } finally { running = false; }
}

module.exports = { syncAnime };
