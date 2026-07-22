const { syncAnime } = require('../services/sync');
syncAnime()
  .then(result => { console.log(`同步完成：${result.records} 条`); process.exit(0); })
  .catch(error => { console.error(`同步失败：${error.message}`); process.exit(1); });
