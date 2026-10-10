import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, contentRoot } from './content';

const sources = { github: 'github.svg', bilibili: 'bilibili账号.svg', douyin: '抖音账号.svg', heybox: '小黑盒.svg' };
const destination = resolve(contentRoot, 'assets/icons');
await mkdir(destination, { recursive: true });
for (const [id, name] of Object.entries(sources)) {
  const raw = await readFile(resolve(root, '../资源', name), 'utf8');
  const svg = raw.replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/\s(?:p-id|t|class)="[^"]*"/g, '');
  await writeFile(resolve(destination, `${id}.svg`), svg);
}
console.log('已导入资源文件夹中的四个平台 SVG。');
