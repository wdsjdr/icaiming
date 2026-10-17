# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定。

## [未发布]

### 变更

- `/resources` 命名与说明修正：「数据榜单」改为「GitHub 趋势」，「热榜 · 前沿」改为「平台热榜」；榜单右侧不再显示无说明的 `1.00/0.72` 归一化分数，改为展示今日新增 star 数（条形仍表示相对榜首比例），并补充表头、来源与每栏导语。
- `/resources` 新增「模型榜」页签：智能榜（每个基础模型取最佳配置）与成本榜（默认只显示智能不低于中位数的模型），支持仅 Max、搜索、效率前沿标记与详情抽屉（`?tab=models&model=` 深链）；数据来自 Artificial Analysis 免费档，聚合任务复用 `0 1 * * *` 时段。
- `/daily` 布局修正：日历卡片顶部与左侧新闻图片卡片对齐（`--daily-head` 44px），月份切换按钮改为 32px 方块（此前 `.icon-button` 的作用域样式不作用于本页，按钮退化成竖条），并在页面头部补充「来源：UAPI ↗」外链。
- 聚合 Worker 改为 4 条 Cron 触发器（`0 */6 * * *`、`0 1 * * *`、`30 1 * * *`、`0 5 * * *`），按表达式分派任务，未知表达式只记录日志；Epic 返回空列表时保留 R2 上一次结果。
- 聚合 Worker `/run` 需 `Authorization: Bearer <RUN_TOKEN>`，未配置令牌返回 503、错误返回 401；必须指定 `?task=`（`rankings`、`hotboard`、`daily-news`、`epic`、`saying`），每次只执行一个任务。
- 站点由 Cloudflare Pages 迁移为 Worker：`functions/` 的 12 个 Pages Function 合并为 `src/worker/index.ts` 路由加 `src/worker/handlers/`（api、blog、media、feeds），静态页面由 `[assets]` 绑定提供，`wrangler.toml` 的 `main`、`[assets]`、`[build]` 替代 `pages_build_output_dir`。
- `pnpm dev` 与 `pnpm preview` 改用 `wrangler dev`，`pnpm dev` 通过 `--var LOCAL_DEV:true` 关闭本地缓存；`pnpm dev` 不再重复执行初始构建。
- `/` 下未匹配的 `/api/*` 路径、`/article-shell` 直接访问统一返回 404 页面；`/api/:collection` 改用 `Map` 查找，避免匹配到原型链属性（如 `constructor`）。
- `html_handling = "drop-trailing-slash"`：`/blog`、`/about` 等规范地址直接返回 200，带斜杠的地址跳转到无斜杠版本。
- 删除 `public/_routes.json`。
- 每日新闻抓取防错标：UAPI 不按日期取图、每次实时重渲染（字节每次都不同），故改用 **dHash 感知哈希** 与最近 3 张归档比对——上游仍回吐前一天那张图（哪怕重新编码）时不再落盘，避免把旧图存成当天日期；补偿 Cron 稍后重试，恢复后自动补齐。
- `/daily` 布局：新闻图查看区改为限高（`min(72vh, 640px)`）内部滚动，长图不再把下方「限时免费」推远。
- 管理页各表单（文章、集合、资料/首页、简历）新增「保存并发布」：先写入本地内容仓库，再立即发布到生产 R2；发布失败会提示，本地修改仍已保存。
- 管理页部署聚合 Worker / 设置 `RUN_TOKEN` 不再继承 `icaiming/.env` 的 `HTTPS_PROXY`（改为只跟随系统环境变量），避免代理程序未运行时部署报 `fetch failed`；`.env` 代理仅作用于管理页自身请求（聚合任务调用、S3 发布）。
- 发布改为**列桶镜像删除**：上传后列出生产桶，删除本地已无、线上仍存的受管对象（跳过 `rankings/`、`misc/`、`_local/`），删除文章/媒体后发布即会从线上移除，不再依赖 manifest；文章、媒体删除后会询问是否立即发布。
- 管理页「校验与发布」新增「对比生产 R2」：列出本地与线上的**缺失**（本地有、线上无）与**多余**（本地无、线上有）差异——「校验全部内容」仅校验本地内容，看不到这类漂移。
- 修复 R2 弱 ETag（`W/"md5"`）未被识别，导致发布跳过检测失效、每次全量重传的问题。
- 管理页发布/对比改用磁盘上的最新凭据（发布前清掉进程缓存的 `R2_*`／`CLOUDFLARE_*` 再重读 `.dev.vars`），R2 令牌轮换或编辑 `.dev.vars` 后无需重启管理页；401/403 现给出「重新保存 R2 令牌」的明确提示。
- 管理页出站代理改为**启动探测 + 运行时回退**：启动时探测代理端口是否可达，不可达就直接连；发布/对比/聚合调用在连接失败时自动切换出口（代理 ↔ 直连）重试一次。代理程序没开时不再报 `fetch failed`，概览与「聚合任务」页显示当前出口。
- 下载清单支持**外部链接**：`downloads/index.json` 的 `file`（本地 `assets/` 或 `downloads/` 文件）与 `url`（网络下载链接）改为**恰好二选一**，前台外链在新窗口打开，本机文件仍以附件下载；导入器与后台校验只在有 `file` 时检查文件存在。
- `/daily-image/<date>` 缓存改为 **ETag 重验证**：带 `ETag`/`Last-Modified` 并支持 `304`，近 7 天用 `public, max-age=300, must-revalidate`、更旧日期仍 `immutable`。修复「手动替换当天新闻图后网页仍显示旧图」（旧响应被 `immutable` 长期缓存）。
### 新增

