# Third-party notices / 站宠素材说明

## dsh-pet 0.3.7

Author: PC2005-cloud (2026)

Original project: **https://github.com/PC2005-cloud/dsh-pet**

本站参考该项目并按白名单使用十五段动画（本轮从 7 个扩展到 15 个，沿用同一不可变 `v0.3.7-web-2` 前缀、只增不改）。未引入其插件、依赖、字体、截图、GIF 或完整素材包。源素材保留在站点代码仓库之外；本地工具仅读取并校验十五段指定 WebM，不修改源文件。

**代码与素材的许可不同。** 上游 README「许可」说明：

> - 代码：MIT
> - 素材（动画/提示词/源视频）：允许开源使用，**禁止商用**
> - **二次创作（二创）约定**：基于本项目的衍生 / 改版 / 换皮作品，在**任何介绍、展示、分发该作品的地方**，须附上原作者 GitHub 地址：https://github.com/PC2005-cloud/dsh-pet

MIT 不应被解释为授予动画素材商用许可。本站当前为个人非商用适配；正式上线前须确认本站的公开使用、开源及分发范围符合上游要求，若有商业用途需另获授权。正式媒体使用现有单桶 `icaiming-content`，可选 `CONTENT_BUCKET` 同源 `/media/assets/pet/v0.3.7-web-2/<sha256>/<id>.webm` 或现桶资源域 `https://assets.icaiming.cn/assets/pet/v0.3.7-web-2/<sha256>/<id>.webm` 直连（无 `/media/`）。同源无需 CORS；直连必须对象自身为 `video/webm`、一年 immutable，并配置允许 Origin `https://icaiming.cn` 的 GET/HEAD CORS，不能依赖 Worker 头修正。公开域可暴露桶内已知 key，不只 pet，CORS 不是鉴权；不读取私人对象，公开范围须所有者审核。十五段按字节数及 SHA-256 校验后纳入完整内容仓库；本次后续仅定点 PUT 十五 key 中的新增八个（其余 7 key 已核验不重传），未来完整内容镜像发布必须保留全部内容及旧版媒体，禁止用仅十五文件的不完整源运行 `content:publish`。旧版保留供回滚，禁止覆盖 immutable URL。本地集成仅在 `.env.production` 纳入公开 v2 base，沿用 GitHub main → Workers Builds，不修改凭据或云配置，不执行生产上传或部署，不以本地验证代替真实 CORS 验收；HTTP 缓存策略不代表已验证 CDN 命中。

`public/pet/idle.webp`（640×360 原画布透明静态帧）及 `public/pet/avatar.webp`（128×128 头像，显示为 48px 悬浮球）为上述同源动画帧的衍生图片，不是本站原创，亦不适用代码 MIT 授权；沿用上游素材的开源使用、禁止商用及完整来源标注约定。静态图片不是透明视频效果或 Safari 真机兼容的证明。原始 WebM 未被覆盖。

### 形象与同人二创声明

按用户提供的原型署名信息整理：

- 鲸鱼娘形象原型：[@上善无形](https://space.bilibili.com/4456176)
- 女仆版／客串原型：[@ZipZipPipe](https://space.bilibili.com/4168597)
- Q版原型：[@这个刀子真甜](https://space.bilibili.com/23315338)

同人二创作品，与 DeepSeek 官方无关，非合作、非商用。形象与同人二创声明遵循 [CC BY-NC-SA 4.0（署名—非商业性使用—相同方式共享）](https://creativecommons.org/licenses/by-nc-sa/4.0/)。

该 CC 声明依据用户提供的信息记录，仅针对形象与同人二创声明，不将站宠适配代码（仍为 MIT）、全站内容或全部上游素材重新许可为 CC。原型和素材的实际许可范围仍需权利人／原作者确认；此处不表示已向上述三位作者取得许可，也不表示获得 DeepSeek 官方授权或合作。动画及同源 WebP 衍生图仍须遵守前述 dsh-pet 素材条款，不能以 CC 声明替代所需授权。

任何介绍、展示、分发均须保留 PC2005-cloud、完整上游地址 **https://github.com/PC2005-cloud/dsh-pet**、上述三位原型作者及主页链接、适用协议与素材条款；代码分发保留下列 MIT 全文。

### Original code license (verbatim)

MIT License

Copyright (c) 2026 PC2005-cloud

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
