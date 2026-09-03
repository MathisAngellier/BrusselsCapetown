// Real PHP multipart handling + filesystem operations in an isolated virtual filesystem.
// Only the database bootstrap is replaced with SQLite; MySQL row locks are simulated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const modules = process.env.BCT_PHP_WASM_MODULES;
if (!modules) throw new Error('Set BCT_PHP_WASM_MODULES to a node_modules directory containing @php-wasm/cli. See ADMIN_MEDIA_MANAGEMENT.md.');
const { PHP, FileLockManagerInMemory } = await import(pathToFileURL(path.join(modules, '@php-wasm/universal/index.js')));
const { loadNodeRuntime } = await import(pathToFileURL(path.join(modules, '@php-wasm/node/index.js')));
const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 }, fileLockManager: new FileLockManagerInMemory() }));
const app = '/app/httpdocs';
for (const dir of ['/app', app, `${app}/api`, `${app}/api/admin`, `${app}/uploads`, `${app}/uploads/gallery`, `${app}/uploads/gallery/1`, `${app}/uploads/gallery/2`, '/app/private']) php.mkdir(dir);
for (const name of ['auth.php', 'location-fields.php', 'media-upload.php', 'media-management.php', 'media.php']) {
    php.writeFile(`${app}/api/admin/${name}`, readFileSync(new URL(`../httpdocs/api/admin/${name}`, import.meta.url)));
}

php.writeFile(`${app}/api/bootstrap.php`, `<?php
class TestMediaStatement extends PDOStatement {
    public function execute(?array $params = null): bool {
        $failure = $_SERVER['BCT_TEST_FAILURE'] ?? '';
        if (($failure === 'delete' && str_starts_with($this->queryString, 'DELETE'))
            || ($failure === 'reorder' && str_starts_with($this->queryString, 'UPDATE') && ($params['sort_order'] ?? -1) === 1)
            || ($failure === 'insert' && str_starts_with($this->queryString, 'INSERT') && ($params['sort_order'] ?? -1) === 3)) {
            throw new RuntimeException('Injected statement failure');
        }
        return parent::execute($params);
    }
}
class TestMediaPdo extends PDO {
    public function prepare(string $query, array $options = []): PDOStatement|false {
        return parent::prepare(str_replace(' FOR UPDATE', '', $query), $options);
    }
    public function commit(): bool {
        if (($_SERVER['BCT_TEST_FAILURE'] ?? '') === 'commit-before') throw new RuntimeException('Injected pre-commit failure');
        $result = parent::commit();
        if (($_SERVER['BCT_TEST_FAILURE'] ?? '') === 'commit-after') throw new RuntimeException('Injected ambiguous commit failure');
        return $result;
    }
}
$pdo = new TestMediaPdo('sqlite:/app/test.sqlite');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->setAttribute(PDO::ATTR_STATEMENT_CLASS, [TestMediaStatement::class]);
`);
php.writeFile('/app/request.php', `<?php
require '/app/httpdocs/api/admin/auth.php';
$_SESSION = ($_SERVER['BCT_TEST_AUTH'] ?? '1') === '1' ? ['admin_id' => 1, 'csrf_token' => str_repeat('a', 64)] : [];
require '/app/httpdocs/api/admin/media.php';
`);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS8cAAAAASUVORK5CYII=', 'base64');
const token = 'a'.repeat(64);
async function runCode(code) {
    const result = await php.run({ code: `<?php ${code}` });
    assert.equal(result.exitCode, 0, result.errors);
    return result;
}
async function reset() {
    await runCode(`
        // All cleanup is confined to this test's disposable WASM filesystem.
        function cleanTestDir($dir) { foreach (scandir($dir) as $name) {
            if ($name === '.' || $name === '..') continue;
            $p = $dir . '/' . $name;
            if (is_dir($p) && !is_link($p)) { cleanTestDir($p); rmdir($p); } else unlink($p);
        } }
        cleanTestDir('/app/httpdocs/uploads/gallery');
        cleanTestDir('/app/private');
        mkdir('/app/httpdocs/uploads/gallery/1'); mkdir('/app/httpdocs/uploads/gallery/2');
        require '/app/httpdocs/api/bootstrap.php';
        $pdo->exec('DROP TABLE IF EXISTS gallery_media');
        $pdo->exec('DROP TABLE IF EXISTS gallery_locations');
        $pdo->exec('CREATE TABLE gallery_locations (location_id INTEGER PRIMARY KEY, location_fr TEXT, journey_order INTEGER)');
        $pdo->exec("INSERT INTO gallery_locations VALUES (1, 'Bruxelles', 1), (2, 'Paris', 2)");
        $pdo->exec('CREATE TABLE gallery_media (media_id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER, media_type TEXT, file_path TEXT, mime_type TEXT, file_size INTEGER, sort_order INTEGER)');
        $pdo->exec("INSERT INTO gallery_media VALUES (1, 1, 'image', '/uploads/gallery/1/original.png', 'image/png', 68, 0), (2, 1, 'video', '/uploads/gallery/1/original.mov', 'video/quicktime', 5, 1), (3, 2, 'image', '/uploads/gallery/2/other.png', 'image/png', 68, 0)");
    `);
    php.writeFile(`${app}/uploads/gallery/1/original.png`, png);
    php.writeFile(`${app}/uploads/gallery/1/original.mov`, 'video');
    php.writeFile(`${app}/uploads/gallery/2/other.png`, png);
}
async function request(body = null, server = {}, method = body ? 'POST' : 'GET') {
    let multipart = null;
    if (body) {
        const form = new FormData();
        for (const [key, value] of Object.entries(body)) form.set(key, value);
        const encoded = new Request('http://test.invalid', { method: 'POST', body: form });
        multipart = { bytes: new Uint8Array(await encoded.arrayBuffer()), contentType: encoded.headers.get('content-type') };
    }
    const response = await php.run({
        scriptPath: '/app/request.php', relativeUri: '/api/admin/media.php?location_id=1', method,
        ...(multipart ? { body: multipart.bytes, headers: { 'Content-Type': multipart.contentType } } : {}),
        $_SERVER: server,
    });
    assert.equal(response.exitCode, 0, response.errors);
    return { status: response.httpStatusCode, body: JSON.parse(response.text) };
}
async function post(action, extra = {}, server = {}) {
    const current = await request();
    return request({ location_id: '1', csrf_token: token, media_revision: current.body.revision, action, ...extra }, server);
}
async function snapshot() {
    const result = await runCode(`require '/app/httpdocs/api/bootstrap.php'; echo json_encode([
        'media' => $pdo->query('SELECT * FROM gallery_media ORDER BY media_id')->fetchAll(),
        'locations' => $pdo->query('SELECT * FROM gallery_locations ORDER BY location_id')->fetchAll(),
        'files' => array_values(array_diff(scandir('/app/httpdocs/uploads/gallery/1'), ['.', '..'])),
        'trash' => is_dir('/app/private/gallery-trash') ? array_values(array_diff(scandir('/app/private/gallery-trash'), ['.', '..'])) : [],
    ]);`);
    return JSON.parse(result.text);
}
const upload = () => ({ expected_media_count: '2', 'media_files[0]': new File([png], 'a.png', { type: 'image/png' }), 'media_files[1]': new File([png], 'b.png', { type: 'image/png' }) });

