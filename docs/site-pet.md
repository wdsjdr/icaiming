# 站点桌宠：本地验证与正式部署工作流

本文描述已有实现、独立 pet-only 本地集成和由所有者批准后的上线步骤。此次沿用 **GitHub `wdsjdr/icaiming` 的 `main` → Cloudflare Workers Builds**，不建立 standalone/olderwebsite，不手动 Wrangler deploy。本地集成不 commit、push、上传或部署。生产复用 `icaiming-content`，`.env.production` 仅提交公开 base `https://assets.icaiming.cn/assets/pet/v0.3.7-web-2`，不含凭据；其他环境文件仍忽略。对象元数据、真实 CORS、授权与公网真机验收仍须保留独立证据，不能由本地构建推定。本次不修改云配置或声称 dashboard 构建变量已核实。

## 1. 本地启动

在 PowerShell 中，从项目目录运行（依赖已安装）：

```powershell
Set-Location 'D:\Codes\MySite\icaiming'
pnpm dev
```

完整开发模式先同步本地内容，再把十五个允许的桌宠片段写入本地 Miniflare R2，随后构建 Astro 并启动 Wrangler。浏览器访问 `http://127.0.0.1:4321/`。内容变更会同步，代码变更会重建；刷新浏览器查看结果。已有服务占用端口时直接使用，不要重复启动。

`pnpm pet:prepare` 仅准备本地 R2 种子；不上传到 Cloudflare。种子清单为 `_local/pet-manifest.json`，与内容导入器的清单分离。十五个本地媒体 URL 使用 `/media/assets/pet/local/<sha256>/<id>.webm`，只匹配允许清单。

`pnpm dev:ui` 是 Astro 开发服务器：桌宠中间件可读取同一组本地 URL，但没有完整 Worker API；不能用它代替完整站点验收。普通 `pnpm build` 由 Astro production 模式加载已提交的 `.env.production`，默认使用公开 v2 base，不携带 WebM 实体或本地媒体 URL；纯配置函数在没有 base 时仍保持未配置。

**不要上传 `pnpm dev` 生成的 `dist`。** 完整开发模式会向子进程传入 `SITE_PET_LOCAL=1`；正式构建必须清除此标志，见后文。

站宠有隐藏、48px 静态悬浮球、展开角色三态。点击球展开，角色主体仅点击互动，右上角独立小三角负责拖动；三角下方圆形箭头或聚焦角色后按 Escape 收起，不再有大白方「×」。Header 现有「外观设置」中的站宠分组提供显示开关、自动走动、80–180px 角色参考高度及重置位置，球始终为 48px；页脚也保留显示/关闭入口。未配置视频时设置禁用并解释原因，不请求视频。

新用户桌面在 load、入场结束后空闲延迟 2.6 秒展开；手机、平板默认静态球，手动展开前零视频请求。用户主动展开、收起、关闭会跨整页导航记住，不会翻页再自动展开；本地存储不可用时默认手动，页内控件仍有效。减少动画偏好、站内动画关闭、入场动画或后台状态阻止/暂停媒体。Safari 默认使用同角色静态帧，手动展开不绕过降级，仍未保证透明视频真机兼容。

### 拖动、键盘与布局偏好

- 主指针（鼠标/触摸）拖动球或角色右上角的独立小三角，移动达到 5px 才认定拖动；拖动后仅抑制同手势合成点击，不影响键盘激活。主体仅点击互动，不拖动、不捕获指针，允许触摸滚动；小三角点击不互动、不切态、不消耗可选预算。二指、非主键及辅助键不会开始拖动。仅球和三角手柄禁止触摸滚动，其他透明画布穿透。
- 球/小三角聚焦后方向键移动 10px，Shift + 方向键移动 40px，Escape 收起；主体方向键不移动，仍可用 Escape 收起。三角为 16px 图形、44×44px 透明命中区；收起圆键在其下方 48px，两者不重叠。工具列总高 92px 计入上下安全边界，右侧保留 48px；短屏放不下时临时显示球，不覆盖展开偏好。设置面板沿用站点已有 Escape 关闭/回 summary、点击外侧关闭逻辑；range 支持原生键盘调整。
- 两态使用脚底中心 anchor，展开缩放只改变角色。统一 640×360 画布、脚底 Y=330、hitbox=(200,50)–(440,335)，不逐片裁剪；角色高度由 285px 参考 hitbox 换算。默认桌面 120px、移动 96px，并按视口、安全区及工具条夹取，视觉特效仍可超出角色 hitbox。
- 布局键 `site-pet-layout-v1`：`{ version:1, mode:'hidden'|'collapsed'|'expanded', height:80..180, autoWalk:boolean, x:0..1, y:0..1 }`；x/y 是相对 visualViewport 的脚底中心归一化位置。损坏/未知版本安全回退，有限数值夹取。旧 `site-pet-visibility=off` 优先保持隐藏，旧 on 不覆盖新三态。会话账本和固定候选池不改。
- 只在用户切态、拖动结束、range change、键盘移动、重置和一次 walk 结束时写位置，不在 RAF 写入。走动自然结束保存终点；中断的步行保留当前 anchor，不拉回起点。resize/visualViewport 变化重新夹取并取消当前 walk；拖动、缩放、关闭自动走动也取消计划。
- 收起中止 fetch/双视频/RAF/定时器但保留页内两核心 blob 与至多一个当前可选 blob；重开复用，不反复耗核心请求或失败额度。隐藏和 pagehide 释放全部 blob。取消可选请求的预占仍不退。
- 步行按视频 `currentTime` 的前 **0–7s** 从起点线性移动到预先规划的边界内终点，**7s–真实 duration（约 10.042s）** 固定在终点，ended 原地切 idle。暂停不按墙钟补跑；上游原片朝左，向右只镜像 video，控件和 anchor 不镜像。距离按 canvasWidth/462 缩放上游 60–240px，空间不足不播放原地撞墙跑步。

