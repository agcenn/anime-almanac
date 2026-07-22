# 番時計 · 番剧资讯站

一个只展示动画元数据、封面、简介、制作信息和开播日期的轻量站点。**不提供视频播放、解析、下载、影视资源链接或资源引流。**

作者：[agcenn](https://github.com/agcenn)。主数据来自 AniList，正式中文译名由开源 `bangumi-data` 数据包补充。同步从源头排除 AniList 成人分级、`Hentai` 与 `Ecchi` 类型作品。

## 项目目录

```text
.
├─ public/                 # TailwindCSS + Vanilla JS 前端
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ src/
│  ├─ routes/anime.js     # 查询、筛选、搜索与详情 API
│  ├─ scripts/            # 手动同步与中文名补全入口
│  ├─ services/
│  │  ├─ anilist.js       # AniList GraphQL 客户端
│  │  ├─ content-policy.js # 永久下架系列与内容策略
│  │  ├─ descriptions.js  # 中文简介翻译与资料摘要
│  │  ├─ translate.js     # 免费翻译接口客户端
│  │  └─ sync.js          # SQLite 批量更新事务
│  ├─ config.js
│  ├─ db.js               # 数据表与索引
│  ├─ scheduler.js        # node-schedule 定时任务
│  └─ server.js           # Express 入口
├─ data/
│  ├─ title-overrides.json # 人工核对后的中文名覆盖表（提交）
│  └─ anime.db             # 运行后生成（不提交）
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
npm run sync:titles       # 补充缺失译名，并应用人工核对的修正
npm run sync:descriptions # 补充中文剧情简介与中文资料摘要
npm run dev
```

浏览 `http://localhost:3000`。健康检查为 `GET /api/health`。

## API

- `GET /api/anime`：支持 `year`、`season`、`status=archive|upcoming`、`scope=current|future`、`origin=jp|cn`、`format`、`q`、`page`、`limit`。
- `GET /api/anime/meta`：筛选项与最近同步状态。
- `GET /api/anime/:id`：作品详情。

## AniList API 说明

本站使用 `https://graphql.anilist.co` 的公开 GraphQL 接口。读取公开动画资料**无需申请 API Key**，也不需要 OAuth。AniList 有速率限制，代码对 429 响应做了有限退避重试；请勿把同步频率设置得过高。若将来使用用户账户功能，才需要按 AniList OAuth 文档注册客户端，但本项目没有也不需要此能力。

AniList 不保证中文译名。数据库使用 `title_chinese` 字段保存经匹配的正式中文译名，页面主标题只显示该字段；缺失时显示“中文译名待公布”。

本站使用 CC BY 4.0 授权的 `bangumi-data`，只读取原始标题、简体中文译名与日期进行本地匹配，不读取其中的播放或资源站点字段。若没有直接译名，会采用中国动画的原生中文标题，读取 AniList 的直接前作关系，再比较数据库内更早开播的同系列 TV/网络作品，并根据已有季数生成“第二季、第三季、后半篇”等名称；仍无法匹配时才调用 MyMemory 机器翻译。机器译名会缓存在 SQLite，不会在每次刷新时改变。

少数品牌名、未公开标题或机器翻译不自然的作品，可在 `data/title-overrides.json` 中按 AniList ID 添加核对后的中文名，再运行 `npm run sync:titles`。覆盖表优先于已有缓存，适合持续修订译名。

详情页只显示 `description_chinese`。有可用原始剧情资料时分批翻译成中文；翻译接口暂时不可用或简介尚未公开时，会根据中文名、国家、制作公司、题材、原作和开播日期生成中文资料摘要，因此不会回退显示整段英文简介。

“放送予定”按当前日期自动划分为“本季度”和“未来季度”，每一组再分为“日本番剧”和“国创动画”。国创包含 AniList 国家代码 `CN`、`TW`、`HK`，日本番剧只包含 `JP`。列表按开播日期距离今天由近到远排列，未定档作品置于最后。

《吉伊卡哇（Chiikawa）》与《我的英雄学院》全系列列入永久下架策略：同步阶段会检查作品自身及关联作品的多语言标题，服务启动会清理旧数据库记录，API 也会进行防御性过滤。后续定时同步不会重新收录其续作、剧场版或衍生动画。

## 定时更新

`.env` 默认配置：

```dotenv
SYNC_CRON=15 3 * * *
SYNC_TIMEZONE=Asia/Shanghai
SYNC_HISTORY_YEARS=6
ANILIST_TIMEOUT_MS=60000
TITLE_TRANSLATION_ENABLED=true
MYMEMORY_ENDPOINT=https://api.mymemory.translated.net/get
TITLE_TRANSLATION_DELAY_MS=350
TITLE_TRANSLATION_TIMEOUT_MS=8000
DESCRIPTION_TRANSLATION_ENABLED=true
DESCRIPTION_TRANSLATION_BATCH_SIZE=40
DESCRIPTION_TRANSLATION_MAX_CHARS=1200
```

含义是每天 03:15（北京时间）同步。可改为 `0 */12 * * *` 每 12 小时一次。`SYNC_HISTORY_YEARS` 控制向前读取多少年（默认 6 年），`ANILIST_TIMEOUT_MS` 控制单次请求超时。MyMemory 的公开翻译接口无需在本项目中配置密钥；如不希望使用机器翻译，可设置 `TITLE_TRANSLATION_ENABLED=false` 或 `DESCRIPTION_TRANSLATION_ENABLED=false`。定时同步每次最多尝试翻译 `DESCRIPTION_TRANSLATION_BATCH_SIZE` 部简介，避免长时间阻塞。修改后重启 Node 进程。手动更新使用 `npm run sync`。同步通过 SQLite 事务执行；失败会写入 `sync_log`，不会清空旧数据，并会对限流、5xx 与临时超时自动退避重试。

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
- AniList 查询设置 `isAdult: false` 并排除 `Hentai`、`Ecchi` 类型；同步还会移除带 `Kids`、`Educational` 标签及已识别少儿系列/制作公司的作品。
- 永久排除《吉伊卡哇（Chiikawa）》与《我的英雄学院》系列及其标题可识别的续作、剧场版和衍生动画。
- 为遵守本站最初的版权边界，不嵌入 PV、正片或其他视频播放器，也不提供视频站跳转链接；PV 即使存在也不会进入数据库或页面。
- AniList 数据可能延迟或有误，正式日期应以动画官方公告为准。
- 商用或公开运营前，应核对 AniList API 条款、图片使用政策，并准备权利人投诉与下架渠道。
