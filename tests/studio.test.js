'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { normalizeSettings } = require('../src/main/settings-store');
const { DEFAULTS, effectiveConfig, resume } = require('../src/main/studio-settings');
const { exportMemories, importMemories } = require('../src/main/memory-transfer');
const { createSpeech, MAX_AUDIO } = require('../src/main/speech');
const { createDesktopInput } = require('../src/main/desktop-input');
const { chat } = require('../src/main/llm');
const { createClipboardPaste } = require('../src/main/clipboard-paste');

test('studio preferences reject unknown fields, unbounded timers, URLs in Azure regions and injected profile keys', () => {
  const cfg = normalizeSettings({});
  assert.equal(cfg.speech.mode, 'push');
  for (const patch of [{ speech: { ...cfg.speech, apiKey: 'must-not-save' } },
    { speech: { ...cfg.speech, azureRegion: 'evil.example/path' } }, { speech: { ...cfg.speech, mode: 'always' } },
    { focus: { ...cfg.focus, workMinutes: 0 } }, { focus: { ...cfg.focus, until: Infinity } },
    { appearance: { ...cfg.appearance, accent: 'url(https://evil)' } }, { performanceProfile: 'warp' },
    { appearanceProfiles: [{ id: randomUUID(), name: 'Injected', appearance: cfg.appearance, scale: 0.6, volume: 1, motion: 'full', apiKeys: {} }] },
    { worklog: [{ scope: randomUUID(), summary: 'orphan', tasks: [] }] }]) assert.throws(() => normalizeSettings(patch));
});

test('focus and automatic battery economy are derived without overwriting saved preferences', () => {
  const cfg = normalizeSettings({ focus: { ...DEFAULTS.focus, until: 2000 }, performanceProfile: 'auto', motion: 'full', volume: 0.8 });
  const focus = effectiveConfig(cfg, { now: 1000, battery: false });
  assert.equal(focus.focusActive, true); assert.equal(focus.wander, false); assert.equal(focus.pcReact, false);
  assert.equal(focus.motion, 'reduced'); assert.equal(focus.volume, 0.2);
  const after = effectiveConfig(cfg, { now: 3000, battery: false });
  assert.equal(after.motion, 'full'); assert.equal(after.volume, 0.8); assert.equal(after.wander, true);
  assert.equal(effectiveConfig(cfg, { now: 3000, battery: true }).lowPower, true);
  assert.equal(cfg.motion, 'full');
});

test('session resume uses only the provided history and scoped tasks', () => {
  const data = resume([{ role: 'user', content: 'First' }, { role: 'assistant', content: 'Old answer' },
    { role: 'user', content: 'Latest' }], { summary: 'Decision', tasks: [{ id: 'task', text: 'Next', done: false }] });
  assert.equal(data.lastRequest, 'Latest'); assert.equal(data.lastReply, 'Old answer'); assert.equal(data.summary, 'Decision');
});

test('memory transfer excludes credentials and conversations, merges facts and refuses hidden settings', () => {
  const project = { id: randomUUID(), name: 'Capri', memories: ['one'] };
  const cfg = normalizeSettings({ memories: ['general'], projects: [project] });
  cfg.apiKeys = { openai: 'private-key' };
  const value = exportMemories(cfg);
  assert.doesNotMatch(JSON.stringify(value), /private-key|apiKeys|history/);
  value.memories.push('new'); value.projects[0].memories.push('two');
  const patch = importMemories(JSON.stringify(value), cfg);
  assert.deepEqual(patch.memories, ['general', 'new']); assert.deepEqual(patch.projects[0].memories, ['one', 'two']);
  assert.deepEqual(cfg.projects[0].memories, ['one']);
  assert.throws(() => importMemories(JSON.stringify({ ...value, apiKeys: { openai: 'injected' } }), cfg));
  assert.throws(() => importMemories(JSON.stringify({ ...value, projects: [{ ...project, command: 'unsafe' }] }), cfg));
  assert.throws(() => importMemories('x'.repeat(256 * 1024 + 1), cfg));
});

function speechFixture(respond = async () => new Response(JSON.stringify({ text: 'Bonjour' }), { headers: { 'content-type': 'application/json' } })) {
  let cfg = normalizeSettings({}); const requests = [];
  const speech = createSpeech({ getConfig: () => cfg, getKeys: () => ({ openai: 'synthetic-openai', groq: 'synthetic-groq', 'speech-elevenlabs': 'synthetic-eleven', 'speech-azure': 'synthetic-azure' }), env: {},
    fetcher: async (url, options) => { requests.push({ url, options }); return respond(url, options); } });
  return { speech, requests, set: (patch) => { cfg = normalizeSettings({ ...cfg, speech: { ...cfg.speech, ...patch } }); } };
}
test('cloud transcription sends multipart audio to the chosen provider with a server-side key', async () => {
  const { speech, requests, set } = speechFixture();
  set({ input: 'groq', inputModel: 'whisper-large-v3-turbo' });
  assert.equal(await speech.transcribe(new Uint8Array([1, 2, 3]), 'audio/webm;codecs=opus'), 'Bonjour');
  assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(requests[0].options.headers.authorization, 'Bearer synthetic-groq');
  assert.equal(requests[0].options.body.get('model'), 'whisper-large-v3-turbo');
  assert.equal(requests[0].options.body.get('file').size, 3);
  await assert.rejects(speech.transcribe(new Uint8Array(MAX_AUDIO + 1)), /volumineux/);
  await assert.rejects(speech.transcribe(new Uint8Array([1]), 'text/html'), /invalide/);
});

