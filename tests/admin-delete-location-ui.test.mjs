import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../httpdocs/admin/delete-location.js', import.meta.url), 'utf8');
function setup(fetchImpl) {
    const nodes = Object.fromEntries(['confirmationName', 'deleteLocationFields', 'deleteLocationButton', 'deleteLocationStatus', 'deleteLocationWarning', 'deleteLocationRecovery', 'cancelLocationDeletion', 'deleteLocationDone'].map(id => [id, { hidden: false, disabled: false, value: '', events: {}, addEventListener(name, handler) { this.events[name] = handler; } }]));
    const form = {
        action: 'http://localhost/api/admin/delete-location.php',
        dataset: { locationId: '7', locationName: 'Bruxelles' }, events: {},
        reportValidity: () => true,
        addEventListener(name, handler) { this.events[name] = handler; },
        setAttribute(name, value) { this[name] = value; },
    };
    nodes.deleteLocationForm = form;
    const requests = [];
    class FakeFormData {
        constructor() {
            assert.equal(nodes.deleteLocationFields.disabled, false, 'Capture form before disabling its fields.');
            this.confirmationName = nodes.confirmationName.value;
        }
    }
    vm.runInNewContext(source, {
        document: { getElementById: id => nodes[id] },
        FormData: FakeFormData, Error, TypeError,
        fetch: async (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); },
    });
    return {
        nodes, form, requests,
        type(name) { nodes.confirmationName.value = name; nodes.confirmationName.events.input(); },
        submit: () => form.events.submit({ preventDefault() {} }),
    };
}
const response = (extra = {}) => ({ ok: true, status: 200, json: async () => ({ success: true, location_id: 7, message: 'Location deleted.', warning: '', ...extra }) });

test('requires exact name, including case, and never submits a mismatched confirmation', async () => {
    const app = setup(response);
    assert.equal(app.nodes.deleteLocationButton.disabled, true);
    app.type('Paris'); await app.submit();
    app.type('bruxelles'); await app.submit();
    assert.equal(app.requests.length, 0);
    app.type(' Bruxelles ');
    assert.equal(app.nodes.deleteLocationButton.disabled, false);
});

test('successful deletion is POST, stays on the result page and cannot submit twice', async () => {
    const app = setup(response); app.type('Bruxelles'); await app.submit();
    assert.equal(app.requests[0].options.method, 'POST');
    assert.equal(app.requests[0].options.credentials, 'same-origin');
    assert.equal(app.nodes.deleteLocationDone.hidden, false);
    assert.equal(app.nodes.deleteLocationButton.hidden, true);
    assert.equal(app.nodes.deleteLocationFields.hidden, true);
    assert.equal(app.nodes.deleteLocationStatus.className, 'form-status success');
    await app.submit(); assert.equal(app.requests.length, 1);
});

test('cleanup warning remains visible after a successful database deletion', async () => {
    const app = setup(() => response({ warning: 'Check private/gallery-trash.' }));
    app.type('Bruxelles'); await app.submit();
    assert.equal(app.nodes.deleteLocationWarning.hidden, false);
    assert.equal(app.nodes.deleteLocationWarning.textContent, 'Check private/gallery-trash.');
    assert.equal(app.nodes.deleteLocationDone.hidden, false);
});

test('duplicate clicks during a request send one mutation', async () => {
    let finish;
    const app = setup(() => new Promise(resolve => { finish = resolve; }));
    app.type('Bruxelles'); const first = app.submit();
    assert.equal(app.nodes.deleteLocationButton.disabled, true);
    assert.equal(app.nodes.deleteLocationFields.disabled, true);
    await app.submit(); assert.equal(app.requests.length, 1);
    finish(response()); await first;
});

for (const status of [401, 404, 409, 419, 500]) {
    test(`HTTP ${status} requires a fresh confirmation page, not blind retry`, async () => {
        const app = setup(() => ({ ok: false, status, json: async () => ({ success: false, message: 'Reload the page.' }) }));
        app.type('Bruxelles'); await app.submit();
        assert.equal(app.nodes.deleteLocationRecovery.hidden, false);
        assert.equal(app.nodes.deleteLocationButton.disabled, true);
        await app.submit(); assert.equal(app.requests.length, 1);
    });
}

test('HTTP 422 allows correcting the confirmation without resetting it', async () => {
    const app = setup(() => ({ ok: false, status: 422, json: async () => ({ success: false, message: 'Check the name.' }) }));
    app.type('Bruxelles'); await app.submit();
    assert.equal(app.nodes.deleteLocationFields.disabled, false);
    assert.equal(app.nodes.confirmationName.value, 'Bruxelles');
    assert.equal(app.nodes.deleteLocationButton.disabled, false);
});

for (const [name, fetchImpl] of [
    ['invalid JSON', () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('HTML'); } })],
    ['network failure', () => { throw new TypeError('Network failed'); }],
    ['generic interruption', () => { throw new Error('Request interrupted'); }],
    ['unexpected target', () => response({ location_id: 99 })],
]) {
    test(`${name}: uncertain result blocks duplicate deletion`, async () => {
        const app = setup(fetchImpl); app.type('Bruxelles'); await app.submit();
        assert.equal(app.nodes.deleteLocationRecovery.hidden, false);
        assert.equal(app.nodes.deleteLocationButton.disabled, true);
        assert.equal(app.form['aria-busy'], 'false');
        await app.submit(); assert.equal(app.requests.length, 1);
    });
}
