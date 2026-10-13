# IC Aiming · 本地优先实施计划

更新日期：2026-10-10。依据：根目录 `Agent.md`、`资源/` 和已确认的品牌方向。

## 1. 本轮目标

先在本地完成品牌、内容、运行链路和多端体验，再安排部署。本轮交付能通过一个命令启动的完整本地站点，内容更新独立于 Astro 构建。

英文主名 **IC Aiming**：IC 是 Ice Cold，也是 “I see” 的谐音；Aiming 表示瞄准，也是名字的一部分。参考现有几何 Logo，围绕 A、W 与 IC 重新设计。联系方式及社交账号来自 `资源/个人联系方式与账号地址.txt`。

## 2. 视觉与交互

各区共享标识、导航、字体比例、间距、边框和操作习惯；通过排版和局部色彩体现内容差异。

| 分区 | 气质 | 表现 |
| --- | --- | --- |
| 首页 | 冷感几何 | 冰白、石墨、冰蓝，聚焦图形和醒目字标 |
| 博客 | 编辑式阅读 | 柔和纸感、衬线标题、舒适行宽、目录 |
| 资源 | 信息工作台 | 分类、搜索、清楚的来源和状态 |
| 关于、简历 | 克制专业 | 信息分组、经历时间线、打印样式 |
| 好玩 | 实验空间 | 局部高对比、交互实验和控制面板 |

三层独立：`data-mode`（light/dark，偏好可为 system）、`data-theme`（皮肤）、`data-section`（分区）。本轮完成 Default、Terminal、Newspaper 三种可用皮肤，后续扩展其他皮肤。明暗、皮肤和动画偏好持久化；URL 参数只临时预览。遵守减少动画偏好、44px 操作区域和键盘导航。

Logo 交付：A/W 几何主体、IC 开口与中轴、横版字标、独立图标、明暗适配。原始资源保留，衍生图标使用可维护的 SVG。

## 3. 架构与数据

```text
icaiming-content/ → 校验 / 生成文章索引 → 本地 R2
                                            ↓
浏览器 → Wrangler Pages → 静态 Astro + Pages Functions
```

- `icaiming/`：代码、组件、样式、Functions、开发脚本、测试与文档。
- `icaiming-content/`：文章、个人资料、项目、简历、资源和媒体。
- 两个目录分别初始化 Git；本轮所有操作均为本地。
- `pnpm dev` 负责准备内容、构建、启动 Pages 运行时，并监听代码与内容变化。
- Markdown frontmatter 是文章元数据来源；`posts/index.json` 由脚本生成，草稿及未来日期文章不发布。
- 新增与修改内容经本地同步即可生效；正文先写入，索引最后更新。
- 首页和列表通过 `/api/*` 读取内容；详情由 `src/worker/handlers/blog.ts` 读取 R2 并注入 Astro 文章模板，返回带正文、标题、描述、canonical 的 HTML。
- 动态文章不使用构建时枚举 slug；真实 404、异常响应、缓存策略与安全 Markdown 渲染一并完成。
- 新增 `site/profile.json`、`site/home.json`、`projects/index.json`。资料未提供的经历和 PDF 显示诚实的空状态。

## 4. 实施顺序与验收

### M1：工程及内容链路
- [x] 初始化两个 Git 仓库，完善忽略规则。
- [x] Wrangler 与本地持久化 R2，内容校验及导入脚本。
- [x] 一个本地启动命令，代码与内容变更可预览。
- [x] 文章、个人资料、首页、项目、资源、简历的类型契约。

验收：干净安装后可启动；绑定缺失、内容缺失、无效数据有明确反馈。

### M2：品牌及公共体验
- [x] 新 Logo、站点主名、favicon 与社交图标。
- [x] 公共布局、分区风格、响应式导航、页脚。
- [x] 明暗/系统、皮肤/URL 预览、动画偏好和持久化。
- [x] 系统字体回退、独立按钮前景色、键盘及减少动画支持。

验收：手机、平板、桌面均无水平溢出；键盘、暗色和减少动画模式可用。

