const path = require('path');
require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/anime.db'),
  syncCron: process.env.SYNC_CRON || '15 3 * * *',
  syncTimezone: process.env.SYNC_TIMEZONE || 'Asia/Shanghai',
  anilistEndpoint: process.env.ANILIST_ENDPOINT || 'https://graphql.anilist.co'
};