- 管理页「概览 → Cloudflare 部署」：验证并保存 Cloudflare API 令牌（仅内存）、部署聚合 Worker、设置 `RUN_TOKEN`；输出经脱敏后显示。
- 管理页「聚合任务」页签：验证并保存 `RUN_TOKEN`（仅内存），手动执行聚合 Worker 的 5 个任务并显示结果；`AGGREGATOR_URL` 可覆盖默认 Worker 地址。管理页出站请求支持代理：`HTTPS_PROXY` / `HTTP_PROXY` 环境变量或 `icaiming/.env` 中的 `HTTPS_PROXY`（依赖 `undici`），「聚合任务」页显示当前代理（不含凭据）。
- 管理页下载条目新增**资源选择器弹窗**：可搜索、显示缩略图与大小、按目录上传后直接选中，替代原先只有提示的下拉框；条目内的「本地文件 / 外部链接」二选一控件可一键切换，图片文件显示预览。聚合 Worker 引入 `jpeg-js`，以 dHash 感知哈希识别上游未更新的同图（见 `tests/daily-news.test.ts`）。
- `/daily` 新增「游戏特惠」（Steam 折扣）区块：卡片显示封面、折扣、现价与原价、好评率与评测数、史低 / 新史低与剩余时间，支持名称搜索、筛选（史低 / 新史低 / 免费 / ≥70% / ≥90%）、排序与分批加载，数据来自 `/api/steam-deals`。
- 首页 Hero 背景「流光」：Reynolds Boids 以拖拽的光线呈现（无鸟类形态），加入缓弯主流向、连续柔线拖尾与更轻的指针扰动；雷达面板坐标显示群体质心。
- `/fun` 标题区背景康威生命游戏：环形边界 B3/S23，以稀疏、慢速、低对比度的标准方格衬托「玩点不一样的 / Play」标题；实验卡保持独立清晰。
- 首页 Hero 与 Playground 标题区随滚动由下而上柔和虚化退场；导航和实验卡保持清晰，减少动态效果时关闭过渡。
- 两处背景效果共用 `src/lib/ambient.ts`：从 CSS 变量解析配色（支持 hex/rgb 形式）、明暗判定、可见性与外观变化订阅；皮肤或明暗模式切换后即时重新取色。
- 为两处效果的纯函数逻辑补充离线测试（`tests/ambient.test.ts`：密度预算单调性与上限、网格尺寸约束、颜色解析与混色）。
- 发现页新增「资源下载」区块：内容仓库 `downloads/index.json` 清单 + 文件校验，`/media/<file>?download=1` 以附件下载。
- 发现页新增「数据榜单」「热榜 · 前沿」「限时免费」区块：桌面表格 / 手机卡片双形态，标注来源与更新时间，空状态诚实展示；热榜支持平台 Tab 切换。
- `/fun/answerbook` 答案之书实验：实时转发 UAPI（免费接口），失败给出提示；首页 status 行与页脚显示随机一言。
- 聚合 Worker `workers/aggregator`：`Source` 适配器接口，抓取 GitHub Trending、UAPI 热榜 5 平台、Epic 限时免费、一言池，分别写入 `rankings/`、`misc/`，失败保留上次结果，按 4 QPS 限速。新增 `aggregator:dev` / `aggregator:deploy` 脚本。
- 榜单解析与 UAPI 映射的离线测试（`tests/rankings.test.ts`、`tests/uapi.test.ts`）。
- 热榜按 `HOTBOARD_LIMIT` 截断（默认 50），发现页默认展示 10 条并支持展开/收起。
- 一言池跨天合并去重（`SAYING_POOL` 上限）并对 429 退避重试；发现页新增页内锚点导航，更新时间格式化为北京时间。
- 新增 `/daily` 每日新闻日历：聚合 Worker 每日 09:00（北京）抓 `daily/news-image` 存入 `misc/daily-news/<date>.jpg`，月历可回看近 12 个月，超 365 天自动清理；新增 `/api/daily-news` 与 `/daily-image/[date]` 路由。
- 发现页改为粘性分栏 Tab（精选收藏 / 资源下载 / 数据榜单 / 热榜 · 前沿），同一时间只显示一块，默认「热榜 · 前沿」，支持 `#hash` 深链与方向键切换；各面板首次激活才拉取数据；数据榜单默认展示 10 条并可展开。
- 「限时免费」（Epic）从发现页移至 `/daily` 每日新闻下方。
- Cron 触发器最终为 4 条（`0 */6 * * *`、`0 1 * * *`、`30 1 * * *`、`0 5 * * *`），在免费计划 5 个上限内并为后续数据源留出空间。
- 修正聚合数据归属：内容导入器不再上传或删除 `rankings/`、`misc/` 键（缺失时前端显示空状态），避免覆盖 Worker 写入的线上数据；GitHub Trending 抓取增加 12s 超时，避免单源卡住整批任务。
- 内容发布到生产 R2：新增 `pnpm content:publish`（经 S3 API / `aws4fetch` 并行上传，按 `_local/manifest.json` 清理旧对象，不碰 `rankings/`、`misc/`）；无 S3 密钥时可回退用 `CLOUDFLARE_API_TOKEN` + wrangler。
- **修正 R2 桶名**：`ic-aiming-content` → `icaiming-content`（`icaiming/` 与聚合 Worker 的 `wrangler.toml`、发布脚本默认值），此前命名不一致会导致生产读写与发布失败。
- 新增本地管理页 `pnpm admin`（127.0.0.1:4400，回环 + Host/Origin 校验 + 会话令牌）：文章编辑（含 Markdown 实时预览）、资源收藏/下载/项目/资料/简历表单、媒体库（上传、引用扫描、同名自动序号、ASCII 文件名）、回收站（`.trash/` 可恢复），以及等价 `content:check` / `content:publish` 的校验与发布按钮（二次确认、日志回显、凭据仅服务端读取）。写入全部落在内容仓库，本地 R2 仍由 `pnpm dev` 监听同步；`rankings/`、`misc/`、`posts/index.json` 不可写。
- 发布导入器 `contentTypes` 补充 `.jpeg`、`.gif`、`.avif`、`.ico`、`.zip`、`.7z`、`.txt`，上传的常见文件类型不再以 octet-stream 提供。
- 新增 `tests/admin.test.ts`（路径守卫、上传目标解析、原子写入、回收站、引用扫描等）。
- 工作区根目录新增 `启动管理页.cmd`：双击即启动管理页（检测 4321 端口，本地站点未运行时先拉起 `pnpm dev` 窗口，浏览器自动打开管理页；参数透传给 `pnpm admin`）。
- 管理页新增「发布凭据」面板：可直接粘贴 R2 令牌的 Access Key ID 与 Secret Access Key，合并写入 `icaiming/.dev.vars`（保留其他行、不回显已保存值），当前会话立即生效，适配 R2 令牌到期轮换；`POST /api/credentials` 仅限本机会话令牌访问。
- 发布改为增量：`content:publish` 逐对象 HEAD 比对 ETag/MD5，未变更对象不再重传并跳过 manifest 重写，完成后输出「新增/更新/跳过/删除」汇总，无变更时不写入任何对象；管理页「发布到生产 R2」同步显示该汇总（wrangler 回退路径标注无变更检测）。
- 管理页条目编辑器交互修复：新增条目自动滚动定位并聚焦（高亮反馈）、必填与链接/日期格式的就地中文校验与错误定位高亮（服务端 zod 错误映射回对应条目）、未保存修改在切换页签/关闭页面前确认与保存按钮脏标记、移动按钮边界禁用、工具栏吸顶、下载条目内直接上传文件并自动填入路径与大小。
- 法律文件页面：`/legal` 索引（文件卡片、要点速览）与 `/legal/terms`、`/legal/privacy`、`/legal/disclaimer`、`/legal/notices` 四个文档页，中英文逐条对照、以中文为准，条款可深链（`#article-n` / `#clause-n-m`）并可打印。文本源自工作区 `LEGAL.md` 草案，按实际功能修订：订阅与访问统计改为「暂未提供 / 上线前更新」，补充答案之书转发 UAPI、浏览器本地存储键、Epic 封面直连、GitHub/UAPI 数据源，爬虫条款与 `robots.txt` 对齐。数据位于 `src/lib/legal.ts`，新增 `tests/legal.test.ts`。
- 页脚新增「法律与隐私」入口；`/sitemap.xml` 加入 5 个法律路由；`robots.txt` 的说明链接改指 `/legal/notices#article-2`；`/fun/answerbook` 表单下增加数据处理即时告知并链接隐私政策。
- 新增 `/fun/milktea` 奶茶店模拟经营：从 Godot 版重制为网页实现（选主推、备基料、摇茶出杯，逐步扩成连锁），核心数据与逻辑拆为 `src/lib/milktea/{data,engine,logic,save}.ts`，新增 `tests/milktea.test.ts`。