既有本地验收环境为 Node **22.19**、pnpm **11.22**；`wrangler.toml` 声明的是 Node **24.18.0**、pnpm **10.11.1**，两者并不一致，且 Worker `[vars]` 不等于实际 CI 工具链已切换。正式上线前由所有者统一 CI 的 Node/pnpm 安装版本，并在该版本重新验证；本文不擅自修改版本配置。

## 2. 当前数据流与许可边界

`scripts/pet/local.ts` 读取仓库外的 `../资源/dsh-pet-0.3.7/dsh-pet/assets/webm`，按 `src/lib/pet/assets.ts` 的字节数与 SHA-256 校验，只处理十五个指定文件。前端先顺序加载 `idle`、`walk` 两个核心片段（合计 **1,038,339 bytes**，不随动作数量变化），不是把十五段都下载。每个标签页的 `sessionStorage` 仍固定选择一个自动候选、两个点击候选——候选池大小与动作总数无关，本次扩展后仍是 **1 自动 + 2 点击**；十五段全部候选共 **6,030,322 bytes**，其中本轮新增 8 个可选动作合计 **2,931,246 bytes**。

可选动画的自动额度是 **3 MiB**，全部可选请求共享 **8 MiB** 总额度，核心片段不计入。每次实际调用 fetch 前按清单字节数保守预占；失败不退，HTTP 缓存是否命中对脚本不透明，仍扣额度。同一页面已缓存的 blob 可复用、免重复扣费；整页导航会失去内存 blob，但沿用固定池与账本。这不是实际网络流量硬上限，也没有 CacheStorage LRU。失败触发冷却，累计三次后停止新的可选请求。

### 上线前先确认授权

上游作者 **PC2005-cloud**，项目 **dsh-pet 0.3.7**：**https://github.com/PC2005-cloud/dsh-pet**。

