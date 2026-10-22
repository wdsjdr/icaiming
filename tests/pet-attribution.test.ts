import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legalDocuments } from '../src/lib/legal';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pet = source('src/components/SitePet.astro');
const footer = source('src/components/layout/Footer.astro');
const header = source('src/components/layout/Header.astro');
const notices = source('THIRD_PARTY_NOTICES.md');
const docs = source('docs/site-pet.md');
const readme = source('README.md');
const repo = 'https://github.com/PC2005-cloud/dsh-pet';
const cc = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
const prototypes = [
  ['鲸鱼娘形象原型', '@上善无形', 'https://space.bilibili.com/4456176'],
  ['女仆版／客串原型', '@ZipZipPipe', 'https://space.bilibili.com/4168597'],
  ['Q版原型', '@这个刀子真甜', 'https://space.bilibili.com/23315338'],
];

test('SitePet keeps only the floating stage plus hidden assistive text', () => {
  for (const marker of ['pet-attribution', 'class="pet-info"', 'data-pet-toggle', 'data-pet-close']) {
    assert.ok(!pet.includes(marker), `${marker} must no longer exist in the page markup`);
  }
  // aria-describedby="pet-controls-help" is used by the stage buttons on every page.
  assert.equal(pet.match(/id="pet-controls-help"/g)?.length, 1, 'the describedby target must exist exactly once');
  assert.match(pet, /<span class="pet-sr" data-pet-status role="status" aria-live="polite"><\/span>/);
  assert.match(pet, /\.pet-sr \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\); white-space: nowrap; border: 0; \}/);
  assert.ok(pet.indexOf('data-pet-stage') < pet.indexOf('id="pet-controls-help"'), 'the stage markup stays first');
});

test('the footer carries no pet content at all', () => {
  for (const text of ['dsh-pet', '素材禁止商用', '站宠说明', 'pet-attribution', '站宠']) {
    assert.ok(!footer.includes(text), `the footer must not contain ${text}`);
  }
  assert.ok(footer.includes('href="/legal"'), 'the footer still links to the legal pages');
});

test('the floating ball carries a compact attribution bubble linked to the full notice', () => {
  const start = pet.indexOf('data-pet-bubble'), end = pet.indexOf('data-pet-bubble-close');
  assert.ok(start > 0 && end > start, 'the bubble markup must exist between the info button and its close control');
  const bubble = pet.slice(start, end);
  for (const [, name, url] of prototypes) {
    assert.ok(bubble.includes(`href="${url}"`), `${name} link`);
    assert.ok(bubble.includes(`>${name}</a>`), `${name} label`);
  }
  for (const required of ['CC BY-NC-SA 4.0', repo, '0.3.7', 'href="/legal/notices#article-5"', '同人二创', '非合作、非商用', '适配代码 MIT，素材禁止商用']) {
    assert.ok(bubble.includes(required), required);
  }
  assert.match(pet, /data-pet-info aria-label="站宠说明与来源" aria-expanded="false" aria-controls="pet-info-bubble" hidden/);
  assert.match(pet, /data-pet-bubble role="dialog" aria-modal="false" aria-labelledby="pet-info-title" hidden/);
  // The small bubble stays free of device, budget and storage details.
  for (const leak of ['3 MiB', 'sessionStorage', 'Safari 默认静态']) assert.ok(!pet.includes(leak), `${leak} must not appear in the ball UI`);
});

test('header appearance settings carry the full pet notice and links', () => {
  const settings = header.slice(header.indexOf('pet-settings'), header.indexOf('</fieldset>'));
  for (const control of ['data-pet-visible', 'data-pet-autowalk', 'data-pet-size', 'data-pet-reset', 'data-pet-settings-status']) {
    assert.ok(settings.includes(control), control);
  }
  assert.ok(settings.includes('站宠说明与来源'), 'the settings panel keeps the summary');
  for (const [, name, url] of prototypes) {
    assert.ok(settings.includes(`href="${url}"`), `${name} link`);
    assert.ok(settings.includes(`>${name}</a>`), `${name} label`);
  }
  assert.ok(settings.includes(`href="${cc}"`), 'CC BY-NC-SA 4.0 link');
  assert.ok(settings.includes(`href="${repo}"`), 'upstream repository link');
  assert.ok(settings.includes('href="/legal/notices#article-5"'), 'link to the full notice in the legal page');
  assert.ok(settings.includes('PC2005-cloud / dsh-pet 0.3.7'), 'upstream version');
});

test('legal notices article 5 exposes the full bilingual pet attribution', () => {
  const document = legalDocuments.find((entry) => entry.slug === 'notices');
  assert.ok(document, 'the notices document must exist');
  const article = document.articles.find((entry) => entry.no === 5);
  assert.ok(article, 'article 5 must exist');
  assert.equal(article.id, 'article-5');
  assert.equal(article.title.zh, '开源组件与致谢');
  assert.equal(article.title.en, 'Open-source Components and Acknowledgements');
  const zh = article.clauses.map((clause) => clause.zh).join('\n');
  const en = article.clauses.map((clause) => clause.en).join('\n');
  for (const [, name, url] of prototypes) {
    assert.ok(zh.includes(`[${name}](${url})`), `${name} zh link`);
    assert.ok(en.includes(url), `${name} en profile link`);
  }
  for (const text of [repo, cc, 'CC BY-NC-SA 4.0', '与 DeepSeek 官方无关，非合作、非商用', '允许开源使用、禁止商用', '不适用代码的 MIT 授权', '不改变代码、全站内容或上游素材的许可', '也不代表已获原型作者或官方授权']) {
    assert.ok(zh.includes(text), text);
  }
  for (const text of ['fan creation unrelated to DeepSeek', 'no partnership and no commercial use', 'commercial use is prohibited', 'not covered by the MIT code license']) {
    assert.ok(en.includes(text), text);
  }
});

test('notices and deployment docs retain supplied attribution and explicit permission boundaries', () => {
  for (const text of [notices, docs]) {
    for (const [role, name, url] of prototypes) {
      assert.ok(text.includes(role));
      assert.ok(text.includes(`[${name}](${url})`));
    }
    for (const required of [repo, cc, 'CC BY-NC-SA 4.0', '同人二创作品，与 DeepSeek 官方无关，非合作、非商用。', '用户提供的信息', '实际许可范围仍需权利人／原作者确认', '站宠适配代码（仍为 MIT）', '全站内容或全部上游素材重新许可为 CC', 'public/pet/idle.webp', 'public/pet/avatar.webp', '禁止商用']) {
      assert.ok(text.includes(required), required);
    }
  }
  for (const text of [repo, 'Copyright (c) 2026 PC2005-cloud', '代码 MIT', 'CC BY-NC-SA 4.0 声明不改变代码或上游素材许可']) {
    assert.ok(readme.includes(text), text);
  }
});

test('upstream MIT code license remains verbatim and complete', () => {
  const mit = `MIT License

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
SOFTWARE.`;
  assert.equal(notices.replace(/\r\n/g, '\n').split('### Original code license (verbatim)')[1]?.trim(), mit);
});