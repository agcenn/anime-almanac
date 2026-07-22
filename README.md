# 番時計 · 番剧资讯站

一个只展示动画元数据、封面、简介、制作信息和开播日期的轻量站点。**不提供视频播放、解析、下载、影视资源链接或资源引流。**

## 项目目录

```text
.
├─ public/                 # TailwindCSS + Vanilla JS 前端
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ src/
│  ├─ routes/anime.js     # 查询、筛选、搜索与详情 API
│  ├─ scripts/sync-now.js # 手动同步入口
│  ├─ services/
│  │  ├─ anilist.js       # AniList GraphQL 客户端
│  │  └─ sync.js          # SQLite 批量更新事务
│  ├─ config.js
│  ├─ db.js               # 数据表与索引
│  ├─ scheduler.js        # node-schedule 定时任务
│  └─ server.js           # Express 入口
├─ data/                  # 运行后生成 anime.db（不提交）
├─ .env.example
├─ .gitignore
└─ package.json
```

## 本地运行

要求 Node.js 22.5 或更新版本（建议使用当前 LTS 版本）。项目使用 Node.js 内置 `node:sqlite`，无需 Python 或本机 C++ 编译工具链。

```bash
npm install
copy .env.example .env     # Windows；macOS/Linux 使用 cp
npm run sync              # 首次拉取 AniList 数据
npm run dev
```

浏览 `http://localhost:3000`。健康检查为 `GET /api/health`。

## API

- `GET /api/anime`：支持 `year`、`season`、`status=archive|upcoming`、`format`、`q`、`page`、`limit`。
- `GET /api/anime/meta`：筛选项与最近同步状态。
- `GET /api/anime/:id`：作品详情。

## AniList API 说明

本站使用 `https://graphql.anilist.co` 的公开 GraphQL 接口。读取公开动画资料**无需申请 API Key**，也不需要 OAuth。AniList 有速率限制，代码对 429 响应做了有限退避重试；请勿把同步频率设置得过高。若将来使用用户账户功能，才需要按 AniList OAuth 文档注册客户端，但本项目没有也不需要此能力。

AniList 不保证中文译名。当前数据库预留 `title_chinese` 字段，但自动同步不会擅自机器翻译；页面按中文、英文、罗马字、日文顺序回退展示。

## 定时更新

`.env` 默认配置：

```dotenv
SYNC_CRON=15 3 * * *
SYNC_TIMEZONE=Asia/Shanghai
SYNC_HISTORY_YEARS=6
ANILIST_TIMEOUT_MS=60000
```

含义是每天 03:15（北京时间）同步。可改为 `0 */12 * * *` 每 12 小时一次。`SYNC_HISTORY_YEARS` 控制向前读取多少年（默认 6 年），`ANILIST_TIMEOUT_MS` 控制单次请求超时。修改后重启 Node 进程。手动更新使用 `npm run sync`。同步通过 SQLite 事务执行；失败会写入 `sync_log`，不会清空旧数据，并会对限流、5xx 与临时超时自动退避重试。

## 部署

Node 服务需要持久化磁盘保存 SQLite，不能直接部署到纯静态 GitHub Pages。推荐：

1. 将本仓库部署到 Render、Railway、Fly.io 或一台 VPS。
2. 构建命令使用 `npm install`，启动命令使用 `npm start`。
3. 设置环境变量 `DATABASE_PATH=/持久化磁盘/anime.db`、`SYNC_CRON`、`SYNC_TIMEZONE`。
4. 首次部署后在服务控制台执行 `npm run sync`。
5. 生产环境建议使用平台持久卷，否则重启或重新部署可能丢失 SQLite 数据。

GitHub 负责源码托管，不等于 Node.js 服务已上线；如仅启用 GitHub Pages，Express、SQLite 和定时任务都不会运行。

## 版权与使用边界

- 仅展示事实性元数据、排期、封面与简介；图片和文本版权归各权利人所有。
- 不新增播放、在线播放、视频解析、磁力、网盘、下载、种子、字幕下载或影视资源链接功能。
- 不抓取国内视频站、盗版站或其他未经授权的数据源。
- AniList 数据可能延迟或有误，正式日期应以动画官方公告为准。
- 商用或公开运营前，应核对 AniList API 条款、图片使用政策，并准备权利人投诉与下架渠道。