- 代码为 MIT；动画、提示词、源视频等素材允许开源使用、**禁止商用**。不能把代码 MIT 当成素材商用许可。
- 所有者须先确认本站的公开使用、开源和分发范围符合要求；商业用途另获授权。任何介绍、展示、分发衍生作品的地方，都保留完整上游地址（不仅是短链接或作者昵称）。
- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) 已保留上游声明及 **MIT 全文**；发布时一并保留。站点静态「站宠说明与来源」也须保留，即使动画关闭或加载失败。
- 当前不引入 GIF、字体、Logo、完整素材包或上游插件。`public/pet/idle.webp` 为 640×360 同源透明帧，`public/pet/avatar.webp` 为 128×128 同源头像（显示 48px 球）；均为上游素材衍生图，非本站原创、非 MIT 素材，完整来源与非商用边界不变。
- 形象与同人二创署名（依据用户提供的信息）：鲸鱼娘形象原型 [@上善无形](https://space.bilibili.com/4456176)；女仆版／客串原型 [@ZipZipPipe](https://space.bilibili.com/4168597)；Q版原型 [@这个刀子真甜](https://space.bilibili.com/23315338)。
- 同人二创作品，与 DeepSeek 官方无关，非合作、非商用。形象与同人二创声明遵循 [CC BY-NC-SA 4.0（署名—非商业性使用—相同方式共享）](https://creativecommons.org/licenses/by-nc-sa/4.0/)。此声明不将站宠适配代码（仍为 MIT）、全站内容或全部上游素材重新许可为 CC；动画与同源 WebP 仍须遵守 dsh-pet 素材条款。
- CC 声明依据用户提供的信息整理，原型和素材的实际许可范围仍需权利人／原作者确认，不表示已取得三位作者许可或 DeepSeek 官方授权。所有介绍、展示、分发均应同时保留完整上游署名、上述三位原型作者及主页链接、适用协议与素材条款；保留一句声明不能替代所需授权。静态说明锚点为 `#pet-attribution`，不依赖 JavaScript 或视频，收起、关闭及未配置时仍保留。
- 若另制 Web 版，可评估裁剪、降低帧率、重新编码，但所有动作须保持统一画布、锚点与 alpha；不能仅把扩展名改成 `.webm`。重新编码后必须重算 `assets.ts` 的 `bytes`、`sha256`，同步本地映射及测试，再做透明度/动作衔接验收；不预先承诺压缩率。

## 3. 阶段一：单桶完整内容源与定点上传清单

使用现有 **`icaiming-content` 单桶**。可通过站点 `CONTENT_BUCKET` 绑定及 `/media/assets/pet/…` 同源读取，也可选择现桶自定义域 `https://assets.icaiming.cn/assets/pet/…` 直接读取。不新增桶或 binding；同源路径不需要 CORS，资源域直连则必须满足下文跨域门禁。凭据只交给发布工具/CI Secrets，绝不进入前端或 `PUBLIC_*` 变量。

运行 `pnpm exec tsx scripts/pet/stage.ts`：先校验全部十五个源文件的 bytes/SHA-256 和已有目标，再仅复制缺失文件到完整 `../icaiming-content/assets/pet/v0.3.7-web-2/`；不同内容的已有文件会拒绝覆盖。它不修改源文件、旧 manifest、文章或远端，也不生成 public/dist 视频。本次已执行并复核十五文件合计 **6,030,322 bytes**：原有 7 个为 `verified-existing`，本轮新增 8 个为 `copied`；重跑全部为 `verified-existing`。

**本次后续只能按十五 key 定点 PUT（本轮仅新增的 8 key，其余 7 key 已核验、不重传），不运行 `pnpm content:publish`。** 未来该命令可从完整内容仓库发布站宠与现有内容，但 S3 路径会列出全桶并删除本地列表没有的受管对象，只保护 `rankings/`、`misc/`、`_local/`。必须保留所有文章、资料、媒体和旧版站宠文件，不能从仅十五文件的不完整目录做全桶镜像。旧版文件同时保留在完整内容源和桶中，避免下次镜像误删。管理页保护整个 `assets/pet` 树（跨平台忽略 ASCII 大小写及统一斜杠），拒绝其祖先目录与所有目录删除；媒体 DELETE 仅允许不经过 symlink/junction 的普通文件。Windows 尾点别名直接拒绝，不仅匹配 hash 或版本。仍允许列表/预览、普通媒体文件删除和回收站恢复；WebM 不开放普通上传。

### 对象路径约定

示例（只替换为实际站点 HTTPS 域名，桶名保持现有值）：

```text
桶：          icaiming-content
base URL：   https://site.example.com/media/assets/pet/v0.3.7-web-2
idle 桶 key：assets/pet/v0.3.7-web-2/deb965d05a85dacf5ff4a20faa757846f0d11679598c3ec578a5571487660395/idle.webm
idle URL：   https://site.example.com/media/assets/pet/v0.3.7-web-2/deb965d05a85dacf5ff4a20faa757846f0d11679598c3ec578a5571487660395/idle.webm
```

Worker 去掉 URL 的 `/media/` 前缀后读取桶 key（例如 `assets/pet/…`），URL 为 `<base>/<sha256>/<id>.webm`。不要拼入桶名。`id` 是英文标识，**不是中文源文件名**。

可选直连 base 为 **`https://assets.icaiming.cn/assets/pet/v0.3.7-web-2`**；例如 idle URL 为 `https://assets.icaiming.cn/assets/pet/v0.3.7-web-2/deb965d05a85dacf5ff4a20faa757846f0d11679598c3ec578a5571487660395/idle.webm`。直连路径直接映射桶 key，**不含 `/media/`**，也不含桶名。两种 URL 读取同十五 key，不复制到另一桶。选哪种 base 由发布者明确决定，本轮不修改构建环境默认值。

| id | 源文件名（`scripts/pet/local.ts`） | bytes（`assets.ts`） | 角色 |
| --- | --- | ---: | --- |
| idle | 待机呼吸休闲.webm | 441437 | 核心 |
| walk | 螃蟹走路.webm | 596902 | 核心 |
| stretch | 超大伸懒腰.webm | 396987 | auto |
| yawn | 哈欠连天.webm | 424352 | auto |
| wave | 点击回应-元气挥手.webm | 421669 | click |
| sulk | 点击回应-傲娇生气.webm | 392336 | click |
| laugh | 点击回应-挠痒咯咯笑.webm | 425393 | click |
| crouch | 原地重力下蹲压缩.webm | 215047 | auto |
| startle | 被吓一跳.webm | 282771 | click |
| tailSweep | 用鲸鱼尾巴拍打地面.webm | 352213 | click |
| curtsy | 女仆屈膝礼仪.webm | 365712 | auto |
| code | 写代码.webm | 383960 | auto |
| cat | 撸猫.webm | 348432 | auto |
| bubbles | 鲸鱼吐泡泡特效.webm | 452096 | click |
| kickShuttle | 踢毽子.webm | 531015 | click |

自动候选（`autoIds`）：`stretch`、`yawn`、`crouch`、`curtsy`、`code`、`cat`；点击候选（`clickIds`）：`wave`、`sulk`、`laugh`、`startle`、`tailSweep`、`bubbles`、`kickShuttle`。角色只决定候选池归属，不改变「1 自动 + 2 点击」的会话池大小，也不改变自动 3 MiB／共享 8 MiB 预算常量。

### v2 前缀是稳定的内容寻址命名空间

`v0.3.7-web-2` 是**只增不改**的稳定命名空间：新动作只新增 `<sha256>/<id>.webm` 对象，**永不覆盖**任何已存在的对象 key（`stage.ts` 对同名不同内容直接拒绝写入）。因此旧页面、HTTP 缓存与回滚窗口里已发布的 URL 仍然有效，滚动回退不需要重新发布 7 个旧对象。未来如需替换某个动作的像素内容（即源文件重新编码），必须使用**新的版本前缀**或新的 id，而不是在同一 key 上原地覆盖。

下面的 PowerShell **只生成内存清单并校验本地文件，不上传**。SHA-256 直接取自 `src/lib/pet/assets.ts`，避免复制过期 hash。若源码结构发生变化导致解析不到十五项，应停止，重新核对源码，不绕过校验。

```powershell
Set-Location 'D:\Codes\MySite\icaiming'
$Bucket = 'icaiming-content'
$AssetHost = 'https://site.example.com'          # 替换为实际站点 Origin
$Version = 'assets/pet/v0.3.7-web-2'             # 新发布用新版本，不覆盖旧对象
$Base = "$AssetHost/media/$Version"
# 若选择现桶资源域直连，仅改 Base（不要加入 /media/）：
# $Base = "https://assets.icaiming.cn/$Version"
$ContentRoot = (Resolve-Path '../icaiming-content').Path
$SourceRoot = Join-Path (Get-Location) '../资源/dsh-pet-0.3.7/dsh-pet/assets/webm'
$SourceNames = @{
  idle = '待机呼吸休闲.webm'; walk = '螃蟹走路.webm'
  stretch = '超大伸懒腰.webm'; yawn = '哈欠连天.webm'
  wave = '点击回应-元气挥手.webm'; sulk = '点击回应-傲娇生气.webm'
  laugh = '点击回应-挠痒咯咯笑.webm'
  crouch = '原地重力下蹲压缩.webm'; startle = '被吓一跳.webm'
  tailSweep = '用鲸鱼尾巴拍打地面.webm'; curtsy = '女仆屈膝礼仪.webm'
  code = '写代码.webm'; cat = '撸猫.webm'
  bubbles = '鲸鱼吐泡泡特效.webm'; kickShuttle = '踢毽子.webm'
}
$Text = Get-Content './src/lib/pet/assets.ts' -Raw -Encoding UTF8
$Pattern = '(?m)^\s*(\w+): \{ bytes: (\d+), sha256: ''([a-f0-9]{64})'' \}'
$Rows = [regex]::Matches($Text, $Pattern)
if ($Rows.Count -ne 15) { throw '清单结构已变化：必须重新核对 assets.ts' }
$Plan = @($Rows | ForEach-Object {
  $Id = $_.Groups[1].Value
  $Bytes = [long]$_.Groups[2].Value
  $Sha256 = $_.Groups[3].Value
  if (-not $SourceNames.ContainsKey($Id)) { throw "未知 id: $Id" }
  $LocalPath = (Resolve-Path (Join-Path $SourceRoot $SourceNames[$Id])).Path
  if ((Get-Item $LocalPath).Length -ne $Bytes -or
      (Get-FileHash $LocalPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) {
    throw "素材校验失败: $Id"
  }
  $StagedPath = Join-Path $ContentRoot "$Version/$Sha256/$Id.webm"
  if ((Get-Item $StagedPath).Length -ne $Bytes -or
      (Get-FileHash $StagedPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) {
    throw "完整内容源校验失败: $Id"
  }
  [pscustomobject]@{
    Id = $Id; Bytes = $Bytes; Sha256 = $Sha256; LocalPath = $StagedPath
    Key = "$Version/$Sha256/$Id.webm"; Url = "$Base/$Sha256/$Id.webm"
  }
})
$Plan | Format-List
```

### 上传方式（只由所有者在正式发布时执行）

`stage.ts` 仅做本地准备，没有远端一键发布。需要按上述清单从完整内容源定点上传十五个对象，不遍历/镜像整个桶、不写 `_local/manifest.json`、不上传其他文件。下面沿用 Wrangler 4.45.0 的**单对象模板**，本轮没有执行上传；发布前核对十五 key 是否已有同版本不同内容，若有则停止，不覆盖：

```powershell
# 先确认 $Bucket / $Base / $Plan 指向现有内容桶及所选同源或资源域地址，再由所有者执行。
$Item = $Plan | Where-Object Id -eq 'idle'  # 分别换成其余十四个 id，逐项核对
pnpm exec wrangler r2 object put "$Bucket/$($Item.Key)" --remote --file "$($Item.LocalPath)" --content-type 'video/webm' --cache-control 'public,max-age=31536000,immutable'
if ($LASTEXITCODE -ne 0) { throw '上传失败，停止发布' }
```

`--remote` 会写入真实 Cloudflare，不能用于本地演练。所有者提供受限凭据，范围限定现有桶。定点 PUT 显式设置 `video/webm` 和 immutable 元数据；完整内容发布器已支持 `.webm` MIME，但 MD5 相同会跳过更新元数据，不可依赖重跑自动修复旧元数据。Worker 在 `writeHttpMetadata` 后仅对精确版本/hash/id 白名单覆写正确 MIME 和缓存头。ETag 是缓存标识，**不是 SHA-256 校验值**。

## 4. 阶段二：同源或资源域直连 HTTP 与缓存门禁

生产 base 可选 **实际站点 HTTPS 域名 + `/media/assets/pet/v0.3.7-web-2`** 或 **`https://assets.icaiming.cn/assets/pet/v0.3.7-web-2`**，不能是 `r2.dev`、localhost、IP、裸域根路径、带凭据/端口/查询/片段的 URL。当前配置校验不能替代所有者保证版本路径不可变。后续新增版本走 Worker 时须同步显式白名单；直连时须为新对象设置正确元数据，不能仅修改 base 后承诺 immutable。

选择同源 Worker 时，**不需要桶 CORS、Access-Control-Allow-Origin 或 ExposeHeaders**。运行时仍是 `fetch(..., { credentials: 'omit' })` → 完整 blob → 双 video 交替播放，公开 URL 不是鉴权接口。

### 现桶资源域直连的额外门禁

`assets.icaiming.cn` 绕过站点媒体 Worker，**不能依赖 Worker 覆写 MIME/缓存头**。十五对象自身必须有 `Content-Type: video/webm` 及 `Cache-Control: public, max-age=31536000, immutable`，GET/HEAD 的长度和 ETag 正确，正文 bytes/SHA-256 对应清单。完整发布器的 MD5 相同跳过逻辑不会修复错误元数据，须由后续定点 PUT/元数据维护流程显式设置并实测。本轮没有执行上传或元数据修改。

从页面 Origin **`https://www.icaiming.cn`** 跨域 fetch 需要现桶 CORS；待所有者审核的最小规则示例（本轮未应用）：

```json
[
  {
    "AllowedOrigins": ["https://www.icaiming.cn"],
    "AllowedMethods": ["GET", "HEAD"],
    "ExposeHeaders": ["Content-Type", "Content-Length", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

不要盲目允许 `*`；若还有其他站点 Origin，须逐个审核。curl 带 `Origin: https://www.icaiming.cn` 的 HEAD/GET 要核对 `Access-Control-Allow-Origin` 和暴露头，再在该真实站点浏览器确认 fetch 可读。没有 Origin 的 curl 成功不代表 CORS 通过。若缓存已存在，首次/重复 GET 的 CORS 都须正确，不承诺已经有 CDN HIT。

**公开域暴露的是该桶中可被已知 key 直接读取的对象，不仅十五个 pet URL。** CORS 不是访问控制，不能阻止非浏览器客户端读取，hash 也不是密码。不读取/探测私人对象；所有者须确认桶中没有不宜公开内容，若存在则先另行隔离或访问控制评估，不把开启域名当作只公开 pet 前缀。本轮未枚举或读取远端对象、未确认该桶隐私边界。

直连待执行的单对象检查模板（不在本轮运行）：

```powershell
$Url = "https://assets.icaiming.cn/assets/pet/v0.3.7-web-2/$($Item.Sha256)/$($Item.Id).webm"
curl.exe --fail --silent --show-error --head -H 'Origin: https://www.icaiming.cn' "$Url"
# GET/hash 检查同下文，但加 -H 'Origin: https://www.icaiming.cn'，并在真实浏览器复测。
```

`src/worker/handlers/media.ts` 对精确的 `v0.3.7-web-2/<hash>/<allowlisted-id>.webm` 路径，在对象元数据之后设置 `Content-Type: video/webm`、`Content-Length`、`ETag`、`Cache-Control: public, max-age=31536000, immutable`；`LOCAL_DEV=true` 改为 `no-store`。HEAD 使用 `bucket.head` 不读取正文；GET/HEAD 支持 If-None-Match（匹配时 304，无正文）。其他媒体保留既有 MIME、缓存与附件行为，原路径安全白名单不放宽。不匹配的 pet 路径不获得这些专属头。

这是**浏览器 HTTP 缓存策略**，不保证 Worker 的 R2 `binding.get()` 自动获得 CDN HIT。本轮不引入 Cache API、Range、新 binding 或缓存规则。若后续要边缘缓存，单独设计并验证，不能把缺少 `CF-Cache-Status` 或 DYNAMIC 解释为本轮未实现的 CDN 已生效。

### HTTP 校验示例

继续使用阶段一的 `$Plan`。本地 `/local/` 同源只检查协议/MIME/长度/hash，不要求生产 ETag/immutable/CDN 头：

```powershell
$Item = $Plan | Where-Object Id -eq 'idle'
$LocalUrl = "http://127.0.0.1:4321/media/assets/pet/local/$($Item.Sha256)/$($Item.Id).webm"
curl.exe --fail --silent --show-error --head "$LocalUrl"
```

正式资源先 HEAD 十五项：

```powershell
$Plan | ForEach-Object {
  Write-Host $_.Id $_.Bytes $_.Sha256
  curl.exe --fail --silent --show-error --head "$($_.Url)"
  if ($LASTEXITCODE -ne 0) { throw "HEAD 失败: $($_.Id)" }
}
```

逐项核对 **200、MIME、Content-Length、ETag、immutable 缓存头**。最终仍要在真实站点浏览器中确认所选路径 fetch 成功；直连另加上节 Origin/CORS 检查。hash 需实际 GET 的正文，HEAD 不能证明。每版本至少完整下载校验每对象一次；此后排查可只复测问题对象，不必反复下载全池：

```powershell
$Item = $Plan | Where-Object Id -eq 'idle'  # 首次上线对十五项分别执行
$Out = Join-Path $env:LOCALAPPDATA "Temp/opencode/site-pet-$($Item.Id)-verify.webm"
curl.exe --fail --silent --show-error -D - --output "$Out" "$($Item.Url)"
if ($LASTEXITCODE -ne 0) { throw 'GET 失败' }
if ((Get-Item $Out).Length -ne $Item.Bytes -or
    (Get-FileHash $Out -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Item.Sha256) {
  throw '下载长度/hash 不符，禁止发布'
}
# 如另外配置了边缘缓存，可再次真实 GET 观察；本方案不承诺 CDN HIT。
curl.exe --fail --silent --show-error -D - --output NUL "$($Item.Url)"
```

记录浏览器再次加载是否使用 HTTP 缓存；仅当另行配置了边缘缓存才检查两次 GET 的 `CF-Cache-Status`。不能凭 immutable 头认定 CDN 已生效。按需用 `$LocalUrl` 代替正式 URL 做本地 GET/hash 检查。

强缓存另检查：`curl.exe --head -H 'If-None-Match: "实际ETag值"' "$($Item.Url)"`，匹配时应为 304。当前运行时完整 fetch 小片段，本轮不为 Worker 实现 Range/206；HTTP 200、正文/hash、MIME、HEAD 一致性与浏览器可读性（直连含 CORS）是阻断门禁。直连的 R2/CDN 行为须单独实测。

**大陆公网门禁**：从用户实际使用的大陆运营商/设备直连实际站域测 DNS、TLS、首个 GET、浏览器缓存、弱网失败与重试。不能用本机代理或本地 200 推导公网可达/速度，也不承诺 CDN 提速结果。

## 5. 阶段三：生产构建、审计与站点发布

发布门禁顺序：**完整内容源与十五对象 bytes/hash 核验（本次仅新增的 8 对象经批准定点 PUT，不重传已核验的 7 个旧对象）→ 网站生产构建/审计 → 审核并推送 GitHub main → Workers Builds → 真实站点 HTTP/浏览器验收**。直连须保留对象元数据/CORS 证据；失败则回滚/禁用，不宣称生产完成。`PUBLIC_PET_ASSET_BASE_URL` 是公开地址，不是密钥，已通过单行 `.env.production` 纳入 **Astro 构建环境**；仅设置 Worker 运行时 `[vars]` 不会改写既有页面。

在独立 pet-only worktree/CI 执行，勿与 `pnpm dev` 共用 `dist`。不复制实际 `.env`、`.dev.vars`、凭据、旧产物或无关功能；保留 HEAD 的 `wrangler.toml` 与锁文件，不使用独立 release Wrangler 配置。源工作区的未提交游戏、实验、路线图等不得带入此次集成，也不回退或覆盖原文件。

Astro production 模式自动读取 `.env.production`，普通构建无需 shell 注入 base。进程环境优先，可有意覆盖 `PUBLIC_PET_ASSET_BASE_URL`；`.env.local`/`.env.production.local` 等未提交文件也不能出现在正式 checkout。**Cloudflare CI 不得设置 `SITE_PET_LOCAL=1`**，并应排查意外 base 覆盖；dashboard 当前值未核实。该本地标志仍保留供现有 `pnpm dev` 调用 production build，故不添加破坏开发流程的全局拒绝条件。无进程 base/本地标志的构建与产物审计才证明仓库默认有效。

```powershell
Set-Location 'C:\Users\86133\AppData\Local\Temp\opencode\pet-github-20261021'
Remove-Item Env:SITE_PET_LOCAL -ErrorAction SilentlyContinue
Remove-Item Env:PUBLIC_PET_ASSET_BASE_URL -ErrorAction SilentlyContinue
# 不注入 base：验证已提交的 .env.production 默认值。
# 所有者先在 CI/构建配置中确认：SITE_PET_LOCAL 未设置为 1，生产 base 不被旧配置覆盖。
# 同样检查本地/CI 环境文件的设置；不要打印、提交任何密钥。
pnpm exec tsx --test tests/pet*.test.ts tests/worker-media.test.ts tests/content-mime.test.ts tests/admin.test.ts tests/content.test.ts
if ($LASTEXITCODE -ne 0) { throw '桌宠测试失败' }
pnpm check
if ($LASTEXITCODE -ne 0) { throw '类型检查失败' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw '生产构建失败' }
```

审计产物，不要把“无 WebM 文件”误写成“HTML 不应包含 .webm URL”（生产 HTML 正应引用远程 URL）：

```powershell
$Media = @(Get-ChildItem './dist' -Recurse -File -Filter '*.webm')
if ($Media.Count) { throw 'dist 不应包含 WebM 实体' }
$TextFiles = @(Get-ChildItem './dist' -Recurse -File | Where-Object Extension -in '.html','.js','.json','.css')
$LocalRefs = @($TextFiles | Select-String -Pattern '/media/assets/pet/local/','assets/pet/local/','http://127.0.0.1','http://localhost')
if ($LocalRefs.Count) { throw '构建仍有本地地址，停止发布并定位引用' }
$ExpectedBase = 'https://assets.icaiming.cn/assets/pet/v0.3.7-web-2'
$ConfigHtml = @(Get-ChildItem './dist' -Recurse -Filter '*.html' | Select-String -SimpleMatch "$ExpectedBase/")
if (-not $ConfigHtml.Count) { throw '没有找到预期生产 base，检查构建环境' }
$ConfigHtml | Select-Object -First 2   # 人工检查 data-config，十五个 URL 的 host/版本/hash 全部符合上传清单
```

再在独立预览/验收环境做第七节的浏览器检查，并保留构建版本和 base。正式链路是 **GitHub wdsjdr/icaiming main → Workers Builds**，构建命令由原 `wrangler.toml` 的 `[build] command = "pnpm build"` 指定；公开 base 随版本控制进入 CI。先完成独立审核，再由所有者批准提交/推送，不从脏工作区或 standalone release 目录部署。CI 工具链与变量仍需核实，不能把 Worker `[vars]` 当作构建环境已配置的证据。

**历史手动备用流程，不用于此次发布：** 仅在所有者另行明确批准时才考虑 `pnpm exec wrangler deploy`；它会真实上传并重建。此次不执行此命令、不建立新站点。**本仓库没有 `pnpm deploy`，`pnpm aggregator:deploy` 只部署聚合 Worker，不能代替站点发布。**

## 6. 回滚与紧急禁用

- 回滚站点到上一个已验收 build/Worker 版本，并恢复与该 build 配套的 base 版本。使用既有 Workers Builds/版本管理回滚流程，先确认旧媒体仍存在。
- 新编码/新内容用新版本前缀和新 hash；不覆盖已发布 immutable URL。旧页面、HTTP 缓存及回滚窗口还会访问旧对象，**不要立即删除前一版本媒体**。保留多久由所有者结合一年浏览器缓存策略与支持窗口制定。
- 紧急禁用：经审核将已提交 `.env.production` 的 base 置空，同时清除构建环境的 base 覆盖与 `SITE_PET_LOCAL`，重新构建并沿既有 GitHub main/Workers Builds 流程发布。仅 unset shell 不会禁用，因为文件仍提供默认值。先确认产物为 `data-state="unconfigured"`、无桌宠远程/本地视频 URL，再发布。
- 不删桶、不覆盖对象来“关闭动画”。未配置、加载失败或 Safari 降级时，保留静态来源说明与完整上游链接。

## 7. 验收记录与上线清单

### 本轮 v8 动作扩展：7 → 15 个动作（2026-10-22，本地 only）

- 在 `feature/site-pet` worktree（提交 `b25782b`）内新增 8 个动作，**沿用既有不可变前缀 `v0.3.7-web-2`**，不新建版本、不重传、不覆盖既有 7 个对象。`src/lib/pet/media.ts` 的 `petMediaVersion` 未改动；匹配器仍由 `assets` 的 key 派生，没有硬编码数量。
- 8 个新动作的 bytes/SHA-256 均由源 WebM 实测（`node:crypto` 计算），非估计值；`scripts/pet/local.ts` 的 id→中文源文件名映射同步扩展。角色分配：**auto = crouch、curtsy、code、cat**；**click = startle、tailSweep、bubbles、kickShuttle**。会话池仍为 **1 自动 + 2 点击**，`session.ts` 的池长度校验与 3 MiB/8 MiB 预算常量未改。
- 新增动作合计 **2,931,246 bytes**；核心 `idle`+`walk` 仍为 **1,038,339 bytes**；全部 15 个候选合计 **6,030,322 bytes**。
- `stage.ts` 本次执行：先校验全部 15 个源文件与已有目标，再以 `wx` 仅写入缺失文件；**原有 7 个为 `verified-existing`，新增 8 个为 `copied`**，重跑全部为 `verified-existing`，未覆盖任何既有对象。
- 文档/README/THIRD_PARTY 的 7 计数与示例已更新为 15；测试中的数量断言同步更新，未放宽任何安全断言（删除保护、白名单、拒绝覆盖保持原样）。
- 本轮**未执行** R2 上传、`content:publish`、commit、push、deploy，也未修改 `D:\Codes\MySite\icaiming` 用户工作区或其索引。

### 本轮删除保护复审修复与资源域文档（2026-10-21）

- 修复前用临时真实文件系统复现 DELETE 的 guard + rename 调用链：**7 tests、3 pass、4 fail**。失败证据包含 `Missing expected rejection (AdminError): assets`、大小写别名 `assets/PET/V0.3.7-WEB-1/<UPPERCASE-HASH>/IDLE.WEBM` 及链接父路径。未操作实际内容仓库的删除。
- 根因是只按完整且大小写精确的 WebM 路径匹配，后续 rename 仍能移动目录。现在同步 guard 保护整个 `assets/pet` 树及 `assets` 祖先（统一斜杠、ASCII 大小写不敏感，拒绝 Windows 尾点别名），DELETE 专用 `moveMediaToTrash` 对源路径逐段 lstat，拒绝目录、symlink/junction，并拒绝链接回收站父路径。普通文件删除及原回收站恢复保留，未扩展上传能力或改变列表/读取。
- 首次修复回归发现测试错误假定当前 Node 会解析 Windows 尾点别名（实际为 ENOENT），已纠正测试：真实大小写别名验证同一文件，尾点拼写不依赖文件系统解析能力，仍必须被 guard 拒绝。
- 最终运行 `pnpm exec tsx --test tests/pet*.test.ts tests/worker-media.test.ts tests/content-mime.test.ts tests/admin.test.ts tests/content.test.ts`：**138 tests、138 pass、0 fail**；`pnpm check`：**0 errors、0 warnings、1 个既有 returnValue deprecated hint**。包含真实临时目录/junction、入口调用保护、普通文件删除/恢复与资源域配置/文档回归；不是线上删除或真实 CORS 验证。
- 文档补充可选 `https://assets.icaiming.cn/assets/pet/v0.3.7-web-2`，直连不经 Worker，需对象自身 video/webm/immutable、Origin `https://www.icaiming.cn` 的 CORS 以及桶公开范围审核。不更改默认 production base、凭据、binding 或云配置，不读取私人对象。
- 本轮未运行 build/dev、进程停止、远端命令、上传/部署、commit/push；保留所有用户无关工作、七 key 定点 PUT 约束及旧版回滚文件。

### 本轮单桶本地准备与媒体回归（2026-10-21）

- 修改源码前已复核 4321 无监听，没有本项目 dev/build 遗留链需停止；未按历史 PID 杀进程。并行会话的 `wrangler whoami` 未触碰。
- `pnpm exec tsx scripts/pet/stage.ts`：七个源文件及目标按 bytes/SHA-256 校验，复制至完整内容仓库，共 **3,099,076 bytes**。不改源素材、不覆盖不同内容、不写旧 manifest、不写 public/dist、不操作远端。
- `pnpm exec tsx --test tests/pet*.test.ts tests/worker-media.test.ts tests/content-mime.test.ts tests/admin.test.ts tests/content.test.ts`：最终 **129 tests、129 pass、0 fail**。包括原 95 项站宠测试、新增同源生产 base 测试、真实临时 Miniflare R2/workerd 媒体路由测试（不是假 bucket），以及内容 MIME/完整源/管理误删回归。媒体测试仅在内存编译测试入口，不运行 Astro build 或写 dist。
- MIME 缺失测试先失败后修复。初次媒体测试因 Node Headers 无法穿过 Miniflare 代理而失败，改为 workerd 内执行后通过；初次 `pnpm check` 发现 R2 联合类型正文收窄错误，修正后重跑为 **0 errors、0 warnings、1 个既有 returnValue deprecated hint**。修正后媒体/内容/管理定向 **12 tests 全通过**。
- `pnpm content:check`：**23 个对象校验通过**，只读，不运行同步或全桶发布。
- 再次运行 `stage.ts`：七项均为 `verified-existing`，证明本地重跑不会覆盖文件；完整内容仓库从 24 增至 31 个文件（含 hidden 占位文件、不含 `.git`），仅新增七个 WebM，未来发布源不是七文件孤立目录。该仓库尚无 commit/remote，不能把本地完整性误称为已与生产全桶对账。
- 未运行 dev、Astro build、`test:local`、远端上传/部署、commit 或 push；临时 R2 测试不等于真实生产 R2 验收，生产门禁仍待执行。

### 初版验证（2026-10-21，历史记录）

- `pnpm exec tsx --test tests/pet*.test.ts`：50 项通过，含真实 initPet 三态、blob 复用、拖动阈值/取消、迟到请求与播放、单 RAF、缩放/键盘/resize、左右方向、7 秒运动及末段固定、存储/MPA 恢复；原预算与失败保护继续覆盖。
- `pnpm check`：0 errors、0 warnings、1 个既有 `scripts/admin/public/app.js` 的 returnValue deprecated hint。
- 普通 `pnpm build`：18 个静态页面构建成功；保留既有 player 大 chunk 警告。本轮未进行生产上传、部署或发布。
- 上述为代码和桩生命周期验证，不替代独立浏览器的视觉、触屏滚动、透明效果、物理 safe-area 或真 Safari/iOS 验收。两个衍生静态图由独立素材任务交付。

### 本轮主体点击／三角拖动手柄验证（2026-10-21）

- `pnpm exec tsx --test tests/pet*.test.ts`：95 项通过、0 失败，覆盖主体仅点击、独立三角手柄拖动／键盘移动、取消捕获、预算与生命周期回归及工具列安全边界。
- `pnpm check`：0 errors、0 warnings、1 个既有 `scripts/admin/public/app.js` 的 returnValue deprecated hint。
- 本轮未运行 build，未进行生产上传、部署或发布。上述为定向测试桩及静态检查结果，不代表本轮 headed 浏览器、触屏或真机验收已通过；下方旧版浏览器记录仍仅为历史记录。

### 已实现；既有本地验收报告已覆盖

以下为前序旧版交互的独立本地验收记录摘要，不代表本轮三态/拖动/缩放的视觉验收，也不是生产验收：

- 真实 headed **Edge Chromium 155**，完整 `pnpm dev` 的主页与 `/blog` 均 200。
- 七媒体 HTTP 200、`video/webm`、长度/hash 对应清单；metadata 均为 640×360、10.042 秒。
- 初始只请求 idle 441,437 + walk 596,902 bytes，可选为 0；13 次快速点击仅请求 wave 421,669 bytes 一次；连续三次关闭/重开成功，关闭后双 video paused 且无 src。
- 模拟手机 390×844、触屏、DPR 3：默认等待 5 秒无媒体，手动开启加载两个核心；新 context 的 reduced-motion 无媒体。
- 可选 404 后 idle 继续推进、failures 增为 1、预占 392,336 bytes 不退；整页导航固定池/账本保留；来源静态存在。
- 前序门禁：31 个 Node 定向测试通过；`pnpm check` 为 0 errors、0 warnings、1 hint；默认 `pnpm build` Complete，产物无 WebM/本地桌宠 URL。

截图保存在验收会话的本地附件目录 `pet-smoke`，不依赖不可移植的绝对临时路径；需要交付截图时由所有者导出该附件，或按本节场景重新截图。

### 部署前仍需所有者执行并留证

- [ ] 许可/开源/非商用范围及原型、素材实际许可经权利人／原作者确认；所有介绍、展示、分发页面保留 PC2005-cloud、**https://github.com/PC2005-cloud/dsh-pet**、三位原型作者及主页链接、CC 形象与同人二创声明及上游素材条款，MIT 全文随代码分发保留；声明不替代授权。
- [ ] CI Node/pnpm 版本统一并复测；现有单桶、最小权限到位；本次只新增八 key 定点 PUT（另有 7 个已核验旧 key 不重传），未来镜像源包含完整内容及所有回滚版本。
- [ ] 十五对象 key、字节数、SHA-256、MIME、HTTP 头正确；GET/HEAD 长度/ETag 一致、条件请求 304、所选路径 fetch 与浏览器缓存通过；直连额外核对对象自身元数据、Origin `https://www.icaiming.cn` 的 CORS 和桶公开范围，不读取私人对象；不把 HTTP 缓存当作 CDN 已验证；大陆直连/弱网通过。
- [ ] 正式产物不带 `SITE_PET_LOCAL=1`、本地 URL 或视频实体；十五 URL 都是预期资源域与不可变版本；未配置版本确实关闭。
- [ ] 桌面 load/空闲延后只加载两核心，不全量下载十五段；入场动画期间无媒体；移动端默认不请求、手动可开；点击快速反馈且不并发预取候选。
- [ ] 网络/解码失败保留当前可用动画或静态占位；失败预占不退、冷却/三次失败上限正确；长时间真实计时触发自动可选，重复跨页直到预算实际耗尽不再 fetch。
- [ ] 关闭/重开、跨页与浏览器后退前进保留固定池和额度；关闭释放媒体；预算是请求账本而非承诺下载流量。
- [ ] 真实后台 `document.hidden === true` 时停止请求/播放，回来可恢复；不要仅以切换标签动作推定成功。
- [ ] 真实 BFCache `pageshow.persisted === true` 恢复后无双任务/旧账本覆盖；减少动画、站内动画偏好、网络节省偏好分别检查。
- [ ] 真 Safari/iOS 静态降级、无视频请求；如未来启用透明视频，另做真机 alpha、解码、自动播放验收。
- [ ] 物理设备 safe-area、横竖屏、滚动与全部页面遮挡/按钮可达性检查；静态来源始终可见，桌宠失败不妨碍正文。
- [ ] 记录旧 build/base、回滚窗口、上线后错误率与首个媒体加载结果；确认没有全池下载。

**未覆盖边界**：既有验收没有真 Safari/iOS、真实 hidden（当时 headed 浏览器切换标签后 `document.hidden` 仍报告 false）、`persisted=true` BFCache、大陆公网/弱网、自动可选长计时与预算真实耗尽、物理 safe-area 和所有滚动遮挡的证据。原页面 `/api/saying` 为 404，不能据此声称全站控制台无错。生产桶定点上传、生产 HTTP/hash/缓存、资源域真实 CORS 及正式站点部署均尚未执行；同源方案无需新增域名/CORS，现桶资源域直连另需上述 CORS/对象元数据/公开范围审核。
