// Run from the repository root with Node 22+. No database or network access.
import { readFile, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length !== 2) {
  console.error('Usage: node scripts/export-gallery.mjs');
  process.exitCode = 1;
} else {
  try {
    const privateDir = path.join(root, 'private');
    // Existing, private directory only. Never write a manifest into httpdocs.
    if (await realpath(privateDir) !== path.join(await realpath(root), 'private')) {
      throw new Error('private must be a real directory, not a symlink.');
    }
    const sourcePath = 'httpdocs/src/assets/js/galleryData.js';
    const source = await readFile(path.join(root, sourcePath), 'utf8');
    // This executes only the project's own gallery data module, never an uploaded file.
    const { galleryLocations } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    if (!Array.isArray(galleryLocations) || !galleryLocations.length) {
      throw new Error('galleryLocations must be a nonempty array.');
    }
    const manifest = {
      version: 1,
      sourcePath,
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      locations: galleryLocations,
    };
    const target = path.join(privateDir, 'gallery-import.manifest.json');
    const handle = await open(target, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(manifest, null, 2) + '\n');
      await handle.sync();
    } finally {
      await handle.close();
    }
    console.log(`Exported ${galleryLocations.length} locations to private/gallery-import.manifest.json`);
    console.log('No database changes. Existing manifest files are never overwritten.');
  } catch (error) {
    console.error(error.code === 'EEXIST'
      ? 'The manifest already exists. Review/move that exact file before exporting again.'
      : error.message);
    process.exitCode = 1;
  }
}
