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
| `pnpm admin` | 本地管理页（127.0.0.1:4400）：文章、资源、下载、项目、资料、简历、媒体库与校验/发布 |
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

## 本地管理页（pnpm admin）

`pnpm admin` 启动仅监听 127.0.0.1:4400 的管理页（自动打开浏览器，`--no-open` 或 `ADMIN_NO_OPEN=1` 可禁用；端口用 `ADMIN_PORT` 调整），无需安装额外依赖：

- 编辑文章（frontmatter 表单 + Markdown 实时预览）、资源收藏、下载清单、项目、资料/首页、简历（含 PDF 上传），管理 `assets/`、`downloads/`、`resume/` 媒体文件。
- 所有写入只落到 `../icaiming-content/`（原子写入 + 同名自动序号 + 文件名校验）；本地 R2 同步仍由 `pnpm dev` 监听完成，管理页不直接写 R2。
- 删除进入 `icaiming-content/.trash/`，可在管理页恢复或彻底删除。
- 「校验全部内容」等价 `content:check`；「发布到生产 R2」等价 `content:publish`（增量上传：未变更对象跳过，完成后汇总新增/更新/跳过/删除），发布前二次确认并回显日志，`.dev.vars` 凭据只在服务端读取。
- 条目编辑交互：新增条目自动滚动定位并聚焦、必填与链接/日期格式就地中文校验、错误条目定位高亮、未保存修改在切换页签或关闭页面前确认、移动按钮边界禁用、工具栏吸顶；下载条目可在表单内直接上传文件并自动填入路径与大小（新建/编辑文章同样有未保存守卫）。
- 发布凭据（R2 令牌）可直接在「概览 → 发布凭据」粘贴更新：保存写入 `icaiming/.dev.vars`（合并保留其他行，已 gitignore），当前会话立即生效，适合 R2 令牌到期轮换；已保存的值不会回显。
- 安全约束：仅回环地址 + Host/Origin 校验 + 每次启动的会话令牌；`rankings/`、`misc/`、`posts/index.json` 永不可写；上传默认 50MB 上限（`ADMIN_MAX_UPLOAD_MB` 调整）。
- Windows 快捷启动：双击工作区根目录的 `启动管理页.cmd`——检测 4321 端口，站点未运行时先开新窗口跑 `pnpm dev`，再启动管理页；额外参数会透传给 `pnpm admin`（如 `--no-open`）。

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
- `/fun/focus` 聚焦练习（限时 60 秒点小球，难度递增，统计反应时间与命中率，最佳成绩存于本地 `focus-best`）与 `/fun/answerbook` 答案之书（实时转发 UAPI，免费接口，失败回退提示）；首页 status 行与页脚显示随机一言。游戏与实验条目硬编码在 `src/pages/fun/` 中，不属于内容仓库。
- 首页开屏动画：原子 → 平面 → 翻转显示标识与标语 → 镜头穿越，Three.js + GSAP 按需加载（gzip 约 174 KB），每会话一次，可跳过；`?intro=1` 重播、`?intro=0` 关闭，详见 [品牌规范](docs/BRAND.md#开屏动画)。
- 两处背景涌现效果，均为纯 Canvas、按需加载、失败不影响页面：首页 Hero 的「流光」使用 Reynolds Boids、缓弯主流向与渐隐拖尾（不绘制粒子头），指针轻微扰动；`/fun` 页头区域铺满的康威生命游戏以低密度方格缓慢变化，作为「玩点不一样的 / Play」标题底纹。两者配色取自 CSS 变量，随皮肤与明暗模式切换；关闭动画或系统「减少动态效果」时保留静态画面，离开视口或标签页隐藏时暂停。首页 Hero 和 Playground 页头随滚动由下而上柔和虚化退场（模糊上限 12px）。

简历经历、教育和 PDF 尚待个人资料补充；页面展示对应空状态。两篇初始文章明确作为示例，资源列表为建站相关的初始收藏。

## 内容维护

详细格式见 [`../icaiming-content/README.md`](../icaiming-content/README.md)。所有索引以 Markdown frontmatter 生成；不要手工修改 `posts/index.json`。

新增文章时只需要在内容仓库创建 `posts/my-note.md`。正文和索引通过本地导入器写入 R2，文章 URL 不依赖构建时的 slug 列表。无效数据在写入前被拒绝；草稿和未来日期文章不会发布。未来日期以 UTC 日历日计算，日期到达后需再次同步或重启开发服务。

`site/profile.json` 管理介绍、邮件和社交账号；`site/home.json` 管理首页介绍；`projects/index.json`、`resources/index.json`、`downloads/index.json`、`resume/resume.json` 管理相应页面。`downloads/index.json` 中的 `file` 必须指向 `assets/` 或 `downloads/` 下已存在的文件，导入时会校验。

`rankings/combined.json`、`misc/hotboard/*`、`misc/epic-free.json`、`misc/saying.json` 由聚合 Worker 直接写入 R2，**内容仓库不包含这些键**（导入器不会上传/删除它们，避免覆盖线上数据）；本地首次需运行 `pnpm aggregator:dev` 并访问 `/run` 抓一次，缺失时前端显示空状态。抓取源为 GitHub Trending 与 UAPI（热榜、Epic 限免需积分、一言免费），可用 `UAPI_KEY` secret 提升额度；积分预算见 [本地实施计划](docs/LOCAL-ROADMAP.md)。

### 发布到生产 R2

本地导入器默认只写本地 R2（`pnpm content:sync`）。要把内容发布到生产桶 `icaiming-content`（内容更新不触发 Pages 构建）：

1. 在 Cloudflare 控制台创建 **R2 API 令牌**（权限 `Object Read & Write`，范围限定该桶），取得 Access Key ID 与 Secret Access Key。
2. 写入 `.dev.vars`（已在 `.gitignore`，不会提交）：
   ```text
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   ```
   可选 `R2_ACCOUNT_ID`、`R2_BUCKET` 覆盖默认目标。
3. 运行 `pnpm content:publish`：先校验全部内容，再通过 S3 API（`aws4fetch`）**增量上传**——逐对象 HEAD 比对 ETag/MD5，未变更对象自动跳过，完成后输出「新增 / 更新 / 跳过 / 删除」汇总，并依据 `_local/manifest.json` 清单清理已删除的旧对象；**永不触碰 `rankings/`、`misc/`**（聚合 Worker 独占）。

没有 S3 密钥时，也可在 `.dev.vars` 放 `CLOUDFLARE_API_TOKEN`（+ `CLOUDFLARE_ACCOUNT_ID`），`content:publish` 会自动回退用 wrangler 上传（较慢、不做清理）。

内容仓库的 CI 可复用同一命令（凭据放仓库 Secrets）。

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