test('OpenAI, ElevenLabs and Azure synthesis use their own protocols and escape SSML text', async () => {
  const { speech, requests, set } = speechFixture(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }));
  assert.equal((await speech.speak('Bonjour')).data.byteLength, 3);
  assert.equal(JSON.parse(requests[0].options.body).voice, 'alloy');
  set({ output: 'elevenlabs', outputModel: 'eleven_multilingual_v2', elevenVoice: 'voice/with spaces' });
  await speech.speak('Bonjour');
  assert.match(requests[1].url, /voice%2Fwith%20spaces$/); assert.equal(requests[1].options.headers['xi-api-key'], 'synthetic-eleven');
  set({ output: 'azure', rate: 1.5 }); await speech.speak('<voice name="evil"> & hello');
  assert.match(requests[2].options.body, /&lt;voice name=&quot;evil&quot;&gt; &amp; hello/);
  assert.match(requests[2].options.body, /rate="\+50%"/);
  assert.equal(requests[2].options.headers['Ocp-Apim-Subscription-Key'], 'synthetic-azure');
});

test('speech errors never echo credential-bearing provider bodies; cancellation reaches the request', async () => {
  const denied = speechFixture(async () => new Response('synthetic-openai private provider body', { status: 401 }));
  await assert.rejects(denied.speech.speak('Test'), (e) => /Clé refusée/.test(e.message) && !/synthetic|private/.test(e.message));
  const slow = speechFixture((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })));
  const abort = new AbortController(); const speaking = slow.speech.speak('Test', abort.signal); abort.abort();
  await assert.rejects(speaking, { name: 'AbortError' });
});

test('Realtime creates a short-lived session and never returns the permanent key', async () => {
  const { speech, requests } = speechFixture(async () => new Response(JSON.stringify({ value: 'ephemeral-client-secret', expires_at: 123 })));
  const token = await speech.realtime('Scoped instructions');
  assert.equal(token.value, 'ephemeral-client-secret'); assert.doesNotMatch(JSON.stringify(token), /synthetic-openai/);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.session.instructions, 'Scoped instructions'); assert.equal(body.session.type, 'realtime');
  assert.equal(body.session.audio.input.turn_detection.interrupt_response, true);
});

const target = { id: '0xabc', pid: 42, name: 'kitty' };
function inputFixture(options = {}) {
  let time = 1000; let front = { address: target.id, pid: 42 };
  let win = { address: target.id, pid: 42, class: 'kitty', mapped: true, at: [100, 200], size: [800, 600], workspace: { id: 1 } };
  const inputs = []; const dispatches = []; const pasted = [];
  const controller = createDesktopInput({ platform: 'linux', env: { HYPRLAND_INSTANCE_SIGNATURE: 'test' }, pid: 99, now: () => time,
    exists: () => true, isSocket: () => true,
    paste: async (text, sendShortcut) => { pasted.push(text); await sendShortcut(); }, releaseKeys: () => {},
    hypr: { query: async (key) => key === 'clients' ? [win] : key === 'monitors' ? [{ activeWorkspace: { id: 1 } }] : front,
      dispatch: async (...args) => { dispatches.push(args); return true; } },
    runner: async (args, text, signal) => { inputs.push({ args, text, signal }); }, ...options });
  return { controller, inputs, dispatches, pasted, time: (t) => { time = t; }, win: (value) => { win = { ...win, ...value }; }, front: (v) => { front = v; } };
}

test('desktop actions require fresh single-use previews and a matching focused visible window', async () => {
  const { controller, inputs, dispatches } = inputFixture();
  const preview = await controller.prepare(target, 'click', { x: 0.5, y: 0.5 });
  assert.equal(inputs.length, 0);
  await controller.execute(preview.token);
  assert.deepEqual(inputs[0].args, ['click', '0xC0']); assert.match(dispatches[1][0], /x = 500, y = 500/);
  await assert.rejects(controller.execute(preview.token), /expiré/);
});

test('expired, moved, replaced and unfocused windows receive no synthetic input', async () => {
  for (const change of ['time', 'move', 'owner', 'focus']) {
    const f = inputFixture(); const p = await f.controller.prepare(target, 'type', { text: 'secret' });
    if (change === 'time') f.time(40000);
    if (change === 'move') f.win({ at: [110, 200] });
    if (change === 'owner') f.win({ pid: 43 });
    if (change === 'focus') f.front({ address: '0xdef', pid: 50 });
    await assert.rejects(f.controller.execute(p.token)); assert.equal(f.inputs.length, 0);
  }
});

