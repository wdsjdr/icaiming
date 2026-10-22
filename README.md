# IC Aiming

## 本地站宠（按需视频）

发布安全：本次仅按十五 key 定点上传（其中 8 个为新增、7 个已核验不重传），不运行全桶 `content:publish`。未来完整内容发布必须保留全部现有内容与旧版站宠文件；不能从十五文件子目录镜像发布，以免删除其他受管对象。旧版对象和完整内容源均须保留，以支持回滚。

不读取或探测私人对象；资源域的桶公开范围须由所有者独立审核，CORS 不是访问控制。

- 本地启动、已验收范围与正式上线分阶段操作见 [站宠工作流](docs/site-pet.md)；上游完整署名：PC2005-cloud / dsh-pet 0.3.7，**https://github.com/PC2005-cloud/dsh-pet**（许可全文见下方 notices）。
- `pnpm dev` 会在内容同步后校验并种入 **15 段白名单 WebM（6,030,322 bytes）** 到本地 Miniflare R2，再显式传递 `SITE_PET_LOCAL=1` 给本地构建。不会访问生产 R2、读取上传密钥或把视频复制到 `public/` / `dist/`。独立清单为 `_local/pet-manifest.json`，不进入内容导入器清单。
- 源目录保持为 `../资源/dsh-pet-0.3.7/dsh-pet/assets/webm`。`pnpm pet:prepare` 可单独准备本地资源；`pnpm dev:ui` 用 Astro 的精确白名单中间件直接读取相同十五段源文件，无需额外媒体服务。
- 桌面细指针宽屏在页面 load + 空闲延后开启；手机、平板从 Header「外观设置」的站宠分组手动开启。关闭会记住；减少动画、入场动画、后台会暂停/阻止请求。Safari 默认静态降级；透明视频仍需实际设备验收。
- 核心 idle/walk 共 1,038,339 bytes，不计可选预算。可选池每会话固定自动 1 段、点击 2 段，首次点击不预取。每次真正 fetch 前预占原始预算：自动 3 MiB、总可选 8 MiB，失败/取消不退；仅页内 blob 命中免扣，HTTP 缓存命中仍扣。这是请求计账，不是实际传输流量硬上限。
- 普通 `pnpm build` 由 Astro production 模式加载已纳入版本控制的 `.env.production`，默认启用站宠，公开 base 固定为 **`https://assets.icaiming.cn/assets/pet/v0.3.7-web-2`**（直连不含 `/media/`）。该文件只有一个公开 URL，不含密钥；其他 `.env.*` 仍被忽略，不复制实际开发环境。进程环境的 `PUBLIC_PET_ASSET_BASE_URL` 优先，可有意覆盖；Cloudflare CI **不得设置 `SITE_PET_LOCAL=1`**，它仅用于 `pnpm dev` 的本地生产构建。未核实控制台环境，不声称 dashboard 已设置；Worker `[vars]` 不是 Astro 构建环境。构建仍校验 HTTPS/域名/版本路径，按 `<base>/<sha256>/<id>.webm` 引用，拒绝 localhost、IP、r2.dev。复用单桶 `icaiming-content`，不新增 binding。直连必须由对象自身提供 `video/webm` 与一年 immutable，并允许 Origin `https://www.icaiming.cn` 的 GET/HEAD CORS，不能依赖 Worker 纠正头。公开域可暴露桶内已知 key，不限 pet；CORS 不是鉴权，公开范围须所有者审核。本地集成不修改凭据或云配置，不上传或部署，不把本地验证当作真实 CORS 验收。
- `pnpm exec tsx scripts/pet/stage.ts` 逐项校验源文件和已有目标，仅向完整 `../icaiming-content/assets/pet/v0.3.7-web-2/<sha256>/<id>.webm` 复制缺失片段（现有 15 个动作共用该不可变前缀），不覆盖不同内容、不改 manifest、不操作远端。本次后续发布只定点 PUT **新增的 8 key**；未来完整 `content:publish` 必须保留全部现有内容和所有回滚版本，**绝不能把仅十五个文件的不完整目录当作内容发布源**。整个 `assets/pet` 树禁止从管理页删除（忽略 ASCII 大小写），所有目录/链接删除也拒绝；仍允许列表/预览、普通媒体文件删除及回收站恢复。精确白名单 URL 的 Worker GET/HEAD 返回 `video/webm`、长度/ETag 和一年 immutable（本地 no-store）；直连绕过 Worker，须单独验证对象元数据和 CORS，均不等于已验证边缘 CDN 缓存。
- 定向验证：`pnpm exec tsx --test tests/pet*.test.ts`、`pnpm check`、`pnpm build`。完整本地预览入口仍是 `pnpm dev`，无需运行会修改内容的 `test:local`。

