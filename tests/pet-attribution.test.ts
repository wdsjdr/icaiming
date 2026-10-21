import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pet = source('src/components/SitePet.astro');
const footer = source('src/components/layout/Footer.astro');
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

test('static pet details credit all prototypes and distinguish character, code and media terms', () => {
  const details = pet.match(/<details id="pet-attribution">([\s\S]*?)<\/details>/)?.[1];
  assert.ok(details, 'source details must be static HTML with a stable anchor');
  assert.ok(pet.indexOf('<div class="shell pet-info">') < pet.indexOf('<details id="pet-attribution">'));
  assert.match(pet.slice(pet.indexOf('</details>') + '</details>'.length), /^\s*\{config\.enabled \?/);
  assert.doesNotMatch(details, /<script|<video|\bhidden\b/);
  for (const [role, name, url] of prototypes) {
    assert.ok(details.includes(`${role}：<a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>`));
  }
  assert.ok(details.includes(`href="${cc}" target="_blank" rel="noopener noreferrer"`));
  assert.ok(details.includes(`href="${repo}" target="_blank" rel="noopener noreferrer">${repo}</a>`));
  for (const text of ['CC BY-NC-SA 4.0', '署名—非商业性使用—相同方式共享', '同人二创作品，与 DeepSeek 官方无关，非合作、非商用。', 'PC2005-cloud', '站宠适配代码 MIT', '允许开源使用、禁止商用', '不改变代码、全站内容或上游素材的许可', '不代表已获原型作者或官方授权']) {
    assert.ok(details.includes(text), text);
  }
});

test('footer keeps full upstream credit and links to the static source explanation', () => {
  assert.ok(footer.includes(`href="${repo}" target="_blank" rel="noopener noreferrer">${repo}</a>`));
  for (const text of ['PC2005-cloud', '素材禁止商用', '同人二创 · 与 DeepSeek 官方无关 · 非合作／非商用', 'href="#pet-attribution"']) {
    assert.ok(footer.includes(text), text);
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
