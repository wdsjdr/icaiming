import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMediaPath, AdminError, listMedia, resolveUploadTarget } from '../scripts/admin/lib';
import { assetPath } from '../src/lib/pet/assets';
import { petMediaPrefix } from '../src/lib/pet/media';
import { contentRoot } from '../scripts/content';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { moveMediaToTrash, restoreFromTrash } from '../scripts/admin/lib';

// Exercise the same file-only operation used by the DELETE entry on disposable files only.
async function deleteMedia(root: string, rel: string) {
  return moveMediaToTrash(root, rel);
}

async function mediaFixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(process.platform === 'win32' ? 'C:/Users/86133/AppData/Local/Temp/opencode' : tmpdir(), 'pet-delete-'));
  try {
    const file = join(root, petMediaPrefix, assetPath('idle'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, 'protected-clip');
    await mkdir(join(root, 'assets/images'), { recursive: true });
    await writeFile(join(root, 'assets/images/photo.png'), 'ordinary-image');
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('regression: guard protects the whole pet namespace and case-insensitive Windows aliases', () => {
  for (const rel of [
    'assets', 'assets/pet', 'assets/pet/v0.3.7-web-1', 'assets/pet/notes.txt',
    `assets/PET/V0.3.7-WEB-1/${assetPath('idle').toUpperCase()}`,
    `ASSETS\\Pet\\v0.3.6-web-1\\${assetPath('walk')}`,
  ]) assert.throws(() => assertMediaPath(rel), AdminError, rel);
});

test('regression: DELETE cannot move a pet ancestor directory or an ordinary media directory', async () => {
  for (const rel of ['assets', 'assets/pet', 'assets/pet/v0.3.7-web-1', 'assets/images']) {
    await mediaFixture(async (root) => {
      await assert.rejects(() => deleteMedia(root, rel), AdminError, rel);
      assert.equal(await readFile(join(root, petMediaPrefix, assetPath('idle')), 'utf8'), 'protected-clip');
      assert.equal(await readFile(join(root, 'assets/images/photo.png'), 'utf8'), 'ordinary-image');
    });
  }
});

test('regression: Windows case aliases and trailing-dot path aliases never delete real pet files', async () => {
  await mediaFixture(async (root) => {
    const aliases = [
      `${petMediaPrefix.toUpperCase()}${assetPath('idle').toUpperCase()}`,
      `${petMediaPrefix.replace('pet/', 'pet./')}${assetPath('idle')}`,
    ];
    for (const rel of aliases) {
      // Case aliases resolve on Windows. Trailing-dot resolution varies with the
      // Node/Win32 path API; reject that spelling regardless of filesystem support.
      if (process.platform === 'win32' && !rel.includes('pet.')) assert.equal(await readFile(join(root, rel), 'utf8'), 'protected-clip');
      await assert.rejects(() => deleteMedia(root, rel), AdminError, rel);
      assert.equal(await readFile(join(root, petMediaPrefix, assetPath('idle')), 'utf8'), 'protected-clip');
    }
  });
});

test('regression: DELETE rejects a symlink/junction in a parent or at the media target', async () => {
  await mediaFixture(async (root) => {
    await mkdir(join(root, 'outside'), { recursive: true });
    await writeFile(join(root, 'outside/keep.png'), 'outside-file');
    await symlink(join(root, 'outside'), join(root, 'assets/linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => deleteMedia(root, 'assets/linked/keep.png'), AdminError);
    await assert.rejects(() => deleteMedia(root, 'assets/linked'), AdminError);
    assert.equal(await readFile(join(root, 'outside/keep.png'), 'utf8'), 'outside-file');
  });
});

test('ordinary file DELETE and trash restore remain compatible', async () => {
  await mediaFixture(async (root) => {
    const moved = await deleteMedia(root, 'assets/images/photo.png');
    assert.equal(moved.path, 'assets/images/photo.png');
    await restoreFromTrash(root, moved.path);
    assert.equal(await readFile(join(root, 'assets/images/photo.png'), 'utf8'), 'ordinary-image');
  });
});

test('media DELETE entry uses the file-only operation, not an unchecked trash rename', async () => {
  const source = await readFile(new URL('../scripts/admin/server.ts', import.meta.url), 'utf8');
  const branch = source.match(/if \(path === '\/api\/media' && method === 'DELETE'\) \{([\s\S]*?)return true;/)?.[1];
  assert.ok(branch);
  assert.match(branch, /await store\.moveMediaToTrash\(contentRoot, rel\)/);
  assert.doesNotMatch(branch, /store\.moveToTrash\(/);
});

test('media DELETE rejects missing targets and linked trash parents', async () => {
  await mediaFixture(async (root) => {
    await assert.rejects(() => deleteMedia(root, 'assets/images/missing.png'), (error: unknown) => error instanceof AdminError && error.status === 404);
    await mkdir(join(root, 'outside-trash'), { recursive: true });
    await symlink(join(root, 'outside-trash'), join(root, '.trash'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => deleteMedia(root, 'assets/images/photo.png'), AdminError);
    assert.equal(await readFile(join(root, 'assets/images/photo.png'), 'utf8'), 'ordinary-image');
  });
});

test('admin delete guard protects version/hash clips including older rollback versions', () => {
  for (const key of [`${petMediaPrefix}${assetPath('idle')}`, `assets/pet/v0.3.6-web-1/${assetPath('walk')}`]) {
    assert.throws(() => assertMediaPath(key), (error: unknown) => error instanceof AdminError && error.status === 403 && error.message.includes('受控内容仓库版本流程'));
    assert.throws(() => assertMediaPath(key.replaceAll('/', '\\')), AdminError);
  }
  for (const key of ['assets/images/a.webp', 'assets/pet-notes.txt', 'downloads/tool.zip', 'resume/resume.pdf']) {
    assert.doesNotThrow(() => assertMediaPath(key));
  }
  for (const key of ['posts/a.md', '../assets/a.png', 'assets/../a.png', 'rankings/a.json']) {
    assert.throws(() => assertMediaPath(key), AdminError);
  }
});

test('protected pet clips remain listed, while generic WebM upload remains disallowed', async () => {
  const listed = await listMedia(contentRoot);
  assert.equal(listed.assets.filter((entry) => entry.path.startsWith(petMediaPrefix)).length, 15);
  await assert.rejects(() => resolveUploadTarget(contentRoot, petMediaPrefix, 'idle.webm'), AdminError);
});

test('resource-domain docs distinguish direct object metadata and CORS from Worker headers', async () => {
  for (const path of ['README.md', 'docs/site-pet.md', 'THIRD_PARTY_NOTICES.md']) {
    const text = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(text, /https:\/\/assets\.icaiming\.cn\/assets\/pet\/v0\.3\.7-web-[1-9]\d*/);
    for (const required of ['https://icaiming.cn', 'video/webm', 'immutable', 'CORS', '十五 key', 'content:publish', '旧版', '私人对象']) {
      assert.ok(text.includes(required), `${path}: ${required}`);
    }
    assert.ok(!text.includes('https://assets.icaiming.cn/media/'), `${path}: direct bucket paths must not include Worker /media/`);
  }
});
