import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../httpdocs/admin/media-manager.js', import.meta.url), 'utf8');
const { moveMedia, validateMediaFiles, validateMediaResponse, setupMediaManager } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const revision = 'a'.repeat(64);
const media = [
    { media_id: 1, media_type: 'image', url: '/uploads/gallery/1/photo.png', file_size: 100, sort_order: 0 },
    { media_id: 2, media_type: 'video', url: '/uploads/gallery/1/video.mov', file_size: 200, sort_order: 1 },
];
const response = (items = media, extra = {}) => ({ ok: true, status: 200, json: async () => ({ success: true, revision, media: items, ...extra }) });

// Small control doubles: unit-tests controller behavior without a browser or DOM library.
class Element {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.disabled = false; this.hidden = false; this.textContent = ''; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(selector === 'button' && child.tag === 'button' ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) {
        const id = selector.match(/data-id="(\d+)"/)?.[1];
        const action = selector.match(/data-action="(\w+)"/)?.[1];
        return this.querySelectorAll('button').find(button => (!id || button.dataset.id === id) && (!action || button.dataset.action === action) && (!selector.includes(':not') || !button.disabled));
    }
    closest() { return this; }
    focus() { this.focused = true; }
}
async function setup(fetchImpl = async () => response(), confirm = () => true) {
    const nodes = Object.fromEntries(['adminMediaList', 'mediaStatus', 'appendMediaForm', 'mediaUploadFields', 'additionalMediaFiles', 'additionalMediaSummary', 'reloadMedia', 'saveMediaOrder', 'resetMediaOrder', 'mediaOrderNote', 'mediaEmpty'].map(id => [id, new Element()]));
    nodes.additionalMediaFiles.files = [];
    nodes.additionalMediaSummary.textContent = 'Limits';
    nodes.appendMediaForm.reportValidity = () => true;
    nodes.appendMediaForm.reset = () => { nodes.additionalMediaFiles.files = []; };
    const root = new Element();
    root.dataset = { locationId: '1', csrfToken: 'csrf' };
    root.querySelector = selector => nodes[selector.slice(1)];
    globalThis.document = { createElement: tag => new Element(tag) };
    const requests = [];
    await setupMediaManager(root, { fetchImpl: async (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); }, confirmImpl: confirm });
    const click = async (id, button = null) => {
        nodes[id].events.click({ target: button });
        await new Promise(resolve => setImmediate(resolve));
    };
    return { nodes, root, requests, click, button: (id, action) => nodes.adminMediaList.querySelector(`button[data-id="${id}"][data-action="${action}"]`) };
}
test.afterEach(() => { delete globalThis.document; });

test('reordering keeps all IDs, respects boundaries and does not mutate its input', () => {
    assert.deepEqual(moveMedia(media, 2, -1).map(item => item.media_id), [2, 1]);
    assert.deepEqual(moveMedia(media, 1, -1), media);
    assert.deepEqual(moveMedia(media, 2, 1), media);
    assert.deepEqual(moveMedia(media, 999, -1), media);
    assert.deepEqual(media.map(item => item.media_id), [1, 2]);
});

test('upload validation covers types, empty files, per-file and aggregate limits', () => {
    const file = (type, mb) => ({ name: 'file', type, size: mb * 1024 * 1024 });
    assert.equal(validateMediaFiles([file('image/png', 15), file('video/quicktime', 200)]), '');
    for (const files of [[], Array(21).fill(file('image/png', 1)), [file('image/heic', 1)], [file('image/png', 0)], [file('image/png', 16)], [file('video/mp4', 201)], [file('video/mp4', 200), file('video/mp4', 151)]]) {
        assert.notEqual(validateMediaFiles(files), '');
    }
});

test('response validation rejects external paths, foreign location paths and duplicate IDs', () => {
    assert.doesNotThrow(() => validateMediaResponse({ success: true, revision, media }, 1));
    for (const items of [[media[0], media[0]], [{ ...media[0], url: 'https://example.com/file.png' }], [{ ...media[0], url: '/uploads/gallery/2/photo.png' }]]) {
        assert.throws(() => validateMediaResponse({ success: true, revision, media: items }, 1));
    }
});

