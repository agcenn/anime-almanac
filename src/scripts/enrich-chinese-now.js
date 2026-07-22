const db = require('../db');
const { enrichChineseTitles } = require('../services/bangumi');

const rows = db.prepare(`
  SELECT id,title_romaji,title_native,title_english,start_date,episodes
  FROM anime
  WHERE title_chinese IS NULL OR title_chinese = ''
  ORDER BY start_date DESC
`).all();

enrichChineseTitles(rows, (done, total, updated) => {
  console.log(`中文译名：${done}/${total}，已匹配 ${updated}`);
})
  .then(result => {
    console.log(`中文译名补充完成：检查 ${result.checked} 部，更新 ${result.updated} 部`);
    process.exit(0);
  })
  .catch(error => {
    console.error(`中文译名补充失败：${error.message}`);
    process.exit(1);
  });
