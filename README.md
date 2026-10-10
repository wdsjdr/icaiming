# IC Aiming

IC = Ice Cold / “I see”。Aiming = 瞄准，也是名字的一部分。

个人站本地版本：Astro + TypeScript + Tailwind/CSS 变量 + Nanostores，Pages Functions 读取本地 R2。当前阶段以本地完善为目标。

## 启动网站

需要 Node.js 22.12+ 和 pnpm。两个仓库保持同级：

```text
MySite/
├── icaiming/          # 在这里运行命令
└── icaiming-content/  # 动态内容
```

```sh
pnpm install
pnpm dev
```

打开 **http://localhost:4321/**。首次启动会校验并导入内容、构建 Astro、启动本地 Pages Functions。无需 Cloudflare 登录，R2 存在 `icaiming/.wrangler/state/v3/r2/`。

修改文章或 JSON 后自动同步 R2，刷新浏览器查看；修改 `src/`、`public/` 后自动构建，刷新页面查看。修改 Functions 由 Wrangler 监听。修改开发脚本、依赖或 Wrangler 配置后重启 `pnpm dev`。退出使用 Ctrl+C。

如果端口已被旧开发服务占用，先在旧终端 Ctrl+C，再启动本项目。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 完整本地站点，自动同步内容和重建代码 |
| `pnpm content:check` | 校验所有内容，不写入 R2 |
| `pnpm content:sync` | 手动同步内容至本地 R2 |
| `pnpm check` | 分别检查 Astro/浏览器代码及 Workers 类型 |
| `pnpm build` | 构建静态页面与共用文章模板 |
| `pnpm preview` | 运行已有 dist + 本地 R2（先执行同步与构建） |
| `pnpm test` | 内容契约、发布规则、Markdown 安全边界及榜单解析测试 |
| `pnpm test:local` | 对运行中的 `pnpm dev` 验证内容新增、修改、草稿和无需重建 |
| `pnpm dev:ui` | 仅 Astro 热更新预览，不启动 Functions/R2；日常完整预览用 `pnpm dev` |
| `pnpm aggregator:dev` | 本地运行聚合 Worker，`GET /run` 立即执行全部抓取任务 |
| `pnpm aggregator:deploy` | 部署聚合 Worker（含 6 小时 Cron 与每日任务） |

`test:local` 会创建唯一命名的临时文章并在结束后删除；开发服务正在运行时执行。默认访问 `http://127.0.0.1:4321`，可用环境变量 `LOCAL_ORIGIN` 修改。

## 已实现