test('list has safe previews in display order and requires authentication', async () => {
    await reset();
    const result = await request();
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.media.map(item => item.media_id), [1, 2]);
    assert.equal(result.body.media[1].url, '/uploads/gallery/1/original.mov');
    assert.equal((await request(null, { BCT_TEST_AUTH: '0' })).status, 401);
    assert.equal((await request(null, {}, 'DELETE')).status, 405);
});

test('append uses real PHP uploaded files, keeps originals and adds order at the end', async () => {
    await reset();
    const before = await snapshot();
    const result = await post('upload', upload());
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.deepEqual(result.body.media.map(item => item.sort_order), [0, 1, 2, 3]);
    const after = await snapshot();
    assert.equal(after.files.length, 4);
    assert.deepEqual(after.media.slice(0, 3), before.media);
    assert.deepEqual(after.locations, before.locations);
});

test('append supports a location without a directory or media', async () => {
    await reset();
    await runCode(`require '/app/httpdocs/api/bootstrap.php'; $pdo->exec('DELETE FROM gallery_media WHERE location_id = 1'); unlink('${app}/uploads/gallery/1/original.png'); unlink('${app}/uploads/gallery/1/original.mov'); rmdir('${app}/uploads/gallery/1');`);
    const result = await post('upload', upload());
    assert.equal(result.status, 201);
    assert.deepEqual(result.body.media.map(item => item.sort_order), [0, 1]);
});

test('partial insert failure rolls back new rows/files but never removes originals', async () => {
    await reset();
    const before = await snapshot();
    const result = await post('upload', upload(), { BCT_TEST_FAILURE: 'insert' });
    assert.equal(result.status, 500);
    assert.deepEqual(await snapshot(), before);
});

test('rejects missing uploads, truncated selections, unsupported contents and excessive counts', async () => {
    await reset();
    for (const files of [
        { expected_media_count: '1' },
        { ...upload(), expected_media_count: '3' },
        { ...upload(), expected_media_count: '21' },
        { expected_media_count: '1', 'media_files[0]': new File(['<?php echo 1;'], 'photo.png', { type: 'image/png' }) },
    ]) {
        assert.equal((await post('upload', files)).status, 422);
    }
    assert.equal((await snapshot()).files.length, 2);
});

