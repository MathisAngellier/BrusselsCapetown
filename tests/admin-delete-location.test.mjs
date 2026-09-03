// Production PHP code, isolated files and SQLite with real ON DELETE CASCADE.
// Only the bootstrap is replaced; MySQL FOR UPDATE is stripped for SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const modules = process.env.BCT_PHP_WASM_MODULES;
if (!modules) throw new Error('Set BCT_PHP_WASM_MODULES as described in ADMIN_MEDIA_MANAGEMENT.md.');
const { PHP, FileLockManagerInMemory } = await import(pathToFileURL(path.join(modules, '@php-wasm/universal/index.js')));
const { loadNodeRuntime } = await import(pathToFileURL(path.join(modules, '@php-wasm/node/index.js')));
const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 }, fileLockManager: new FileLockManagerInMemory() }));
const app = '/app/httpdocs';
for (const directory of ['/app', app, `${app}/api`, `${app}/api/admin`, `${app}/admin`, `${app}/uploads`, `${app}/uploads/gallery`, '/app/private']) php.mkdir(directory);
for (const file of ['api/admin/auth.php', 'api/admin/location-fields.php', 'api/admin/media-management.php', 'api/admin/location-deletion.php', 'api/admin/delete-location.php', 'admin/delete-location.php', 'admin/layout.php']) {
    php.writeFile(`${app}/${file}`, readFileSync(new URL(`../httpdocs/${file}`, import.meta.url)));
}
php.writeFile(`${app}/api/bootstrap.php`, `<?php
class TestDeleteStatement extends PDOStatement {
    public function execute(?array $params = null): bool {
        if (str_starts_with($this->queryString, 'DELETE FROM gallery_locations')) {
            $failure = $_SERVER['BCT_TEST_FAILURE'] ?? '';
            if ($failure === 'restore-conflict') {
                file_put_contents('/app/httpdocs/uploads/gallery/1/photo.png', 'Do not overwrite this replacement');
            }
            if (in_array($failure, ['delete', 'restore-conflict', 'rollback'], true)) throw new RuntimeException('Injected delete failure');
        }
        return parent::execute($params);
    }
}
class TestDeletePdo extends PDO {
    public function prepare(string $sql, array $options = []): PDOStatement|false {
        return parent::prepare(str_replace(' FOR UPDATE', '', $sql), $options);
    }
    public function commit(): bool {
        if (($_SERVER['BCT_TEST_FAILURE'] ?? '') === 'commit-before') throw new RuntimeException('Injected pre-commit failure');
        $result = parent::commit();
        if (($_SERVER['BCT_TEST_FAILURE'] ?? '') === 'commit-after') throw new RuntimeException('Injected ambiguous commit');
        return $result;
    }
    public function rollBack(): bool {
        if (($_SERVER['BCT_TEST_FAILURE'] ?? '') === 'rollback') throw new RuntimeException('Injected rollback failure');
        return parent::rollBack();
    }
}
$pdo = new TestDeletePdo('sqlite:/app/test.sqlite');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->setAttribute(PDO::ATTR_STATEMENT_CLASS, [TestDeleteStatement::class]);
$pdo->exec(($_SERVER['BCT_TEST_FAILURE'] ?? '') === 'no-cascade' ? 'PRAGMA foreign_keys = OFF' : 'PRAGMA foreign_keys = ON');
`);
for (const target of ['api', 'page']) {
    php.writeFile(`/app/${target}.php`, `<?php
require '${app}/api/admin/auth.php';
$_SESSION = ($_SERVER['BCT_TEST_AUTH'] ?? '1') === '1' ? ['admin_id' => 1, 'admin_username' => 'admin', 'csrf_token' => str_repeat('a', 64)] : [];
require '${app}/${target === 'api' ? 'api/admin' : 'admin'}/delete-location.php';
`);
}
async function runCode(code) {
    const result = await php.run({ code: `<?php ${code}` });
    assert.equal(result.exitCode, 0, result.errors);
    return result;
}
async function reset() {
    await runCode(`
        // These paths exist only inside this test's disposable WASM filesystem.
        function cleanTest($dir) { foreach (scandir($dir) as $name) {
            if ($name === '.' || $name === '..') continue;
            $p = $dir . '/' . $name;
            if (is_dir($p) && !is_link($p)) { cleanTest($p); rmdir($p); } else unlink($p);
        } }
        cleanTest('${app}/uploads/gallery'); cleanTest('/app/private');
        mkdir('${app}/uploads/gallery/1'); mkdir('${app}/uploads/gallery/2');
        require '${app}/api/bootstrap.php';
        $pdo->exec('DROP TABLE IF EXISTS gallery_media'); $pdo->exec('DROP TABLE IF EXISTS gallery_locations');
        $pdo->exec('CREATE TABLE gallery_locations (location_id INTEGER PRIMARY KEY, journey_order INTEGER, journey_date TEXT, location_fr TEXT, location_en TEXT, distance_km TEXT, latitude TEXT, longitude TEXT, description_fr TEXT, description_en TEXT)');
        $pdo->exec("INSERT INTO gallery_locations VALUES (1, 1, '2026-09-01', 'Bruxelles', 'Brussels', '10.00', '50', '4', '', ''), (2, 2, '2026-09-02', 'Paris', 'Paris', '20.00', '49', '3', 'Une étape', 'A stop')");
        $pdo->exec('CREATE TABLE gallery_media (media_id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER NOT NULL REFERENCES gallery_locations(location_id) ON DELETE CASCADE, media_type TEXT, file_path TEXT, mime_type TEXT, file_size INTEGER, sort_order INTEGER)');
        $pdo->exec("INSERT INTO gallery_media VALUES (1, 1, 'image', '/uploads/gallery/1/photo.png', 'image/png', 5, 0), (2, 1, 'video', '/uploads/gallery/1/video.mov', 'video/quicktime', 5, 1), (3, 2, 'image', '/uploads/gallery/2/other.png', 'image/png', 5, 0)");
    `);
    php.writeFile(`${app}/uploads/gallery/1/photo.png`, 'photo');
    php.writeFile(`${app}/uploads/gallery/1/video.mov`, 'video');
    php.writeFile(`${app}/uploads/gallery/2/other.png`, 'other');
}
async function revision(id = 1) {
    return (await runCode(`require '${app}/api/bootstrap.php'; require '${app}/api/admin/location-deletion.php'; echo bctLocationDeletionRevision(bctReadDeletionLocation($pdo, ${id}), bctReadLocationMedia($pdo, ${id}));`)).text;
}
async function request(body = null, server = {}, target = 'api', method = body ? 'POST' : 'GET', query = 'id=1') {
    let payload = {};
    if (body) {
        const form = new FormData();
        for (const [key, value] of Object.entries(body)) form.set(key, value);
        const encoded = new Request('http://test.invalid', { method: 'POST', body: form });
        payload = { body: new Uint8Array(await encoded.arrayBuffer()), headers: { 'Content-Type': encoded.headers.get('content-type') } };
    }
    const result = await php.run({ scriptPath: `/app/${target}.php`, relativeUri: `/delete-location.php?${query}`, method, ...payload, $_SERVER: server });
    assert.equal(result.exitCode, 0, result.errors);
    return { status: result.httpStatusCode, text: result.text, headers: result.headers, body: target === 'api' ? JSON.parse(result.text) : null };
}
async function post(extra = {}, server = {}) {
    return request({ location_id: '1', deletion_revision: await revision(), confirmation_name: 'Bruxelles', csrf_token: 'a'.repeat(64), ...extra }, server);
}
async function snapshot() {
    return JSON.parse((await runCode(`require '${app}/api/bootstrap.php';
        function names($dir) { return is_dir($dir) ? array_values(array_diff(scandir($dir), ['.', '..'])) : []; }
        echo json_encode([
            'locations' => $pdo->query('SELECT * FROM gallery_locations ORDER BY location_id')->fetchAll(),
            'media' => $pdo->query('SELECT * FROM gallery_media ORDER BY media_id')->fetchAll(),
            'files' => names('${app}/uploads/gallery/1'), 'trash' => names('/app/private/gallery-trash')
        ]);`)).text);
}