动画出处（介绍、展示及分发均须保留）：**https://github.com/PC2005-cloud/dsh-pet** · Copyright (c) 2026 PC2005-cloud。代码 MIT；动画等素材允许开源使用、禁止商用。同人二创作品，与 DeepSeek 官方无关，非合作、非商用；形象与同人二创 CC BY-NC-SA 4.0 声明不改变代码或上游素材许可。三位原型作者署名、主页链接、完整许可与上线前范围确认见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，展示及分发时一并保留。

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
| `pnpm preview` | 运行已有 dist + 本地 R2（`wrangler dev`，启动时按 `[build]` 先构建） |
| `pnpm test` | 内容契约、发布规则、Markdown 安全边界及榜单解析测试 |
| `pnpm test:local` | 对运行中的 `pnpm dev` 验证内容新增、修改、草稿和无需重建 |
| `pnpm dev:ui` | 仅 Astro 热更新预览，不启动 Worker/R2；日常完整预览用 `pnpm dev` |
| `pnpm aggregator:dev` | 本地运行聚合 Worker，`GET /run?task=<name>` 手动执行单个抓取任务（需令牌） |
| `pnpm aggregator:deploy` | 部署聚合 Worker（4 条 Cron 触发器，见下文） |

`test:local` 会创建唯一命名的临时文章并在结束后删除；开发服务正在运行时执行。默认访问 `http://127.0.0.1:4321`，可用环境变量 `LOCAL_ORIGIN` 修改。

## 本地管理页（pnpm admin）

`pnpm admin` 启动仅监听 127.0.0.1:4400 的管理页（自动打开浏览器，`--no-open` 或 `ADMIN_NO_OPEN=1` 可禁用；端口用 `ADMIN_PORT` 调整），无需安装额外依赖：

