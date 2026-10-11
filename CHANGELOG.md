# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定。

## [未发布]

### 新增

- 发现页新增「资源下载」区块：内容仓库 `downloads/index.json` 清单 + 文件校验，`/media/<file>?download=1` 以附件下载。
- 发现页新增「数据榜单」「热榜 · 前沿」「限时免费」区块：桌面表格 / 手机卡片双形态，标注来源与更新时间，空状态诚实展示；热榜支持平台 Tab 切换。
- `/fun/answerbook` 答案之书实验：实时转发 UAPI（免费接口），失败给出提示；首页 status 行与页脚显示随机一言。
- 聚合 Worker `workers/aggregator`：`Source` 适配器接口，抓取 GitHub Trending、UAPI 热榜 5 平台、Epic 限时免费、一言池，分别写入 `rankings/`、`misc/`，`0 */6 * * *` 与 `0 4 * * *` Cron，失败保留上次结果，按 4 QPS 限速。新增 `aggregator:dev` / `aggregator:deploy` 脚本。
- 榜单解析与 UAPI 映射的离线测试（`tests/rankings.test.ts`、`tests/uapi.test.ts`）。
- 热榜按 `HOTBOARD_LIMIT` 截断（默认 50），发现页默认展示 10 条并支持展开/收起。
- 一言池跨天合并去重（`SAYING_POOL` 上限）并对 429 退避重试；发现页新增页内锚点导航，更新时间格式化为北京时间。
- 新增 `/daily` 每日新闻日历：聚合 Worker 每日 09:00（北京）抓 `daily/news-image` 存入 `misc/daily-news/<date>.jpg`，月历可回看近 12 个月，超 365 天自动清理；新增 `/api/daily-news` 与 `/daily-image/[date]` 路由（后者已加入 `_routes.json`）。
- 发现页改为粘性分栏 Tab（精选收藏 / 资源下载 / 数据榜单 / 热榜 · 前沿），同一时间只显示一块，默认「热榜 · 前沿」，支持 `#hash` 深链与方向键切换；各面板首次激活才拉取数据；数据榜单默认展示 10 条并可展开。
- 「限时免费」（Epic）从发现页移至 `/daily` 每日新闻下方。
- Cron 触发器合并为 2 个（`0 */6 * * *`、`0 1 * * *`），在 5 个上限内并为后续数据源留出空间。
- 修正聚合数据归属：内容导入器不再上传或删除 `rankings/`、`misc/` 键（缺失时前端显示空状态），避免覆盖 Worker 写入的线上数据；GitHub Trending 抓取增加 12s 超时，避免单源卡住整批任务。
- 内容发布到生产 R2：新增 `pnpm content:publish`（经 S3 API / `aws4fetch` 并行上传，按 `_local/manifest.json` 清理旧对象，不碰 `rankings/`、`misc/`）；无 S3 密钥时可回退用 `CLOUDFLARE_API_TOKEN` + wrangler。
- **修正 R2 桶名**：`ic-aiming-content` → `icaiming-content`（Pages 与聚合 Worker 的 `wrangler.toml`、发布脚本默认值），此前命名不一致会导致生产读写与发布失败。

### 计划中

- GSAP ScrollTrigger 与 Lenis 滚动增强。
- 更多交互实验与更多榜单数据源（Artificial Analysis / LMSYS / OpenRouter）。
- RSS 聚合与扩展皮肤。

## [0.2.0] - 2026-10-10

首个可用版本。本地 Astro 5 + TypeScript + Tailwind/CSS 变量，Pages Functions 读取 R2 内容，实现内容与代码分离、更新内容不触发重建。

### 新增

- IC Aiming 品牌标识、响应式公共布局与分区视觉，`/brand` 提供完整版与紧凑版标识预览及 SVG 下载。
- Default、Terminal、Newspaper 三套皮肤，亮色 / 暗色 / 跟随系统三种模式，支持 `?theme=terminal&mode=dark` 临时预览，偏好持久化且异常时仍可用。
- 首页开屏动画：原子 → 平面 → 翻转显示标识与标语 → 镜头穿越，Three.js + GSAP 按需加载（gzip 约 174 KB），每会话一次、可跳过，支持 `?intro=1` 重播与 `?intro=0` 关闭。
- 首页项目与最近文章、博客搜索和标签筛选。
- `/blog/:slug` 运行时 Markdown 详情、代码块、目录、阅读进度、文章级 SEO 与真实 404。
- 动态 `/rss.xml`、`/sitemap.xml`，资源分类检索，结构化简历与 PDF 状态，`/fun/focus` 聚焦练习。
- 本地内容同步与集成验证脚本、内容契约与 Markdown 安全边界测试。
- 品牌规范、本地实施计划与验收记录文档。

### 说明

- 简历经历、教育与 PDF 待个人资料补充，页面显示对应空状态。
- 两篇初始文章为示例内容，资源列表为建站相关的初始收藏。
- 正式部署（Cloudflare Pages、R2 桶、资源域名）安排在本地验收确认之后。

[未发布]: https://github.com/wdsjdr/icaiming/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/wdsjdr/icaiming/releases/tag/v0.2.0