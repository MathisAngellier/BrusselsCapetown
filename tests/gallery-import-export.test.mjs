import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function fixture(t, source = 'export const galleryLocations = [{id:1}];\n') {
  const dir = await mkdtemp(path.join(tmpdir(), 'bct-gallery-export-'));
  t.after(() => rm(dir, { recursive: true, force: true })); // This test's own mkdtemp only.
  for (const sub of ['scripts', 'private', 'httpdocs/src/assets/js']) await mkdir(path.join(dir, sub), { recursive: true });
  await copyFile(new URL('../scripts/export-gallery.mjs', import.meta.url), path.join(dir, 'scripts/export-gallery.mjs'));
  await writeFile(path.join(dir, 'httpdocs/src/assets/js/galleryData.js'), source);
  return { dir, target: path.join(dir, 'private/gallery-import.manifest.json'),
    run: (...args) => spawnSync(process.execPath, ['scripts/export-gallery.mjs', ...args], { cwd: dir, encoding: 'utf8' }) };
}

test('export preserves real merged data and source checksum without overwriting', async t => {
  const source = await readFile(new URL('../httpdocs/src/assets/js/galleryData.js', import.meta.url), 'utf8');
  const f = await fixture(t, source); const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const before = await readFile(f.target, 'utf8'); const manifest = JSON.parse(before);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.sourceSha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(manifest.locations[0].location.fr, 'Bruxelles, Belgique');
  assert.ok(manifest.locations.some(x => x.location.fr === 'Maubeuge, France'));
  assert.equal(f.run().status, 1);
  assert.equal(await readFile(f.target, 'utf8'), before);
});

test('export refuses invalid data or unknown flags', async t => {
  const f = await fixture(t, 'export const galleryLocations = [];');
  assert.equal(f.run().status, 1);
  assert.equal(f.run('--force').status, 1);
  await assert.rejects(readFile(f.target), { code: 'ENOENT' });
});

test('export refuses symlinked private destination', async t => {
  const f = await fixture(t);
  await rm(path.join(f.dir, 'private'), { recursive: true });
  await mkdir(path.join(f.dir, 'other'));
  await symlink(path.join(f.dir, 'other'), path.join(f.dir, 'private'), 'dir');
  assert.equal(f.run().status, 1);
  await assert.rejects(readFile(f.target), { code: 'ENOENT' });
});

test('merge keeps database loading, empty-description spacing and main iPhone fixes', async () => {
  const js = await readFile(new URL('../httpdocs/src/assets/js/gallery.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../httpdocs/src/assets/css/gallery.css', import.meta.url), 'utf8');
  assert.match(js, /loadGalleryLocations\(fallbackLocations\)/);
  assert.match(js, /src="\$\{escapeAttribute\(item.src\)\}#t=0\.001"/);
  assert.match(css, /#locationDescription\[hidden\] \+ \.media-grid\s*\{\s*margin-top: 2rem;/);
  assert.match(css, /white-space: nowrap/);
  assert.match(css, /\.video-play-icon\s*\{\s*width: 28px;\s*height: 28px;\s*flex-shrink: 0;/);
});