- 编辑文章（frontmatter 表单 + Markdown 实时预览）、资源收藏、下载清单、项目、资料/首页、简历（含 PDF 上传），管理 `assets/`、`downloads/`、`resume/` 媒体文件。
- 所有写入只落到 `../icaiming-content/`（原子写入 + 同名自动序号 + 文件名校验）；本地 R2 同步仍由 `pnpm dev` 监听完成，管理页不直接写 R2。
- 删除进入 `icaiming-content/.trash/`，可在管理页恢复或彻底删除；文章、媒体删除后管理页会询问是否立即发布到 R2，让线上同步删除（集合条目删除后点「保存并发布」即可）。
- 「校验全部内容」等价 `content:check`（只校验本地内容）；「发布到生产 R2」等价 `content:publish`（增量上传：未变更对象跳过，完成后汇总新增/更新/跳过/删除），发布前二次确认并回显日志，`.dev.vars` 凭据只在服务端读取。文章、集合、资料/首页、简历等表单另提供「保存并发布」：先写入本地内容仓库，再立即发布到生产 R2（发布失败会提示，本地修改仍已保存）。
- 「对比生产 R2」列出本地与线上的差异：**缺失**（本地有、线上无，发布后会补上）与**多余**（本地无、线上有，发布后会删除），用于发现「校验」看不到的线上漂移。
- 发布按**列桶镜像**删除：上传后列出生产桶，删除所有本地已无、线上仍存的受管对象（跳过 `rankings/`、`misc/` 与 `_local/`），因此删除文章/媒体无需依赖 manifest 也能同步；文章、媒体删除后会询问是否立即发布。R2 返回弱 ETag（`W/"md5"`），发布据此跳过未变更对象。
- 条目编辑交互：新增条目自动滚动定位并聚焦、必填与链接/日期格式就地中文校验、错误条目定位高亮、未保存修改在切换页签或关闭页面前确认、移动按钮边界禁用、工具栏吸顶（新建/编辑文章同样有未保存守卫）。下载条目的「资源来源」用「本地文件 / 外部链接」二选一控件：本地点「选择 / 上传…」打开资源选择器（可搜索、显示缩略图与大小、按目录上传后直接选中），图片显示预览；外链直接填 URL。
- 发布凭据（R2 令牌）可直接在「概览 → 发布凭据」粘贴更新：保存写入 `icaiming/.dev.vars`（合并保留其他行，已 gitignore），当前会话立即生效，适合 R2 令牌到期轮换；已保存的值不会回显。
- Cloudflare 部署（「概览 → Cloudflare 部署」）：粘贴 API 令牌后先调用 `wrangler whoami` 验证，仅保存在管理页进程内存中（不写盘，关闭管理页即清除，也可手动清除）。可一键部署 `ic-aiming-aggregator`，或设置其 `RUN_TOKEN`（值经 stdin 交给 wrangler，设置成功后同样只保存在内存中）。部署会启用定时任务并消耗 UAPI 额度，均需二次确认。部署与设置令牌通过 wrangler 连接 Cloudflare，只跟随系统环境变量里的代理（`HTTPS_PROXY`），**不读取** `icaiming/.env` 的代理配置，避免因代理未运行导致部署失败。
- 聚合任务（「聚合任务」页签）：手动执行聚合 Worker 的单个任务（`rankings`、`hotboard`、`daily-news`、`epic`、`saying`），结果以 JSON 显示。需要已就绪的 `RUN_TOKEN`：刚在概览设置过会自动就绪；管理页重启后粘贴已设置的值验证即可（验证只发送一次不带任务的请求，不执行抓取）。消耗积分的任务执行前需确认。Worker 地址默认为 `https://ic-aiming-aggregator.3043927908.workers.dev`，可用环境变量 `AGGREGATOR_URL` 覆盖（只能是域名或源，不能带路径）。若本机直连 Cloudflare 不通，在 `icaiming/.env`（已 gitignore）中加入 `HTTPS_PROXY=http://127.0.0.1:7897`（端口按你的代理软件），然后重启 `pnpm admin`。管理页启动时会**探测代理端口**：可达就走代理、不可达就直连；发布/对比/聚合调用在连接失败时会自动切换出口（代理 ↔ 直连）重试一次——所以代理程序没开也不会再出现 `fetch failed`。该代理只作用于管理页自身的请求（聚合任务调用、S3 发布），不会传给 wrangler 子进程；部署聚合 Worker 走系统环境变量里的代理。Node 不读取 Windows 系统代理，所以必须写在这里或设置环境变量；「聚合任务」页会显示代理地址与当前出口（不含凭据）。
- 发布到生产 R2 不会改动聚合 Worker 写入的 `rankings/` 与 `misc/`：导入器的内容列表不包含这些前缀，上传与清理都会跳过它们（`tests/admin-aggregator.test.ts` 有对应断言）。
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
- 发现页分栏 Tab：「精选收藏」「资源下载」「数据榜单」「热榜 · 前沿」（默认热榜，粘性标签栏，方向键可切换，首次激活才拉取）；下载项经内容仓库导入，本机文件以 `/media` 附件下载、外部链接在新窗口打开；榜单（GitHub 趋势）与热榜、一言由聚合 Worker 定时抓取写入 R2，前端呈现并标注更新时间，失败保留上次结果。
- `/daily` 每日新闻日历：聚合 Worker 每日 09:00（北京）抓一张新闻图存入 R2，月历可回看近 12 个月，超过 `NEWS_RETENTION_DAYS`（默认 365 天）自动清理；日历下方展示 Epic「限时免费」游戏。
- `/fun/focus` 聚焦练习（限时 60 秒点小球，难度递增，统计反应时间与命中率，最佳成绩存于本地 `focus-best`）与 `/fun/answerbook` 答案之书（实时转发 UAPI，免费接口，失败回退提示）；首页 status 行与页脚显示随机一言。游戏与实验条目硬编码在 `src/pages/fun/` 中，不属于内容仓库。
- 首页开屏动画：原子 → 平面 → 翻转显示标识与标语 → 镜头穿越，Three.js + GSAP 按需加载（gzip 约 174 KB），每会话一次，可跳过；`?intro=1` 重播、`?intro=0` 关闭，详见 [品牌规范](docs/BRAND.md#开屏动画)。
- `/legal` 法律与隐私：用户协议、隐私政策、免责声明、其他声明四个静态页，中英文逐条对照（中文为准），页脚入口、sitemap 收录。文本在 `src/lib/legal.ts`（随代码维护，不放 R2）；新增或改变涉及数据处理的功能（Cookie、存储键、第三方接口、订阅、统计）时，同步修改该文件与 `LEGAL.updated`。
- 两处背景涌现效果，均为纯 Canvas、按需加载、失败不影响页面：首页 Hero 的「流光」使用 Reynolds Boids、缓弯主流向与渐隐拖尾（不绘制粒子头），指针轻微扰动；`/fun` 页头区域铺满的康威生命游戏以低密度方格缓慢变化，作为「玩点不一样的 / Play」标题底纹。两者配色取自 CSS 变量，随皮肤与明暗模式切换；关闭动画或系统「减少动态效果」时保留静态画面，离开视口或标签页隐藏时暂停。首页 Hero 和 Playground 页头随滚动由下而上柔和虚化退场（模糊上限 12px）。

简历经历、教育和 PDF 尚待个人资料补充；页面展示对应空状态。两篇初始文章明确作为示例，资源列表为建站相关的初始收藏。

## 内容维护

详细格式见 [`../icaiming-content/README.md`](../icaiming-content/README.md)。

文章由站点运行时直接读取 R2：列出 `posts/*.md` 对象，解析 frontmatter，过滤草稿和未来日期文章。发布流程不变，在内容仓库本地编辑后执行 `pnpm content:publish` 上传；直接在 R2 中新增、修改或删除的文章同样会自动生效，无需重新发布或重建。文章列表在每个 Worker 实例内缓存 60 秒（`LOCAL_DEV=true` 时不缓存）；单篇文章读取不缓存。`posts/index.json` 已不再被站点读取，损坏的单篇文章会被跳过并记录日志，不影响其他文章。未来日期以 UTC 日历日计算，到达当天后约 60 秒内自动上线。

`site/profile.json` 管理介绍、邮件和社交账号；`site/home.json` 管理首页介绍；`projects/index.json`、`resources/index.json`、`downloads/index.json`、`resume/resume.json` 管理相应页面。`downloads/index.json` 的每个条目需**恰好提供** `file`（`assets/` 或 `downloads/` 下已存在的文件，导入时校验）或 `url`（网络下载链接）之一。

`rankings/combined.json`、`misc/hotboard/*`、`misc/epic-free.json`、`misc/saying.json` 由聚合 Worker 直接写入 R2，**内容仓库不包含这些键**（导入器不会上传/删除它们，避免覆盖线上数据）；本地首次需运行 `pnpm aggregator:dev`，再用 `Authorization: Bearer <RUN_TOKEN>` 请求 `/run?task=rankings`（可选 `hotboard`、`daily-news`、`epic`、`saying`）抓一次，缺失时前端显示空状态。`RUN_TOKEN` 写入 `workers/aggregator/.dev.vars`（已 gitignore）；线上通过 `wrangler secret put RUN_TOKEN --config workers/aggregator/wrangler.toml` 设置，未设置时 `/run` 返回 503。抓取源为 GitHub Trending、UAPI（热榜、Epic 限免需积分、一言免费），可用 `UAPI_KEY` secret 提升额度；积分预算见 [本地实施计划](docs/LOCAL-ROADMAP.md)。

### 发布到生产 R2

本地导入器默认只写本地 R2（`pnpm content:sync`）。要把内容发布到生产桶 `icaiming-content`（内容更新不触发站点重新部署）：

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
src/lib/               内容契约、浏览器渲染、主题逻辑、法律文件文本（legal.ts）
src/server/            R2 服务、Markdown 渲染
src/styles/            主题、分区、长文和动效样式
src/stores/            Nanostores 偏好状态
src/worker/            站点 Worker：index.ts 路由，handlers/ 下为 API、文章、媒体、RSS 与 sitemap
workers/aggregator/    定时抓取榜单、热榜、限免与一言写入 R2 的独立 Worker
scripts/               本地同步、开发与集成验证
tests/                 必要的数据及渲染测试
docs/                  实施计划、品牌规范和验收记录
```

`article-shell` 由 Astro 构建，Worker 通过 `ASSETS` 绑定取出模板，使用 HTMLRewriter 注入正文和 meta。外部直接访问模板返回 404。浏览器包不包含 YAML 解析或服务端 Markdown 渲染库。

## 部署

本次站宠沿用 **GitHub `wdsjdr/icaiming` 的 `main` → Cloudflare Workers Builds**。先独立审核干净的 pet-only 分支及本地测试/构建，待所有者批准后再提交并推送/合并到 `main`；本地集成阶段不执行 commit、push 或部署。不新建 standalone/olderwebsite 站点，也不手动运行 Wrangler deploy。公开生产 base 随 `.env.production` 一起进入 GitHub，不依赖未经核实的 dashboard 变量；CI 仍须确认无本地标志或意外进程变量覆盖。具体审计和回滚见 [站宠工作流](docs/site-pet.md#5-阶段三生产构建审计与站点发布)。

站点是一个 Cloudflare Worker（`wrangler.toml`：`main` 为 `src/worker/index.ts`，`[assets]` 指向 `dist`）。Workers Builds 连接本仓库 `main` 分支：每次推送时执行 `wrangler.toml` 中的 `[build]`（`pnpm build`），再部署。

- R2 绑定 `CONTENT_BUCKET` 写在 `wrangler.toml` 中，随部署生效，不需要在控制台手动绑定。
- `LOCAL_DEV` 不写入 `wrangler.toml`，生产环境启用边缘缓存；本地由 `pnpm dev` 通过 `--var LOCAL_DEV:true` 传入。
- 路径 `/api/*`、`/blog/*`、`/daily-image/*`、`/media/*`、`/rss.xml`、`/sitemap.xml`、`/article-shell*` 先经 Worker 处理，其余直接由静态资源返回。
- 自定义域名绑定在 Worker 的 Settings → Domains & Routes 中。

Wrangler 与 Miniflare 使用配套版本，前后端 TypeScript 配置独立，避免 Workers `Element` 等类型污染浏览器 DOM。

## 文档

- [更新日志](CHANGELOG.md)
- [本地实施计划与后续任务](docs/LOCAL-ROADMAP.md)
- [品牌与视觉规范](docs/BRAND.md)
- [本地验收记录](docs/VERIFICATION.md)

聚合 Worker（`workers/aggregator`）用 **4 个 Cron 触发器**（免费计划上限 5，保留 1 个余量），时间为 UTC，映射在 `src/index.ts` 的 `schedule`，与 `wrangler.toml` 的 `crons` 由测试保持一致：

| Cron | 北京时间 | 任务 |
| --- | --- | --- |
| `0 */6 * * *` | 每 6 小时 | GitHub 趋势、热榜 5 平台 |
| `0 1 * * *` | 09:00 | 每日新闻图、Epic 限免 |
| `30 1 * * *` | 09:30 | 一言池 |
| `0 5 * * *` | 13:00 | 每日新闻补抓（当日已存在则跳过） |

未知的 Cron 表达式只记录日志，不执行任务。更多数据源优先并入现有触发器，按 `Source` 接口扩展，需先确认接口与字段。

后续：GSAP ScrollTrigger / Lenis 滚动增强、更多实验、更多榜单数据源（Artificial Analysis / LMSYS / OpenRouter / RSS）及扩展皮肤。正式部署见上文「部署」一节。
