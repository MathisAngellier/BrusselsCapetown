// Real PHP + disposable SQLite/files. InnoDB locks/schema checks still need Laragon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const modules = process.env.BCT_PHP_WASM_MODULES;
if (!modules) throw new Error('Set BCT_PHP_WASM_MODULES; see GALLERY_MIGRATION.md.');
const { PHP, FileLockManagerInMemory } = await import(pathToFileURL(path.join(modules, '@php-wasm/universal/index.js')));
const { loadNodeRuntime } = await import(pathToFileURL(path.join(modules, '@php-wasm/node/index.js')));
const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 }, fileLockManager: new FileLockManagerInMemory() }));
const root = '/app';
for (const dir of ['/app', '/app/scripts', '/app/private', '/app/httpdocs', '/app/httpdocs/uploads',
  '/app/httpdocs/uploads/gallery', '/app/httpdocs/public', '/app/httpdocs/public/img', '/app/httpdocs/public/img/gallery',
  '/app/httpdocs/public/video', '/app/httpdocs/public/video/gallery', '/app/httpdocs/src', '/app/httpdocs/src/assets', '/app/httpdocs/src/assets/js']) php.mkdir(dir);
for (const name of ['gallery-import-lib.php', 'import-gallery.php']) {
  php.writeFile(`/app/scripts/${name}`, readFileSync(new URL(`../scripts/${name}`, import.meta.url)));
}
const source = 'export const galleryLocations = [];\n';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS8cAAAAASUVORK5CYII=', 'base64');
// Minimal MP4 MIME header, not a browser playback fixture.
const mp4 = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex');
php.writeFile('/app/setup.php', `<?php
require '/app/scripts/gallery-import-lib.php';
class ImportTestStatement extends PDOStatement {
    public function execute(?array $params = null): bool {
        $failure = $GLOBALS['failure'] ?? '';
        if (str_contains($this->queryString, 'INSERT INTO gallery_locations') && $failure === 'coerce') {
            $params['latitude'] = 0;
        }
        if (str_contains($this->queryString, 'INSERT INTO gallery_media')) {
            if ($failure === 'replacement') {
                file_put_contents('/app/httpdocs' . $params['file_path'], 'replacement: keep me');
            }
            if (in_array($failure, ['insert', 'rollback', 'replacement'], true)) throw new RuntimeException('Injected insert failure');
        }
        return parent::execute($params);
    }
}
class ImportTestPdo extends PDO {
    public function query(string $sql, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false {
        return parent::query(str_replace(' FOR UPDATE', '', $sql), $fetchMode, ...$fetchModeArgs);
    }
    public function commit(): bool {
        if (($GLOBALS['failure'] ?? '') === 'commit-before') throw new RuntimeException('Injected before commit');
        $ok = parent::commit();
        if (($GLOBALS['failure'] ?? '') === 'commit-after') throw new RuntimeException('Injected uncertain commit');
        return $ok;
    }
    public function rollBack(): bool {
        if (($GLOBALS['failure'] ?? '') === 'rollback') throw new RuntimeException('Injected rollback failure');
        return parent::rollBack();
    }
}
$pdo = new ImportTestPdo('sqlite:/app/test.sqlite');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->setAttribute(PDO::ATTR_STATEMENT_CLASS, [ImportTestStatement::class]);
$pdo->exec('PRAGMA foreign_keys = ON');
function manifest() { return json_decode(file_get_contents('/app/private/gallery-import.manifest.json'), true, 128, JSON_THROW_ON_ERROR); }
`);
async function run(code) {
  const result = await php.run({ code: `<?php ${code}` });
  assert.equal(result.exitCode, 0, result.errors + result.text);
  return result.text;
}
function manifest() {
  const location = {
    id: 1, date: '2026-09-01', location: { fr: 'Bruxelles, Belgique', en: 'Brussels, Belgium' },
    distance: 0, latitude: 50.8503, longitude: 4.3517, description: { fr: 'Départ\nBonjour', en: 'Departure\nHello' },
    media: [{ type: 'image', src: '/img/gallery/a.png' }, { type: 'video', src: '/video/gallery/v.mp4' }],
  };
  return { version: 1, sourcePath: 'httpdocs/src/assets/js/galleryData.js', sourceSha256: createHash('sha256').update(source).digest('hex'),
    locations: [location, { ...location, location: { fr: 'Maubeuge, France', en: 'Maubeuge, France' },
      distance: 97, latitude: 50.328698, longitude: 4.006422, description: { fr: '', en: '' }, media: [] }] };
}
async function reset(data = manifest()) {
  await run(`
    // Only the isolated WASM test filesystem is cleared.
    function clearFixture($dir) { foreach (scandir($dir) as $name) {
      if ($name === '.' || $name === '..') continue;
      $p = $dir . '/' . $name;
      if (is_dir($p) && !is_link($p)) { clearFixture($p); rmdir($p); } else unlink($p);
    } }
    clearFixture('/app/private'); clearFixture('/app/httpdocs/uploads/gallery');
    clearFixture('/app/httpdocs/public/img/gallery'); clearFixture('/app/httpdocs/public/video/gallery');
    require '/app/setup.php';
    $pdo->exec('DROP TABLE IF EXISTS gallery_media'); $pdo->exec('DROP TABLE IF EXISTS gallery_locations');
    $pdo->exec('CREATE TABLE gallery_locations (location_id INTEGER PRIMARY KEY AUTOINCREMENT, journey_order INTEGER, journey_date TEXT,
      location_fr TEXT, location_en TEXT, description_fr TEXT, description_en TEXT, distance_km NUMERIC, latitude NUMERIC, longitude NUMERIC)');
    $pdo->exec('CREATE TABLE gallery_media (media_id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL REFERENCES gallery_locations(location_id) ON DELETE CASCADE,
      media_type TEXT, file_path TEXT, mime_type TEXT, file_size INTEGER, sort_order INTEGER)');
  `);
  php.writeFile('/app/httpdocs/src/assets/js/galleryData.js', source);
  php.writeFile('/app/httpdocs/public/img/gallery/a.png', png);
  php.writeFile('/app/httpdocs/public/video/gallery/v.mp4', mp4);
  php.writeFile('/app/private/gallery-import.manifest.json', JSON.stringify(data));
  php.writeFile('/app/private/config.php', 'unchanged application config');
}
async function plan() {
  return JSON.parse(await run(`require '/app/setup.php'; echo json_encode(bctImportPlan(manifest(), '/app'));`));
}
async function apply(failure = '') {
  return JSON.parse(await run(`require '/app/setup.php'; $GLOBALS['failure'] = '${failure}';
    try { $result = bctImportApply($pdo, bctImportPlan(manifest(), '/app'), '/app', 'brusselscapetown_migration_test');
      echo json_encode(['ok' => true, 'result' => $result]);
    } catch (Throwable $e) { echo json_encode(['ok' => false, 'error' => $e->getMessage()]); }`));
}
async function snapshot() {
  return JSON.parse(await run(`require '/app/setup.php';
    function files($dir) { $result = []; foreach (scandir($dir) as $n) {
      if ($n === '.' || $n === '..') continue; $p = $dir . '/' . $n;
      $result[$n] = is_dir($p) && !is_link($p) ? files($p) : (is_link($p) ? 'symlink' : hash_file('sha256', $p));
    } return $result; }
    echo json_encode(['locations' => $pdo->query('SELECT * FROM gallery_locations ORDER BY location_id')->fetchAll(),
      'media' => $pdo->query('SELECT * FROM gallery_media ORDER BY media_id')->fetchAll(),
      'private' => files('/app/private'), 'uploads' => files('/app/httpdocs/uploads/gallery'),
      'source' => files('/app/httpdocs/public')]);`));
}

