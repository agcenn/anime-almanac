const path = require('path');
require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/anime.db'),
  syncCron: process.env.SYNC_CRON || '15 3 * * *',
  syncTimezone: process.env.SYNC_TIMEZONE || 'Asia/Shanghai',
  anilistEndpoint: process.env.ANILIST_ENDPOINT || 'https://graphql.anilist.co',
  syncHistoryYears: Math.max(Number(process.env.SYNC_HISTORY_YEARS || 6), 0),
  anilistTimeoutMs: Math.max(Number(process.env.ANILIST_TIMEOUT_MS || 60000), 10000),
  titleTranslationEnabled: process.env.TITLE_TRANSLATION_ENABLED !== 'false',
  myMemoryEndpoint: process.env.MYMEMORY_ENDPOINT || 'https://api.mymemory.translated.net/get',
  titleTranslationDelayMs: Math.max(Number(process.env.TITLE_TRANSLATION_DELAY_MS || 350), 200),
  titleTranslationTimeoutMs: Math.max(Number(process.env.TITLE_TRANSLATION_TIMEOUT_MS || 8000), 3000),
  descriptionTranslationEnabled: process.env.DESCRIPTION_TRANSLATION_ENABLED !== 'false',
  descriptionTranslationBatchSize: Math.max(Number(process.env.DESCRIPTION_TRANSLATION_BATCH_SIZE || 40), 0),
  descriptionTranslationMaxChars: Math.max(Number(process.env.DESCRIPTION_TRANSLATION_MAX_CHARS || 1200), 200)
};
