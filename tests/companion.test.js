'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWindowControl } = require('../src/main/window-control');
const { normalizeHistory, normalizeMemory } = require('../src/main/chat-memory');

const window = { address: '0xabc', pid: 42, class: 'firefox', mapped: true, workspace: { id: 3, name: '3' }, title: 'Private page' };
function controlHarness() {
  let clients = [window];
  const sent = [];
  let lua = true;
  const control = createWindowControl({ platform: 'linux', env: { HYPRLAND_INSTANCE_SIGNATURE: 'test' }, pid: 99,
    hypr: {
      query: async (key) => key === 'clients' ? clients : { id: 5 },
      dispatch: async (...args) => { sent.push(args); return true; },
      request: async (text) => { sent.push(text); return lua || text.startsWith('[[BATCH]]') ? 'ok' : 'unknown dispatcher'; },
    } });
  return { control, sent, clients: (v) => { clients = v; }, legacy: () => { lua = false; } };
}

test('window control lists only valid external windows without private titles', async () => {
  const { control, clients } = controlHarness();
  clients([window, { ...window, address: '0x123', pid: 99 }, { ...window, class: 'capri' },
    { ...window, mapped: false }, { ...window, address: '0x1;exit' }, null]);
  const rows = await control.list();
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { id: '0xabc', pid: 42, name: 'firefox', workspace: 3, minimized: false });
  assert.doesNotMatch(JSON.stringify(rows), /Private/);
});

test('closed windows, recycled addresses and malformed actions cannot inherit permission', async () => {
  const { control, clients, sent } = controlHarness();
  const [target] = await control.list();
  for (const rows of [[], [{ ...window, pid: 43 }], [{ ...window, class: 'kitty' }]]) {
    clients(rows);
    assert.equal((await control.act(target, 'maximize')).code, 'gone');
  }
  clients([window]);
  assert.equal((await control.act(target, 'exec')).code, 'invalid');
  assert.equal((await control.act({ ...target, id: '0x1";exit' }, 'focus')).ok, false);
  assert.equal(sent.length, 0);
});

test('Hyprland minimization is reversible and uses the selected window and original workspace', async () => {
  const { control, clients, sent } = controlHarness();
  const [target] = await control.list();
  assert.equal((await control.act(target, 'minimize')).ok, true);
  assert.match(sent[0][0], /address:0xabc.*special:capri-minimized.*follow = false/);
  clients([{ ...window, workspace: { id: -7, name: 'special:capri-minimized' } }]);
  assert.equal((await control.act(target, 'restore')).ok, true);
  assert.match(sent[1][0], /workspace = "3".*follow = true/);
  assert.match(sent[2], /fullscreen_state.*internal = 0.*action = "set"/);
});

test('a restart can recover minimized windows onto the active workspace', async () => {
  const { control, clients, sent } = controlHarness();
  clients([{ ...window, workspace: { id: -7, name: 'special:capri-minimized' } }]);
  const [target] = await control.list();
  assert.equal((await control.act(target, 'focus')).ok, true);
  assert.match(sent[0][0], /workspace = "5"/);
});

test('legacy Hyprland sets the explicit maximized state in one compositor batch', async () => {
  const { control, sent, legacy } = controlHarness();
  legacy();
  const [target] = await control.list();
  assert.equal((await control.act(target, 'maximize')).ok, true);
  assert.equal(sent.at(-1), '[[BATCH]]dispatch focuswindow address:0xabc;dispatch fullscreenstate 1 1 set');
});

test('unsupported desktops return an explicit result without making system calls', async () => {
  const control = createWindowControl({ platform: 'linux', env: {}, hypr: { query() { throw new Error('must not call'); } } });
  assert.deepEqual(await control.list(), []);
  assert.equal((await control.act({}, 'focus')).code, 'unsupported');
});

test('Windows checks the owner at action time and never interpolates application names', async () => {
  const scripts = [];
  const control = createWindowControl({ platform: 'win32', pid: 99, powershell: async (script) => {
    scripts.push(script);
    return script.startsWith('Get-Process') ? JSON.stringify([{ id: '1234', pid: 42, name: "test'; dangerous" }]) : 'True';
  } });
  const [target] = await control.list();
  assert.equal((await control.act(target, 'focus')).ok, true);
  assert.match(scripts.at(-1), /GetWindowThreadProcessId.*\$owner -ne 42/);
  assert.doesNotMatch(scripts.at(-1), /dangerous/);
});