test('preflight hashes image/video, keeps translations/order, warns duplicate static ID, writes nothing', async () => {
  await reset(); const before = await snapshot(); const p = await plan();
  assert.equal(p.locations.length, 2); assert.equal(p.media_count, 2);
  assert.equal(p.locations[0].fields.description_fr, 'Départ\nBonjour');
  assert.equal(p.locations[1].fields.journey_order, 2);
  assert.equal(p.locations[1].fields.description_en, '');
  assert.equal(p.locations[0].media[1].mime, 'video/mp4');
  assert.match(p.warnings[0], /Repeated static ID/);
  assert.deepEqual(await snapshot(), before);
});

test('apply generates IDs, copies checked bytes, records MIME/size/order, keeps original/config', async () => {
  await reset(); const before = await snapshot();
  // Empty tables need not have their AUTO_INCREMENT reset to 1.
  await run(`require '/app/setup.php'; $pdo->exec("INSERT INTO sqlite_sequence(name,seq) VALUES ('gallery_locations', 40)");`);
  const result = await apply(); assert.equal(result.ok, true, result.error);
  const after = await snapshot();
  assert.deepEqual(after.locations.map(x => x.location_id), [41, 42]);
  assert.deepEqual(after.media.map(x => x.sort_order), [0, 1]);
  assert.equal(after.media[0].file_size, png.length);
  assert.equal(after.media[1].file_size, mp4.length);
  assert.equal(after.media[0].mime_type, 'image/png');
  for (const row of after.media) {
    assert.match(row.file_path, /^\/uploads\/gallery\/41\/[a-f0-9]{32}\.(png|mp4)$/);
    const original = row.media_type === 'image' ? png : mp4;
    assert.deepEqual(Buffer.from(php.readFileAsBuffer('/app/httpdocs' + row.file_path)), original);
  }
  assert.deepEqual(after.source, before.source);
  assert.equal(after.private['config.php'], before.private['config.php']);
  assert.match(php.readFileAsText('/app/private/gallery-import-run.jsonl'), /"event":"committed"/);
  assert.equal(php.fileExists('/app/httpdocs/uploads/gallery/42'), false);
});

