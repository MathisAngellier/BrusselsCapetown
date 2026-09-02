import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../httpdocs/admin/edit-location.js', import.meta.url), 'utf8');

function setup(fetchImpl, valid = true) {
    const fields = Object.fromEntries(Object.entries({
        csrf_token: 'csrf', location_id: '1', revision: 'old', journey_date: '2026-09-02',
        location_fr: 'Bruxelles', distance_km: '12.50', latitude: '50', longitude: '4', description_fr: '',
    }).map(([name, value]) => [name, { value }]));
    const nodes = Object.fromEntries(['editStatus', 'saveButton', 'editFields', 'editRecovery', 'editSummaryLocation'].map(id => [id, {}]));
    let handler;
    const form = {
        action: 'http://localhost/api/admin/update-location.php',
        elements: { namedItem: name => fields[name] },
        reportValidity: () => valid,
        setAttribute(name, value) { this[name] = value; },
        addEventListener(name, callback) { assert.equal(name, 'submit'); handler = callback; },
    };
    nodes.editLocationForm = form;
    const requests = [];
    class FakeFormData {
        constructor() {
            assert.notEqual(nodes.editFields.disabled, true, 'Capture data before disabling controls.');
            this.values = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.value]));
        }
    }
    vm.runInNewContext(source, {
        document: { getElementById: id => nodes[id] },
        FormData: FakeFormData,
        fetch: async (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); },
        Error, TypeError,
    });
    return { fields, nodes, requests, submit: () => handler({ preventDefault() {} }) };
}

const saved = {
    success: true, revision: 'new', message: 'Location updated.',
    location: { journey_date: '2026-09-03', location_fr: '<b>Paris</b>', distance_km: '25.00', latitude: '51', longitude: '3', description_fr: '' },
};
const success = () => ({ ok: true, status: 200, json: async () => saved });

test('successful save refreshes revision and fields without resetting the form', async () => {
    const app = setup(success);
    await app.submit();
    assert.equal(app.fields.revision.value, 'new');
    assert.equal(app.fields.location_fr.value, '<b>Paris</b>');
    assert.equal(app.nodes.editSummaryLocation.textContent, '<b>Paris</b>');
    assert.equal(app.nodes.editStatus.className, 'form-status success');
    assert.equal(app.nodes.editFields.disabled, false);
    assert.equal(app.requests[0].options.method, 'POST');
    assert.equal(app.requests[0].options.credentials, 'same-origin');
    await app.submit();
    assert.equal(app.requests[1].options.body.values.revision, 'new');
});

test('invalid form does not submit', async () => {
    const app = setup(success, false);
    await app.submit();
    assert.equal(app.requests.length, 0);
});

test('prevents duplicate submission while saving', async () => {
    let finish;
    const app = setup(() => new Promise(resolve => { finish = resolve; }));
    const first = app.submit();
    assert.equal(app.nodes.editFields.disabled, true);
    assert.equal(app.nodes.saveButton.disabled, true);
    await app.submit();
    assert.equal(app.requests.length, 1);
    finish(success());
    await first;
    assert.equal(app.nodes.saveButton.disabled, false);
});

for (const status of [401, 404, 409, 419, 422, 502]) {
    test(`HTTP ${status}: preserves entered data and allows recovery`, async () => {
        const app = setup(() => ({ ok: false, status, json: async () => ({ success: false, message: 'Save failed.' }) }));
        await app.submit();
        assert.equal(app.fields.location_fr.value, 'Bruxelles');
        assert.equal(app.fields.revision.value, 'old');
        assert.equal(app.nodes.editStatus.className, 'form-status error');
        assert.equal(app.nodes.saveButton.disabled, false);
        assert.equal(app.nodes.editRecovery.hidden, ![401, 404, 409, 419].includes(status));
    });
}

test('invalid JSON warns about uncertain save without losing input', async () => {
    const app = setup(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('HTML'); } }));
    await app.submit();
    assert.match(app.nodes.editStatus.textContent, /may have been saved/);
    assert.equal(app.fields.revision.value, 'old');
    assert.equal(app.nodes.editFields.disabled, false);
});

test('network failure keeps input and warns against blind retry', async () => {
    const app = setup(() => { throw new TypeError('Network unavailable'); });
    await app.submit();
    assert.match(app.nodes.editStatus.textContent, /Check the overview before retrying/);
    assert.equal(app.nodes.editLocationForm['aria-busy'], 'false');
});
