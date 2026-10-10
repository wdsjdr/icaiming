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
| `pnpm test` | 内容契约、发布规则、Markdown 安全边界测试 |
| `pnpm test:local` | 对运行中的 `pnpm dev` 验证内容新增、修改、草稿和无需重建 |
| `pnpm dev:ui` | 仅 Astro 热更新预览，不启动 Functions/R2；日常完整预览用 `pnpm dev` |

`test:local` 会创建唯一命名的临时文章并在结束后删除；开发服务正在运行时执行。默认访问 `http://127.0.0.1:4321`，可用环境变量 `LOCAL_ORIGIN` 修改。

## 已实现

- IC Aiming 品牌、响应式公共布局和分区视觉。
- `/brand` 标识预览：完整版与紧凑版、明暗对照、实际尺寸及 SVG 下载。
- Default / Terminal / Newspaper 皮肤，亮色 / 暗色 / 跟随系统，动画偏好。
- `?theme=terminal&mode=dark` 临时预览，手动设置后退出预览；偏好存储异常时仍可使用。
- 首页项目与最近文章、博客搜索和标签筛选。
- `/blog/:slug` 运行时 Markdown 详情、代码块、目录、阅读进度、文章级 SEO、真实 404。
- 动态 `/rss.xml`、`/sitemap.xml`，真实社交入口、资源分类搜索、结构化简历与 PDF 状态。
- `/fun/focus` 聚焦练习：角度和距离控制、重置、键盘操作。
- 首页开屏动画：原子 → 平面 → 翻转显示标识与标语 → 镜头穿越，Three.js + GSAP 按需加载（gzip 约 174 KB），每会话一次，可跳过；`?intro=1` 重播、`?intro=0` 关闭，详见 [品牌规范](docs/BRAND.md#开屏动画)。

简历经历、教育和 PDF 尚待个人资料补充；页面展示对应空状态。两篇初始文章明确作为示例，资源列表为建站相关的初始收藏。

## 内容维护

详细格式见 [`../icaiming-content/README.md`](../icaiming-content/README.md)。所有索引以 Markdown frontmatter 生成；不要手工修改 `posts/index.json`。

新增文章时只需要在内容仓库创建 `posts/my-note.md`。正文和索引通过本地导入器写入 R2，文章 URL 不依赖构建时的 slug 列表。无效数据在写入前被拒绝；草稿和未来日期文章不会发布。未来日期以 UTC 日历日计算，日期到达后需再次同步或重启开发服务。

`site/profile.json` 管理介绍、邮件和社交账号；`site/home.json` 管理首页介绍；`projects/index.json`、`resources/index.json`、`resume/resume.json` 管理相应页面。

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
scripts/               本地同步、开发与集成验证
tests/                 必要的数据及渲染测试
docs/                  实施计划、品牌规范和验收记录
```

`article-shell` 由 Astro 构建，Function 通过静态资源绑定取出模板，使用 HTMLRewriter 注入正文和 meta。外部直接访问模板返回 404。浏览器包不包含 YAML 解析或服务端 Markdown 渲染库。

Wrangler 与 Miniflare 使用配套版本，前后端 TypeScript 配置独立，避免 Workers `Element` 等类型污染浏览器 DOM。

## 文档

- [本地实施计划与后续任务](docs/LOCAL-ROADMAP.md)
- [品牌与视觉规范](docs/BRAND.md)
- [本地验收记录](docs/VERIFICATION.md)

后续：GSAP ScrollTrigger / Lenis 滚动增强、更多实验、外部聚合 Worker/Cron、多源榜单及扩展皮肤。正式部署在本地验收和确认之后安排。
