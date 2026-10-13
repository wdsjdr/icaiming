import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  AdminError, atomicWrite, buildPostRaw, createPost, listMedia, listPosts, listTrash, moveToTrash,
  normalizeCredential, purgeTrash, readCollection, readPostFile, referencesFor, resolveUploadTarget,
  restoreFromTrash, sanitizeUploadName, updateEnvFile, validateCollection, walkFiles, writePost,
} from '../scripts/admin/lib';
import { md5Hex, remoteAction } from '../scripts/content';
import { parsePost } from '../src/lib/content';

async function fixture(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'icaiming-admin-'));
}

async function seed(root: string, files: Record<string, string | Buffer>) {
  for (const [rel, data] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, data);
  }
}

async function cleanup(root: string) {
  await rm(root, { recursive: true, force: true });
}

test('resolveUploadTarget enforces folders, extensions, name sanitization and collisions', async () => {
  const root = await fixture();
  try {
    const target = await resolveUploadTarget(root, 'assets/images', 'My Photo 1.PNG');
    assert.equal(target.rel, 'assets/images/My-Photo-1.png');
    await seed(root, { [target.rel]: 'x' });
    const second = await resolveUploadTarget(root, 'assets/images', 'My Photo 1.PNG');
    assert.equal(second.rel, 'assets/images/My-Photo-1-2.png');
    await assert.rejects(() => resolveUploadTarget(root, 'posts', 'x.md'), AdminError);
    await assert.rejects(() => resolveUploadTarget(root, 'assets', 'payload.exe'), AdminError);
    await assert.rejects(() => resolveUploadTarget(root, 'resume', 'cv.png'), AdminError);
    await assert.rejects(() => resolveUploadTarget(root, 'resume/sub', 'cv.pdf'), AdminError);
    const resume = await resolveUploadTarget(root, 'resume', '简历 2026.pdf');
    assert.match(resume.rel, /^resume\/[A-Za-z0-9_-]+\.pdf$/);
  } finally {
    await cleanup(root);
  }
});

test('sanitizeUploadName strips unsafe characters and reserved names', () => {
  assert.equal(sanitizeUploadName('a/b c.webp'), 'b-c.webp');
  assert.equal(sanitizeUploadName('../../evil.js'), 'evil.js');
  assert.equal(sanitizeUploadName('CON.txt'), 'file-CON.txt');
  assert.equal(sanitizeUploadName('???.png'), sanitizeUploadName('???.png'));
  assert.match(sanitizeUploadName('???.png'), /^file-[a-z0-9]+\.png$/);
  assert.match(sanitizeUploadName('.hidden.svg'), /\.svg$/);
});

test('atomicWrite replaces existing files and leaves no temp residue', async () => {
  const root = await fixture();
  try {
    const file = join(root, 'a.txt');
    await atomicWrite(file, 'one');
    await atomicWrite(file, 'two');
    assert.equal(await readFile(file, 'utf8'), 'two');
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(root), ['a.txt']);
  } finally {
    await cleanup(root);
  }
});

test('posts are created, validated, listed and refusals are explicit', async () => {
  const root = await fixture();
  try {
    const raw = buildPostRaw({ title: '标题', description: '描述', date: '2026-10-10', tags: ['a', 'b'], draft: false }, '正文内容');
    const parsed = parsePost(raw, 'hello-admin');
    assert.equal(parsed.meta.title, '标题');
    assert.deepEqual(parsed.meta.tags, ['a', 'b']);
    await createPost(root, 'hello-admin', raw);
    await assert.rejects(() => createPost(root, 'hello-admin', raw), /已存在/);
    await assert.rejects(() => createPost(root, 'Bad Slug', raw), /slug/);
    await assert.rejects(() => writePost(root, 'hello-admin', '---\ntitle: x\n---\n'), /缺少|description|date/);

    const draftMeta = JSON.stringify({ title: 'd', description: 'd', date: '2999-01-01', draft: false });
    await seed(root, { 'posts/future.md': `---\n${draftMeta}\n---\n\n未来正文` });
    const listed = await listPosts(root);
    const hello = listed.find((post) => post.slug === 'hello-admin');
    assert.ok(hello?.valid && hello.published);
    assert.equal(listed.find((post) => post.slug === 'future')?.published, false);
    const read = await readPostFile(root, 'hello-admin');
    assert.equal(read.valid, true);
    assert.equal((read as { body: string }).body.trim(), '正文内容');
  } finally {
    await cleanup(root);
  }
});