test('repeat import/nonempty database is refused without changes', async () => {
  await reset(); assert.equal((await apply()).ok, true); const before = await snapshot();
  const result = await apply(); assert.equal(result.ok, false); assert.match(result.error, /not empty/);
  assert.deepEqual(await snapshot(), before);
});

test('existing recovery journal blocks even an empty database', async () => {
  await reset(); php.writeFile('/app/private/gallery-import-run.jsonl', 'preserve');
  const before = await snapshot(); assert.equal((await apply()).ok, false);
  assert.deepEqual(await snapshot(), before);
});

test('existing upload folder is never reused or removed', async () => {
  await reset(); php.mkdir('/app/httpdocs/uploads/gallery/1'); php.writeFile('/app/httpdocs/uploads/gallery/1/keep.txt', 'keep');
  const result = await apply(); assert.equal(result.ok, false); assert.match(result.error, /already exists/);
  assert.equal(php.readFileAsText('/app/httpdocs/uploads/gallery/1/keep.txt'), 'keep');
  assert.equal((await snapshot()).locations.length, 0);
});

for (const failure of ['insert', 'commit-before', 'coerce']) {
  test(`${failure}: confirmed rollback removes only new unchanged copies`, async () => {
    await reset(); const before = await snapshot(); const result = await apply(failure);
    assert.equal(result.ok, false); assert.match(result.error, /rolled back/);
    const after = await snapshot();
    assert.equal(after.locations.length, 0); assert.equal(after.media.length, 0);
    assert.deepEqual(after.uploads, before.uploads); assert.deepEqual(after.source, before.source);
    assert.match(php.readFileAsText('/app/private/gallery-import-run.jsonl'), /"cleanup_complete":true/);
  });
}

test('unknown commit outcome keeps all media and recovery journal', async () => {
  await reset(); const result = await apply('commit-after');
  assert.equal(result.ok, false); assert.match(result.error, /uncertain/);
  const after = await snapshot(); assert.equal(after.locations.length, 2);
  for (const row of after.media) assert.equal(php.fileExists('/app/httpdocs' + row.file_path), true);
});

test('rollback failure preserves media for recovery', async () => {
  await reset(); const result = await apply('rollback');
  assert.equal(result.ok, false); assert.match(result.error, /uncertain/);
  const after = await snapshot(); assert.ok(Object.keys(after.uploads['1']).length > 0);
});

test('a replaced destination is retained during rollback', async () => {
  await reset(); const result = await apply('replacement'); assert.equal(result.ok, false);
  const after = await snapshot(); const filename = Object.keys(after.uploads['1'])[0];
  assert.equal(php.readFileAsText('/app/httpdocs/uploads/gallery/1/' + filename), 'replacement: keep me');
  assert.match(php.readFileAsText('/app/private/gallery-import-run.jsonl'), /"cleanup_complete":false/);
});

