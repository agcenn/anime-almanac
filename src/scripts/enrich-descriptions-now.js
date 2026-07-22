const db = require('../db');
const { enrichChineseDescriptions } = require('../services/descriptions');

const rows = db.prepare('SELECT id FROM anime ORDER BY start_date ASC').all();
enrichChineseDescriptions(rows, {
  batchSize: Number.POSITIVE_INFINITY,
  onProgress: (done, total) => console.log(`中文简介：${done}/${total}`)
})
  .then(result => {
    console.log(`中文简介完成：翻译 ${result.translated}，原生中文 ${result.originalChinese}，资料摘要 ${result.generated}`);
    process.exit(0);
  })
  .catch(error => {
    console.error(`中文简介失败：${error.message}`);
    process.exit(1);
  });
