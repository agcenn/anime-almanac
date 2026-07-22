const schedule = require('node-schedule');
const config = require('./config');
const { syncAnime } = require('./services/sync');

function startScheduler() {
  const rule = new schedule.RecurrenceRule();
  rule.tz = config.syncTimezone;
  // 支持标准 5 段 cron；时区由 node-schedule 的 tz 选项处理。
  const job = schedule.scheduleJob({ rule: config.syncCron, tz: config.syncTimezone }, () => {
    syncAnime().then(r => console.log(`[sync] 更新 ${r.records || 0} 条`)).catch(err => console.error('[sync]', err.message));
  });
  return job;
}

module.exports = { startScheduler };