for (const [name, mutate] of [
  ['invalid date', m => m.locations[0].date = '2026-02-30'],
  ['invalid coordinate', m => m.locations[0].latitude = 91],
  ['negative distance', m => m.locations[1].distance = -1],
  ['missing translation', m => delete m.locations[0].location.en],
  ['duplicate location', m => m.locations[1] = structuredClone(m.locations[0])],
  ['date order', m => m.locations[1].date = '2026-08-31'],
  ['unsupported HEIC', m => m.locations[0].media[0].src = '/img/gallery/a.heic'],
  ['path traversal', m => m.locations[0].media[0].src = '/img/gallery/../../a.png'],
  ['external URL', m => m.locations[0].media[0].src = 'https://example.com/a.png'],
  ['missing media', m => m.locations[0].media[0].src = '/img/gallery/missing.png'],
  ['wrong declared type', m => m.locations[0].media[0].type = 'video'],
  ['stale export', m => m.sourceSha256 = '0'.repeat(64)],
  ['duplicate media', m => m.locations[0].media.push(m.locations[0].media[0])],
]) {
  test(`${name}: preflight fails before writes`, async () => {
    const m = manifest(); mutate(m); await reset(m); const before = await snapshot();
    assert.equal((await apply()).ok, false); assert.deepEqual(await snapshot(), before);
  });
}

test('a symlinked source is refused', async () => {
  await reset(); await run(`rename('/app/httpdocs/public/img/gallery/a.png', '/app/private/a.png'); symlink('/app/private/a.png', '/app/httpdocs/public/img/gallery/a.png');`);
  const before = await snapshot(); const result = await apply();
  assert.equal(result.ok, false); assert.match(result.error, /Symlink/); assert.deepEqual(await snapshot(), before);
});

test('fake image content is refused', async () => {
  await reset(); php.writeFile('/app/httpdocs/public/img/gallery/a.png', '<?php echo 1;');
  assert.equal((await apply()).ok, false); assert.equal(php.fileExists('/app/private/gallery-import-run.jsonl'), false);
});

test('a source changed after planning fails checksum verification and rolls back', async () => {
  await reset();
  const result = JSON.parse(await run(`require '/app/setup.php'; $plan = bctImportPlan(manifest(), '/app');
    $source = '/app/httpdocs/public/img/gallery/a.png';
    $bytes = file_get_contents($source); $bytes[strlen($bytes) - 1] = 'X'; file_put_contents($source, $bytes);
    try { bctImportApply($pdo, $plan, '/app', 'brusselscapetown_migration_test'); echo json_encode(['ok' => true]); }
    catch (Throwable $e) { echo json_encode(['ok' => false, 'error' => $e->getMessage()]); }`));
  assert.equal(result.ok, false); assert.match(result.error, /checksum/);
  assert.equal((await snapshot()).locations.length, 0);
  assert.match(php.readFileAsText('/app/private/gallery-import-run.jsonl'), /"cleanup_complete":false/);
});

test('copy helper never overwrites an existing destination', async () => {
  await reset(); php.writeFile('/app/private/existing.png', 'keep');
  const result = await run(`require '/app/setup.php'; $plan = bctImportPlan(manifest(), '/app'); $created = [];
    try { bctImportCopy('/app/httpdocs/public/img/gallery/a.png', '/app/private/existing.png', $plan['locations'][0]['media'][0], $created); echo 'unexpected'; }
    catch (Throwable $e) { echo $e->getMessage(); }`);
  assert.match(result, /Destination exists/);
  assert.equal(php.readFileAsText('/app/private/existing.png'), 'keep');
});

test('only explicit loopback *_migration_test targets are accepted', async () => {
  const results = JSON.parse(await run(`require '/app/setup.php'; $results = [];
    foreach ([['127.0.0.1', 'brusselscapetown_migration_test', 'brusselscapetown_migration_test'],
      ['localhost', 'brusselscapetown', 'brusselscapetown'], ['localhost', 'brusselscapetown_local', 'brusselscapetown_local'],
      ['remote.example', 'brusselscapetown_migration_test', 'brusselscapetown_migration_test'],
      ['127.0.0.1', 'brusselscapetown_migration_test', 'different_migration_test']] as [$host, $database, $expected]) {
      try { bctImportValidateTarget(['host' => $host, 'database' => $database, 'port' => 3306, 'username' => 'test', 'password' => ''], $expected); $results[] = true; }
      catch (Throwable $e) { $results[] = false; }
    } echo json_encode($results);`));
  assert.deepEqual(results, [true, false, false, false, false]);
});

test('CLI importer refuses web invocation before loading config', async () => {
  const result = await php.run({ scriptPath: '/app/scripts/import-gallery.php', method: 'GET' });
  assert.equal(result.httpStatusCode, 404); assert.equal(result.text, '');
});

test.after(() => php.exit());
