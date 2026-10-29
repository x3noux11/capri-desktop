'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { normalizeSettings } = require('../src/main/settings-store');
const { normalizeMemory } = require('../src/main/chat-memory');
const { createRoutines } = require('../src/main/routines');

const app = { id: '/usr/share/applications/kitty.desktop', file: 'kitty', name: 'Kitty', wmClass: 'kitty' };
const routine = () => ({ id: randomUUID(), name: 'Dev', steps: [{ desktopId: app.id, workspace: 3 }] });
function harness(extra = {}) {
  const saved = routine();
  const sent = [];
  const runner = createRoutines({ platform: 'linux', env: { HYPRLAND_INSTANCE_SIGNATURE: 'test' }, pid: 99,
    exists: () => true,
    load: () => ({ routines: [saved] }), entries: () => [app],
    hypr: { query: async () => [], dispatch: async (...args) => { sent.push(args); return true; } }, ...extra });
  return { saved, sent, runner };
}

test('projects require stable unique ids, bounded memories and a valid selected scope', () => {
  const project = { id: randomUUID(), name: 'Capri', memories: ['uses Node 24'] };
  assert.equal(normalizeSettings({ projects: [project], activeProject: project.id }).activeProject, project.id);
  for (const patch of [{ projects: [project, project] }, { activeProject: randomUUID() },
    { projects: [{ ...project, id: '__proto__' }] }, { projects: [{ ...project, memories: ['x'.repeat(201)] }] }]) {
    assert.throws(() => normalizeSettings(patch));
  }
});

test('routine settings reject commands, duplicate apps, invalid workspaces and oversized plans', () => {
  const r = routine();
  assert.equal(normalizeSettings({ routines: [r] }).routines.length, 1);
  for (const steps of [[{ desktopId: 'sh -c unsafe', workspace: 1 }],
    [{ desktopId: app.id, workspace: 0 }], [{ desktopId: app.id, workspace: 1.5 }],
    [r.steps[0], r.steps[0]], [{ desktopId: '/tmp/app\n.desktop', workspace: 1 }]]) {
    assert.throws(() => normalizeSettings({ routines: [{ ...r, steps }] }));
  }
});

test('legacy chat memory migrates without leaking general conversations into projects', () => {
  const a = randomUUID(); const b = randomUUID();
  const value = normalizeMemory({ history: [{ role: 'user', content: 'general' }], projectHistory: {
    [a]: [{ role: 'user', content: 'project A only' }], [b]: [{ role: 'assistant', content: 'project B only' }],
    constructor: [{ role: 'system', content: 'injected' }],
  } });
  assert.equal(value.history[0].content, 'general');
  assert.equal(value.projectHistory[a][0].content, 'project A only');
  assert.equal(value.projectHistory[b][0].content, 'project B only');
  assert.equal(Object.hasOwn(value.projectHistory, 'constructor'), false);
  assert.deepEqual(normalizeMemory({ history: [] }).projectHistory, {});
  assert.equal(normalizeMemory({ history: [], claudeScope: a }).claudeScope, a);
  assert.equal(normalizeMemory({ history: [] }).claudeScope, '');
});

test('a routine launches only an installed desktop entry with a targeted workspace', async () => {
  const { saved, sent, runner } = harness();
  const result = await runner.run(saved.id, saved.steps);
  assert.equal(result.ok, true);
  assert.equal(result.steps[0].kind, 'launch');
  assert.match(sent[0][0], /hl\.dsp\.exec_cmd.*gio launch.*kitty\.desktop.*workspace = "3 silent"/);
  assert.equal(sent[0][1], "exec [workspace 3 silent] gio launch '/usr/share/applications/kitty.desktop'");
});

test('existing app windows are moved by address without opening another instance', async () => {
  const sent = [];
  const { saved, runner } = harness({ hypr: {
    query: async (what) => what === 'clients' ? [{ mapped: true, pid: 42, class: 'kitty', address: '0xabc' }] : [],
    dispatch: async (...args) => { sent.push(args); return true; },
  } });
  assert.equal((await runner.run(saved.id)).steps[0].kind, 'move');
  assert.match(sent[0][0], /address:0xabc.*workspace = "3".*follow = false/);
  assert.ok(!sent.some((s) => s[0].includes('exec_cmd')));
});

