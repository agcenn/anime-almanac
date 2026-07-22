const path = require('path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');
require('./db');
const animeRoutes = require('./routes/anime');
const { startScheduler } = require('./scheduler');

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/anime', animeRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.listen(config.port, () => {
  startScheduler();
  console.log(`番时计运行于 http://localhost:${config.port}`);
  console.log('首次使用请运行 npm run sync 拉取 AniList 数据');
});