test('confirmation page is read-only, named and shows exact media counts', async () => {
    await reset(); const before = await snapshot();
    const result = await request(null, {}, 'page');
    assert.equal(result.status, 200);
    assert.match(result.text, /Bruxelles/);
    assert.match(result.text, /1 photo\(s\) and 1 video\(s\)/);
    assert.match(result.text, new RegExp(`name="deletion_revision" value="${await revision()}"`));
    assert.deepEqual(await snapshot(), before);
});

test('delete cascades records, removes all selected files/folder, preserves every other stop field', async () => {
    await reset(); const before = await snapshot();
    const result = await post();
    assert.equal(result.status, 200); assert.equal(result.body.success, true);
    assert.equal(result.body.media_count, 2); assert.equal(result.body.warning, '');
    const after = await snapshot();
    assert.deepEqual(after.locations, [before.locations[1]]);
    assert.deepEqual(after.media, [before.media[2]]);
    assert.deepEqual(after.trash, []);
    assert.equal(php.fileExists(`${app}/uploads/gallery/1`), false);
    assert.equal(php.readFileAsText(`${app}/uploads/gallery/2/other.png`), 'other');
});

test('repeat deletion returns not found without touching any other data', async () => {
    await reset(); const oldRevision = await revision(); await post(); const before = await snapshot();
    const result = await request({ location_id: '1', deletion_revision: oldRevision, confirmation_name: 'Bruxelles', csrf_token: 'a'.repeat(64) });
    assert.equal(result.status, 404); assert.deepEqual(await snapshot(), before);
});