test('collections validate cross-file references instead of accepting dangling paths', async () => {
  const root = await fixture();
  try {
    await seed(root, { 'downloads/file.bin': 'x' });
    const good = { items: [{ title: 't', description: 'd', category: 'c', file: 'downloads/file.bin', tags: [] }] };
    const parsed = await validateCollection(root, 'downloads', good);
    assert.equal(parsed.items?.length, 1);
    const missing = { items: [{ title: 't', description: 'd', category: 'c', file: 'downloads/missing.bin', tags: [] }] };
    await assert.rejects(() => validateCollection(root, 'downloads', missing), /不存在/);
    const unsafe = { items: [{ title: 't', description: 'd', category: 'c', file: 'posts/evil.md', tags: [] }] };
    await assert.rejects(() => validateCollection(root, 'downloads', unsafe), /路径不合法/);
    const resource = { items: [{ title: 't', description: 'd', category: 'c', url: 'javascript:alert(1)', tags: [] }] };
    await assert.rejects(() => validateCollection(root, 'resources', resource));
  } finally {
    await cleanup(root);
  }
});

test('collection reads report invalid JSON without throwing and write through to disk', async () => {
  const root = await fixture();
  try {
    await seed(root, { 'site/profile.json': '{invalid' });
    const broken = await readCollection(root, 'profile');
    assert.equal(broken.valid, false);
    assert.ok(broken.error);
    await assert.rejects(() => readCollection(root, 'unknown'), /未知集合/);
  } finally {
    await cleanup(root);
  }
});

test('trash flow moves files out of the content tree, restores them and purges', async () => {
  const root = await fixture();
  try {
    await seed(root, { 'posts/trashme.md': 'x' });
    const moved = await moveToTrash(root, 'posts/trashme.md');
    assert.equal(moved.path, 'posts/trashme.md');
    assert.equal(await stat(join(root, 'posts/trashme.md')).catch(() => null), null);
    const entries = await listTrash(root);
    assert.equal(entries.length, 1);
    await restoreFromTrash(root, moved.path);
    assert.equal(await readFile(join(root, 'posts/trashme.md'), 'utf8'), 'x');
    await assert.rejects(() => restoreFromTrash(root, moved.path), /不存在/);
    await moveToTrash(root, 'posts/trashme.md');
    await purgeTrash(root, 'posts/trashme.md');
    assert.equal((await listTrash(root)).length, 0);
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(join(root, '.trash')), []);
    await assert.rejects(() => moveToTrash(root, 'posts/../escape.md'), AdminError);
    await assert.rejects(() => moveToTrash(root, '不存在的.md'), AdminError);
  } finally {
    await cleanup(root);
  }
});

test('media listing filters resume to PDFs and reference scan resolves post links', async () => {
  const root = await fixture();
  try {
    await seed(root, {
      'assets/images/a.webp': 'a',
      'assets/images/ab.webp': 'ab',
      'downloads/tool.zip': 'z',
      'resume/resume.json': '{}',
      'resume/resume.pdf': '%PDF',
      'posts/using.md': '---\ntitle: t\ndescription: d\ndate: "2026-10-10"\n---\n\n![x](/media/assets/images/a.webp)',
    });
    const media = await listMedia(root);
    assert.deepEqual(media.assets.map((entry) => entry.path), ['assets/images/a.webp', 'assets/images/ab.webp']);
    assert.deepEqual(media.resume.map((entry) => entry.path), ['resume/resume.pdf']);
    const corpus = [
      { label: 'posts/using.md', text: '![x](/media/assets/images/a.webp)' },
      { label: 'downloads/index.json', text: '{"file":"downloads/tool.zip"}' },
    ];
    assert.deepEqual(referencesFor(corpus, 'assets/images/a.webp'), ['posts/using.md']);
    assert.deepEqual(referencesFor(corpus, 'assets/images/ab.webp'), []);
    assert.deepEqual(referencesFor(corpus, 'downloads/tool.zip'), ['downloads/index.json']);
    const walked = await walkFiles(root, 'assets');
    assert.equal(walked.length, 2);
    await assert.rejects(() => walkFiles(root, '../outside'), AdminError);
  } finally {
    await cleanup(root);
  }
});

