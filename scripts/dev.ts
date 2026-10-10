import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import chokidar from 'chokidar';
import { root, contentRoot, persist, syncContent } from './content';

const astro = resolve(root, 'node_modules/astro/astro.js');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
function build() {
  return new Promise<void>((done, reject) => {
    const process = spawn(globalThis.process.execPath, [astro, 'build'], { cwd: root, stdio: 'inherit' });
    process.once('error', reject);
    process.once('exit', (code) => code === 0 ? done() : reject(new Error(`Astro build exited ${code}`)));
  });
}
await syncContent();
await build();
const server: ChildProcess = spawn(process.execPath, [wrangler, 'pages', 'dev', '--persist-to', persist, '--show-interactive-dev-session=false'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
let queue = Promise.resolve();
let contentTimer: ReturnType<typeof setTimeout>;
let codeTimer: ReturnType<typeof setTimeout>;
const enqueue = (job: () => Promise<void>) => { queue = queue.then(job).catch((error) => console.error('[dev]', error.message)); };
const contentWatcher = chokidar.watch(contentRoot, {
  ignoreInitial: true, ignored: (path) => /[\\/]\.[^\\/]+/.test(path) || path === resolve(contentRoot, 'posts/index.json'),
});
contentWatcher.on('all', () => { clearTimeout(contentTimer); contentTimer = setTimeout(() => enqueue(syncContent), 350); });
const codeWatcher = chokidar.watch([resolve(root, 'src'), resolve(root, 'public'), resolve(root, 'astro.config.mjs'), resolve(root, 'tailwind.config.mjs')], { ignoreInitial: true });
codeWatcher.on('all', () => { clearTimeout(codeTimer); codeTimer = setTimeout(() => enqueue(build), 450); });
console.log('[dev] 完整站点：http://localhost:4321 · 内容自动同步；代码自动构建，刷新浏览器查看。');
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true; clearTimeout(contentTimer); clearTimeout(codeTimer);
  void contentWatcher.close(); void codeWatcher.close(); server.kill();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
server.once('exit', (code) => { stop(); process.exitCode = code ?? 0; });
