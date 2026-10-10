# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定。

## [未发布]

### 计划中

- GSAP ScrollTrigger 与 Lenis 滚动增强。
- 更多交互实验，外部数据聚合 Worker 与六小时 Cron。
- 多源榜单归一化、RSS 聚合与扩展皮肤。

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