test('initial load renders image/video previews and sets boundary buttons', async () => {
    const app = await setup();
    assert.equal(app.nodes.adminMediaList.children.length, 2);
    assert.equal(app.button(1, 'earlier').disabled, true);
    assert.equal(app.button(2, 'later').disabled, true);
    assert.equal(app.nodes.mediaUploadFields.disabled, false);
    const video = app.nodes.adminMediaList.children[1].children.find(node => node.tag === 'video');
    assert.equal(video.controls, true);
    assert.equal(video.playsInline, true);
    assert.equal(video.src, '/uploads/gallery/1/video.mov#t=0.001');
});

test('moving is local until Save order; pending order blocks uploads/deletions', async () => {
    const app = await setup(async (url, options) => options.method === 'POST' ? response([...media].reverse(), { message: 'Saved' }) : response());
    await app.click('adminMediaList', app.button(2, 'earlier'));
    assert.equal(app.requests.length, 1);
    assert.equal(app.nodes.saveMediaOrder.disabled, false);
    assert.equal(app.nodes.mediaUploadFields.disabled, true);
    assert.equal(app.button(1, 'delete').disabled, true);
    await app.click('saveMediaOrder');
    assert.equal(app.requests[1].options.body.get('ordered_media_ids'), '[2,1]');
    assert.equal(app.requests[1].options.body.get('csrf_token'), 'csrf');
    assert.equal(app.nodes.saveMediaOrder.disabled, true);
    assert.equal(app.nodes.mediaUploadFields.disabled, false);
});

test('discard restores saved order without calling the endpoint', async () => {
    const app = await setup();
    await app.click('adminMediaList', app.button(2, 'earlier'));
    await app.click('resetMediaOrder');
    assert.equal(app.button(1, 'earlier').disabled, true);
    assert.equal(app.requests.length, 1);
});

test('canceling deletion never sends a mutation', async () => {
    let confirmations = 0;
    const app = await setup(undefined, () => { confirmations++; return false; });
    await app.click('adminMediaList', app.button(1, 'delete'));
    assert.equal(confirmations, 1);
    assert.equal(app.requests.length, 1);
});

test('confirmed deletion sends only the selected ID', async () => {
    const app = await setup(async (url, options) => options.method === 'POST' ? response([media[1]]) : response());
    await app.click('adminMediaList', app.button(1, 'delete'));
    assert.equal(app.requests[1].options.body.get('media_id'), '1');
    assert.equal(app.requests[1].options.body.get('action'), 'delete');
    assert.equal(app.nodes.adminMediaList.children.length, 1);
});

test('stale/error response blocks mutations until a successful reload', async () => {
    const app = await setup(async (url, options) => options.method === 'POST' ? { ok: false, status: 409, json: async () => ({ success: false, message: 'Stale list' }) } : response());
    await app.click('adminMediaList', app.button(1, 'delete'));
    assert.equal(app.nodes.mediaUploadFields.disabled, true);
    assert.equal(app.button(1, 'delete').disabled, true);
    assert.match(app.nodes.mediaStatus.textContent, /Reload media list/);
    await app.click('reloadMedia');
    assert.equal(app.nodes.mediaUploadFields.disabled, false);
});

test('additional upload sends selected files and clears selection after success', async () => {
    const app = await setup();
    app.nodes.additionalMediaFiles.files = [new File(['image'], 'photo.png', { type: 'image/png' })];
    app.nodes.appendMediaForm.events.submit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.requests[1].options.body.get('action'), 'upload');
    assert.equal(app.requests[1].options.body.get('expected_media_count'), '1');
    assert.equal(app.requests[1].options.body.getAll('media_files[]').length, 1);
    assert.equal(app.nodes.additionalMediaFiles.files.length, 0);
});

test('empty list permits uploading and disables save order', async () => {
    const app = await setup(async () => response([]));
    assert.equal(app.nodes.mediaEmpty.hidden, false);
    assert.equal(app.nodes.mediaUploadFields.disabled, false);
    assert.equal(app.nodes.saveMediaOrder.disabled, true);
});