### 变更

- `/fun/focus` 聚焦练习由手动轨道控件改为限时 60 秒点小球：小球随时间变小、存活变短；统计命中、命中率、平均与最快反应；最佳成绩存入 `localStorage`（`focus-best`），按命中数、同分看平均反应。游戏逻辑拆为纯函数模块 `src/lib/focus-drill.ts`，并新增 `tests/focus-drill.test.ts`。
- `/fun` 页头：英文 `Play` 作大标题、「玩点不一样的」作强调色副标题，与首页 Hero 排版一致；生命游戏画布铺满整个页头区域并向外略微扩展，边缘羽化，不透明度由 0.34 提高到 0.5，格子大小不变。
- `/fun/answerbook` 答案之书改为上下结构：全宽书页卡片，页眉细分隔线，答案使用显式宋体字体栈，按钮文字与箭头间距恢复正常，状态行为空时不占位。
- 滚动虚化强度增强：模糊上限由 6px 提高到 12px，过渡带加宽到 18%（全站共用，首页同样生效）。

- `/fun` 改为全屏首屏：生命游戏铺满视口（扣除导航高度），中央为 `Play` 大标题与副标题，底部向下箭头平滑滚动到「实验目录」。
- `/fun` 实验目录改为行式列表：序号、标题、描述、状态与标签；搜索框匹配标题、描述与标签（多词需全部命中），关键词同步到 `?q=`，无 JavaScript 时列表完整可见。实验条目与搜索逻辑位于 `src/lib/experiments.ts`，测试位于 `tests/experiments.test.ts`。

### 移除

- `PageLayout` 的 `heroHead` 与 `softenLead` 变体（仅好玩页使用，现已不再需要）。
- 内容仓库 `icaiming-content/rankings/.gitkeep`：`rankings/` 前缀由聚合 Worker 独占，不应存在于内容仓库。
- 工作区根目录的 `.playwright-cli/` 与 `.dsh-acl-recovery/`。

### 文档

- 根 `README.md` §7 明确仓库职责边界：游戏与实验的代码及条目硬编码在 `icaiming/`，内容仓库只保存需人工维护的数据；修正测试用例数（41）与好玩页描述。
- `icaiming-content/README.md` 说明游戏条目不在本仓库，`BrandMark.astro` 为品牌标识的唯一来源。

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
- 初始文章（`a-small-garden.md`）为示例内容，资源列表为建站相关的初始收藏。
- 正式部署（站点 Worker、R2 桶、资源域名）安排在本地验收确认之后。

[未发布]: https://github.com/wdsjdr/icaiming/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/wdsjdr/icaiming/releases/tag/v0.2.0
