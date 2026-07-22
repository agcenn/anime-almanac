const db = require('../db');
const { fetchAnime } = require('./anilist');

const upsert = db.prepare(`
  INSERT INTO anime (id,title_romaji,title_native,title_english,title_chinese,description,cover_large,banner_image,format,status,season,season_year,start_date,end_date,episodes,duration,genres,studios,source,site_url,updated_at)
  VALUES (@id,@title_romaji,@title_native,@title_english,@title_chinese,@description,@cover_large,@banner_image,@format,@status,@season,@season_year,@start_date,@end_date,@episodes,@duration,@genres,@studios,@source,@site_url,@updated_at)
  ON CONFLICT(id) DO UPDATE SET
    title_romaji=excluded.title_romaji,title_native=excluded.title_native,title_english=excluded.title_english,
    description=excluded.description,cover_large=excluded.cover_large,banner_image=excluded.banner_image,
    format=excluded.format,status=excluded.status,season=excluded.season,season_year=excluded.season_year,
    start_date=excluded.start_date,end_date=excluded.end_date,episodes=excluded.episodes,duration=excluded.duration,
    genres=excluded.genres,studios=excluded.studios,source=excluded.source,site_url=excluded.site_url,updated_at=excluded.updated_at
`);
// 内置 node:sqlite 没有 transaction 包装器，显式事务仍可确保批量写入原子性。
function writeBatch(items) {
  db.exec('BEGIN IMMEDIATE');
  try {
    items.forEach(item => upsert.run(item));
    db.exec('COMMIT');
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
    const items = await fetchAnime();
    writeBatch(items);
    db.prepare("UPDATE sync_log SET finished_at=?,status='SUCCESS',records=? WHERE id=?").run(new Date().toISOString(), items.length, log.lastInsertRowid);
    return { records: items.length };
  } catch (error) {
    db.prepare("UPDATE sync_log SET finished_at=?,status='FAILED',message=? WHERE id=?").run(new Date().toISOString(), error.message, log.lastInsertRowid);
    throw error;
  } finally { running = false; }
}

module.exports = { syncAnime };