### M3：博客及页面内容闭环
- [x] 首页最近文章和项目读取数据。
- [x] 博客搜索、标签、真实详情链接及空状态。
- [x] Markdown 详情、代码块、目录、阅读进度、文章元信息。
- [x] 动态 RSS、sitemap、缺失文章 404。
- [x] 关于、结构化简历及 PDF 状态、资源分类与检索。

验收：新增文章只同步内容即可出现在列表并直接访问；详情刷新正常；草稿不可被直接读取；错误内容不污染已发布索引。

### M4：验证及交接
- [x] `pnpm check`、`pnpm build`。
- [x] 内容解析、slug、草稿和 Markdown 安全边界的必要测试。
- [x] 浏览器验证主题、移动导航、检索、详情直达、错误路径。
- [x] 实测内容更新无需 Astro 重建，更新 README 和本计划进度。

本轮已完成 M1—M4，并加入 `/fun/focus` 点小球练习（限时、反应时间统计、难度递增、本地最佳成绩）。验证细节见 [VERIFICATION.md](VERIFICATION.md)，启动及维护方法见 [README](../README.md)。

## 5. 后续工作

已完成首页原子到 Logo 开屏动画（可跳过、按需加载、会话内一次、低端设备 CSS 简版）。发现页现有「精选收藏 / 资源下载 / 数据榜单 / 热榜 · 前沿」四块（粘性分栏 Tab，默认热榜，首次激活才拉取）；Epic「限时免费」移至 `/daily` 每日新闻下方；好玩页新增 `/fun/answerbook` 答案之书，首页 status 行与页脚显示随机一言。

聚合 Worker 合并为 `workers/aggregator`：GitHub Trending 榜单（归一化写入 `rankings/combined.json`）、UAPI 热榜 5 平台（`misc/hotboard/*`）、Epic 限时免费（`misc/epic-free.json`）、一言池（`misc/saying.json`）、每日新闻图（`misc/daily-news/<date>.jpg`）。免费计划最多 5 个 Cron 触发器，故用 **2 个**：`0 */6 * * *`（榜单 + 热榜）与 `0 1 * * *`=北京 09:00（每日新闻 + 限免 + 一言）。失败保留上一次结果，UAPI 调用按 4 QPS 限速间隔。每日新闻图按北京日期命名、幂等跳过、超 `NEWS_RETENTION_DAYS`（默认 365 天）自清理；答案之书为免费实时代理。离线测试见 `tests/rankings.test.ts`、`tests/uapi.test.ts`、`tests/daily-news.test.ts`。

积分预算（访客每月 1500）：热榜 1 积分/次 × 5 平台 × 每 6h ≈ 600/月；Epic 限免 ≈ 30/月；每日新闻 ≈ 30/月（1/天）；一言与答案之书免费。共约 660/月，留足余量；如需 `UAPI_KEY` 可提升额度，经 `wrangler secret put UAPI_KEY` 注入。

**数据归属**：`rankings/`、`misc/` 下的键由聚合 Worker 独占写；内容仓库与本地导入器都不包含、不上传、也不删除这些键（导入器另有保护名单），缺失时前端显示空状态，避免人工同步覆盖线上数据。

本地基础体验稳定后继续：GSAP ScrollTrigger/Lenis 渐进增强、更多互动实验、更多榜单数据源（Artificial Analysis / LMSYS / OpenRouter）与 RSS 聚合。每个数据源先确认可用接口与字段，再按 `workers/aggregator/src/sources` 的接口编写适配器。

部署安排在本地验收和用户确认之后：Cloudflare Pages、R2 桶 `icaiming-content`、资源域名、内容独立同步。域名、正式简历/PDF、真实项目及完整个人介绍可逐步补充。

## 6. 技能与质量原则

`frontend-design` 指导品牌、布局和交互，`playwright-cli` 用于浏览器验收。实现遇到故障时按 `systematic-debugging` 先定位再修复。工程采用 Astro + TypeScript + Tailwind/CSS 变量 + Nanostores，避免用大体积动画阻挡首屏阅读。