test('save order persists exactly and keeps other location untouched', async () => {
    await reset();
    const result = await post('reorder', { ordered_media_ids: '[2,1]' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.media.map(item => item.media_id), [2, 1]);
    assert.equal((await snapshot()).media[2].sort_order, 0);
});

test('rejects duplicate, missing, foreign, malformed and noninteger order IDs', async () => {
    await reset();
    const before = await snapshot();
    for (const value of ['[1,1]', '[1]', '[1,3]', '[1,"2"]', '{}', 'null', 'bad', '[1,2,2]']) {
        assert.equal((await post('reorder', { ordered_media_ids: value })).status, 422, value);
    }
    assert.deepEqual(await snapshot(), before);
});

test('partial reorder failure rolls back all changed positions', async () => {
    await reset();
    const before = await snapshot();
    assert.equal((await post('reorder', { ordered_media_ids: '[2,1]' }, { BCT_TEST_FAILURE: 'reorder' })).status, 500);
    assert.deepEqual(await snapshot(), before);
});

test('delete removes only selected file/row and empties private staging', async () => {
    await reset();
    const result = await post('delete', { media_id: '1' });
    assert.equal(result.status, 200);
    const after = await snapshot();
    assert.deepEqual(after.files, ['original.mov']);
    assert.deepEqual(after.media.map(item => item.media_id), [2, 3]);
    assert.deepEqual(after.trash, []);
    assert.equal(php.fileExists(`${app}/uploads/gallery/2/other.png`), true);
    assert.equal((await post('delete', { media_id: '2' })).body.media.length, 0);
    assert.equal((await snapshot()).locations.length, 2);
});

test('delete missing file removes the broken record safely', async () => {
    await reset();
    await runCode(`unlink('${app}/uploads/gallery/1/original.png');`);
    assert.equal((await post('delete', { media_id: '1' })).status, 200);
});

for (const failure of ['delete', 'commit-before']) {
    test(`deletion ${failure} failure restores original file and database row`, async () => {
        await reset();
        const before = await snapshot();
        assert.equal((await post('delete', { media_id: '1' }, { BCT_TEST_FAILURE: failure })).status, 500);
        assert.deepEqual(await snapshot(), before);
        assert.deepEqual(Buffer.from(php.readFileAsBuffer(`${app}/uploads/gallery/1/original.png`)), png);
    });
}

test('ambiguous commit keeps staged file and recovery manifest rather than destroying data', async () => {
    await reset();
    assert.equal((await post('delete', { media_id: '1' }, { BCT_TEST_FAILURE: 'commit-after' })).status, 500);
    const after = await snapshot();
    assert.deepEqual(after.media.map(item => item.media_id), [2, 3]);
    assert.equal(after.trash.length, 2);
    assert.ok(after.trash.some(name => name.endsWith('.json')));
    assert.ok(after.trash.some(name => name.endsWith('.bin')));
});

test('rejects foreign IDs, stale revisions and forged CSRF without side effects', async () => {
    await reset();
    const before = await snapshot();
    assert.equal((await post('delete', { media_id: '3' })).status, 422);
    assert.equal((await post('delete', { media_id: '1', media_revision: '0'.repeat(64) })).status, 409);
    assert.equal((await post('delete', { media_id: '1', csrf_token: 'bad' })).status, 419);
    assert.equal((await post('delete', { media_id: '1' }, { BCT_TEST_AUTH: '0' })).status, 401);
    assert.equal((await post('delete', { media_id: '1', location_id: '999' })).status, 404);
    assert.deepEqual(await snapshot(), before);
});

test('corrupted paths are hidden in previews and never used for deletion', async () => {
    await reset();
    await runCode(`require '/app/httpdocs/api/bootstrap.php'; $pdo->exec("UPDATE gallery_media SET file_path = '/uploads/gallery/1/../../private/config.php' WHERE media_id = 1");`);
    assert.equal((await request()).body.media[0].url, null);
    assert.equal((await post('delete', { media_id: '1' })).status, 500);
    assert.equal(php.fileExists(`${app}/uploads/gallery/1/original.png`), true);
});

test('symlinked media cannot delete a different location file', async () => {
    await reset();
    await runCode(`unlink('${app}/uploads/gallery/1/original.png'); symlink('${app}/uploads/gallery/2/other.png', '${app}/uploads/gallery/1/original.png');`);
    assert.equal((await post('delete', { media_id: '1' })).status, 500);
    assert.equal(php.fileExists(`${app}/uploads/gallery/2/other.png`), true);
});

test('fresh upload default still refuses an existing directory', async () => {
    await reset();
    const result = await runCode(`require '/app/httpdocs/api/bootstrap.php'; require '/app/httpdocs/api/admin/media-upload.php';
        try { bctStoreMediaFiles($pdo, 1, []); echo 'incorrectly accepted'; }
        catch (RuntimeException $error) { echo 'refused existing directory'; }`);
    assert.equal(result.text, 'refused existing directory');
    assert.equal((await snapshot()).files.length, 2);
});

test('real earlier revision is rejected after another order is saved', async () => {
    await reset();
    const oldRevision = (await request()).body.revision;
    await post('reorder', { ordered_media_ids: '[2,1]' });
    assert.equal((await post('delete', { media_id: '1', media_revision: oldRevision })).status, 409);
    assert.equal((await snapshot()).files.length, 2);
});

test('empty order must be a JSON array, not an object', async () => {
    await reset();
    await post('delete', { media_id: '1' });
    await post('delete', { media_id: '2' });
    assert.equal((await post('reorder', { ordered_media_ids: '{}' })).status, 422);
    assert.equal((await post('reorder', { ordered_media_ids: '[]' })).status, 200);
    assert.equal((await post('upload', upload())).status, 201);
});

test.after(() => php.exit());
