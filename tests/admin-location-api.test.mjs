import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./admin-location-api-fixture.php', import.meta.url));
const php = process.env.PHP_BINARY || 'php';

function run(scenario) {
    const processResult = spawnSync(php, [fixture, scenario], { encoding: 'utf8' });
    assert.ifError(processResult.error);
    assert.equal(processResult.status, 0, processResult.stderr + processResult.stdout);
    const [body, state] = processResult.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(state.in_transaction, false, 'No transaction may remain open.');
    assert.deepEqual(state.media, [{ media_id: 8, location_id: 1, file_path: '/uploads/gallery/1/001-photo.jpg' }]);
    return { body, state };
}

test('update details, retain IDs, journey order, translations and media', () => {
    const { body, state } = run('success');
    assert.equal(state.status, 200);
    assert.equal(body.success, true);
    assert.equal(state.location.location_id, 1);
    assert.equal(state.location.journey_order, 3);
    assert.equal(state.location.location_en, 'Brussels');
    assert.equal(state.location.distance_km, '25.50');
    assert.equal(state.location.latitude, '51.1234567');
    assert.equal(state.location.journey_date, '2026-09-03');
    assert.match(body.revision, /^[a-f0-9]{64}$/);
});

test('clearing description clears both languages without translation', () => {
    const { body, state } = run('clear-description');
    assert.equal(body.success, true);
    assert.equal(state.location.description_fr, '');
    assert.equal(state.location.description_en, '');
});

test('saving unchanged values is successful', () => {
    const { body, state } = run('no-change');
    assert.equal(body.success, true);
    assert.equal(state.location.distance_km, '12.50');
});

for (const [scenario, status] of [
    ['unauthenticated', 401], ['wrong-method', 405], ['bad-csrf', 419], ['array-csrf', 419],
    ['bad-id', 422], ['bad-input', 422], ['array-description', 422], ['stale', 409],
    ['missing', 404], ['translation-error', 502], ['files', 422], ['save-error', 500],
]) {
    test(`${scenario}: HTTP ${status}, no data changed`, () => {
        const { body, state } = run(scenario);
        assert.equal(state.status, status);
        assert.equal(body.success, false);
        assert.equal(state.location.location_fr, 'Bruxelles');
        assert.equal(state.location.description_en, 'A stop.');
        assert.equal(state.location.distance_km, '12.50');
    });
}

test('rechecks the revision under lock', () => {
    const { state } = run('changed-during-save');
    assert.equal(state.status, 409);
    assert.equal(state.location.location_fr, 'Autre modification');
    assert.equal(state.location.distance_km, '12.50');
});

test('handles deletion after the initial read', () => {
    const { state } = run('deleted-during-save');
    assert.equal(state.status, 404);
    assert.equal(state.location, false);
});