test('empty location and already-missing files can be deleted', async () => {
    await reset();
    await runCode(`require '${app}/api/bootstrap.php'; $pdo->exec('DELETE FROM gallery_media WHERE location_id = 1'); unlink('${app}/uploads/gallery/1/photo.png'); unlink('${app}/uploads/gallery/1/video.mov'); rmdir('${app}/uploads/gallery/1');`);
    assert.equal((await post()).body.media_count, 0);
    await reset(); await runCode(`unlink('${app}/uploads/gallery/1/photo.png');`);
    assert.equal((await post()).status, 200);
});

test('unregistered files are preserved and reported after deleting registered media', async () => {
    await reset(); php.writeFile(`${app}/uploads/gallery/1/keep.txt`, 'unregistered');
    const result = await post();
    assert.equal(result.status, 200); assert.match(result.body.warning, /unexpected files/);
    assert.equal(php.readFileAsText(`${app}/uploads/gallery/1/keep.txt`), 'unregistered');
    assert.deepEqual((await snapshot()).files, ['keep.txt']);
});

for (const failure of ['delete', 'commit-before', 'no-cascade']) {
    test(`${failure}: all files and records are restored on rollback`, async () => {
        await reset(); const before = await snapshot();
        const result = await post({}, { BCT_TEST_FAILURE: failure });
        assert.equal(result.status, 500); assert.equal(result.body.success, false);
        assert.deepEqual(await snapshot(), before);
        assert.equal(php.readFileAsText(`${app}/uploads/gallery/1/photo.png`), 'photo');
        assert.equal(php.readFileAsText(`${app}/uploads/gallery/1/video.mov`), 'video');
    });
}

test('failure staging the second file restores the first and preserves foreign files', async () => {
    await reset();
    await runCode(`unlink('${app}/uploads/gallery/1/video.mov'); symlink('${app}/uploads/gallery/2/other.png', '${app}/uploads/gallery/1/video.mov');`);
    const before = await snapshot();
    assert.equal((await post()).status, 500); assert.deepEqual(await snapshot(), before);
    assert.equal(php.readFileAsText(`${app}/uploads/gallery/1/photo.png`), 'photo');
    assert.equal(php.readFileAsText(`${app}/uploads/gallery/2/other.png`), 'other');
});