- IC Aiming 品牌、响应式公共布局和分区视觉。
- `/brand` 标识预览：完整版与紧凑版、明暗对照、实际尺寸及 SVG 下载。
- Default / Terminal / Newspaper 皮肤，亮色 / 暗色 / 跟随系统，动画偏好。
- `?theme=terminal&mode=dark` 临时预览，手动设置后退出预览；偏好存储异常时仍可使用。
- 首页项目与最近文章、博客搜索和标签筛选。
- `/blog/:slug` 运行时 Markdown 详情、代码块、目录、阅读进度、文章级 SEO、真实 404。
- 动态 `/rss.xml`、`/sitemap.xml`，真实社交入口、资源分类搜索、结构化简历与 PDF 状态。
- 发现页分栏 Tab：「精选收藏」「资源下载」「数据榜单」「热榜 · 前沿」（默认热榜，粘性标签栏，方向键可切换，首次激活才拉取）；下载项经内容仓库导入、`/media` 带 attachment 下载；榜单（GitHub 趋势）与热榜、一言由聚合 Worker 定时抓取写入 R2，前端呈现并标注更新时间，失败保留上次结果。
- `/daily` 每日新闻日历：聚合 Worker 每日 09:00（北京）抓一张新闻图存入 R2，月历可回看近 12 个月，超过 `NEWS_RETENTION_DAYS`（默认 365 天）自动清理；日历下方展示 Epic「限时免费」游戏。
- `/fun/focus` 聚焦练习与 `/fun/answerbook` 答案之书（实时转发 UAPI，免费接口，失败回退提示）；首页 status 行与页脚显示随机一言。
- 首页开屏动画：原子 → 平面 → 翻转显示标识与标语 → 镜头穿越，Three.js + GSAP 按需加载（gzip 约 174 KB），每会话一次，可跳过；`?intro=1` 重播、`?intro=0` 关闭，详见 [品牌规范](docs/BRAND.md#开屏动画)。

简历经历、教育和 PDF 尚待个人资料补充；页面展示对应空状态。两篇初始文章明确作为示例，资源列表为建站相关的初始收藏。

## 内容维护

详细格式见 [`../icaiming-content/README.md`](../icaiming-content/README.md)。所有索引以 Markdown frontmatter 生成；不要手工修改 `posts/index.json`。

新增文章时只需要在内容仓库创建 `posts/my-note.md`。正文和索引通过本地导入器写入 R2，文章 URL 不依赖构建时的 slug 列表。无效数据在写入前被拒绝；草稿和未来日期文章不会发布。未来日期以 UTC 日历日计算，日期到达后需再次同步或重启开发服务。

`site/profile.json` 管理介绍、邮件和社交账号；`site/home.json` 管理首页介绍；`projects/index.json`、`resources/index.json`、`downloads/index.json`、`resume/resume.json` 管理相应页面。`downloads/index.json` 中的 `file` 必须指向 `assets/` 或 `downloads/` 下已存在的文件，导入时会校验。

`rankings/combined.json`、`misc/hotboard/*`、`misc/epic-free.json`、`misc/saying.json` 由聚合 Worker 直接写入 R2，**内容仓库不包含这些键**（导入器不会上传/删除它们，避免覆盖线上数据）；本地首次需运行 `pnpm aggregator:dev` 并访问 `/run` 抓一次，缺失时前端显示空状态。抓取源为 GitHub Trending 与 UAPI（热榜、Epic 限免需积分、一言免费），可用 `UAPI_KEY` secret 提升额度；积分预算见 [本地实施计划](docs/LOCAL-ROADMAP.md)。

## 目录与架构

```text
src/components/        公共布局、品牌及 UI
src/layouts/           全站布局、分区页布局
src/pages/             静态页面及 article-shell 共用模板
src/lib/               内容契约、浏览器渲染、主题逻辑
src/server/            R2 服务、Markdown 渲染
src/styles/            主题、分区、长文和动效样式
src/stores/            Nanostores 偏好状态
functions/             API、文章运行时 HTML、媒体、RSS、sitemap
workers/aggregator/    定时抓取榜单、热榜、限免与一言写入 R2 的独立 Worker
scripts/               本地同步、开发与集成验证
tests/                 必要的数据及渲染测试
docs/                  实施计划、品牌规范和验收记录
```

`article-shell` 由 Astro 构建，Function 通过静态资源绑定取出模板，使用 HTMLRewriter 注入正文和 meta。外部直接访问模板返回 404。浏览器包不包含 YAML 解析或服务端 Markdown 渲染库。

Wrangler 与 Miniflare 使用配套版本，前后端 TypeScript 配置独立，避免 Workers `Element` 等类型污染浏览器 DOM。

## 文档

- [更新日志](CHANGELOG.md)
- [本地实施计划与后续任务](docs/LOCAL-ROADMAP.md)
- [品牌与视觉规范](docs/BRAND.md)
- [本地验收记录](docs/VERIFICATION.md)

聚合 Worker（`workers/aggregator`）用 **2 个 Cron 触发器**（免费计划上限 5）：`0 */6 * * *` 抓 GitHub Trending 与热榜 5 平台，`0 1 * * *`（北京 09:00）抓每日新闻并顺带 Epic 限免与一言池。更多数据源优先并入现有触发器，按 `Source` 接口扩展，需先确认接口与字段。

后续：GSAP ScrollTrigger / Lenis 滚动增强、更多实验、更多榜单数据源（Artificial Analysis / LMSYS / OpenRouter / RSS）及扩展皮肤。正式部署（Cloudflare Pages + R2 `icaiming-content`）在本地验收和确认之后安排。