test('missing applications and stale previews are rejected before any action', async () => {
  const missing = harness({ entries: () => [] });
  assert.equal((await missing.runner.run(missing.saved.id)).code, 'missing');
  assert.equal(missing.sent.length, 0);
  const stale = harness();
  assert.equal((await stale.runner.run(stale.saved.id, [])).code, 'stale');
  assert.equal(stale.sent.length, 0);
});

test('routine failure stops later steps and reports partial completion', async () => {
  const saved = routine();
  const other = { ...app, id: '/usr/share/applications/firefox.desktop', file: 'firefox', name: 'Firefox' };
  saved.steps.push({ desktopId: other.id, workspace: 4 });
  let calls = 0;
  const { runner } = harness({ load: () => ({ routines: [saved] }), entries: () => [app, other],
    hypr: { query: async () => [], dispatch: async () => { calls++; return false; } } });
  const result = await runner.run(saved.id);
  assert.equal(result.ok, false);
  assert.equal(result.steps.length, 1);
  assert.equal(calls, 1);
});

test('desktop paths are quoted as literal shell arguments; Lua delimiters cannot be escaped', async () => {
  const strange = { ...app, id: "/tmp/a'$(touch injected)]=].desktop" };
  const saved = routine(); saved.steps[0].desktopId = strange.id;
  const sent = [];
  const { runner } = harness({ load: () => ({ routines: [saved] }), entries: () => [strange],
    hypr: { query: async () => [], dispatch: async (...args) => { sent.push(args); return true; } } });
  assert.equal((await runner.run(saved.id)).ok, true);
  assert.match(sent[0][1], /'\\''/);
  assert.match(sent[0][0], /\[==\[/);
});

test('routines never execute on a Linux desktop without Hyprland', async () => {
  const { runner, sent, saved } = harness({ env: {} });
  assert.equal((await runner.run(saved.id)).code, 'unsupported');
  assert.equal(sent.length, 0);
});

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const browser = (file) => import(moduleUrl(path.join(__dirname, '../src/renderer/js', file)));

test('chat context includes general facts and only the selected project facts', async (t) => {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => { if (previous === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = previous; });
  const { Chat } = await browser('chat.js');
  const chat = Object.assign(Object.create(Chat.prototype), { brain: { custom: {
    memories: ['general fact'], activeProject: 'a', projects: [
      { id: 'a', name: 'A', memories: ['fact A'] }, { id: 'b', name: 'B', memories: ['secret B'] },
    ],
  } } });
  const context = chat.personal().join('\n');
  assert.match(context, /general fact/); assert.match(context, /fact A/); assert.doesNotMatch(context, /secret B/);
  let scope;
  chat.host = { chatRemember: (_h, id) => { scope = id; } }; chat.history = []; chat.projectId = 'a';
  chat.remember({ role: 'user', content: 'project A message' });
  assert.equal(scope, 'a');
});

test('routine UI requires confirmation and releases the keyboard before execution', async () => {
  const { Workspaces } = await browser('workspaces.js');
  for (const confirm of ['cancel', 'yes']) {
    const saved = routine();
    const choices = ['r:0', 'run', confirm, ...(confirm === 'yes' ? ['back'] : []), 'close'];
    const events = [];
    const ui = new Workspaces({ brain: { lang: 'fr' }, guide: { ask: async () => choices.shift() },
      host: { getConfig: async () => ({ routines: [saved] }), routineApps: async () => [app],
        releaseFocus: async () => events.push('release'),
        runRoutine: async (id, steps) => { events.push(id); assert.deepEqual(steps, saved.steps); return { ok: true, steps: [] }; } } });
    await ui.routines();
    assert.deepEqual(events, confirm === 'yes' ? ['release', saved.id] : []);
  }
});

test('a stalled intro still releases onboarding when every landing frame is skipped', async (t) => {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false });
  t.after(() => { if (previous === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = previous; });
  const { FxLayer } = await browser('fx.js');
  const fx = Object.assign(Object.create(FxLayer.prototype), {
    grab: {}, size: { w: 1920, h: 1080 }, items: [], last: 0,
    ctx: { clearRect() {} }, canvas: { width: 1920, height: 1080 },
    add(item) { this.items.push({ ...item, born: 0 }); },
    draw() { throw new Error('expired intro must not draw'); },
  });
  let landed = false;
  const landing = fx.intro({ to: { x: 100, y: 100, size: 60 } }).then(() => { landed = true; });
  fx.frame(10000); // skip directly beyond the full intro lifetime
  await Promise.resolve();
  assert.equal(landed, true);
  await landing;
  assert.equal(fx.items.length, 0);
});