test('a corrupt second path does not delete arbitrary files and restores staged files', async () => {
    await reset();
    await runCode(`require '${app}/api/bootstrap.php'; $pdo->exec("UPDATE gallery_media SET file_path = '/uploads/gallery/1/../../private/config.php' WHERE media_id = 2");`);
    const before = await snapshot();
    assert.equal((await post()).status, 500); assert.deepEqual(await snapshot(), before);
});

for (const failure of ['commit-after', 'rollback']) {
    test(`${failure}: uncertain outcome retains all private recovery pairs`, async () => {
        await reset(); const result = await post({}, { BCT_TEST_FAILURE: failure });
        assert.equal(result.status, 500); assert.match(result.body.message, /private\/gallery-trash/);
        const after = await snapshot();
        assert.equal(after.trash.filter(name => name.endsWith('.bin')).length, 2);
        assert.equal(after.trash.filter(name => name.endsWith('.json')).length, 2);
        assert.equal(php.readFileAsText(`${app}/uploads/gallery/2/other.png`), 'other');
    });
}

test('restoration conflict never overwrites a replacement and restores remaining files', async () => {
    await reset(); const result = await post({}, { BCT_TEST_FAILURE: 'restore-conflict' });
    assert.equal(result.status, 500); assert.match(result.body.message, /restoration failed/);
    const after = await snapshot();
    assert.equal(after.locations.length, 2); assert.equal(after.media.length, 3);
    assert.equal(after.trash.length, 2);
    assert.equal(php.readFileAsText(`${app}/uploads/gallery/1/photo.png`), 'Do not overwrite this replacement');
    assert.equal(php.readFileAsText(`${app}/uploads/gallery/1/video.mov`), 'video');
});

test('changed text or newly added media invalidates the reviewed confirmation', async () => {
    await reset(); const oldRevision = await revision();
    await runCode(`require '${app}/api/bootstrap.php'; $pdo->exec("UPDATE gallery_locations SET description_fr = 'Changed' WHERE location_id = 1");`);
    assert.equal((await post({ deletion_revision: oldRevision })).status, 409);
    const currentRevision = await revision();
    await runCode(`require '${app}/api/bootstrap.php'; $pdo->exec("INSERT INTO gallery_media (location_id, media_type, file_path, mime_type, file_size, sort_order) VALUES (1, 'image', '/uploads/gallery/1/new.png', 'image/png', 1, 2)");`);
    const before = await snapshot();
    assert.equal((await post({ deletion_revision: currentRevision })).status, 409);
    assert.deepEqual(await snapshot(), before);
});

test('authentication, CSRF, method, ownership revision and typed name are enforced', async () => {
    await reset(); const before = await snapshot();
    for (const [extra, status] of [
        [{ csrf_token: 'bad' }, 419], [{ confirmation_name: 'Paris' }, 422], [{ confirmation_name: '' }, 422],
        [{ location_id: '1 OR 1=1' }, 422], [{ location_id: '2', confirmation_name: 'Paris' }, 409],
        [{ deletion_revision: '0'.repeat(64) }, 409], [{ location_id: '999' }, 404],
        [{ 'unexpected_file': new File(['data'], 'upload.txt') }, 422],
    ]) assert.equal((await post(extra)).status, status, JSON.stringify(extra));
    assert.equal((await post({}, { BCT_TEST_AUTH: '0' })).status, 401);
    assert.equal((await request()).status, 405);
    assert.deepEqual(await snapshot(), before);
});

test('confirmation page escapes names and handles unauthenticated, invalid and missing IDs', async () => {
    await reset();
    await runCode(`require '${app}/api/bootstrap.php'; $pdo->exec("UPDATE gallery_locations SET location_fr = '<img src=x onerror=alert(1)>' WHERE location_id = 1");`);
    const html = (await request(null, {}, 'page')).text;
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    assert.equal((await request(null, {}, 'page', 'GET', 'id=999')).status, 404);
    assert.equal((await request(null, {}, 'page', 'GET', 'id[]=1')).status, 400);
    const unauthenticated = await request(null, { BCT_TEST_AUTH: '0' }, 'page');
    assert.equal(unauthenticated.status, 302);
    assert.equal(unauthenticated.text, '');
});

test.after(() => php.exit());