test('path guards reject traversal, absolute and reserved segment paths', async () => {
  const root = await fixture();
  try {
    const bad = ['../x', 'a/../b', '/etc/passwd', 'C:evil', '.hidden/x', 'con/x', 'a//b', 'a/', ''];
    for (const rel of bad) {
      await assert.rejects(() => moveToTrash(root, rel), AdminError, `应拒绝：${rel}`);
    }
    const ok = await resolveUploadTarget(root, 'assets', 'ok.txt');
    assert.equal(ok.rel, 'assets/ok.txt');
  } finally {
    await cleanup(root);
  }
});

test('env credential updates create, append and replace values without touching other lines', async () => {
  const root = await fixture();
  try {
    const envPath = join(root, '.dev.vars');
    await updateEnvFile(envPath, { R2_ACCESS_KEY_ID: 'KEY1', R2_SECRET_ACCESS_KEY: 'SEC1' });
    let text = await readFile(envPath, 'utf8');
    assert.match(text, /^R2_ACCESS_KEY_ID=KEY1$/m);
    assert.match(text, /^R2_SECRET_ACCESS_KEY=SEC1$/m);
    assert.equal(text.endsWith('\n'), true);

    await seed(root, { '.dev.vars': '# keep\nCLOUDFLARE_API_TOKEN=token-value\nR2_ACCESS_KEY_ID="OLD"\n\nUAPI_KEY=u\n' });
    await updateEnvFile(envPath, { R2_ACCESS_KEY_ID: 'KEY2', R2_SECRET_ACCESS_KEY: 'SEC2' });
    text = await readFile(envPath, 'utf8');
    assert.match(text, /# keep/);
    assert.match(text, /CLOUDFLARE_API_TOKEN=token-value/);
    assert.match(text, /^R2_ACCESS_KEY_ID=KEY2$/m);
    assert.match(text, /^R2_SECRET_ACCESS_KEY=SEC2$/m);
    assert.match(text, /^UAPI_KEY=u$/m);
    assert.doesNotMatch(text, /OLD/);
    assert.equal(text.endsWith('\n\n'), false);

    await updateEnvFile(envPath, { R2_ACCESS_KEY_ID: 'KEY3' });
    text = await readFile(envPath, 'utf8');
    assert.match(text, /^R2_ACCESS_KEY_ID=KEY3$/m);
    assert.match(text, /^R2_SECRET_ACCESS_KEY=SEC2$/m);
  } finally {
    await cleanup(root);
  }
});

test('credential values reject blanks, whitespace, newlines and overlong input', () => {
  assert.equal(normalizeCredential('  abc123  ', 'key'), 'abc123');
  assert.equal(normalizeCredential('a+b/c=', 'key'), 'a+b/c=');
  assert.throws(() => normalizeCredential('', 'key'), AdminError);
  assert.throws(() => normalizeCredential('   ', 'key'), AdminError);
  assert.throws(() => normalizeCredential('a b', 'key'), AdminError);
  assert.throws(() => normalizeCredential('line\nbreak', 'key'), AdminError);
  assert.throws(() => normalizeCredential('x'.repeat(257), 'key'), AdminError);
});

test('publish diff skips unchanged objects and re-uploads mismatched or multipart etags', () => {
  const digest = md5Hex('hello');
  assert.equal(digest, '5d41402abc4b2a76b9719d911017c592');
  assert.equal(md5Hex(Buffer.from('hello')), digest);
  assert.equal(remoteAction(digest, { status: 404, etag: null }), 'add');
  assert.equal(remoteAction(digest, { status: 200, etag: `"${digest}"` }), 'skip');
  assert.equal(remoteAction(digest, { status: 200, etag: `W/"${digest}"` }), 'skip');
  assert.equal(remoteAction(digest, { status: 200, etag: digest.toUpperCase() }), 'skip');
  assert.equal(remoteAction(digest, { status: 200, etag: `"${digest}-2"` }), 'update');
  assert.equal(remoteAction(digest, { status: 200, etag: '"00000000000000000000000000000000"' }), 'update');
  assert.equal(remoteAction(digest, { status: 200, etag: null }), 'update');
});