test('chat history is bounded, strips injected roles and keeps the most recent conversation', () => {
  const history = normalizeHistory([{ role: 'system', content: 'injected' },
    ...Array.from({ length: 100 }, (_v, i) => ({ role: 'user', content: `${i}:` + 'x'.repeat(10000), extra: 'private' }))]);
  assert.ok(history.length <= 60);
  assert.ok(history.every((m) => m.role === 'user' && m.content.length <= 6000 && !('extra' in m)));
  assert.ok(history.reduce((n, m) => n + m.content.length, 0) <= 48000);
  assert.match(history.at(-1).content, /^99:/);
  assert.deepEqual(normalizeMemory({ history: [], claude: { session: 'old' } }).claude, { session: 'old' });
  assert.throws(() => normalizeMemory({ history: {} }));
});

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const browser = (file) => import(moduleUrl(path.join(__dirname, '../src/renderer/js', file)));

test('local commands recognize explicit requests without interpreting casual mentions as actions', async () => {
  const { localCommand } = await browser('companion.js');
  assert.deepEqual(localCommand('agrandis Firefox'), { kind: 'window', action: 'maximize', name: 'Firefox' });
  assert.deepEqual(localCommand('que sais-tu de moi ?'), { kind: 'memory' });
  assert.equal(localCommand('Est-ce que tu peux expliquer comment agrandir Firefox ?'), null);
  assert.equal(localCommand('je minimise les risques'), null);
});

test('window UI cancellation never calls the action IPC, confirmation releases keyboard first', async () => {
  const { Companion } = await browser('companion.js');
  for (const confirm of ['no', null, 'yes']) {
    const choices = ['win:0', 'maximize', confirm, 'ok'];
    const events = [];
    const ui = new Companion({ brain: { lang: 'fr' }, chat: {},
      guide: { ask: async () => choices.shift(), ok: () => [] },
      host: { controlWindows: async () => [{ id: '0xabc', pid: 42, name: 'firefox' }],
        releaseFocus: async () => events.push('release'),
        controlWindow: async (target, action) => { events.push([target.id, action]); return { ok: true }; } } });
    await ui.windows();
    assert.deepEqual(events, confirm === 'yes' ? ['release', ['0xabc', 'maximize']] : []);
  }
});

test('memory UI edits and removes individual facts and does not delete history on cancellation', async () => {
  const { Companion } = await browser('companion.js');
  let cfg = { memories: ['old', 'keep'] };
  const choices = ['item:0', 'item:0', 'history', 'no', 'close'];
  const edits = [{ text: 'corrected' }, { action: 'remove' }];
  const saves = [];
  const ui = new Companion({ brain: { lang: 'fr', custom: cfg }, chat: {},
    guide: { ask: async () => choices.shift(), askText: async () => edits.shift() },
    host: { getConfig: async () => structuredClone(cfg), setConfig: async (patch) => {
      cfg = { ...cfg, ...patch }; saves.push(structuredClone(cfg.memories)); return cfg;
    }, forgetChats: () => { throw new Error('cancelled deletion must not run'); } } });
  await ui.memory();
  assert.deepEqual(saves, [['corrected', 'keep'], ['keep']]);
});

test('onboarding is marked complete only after all steps, and can be dismissed', async () => {
  const { Companion } = await browser('companion.js');
  for (const complete of [false, true]) {
    let steps = 0;
    const saved = [];
    const ui = new Companion({ brain: { lang: 'fr' }, guide: { ask: async () => { steps++; return complete ? 'next' : 'close'; } },
      host: { setConfig: async (patch) => saved.push(patch) } });
    await ui.tour();
    assert.equal(steps, complete ? 4 : 1);
    assert.deepEqual(saved, complete ? [{ companionTour: true }] : []);
  }
});

test('local model context has a character budget and preserves the latest user request', async (t) => {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => { if (previous === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = previous; });
  const { contextHistory } = await browser('chat.js');
  const result = contextHistory([{ role: 'assistant', content: 'x'.repeat(20000) }, { role: 'user', content: 'latest request' }]);
  assert.equal(result.at(-1).content, 'latest request');
  assert.equal(result.reduce((n, m) => n + m.content.length, 0), 16000);
});

test('hidden sprites request no GPU frames and resource saving preserves active animation speed', async (t) => {
  const previousMedia = globalThis.matchMedia;
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.matchMedia = () => ({ matches: false });
  let frames = 0;
  globalThis.requestAnimationFrame = () => { frames++; };
  t.after(() => {
    if (previousMedia === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = previousMedia;
    if (previousFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousFrame;
  });
  const { Capri } = await browser('capri.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const capri = Object.assign(Object.create(Capri.prototype), { hidden: true, lowPower: true, mode: 'idle', stance: 'stand',
    lastDraw: 0, loop: null, drawFrame() { throw new Error('hidden sprites must not draw'); } });
  capri.loop = Capri.prototype.loop.bind(capri);
  capri.loop(0);
  for (let i = 0; i < 4; i++) t.mock.timers.tick(250);
  assert.equal(frames, 0);
  assert.equal(capri.interval(), 1000 / 6);
  capri.busy = true;
  assert.equal(capri.interval(), 1000 / 24);
  capri.hidden = false;
  t.mock.timers.tick(250);
  assert.equal(frames, 1);
});