test('Unicode text uses clipboard insertion, unsupported keys are refused and emergency stop invalidates every preview', async () => {
  const f = inputFixture();
  const text = 'Éléonore — 日本語 $(not-a-shell)\n\\literal';
  const p = await f.controller.prepare(target, 'type', { text });
  await f.controller.execute(p.token);
  assert.deepEqual(f.inputs[0].args, ['key', '29:1', '47:1', '47:0', '29:0']);
  assert.equal(f.inputs[0].text, ''); assert.deepEqual(f.pasted, [text]);
  await assert.rejects(f.controller.prepare(target, 'key', { key: 'arbitrary' }));
  await assert.rejects(f.controller.prepare(target, 'click', { x: 2, y: 0 }));
  const q = await f.controller.prepare(target, 'key', { key: 'Enter' }); f.controller.stop();
  await assert.rejects(f.controller.execute(q.token)); assert.equal(f.inputs.length, 1);
});

test('clipboard insertion restores every original format and preserves Unicode verbatim', async () => {
  class Item { constructor(data) { this.data = data; this.types = Object.keys(data); } async getType(type) { return this.data[type]; } }
  const original = new Item({ 'text/plain': new Blob(['Original']), 'text/html': new Blob(['<b>Original</b>']), 'image/png': new Blob([new Uint8Array([1, 2, 3])]) });
  let items = [original]; let text = 'Original'; let sent = false;
  const clipboard = { read: async () => items, readText: async () => text,
    writeText: async (value) => { text = value; items = [new Item({ 'text/plain': new Blob([value]) })]; },
    write: async (value) => { items = value; text = await value[0].data['text/plain'].text(); }, clear: () => { items = []; text = ''; } };
  const paste = createClipboardPaste({ clipboard, ClipboardItem: Item, wait: async () => {} });
  const input = 'Été — 日本語\n\\$(literal)';
  await paste(input, async () => { assert.equal(text, input); sent = true; }, new AbortController().signal);
  assert.equal(sent, true); assert.equal(text, 'Original'); assert.deepEqual(items[0].types, original.types);
  assert.deepEqual(new Uint8Array(await items[0].data['image/png'].arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test('losing focus during input aborts the sender and releases virtual keys', async () => {
  let started; let releases = 0; const ready = new Promise((resolve) => { started = resolve; });
  const f = inputFixture({ releaseKeys: () => { releases++; }, runner: async (_args, _text, signal) => {
    started(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const preview = await f.controller.prepare(target, 'key', { key: 'Ctrl+A' });
  const sending = f.controller.execute(preview.token); const rejected = assert.rejects(sending, { name: 'AbortError' });
  await ready; f.front({ address: '0xdef', pid: 50 }); await rejected;
  assert.equal(releases, 1); assert.equal(f.controller.status().active, false);
});

test('clipboard cancellation restores the snapshot without overwriting a new user copy', async () => {
  let text = ''; let clear = 0; let sent = 0;
  const clipboard = { read: async () => [], readText: async () => text, writeText: async (value) => { text = value; }, clear: () => { text = ''; clear++; } };
  const abort = new AbortController();
  const paste = createClipboardPaste({ clipboard, ClipboardItem: class {}, wait: async () => {} });
  await assert.rejects(paste('temporary', async () => { sent++; abort.abort(); }, abort.signal), { name: 'AbortError' });
  assert.equal(clear, 1); assert.equal(text, ''); assert.equal(sent, 1);
  await assert.rejects(paste('never inserted', async () => { sent++; }, abort.signal), { name: 'AbortError' });
  assert.equal(text, ''); assert.equal(sent, 1);
  const userCopy = createClipboardPaste({ clipboard, ClipboardItem: class {}, wait: async () => { text = 'new user copy'; } });
  await userCopy('temporary', async () => {}, new AbortController().signal);
  assert.equal(text, 'new user copy'); assert.equal(clear, 1);
});

test('an empty X11 clipboard represented by a formatless item is restored as empty', async () => {
  let text = ''; let cleared = false;
  const clipboard = { read: async () => [{ types: [] }], readText: async () => text,
    writeText: async (value) => { text = value; }, clear: () => { text = ''; cleared = true; } };
  const paste = createClipboardPaste({ clipboard, ClipboardItem: class { constructor() { throw new Error('Empty items are invalid'); } }, wait: async () => {} });
  await paste('Été', async () => assert.equal(text, 'Été'), new AbortController().signal);
  assert.equal(cleared, true); assert.equal(text, '');
});

test('an already-cancelled Claude request never spawns a terminal process', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(chat('claude', {}, { model: 'Claude Code', messages: [] }, () => {}, abort.signal), { name: 'AbortError' });
});
