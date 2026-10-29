'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const ADDRESS = /^0x[0-9a-f]{1,16}$/i;
const SHORTCUTS = { Enter: [28], Escape: [1], Tab: [15], Backspace: [14], 'Ctrl+A': [29, 30], 'Ctrl+C': [29, 46], 'Ctrl+V': [29, 47], 'Ctrl+L': [29, 38], 'Ctrl+Z': [29, 44] };
const RELEASE_KEYS = ['key', '--key-delay', '0', ...[...new Set([...Object.values(SHORTCUTS).flat(), 272, 273])].map((key) => `${key}:0`)];
function runInput(args, input, signal, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn('ydotool', args, { env, stdio: ['pipe', 'ignore', 'ignore'], signal });
    const timer = setTimeout(() => child.kill(), 60000);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('ydotool a refusé l’action.')); });
    child.stdin.on('error', () => {}); child.stdin.end(input || '');
  });
}
function createDesktopInput({ platform = process.platform, env = process.env, pid = process.pid,
  hypr = require('./hyprland'), exists = require('./platform').commandExists,
  isSocket = (p) => { try { return fs.statSync(p).isSocket(); } catch { return false; } },
  runner = runInput, now = Date.now, paste = null,
  releaseKeys = () => execFile('ydotool', RELEASE_KEYS, { env, timeout: 1500 }, () => {}) } = {}) {
  const plans = new Map(); let active = null; let stopped = false;
  function status() {
    const session = platform === 'linux' && Boolean(env.HYPRLAND_INSTANCE_SIGNATURE);
    const socket = env.YDOTOOL_SOCKET || (env.XDG_RUNTIME_DIR ? path.join(env.XDG_RUNTIME_DIR, '.ydotool_socket') : '/tmp/.ydotool_socket');
    return { session, tool: exists('ydotool'), daemon: isSocket(socket), capture: exists('grim'),
      ready: session && exists('ydotool') && isSocket(socket), active: Boolean(active) };
  }
  async function window(target) {
    if (!target || !ADDRESS.test(target.id) || !Number.isSafeInteger(target.pid)) throw new Error('Fenêtre invalide.');
    const [clients, monitors] = await Promise.all([hypr.query('clients'), hypr.query('monitors')]);
    const visible = new Set(monitors.flatMap((m) => [m.activeWorkspace?.id, m.specialWorkspace?.id]).filter((i) => i !== 0));
    const win = clients.find((c) => c?.address === target.id && c.pid === target.pid && c.pid !== pid
      && c.mapped && !c.hidden && c.class === target.name && !/^capri(-desktop)?$/i.test(c.class)
      && (c.pinned || visible.has(c.workspace?.id)));
    if (!win || !Array.isArray(win.at) || !Array.isArray(win.size) || ![...win.at, ...win.size].every(Number.isFinite)
      || win.size[0] < 10 || win.size[1] < 10) throw new Error('La fenêtre n’est plus visible ou a changé.');
    return win;
  }
  async function prepare(target, action, data = {}) {
    if (!status().ready) throw new Error('Il faut Hyprland, ydotool et son service utilisateur configuré.');
    if (!['click', 'rightClick', 'type', 'key', 'scroll'].includes(action)) throw new Error('Action inconnue.');
    if (action === 'type' && (typeof data.text !== 'string' || !data.text || data.text.length > 2000 || data.text.includes('\0'))) throw new Error('Texte invalide.');
    if (action === 'key' && !Object.hasOwn(SHORTCUTS, data.key)) throw new Error('Raccourci indisponible.');
    if (action === 'scroll' && (!Number.isInteger(data.amount) || Math.abs(data.amount) > 10 || data.amount === 0)) throw new Error('Défilement invalide.');
    if (['click', 'rightClick', 'scroll'].includes(action) && (![data.x, data.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1))) throw new Error('Coordonnées invalides.');
    const win = await window(target);
    for (const [token, p] of plans) if (p.until < now()) plans.delete(token);
    if (plans.size >= 8) plans.delete(plans.keys().next().value);
    const token = randomUUID(); stopped = false;
    plans.set(token, { target: { ...target }, action, data: { ...data }, at: [...win.at], size: [...win.size], until: now() + 30000 });
    return { token, target, action, data, expires: now() + 30000 };
  }
  async function execute(token) {
    const plan = plans.get(token); plans.delete(token);
    if (!plan || plan.until < now() || stopped) throw new Error('L’aperçu a expiré. Prépare à nouveau l’action.');
    if (active) throw new Error('Une action est déjà en cours.');
    const abort = new AbortController(); active = abort;
    // Release keys and mouse buttons used by Capri if interrupted before key-up.
    abort.signal.addEventListener('abort', releaseKeys, { once: true });
    let watcher = null; let checking = false;
    try {
      const win = await window(plan.target);
      if (JSON.stringify([win.at, win.size]) !== JSON.stringify([plan.at, plan.size])) throw new Error('La fenêtre a bougé. Vérifie à nouveau la cible.');
      if (!await hypr.dispatch(`hl.dsp.focus({ window = "address:${win.address}" })`, `focuswindow address:${win.address}`)) throw new Error('Impossible de cibler la fenêtre.');
      if (['click', 'rightClick', 'scroll'].includes(plan.action)) {
        const x = Math.round(win.at[0] + 2 + plan.data.x * (win.size[0] - 4));
        const y = Math.round(win.at[1] + 2 + plan.data.y * (win.size[1] - 4));
        if (!await hypr.dispatch(`hl.dsp.cursor.move({ x = ${x}, y = ${y} })`, `movecursor ${x} ${y}`)) throw new Error('Impossible de déplacer le pointeur.');
      }
      const front = await hypr.query('activewindow');
      if (abort.signal.aborted || front?.address !== win.address || front.pid !== win.pid) throw new Error('Le focus a changé : action annulée.');
      const data = plan.data;
      watcher = setInterval(async () => {
        if (checking || abort.signal.aborted) return; checking = true;
        try { const front = await hypr.query('activewindow'); if (front?.address !== win.address || front.pid !== win.pid) abort.abort(); }
        catch { abort.abort(); }
        finally { checking = false; }
      }, 75);
      if (plan.action === 'type') {
        if (!paste) throw new Error('La saisie nécessite le presse-papiers de Capri.');
        await paste(data.text, () => runner(['key', '29:1', '47:1', '47:0', '29:0'], '', abort.signal, env), abort.signal);
      }
      else if (plan.action === 'key') {
        const codes = SHORTCUTS[data.key];
        await runner(['key', ...codes.map((k) => `${k}:1`), ...[...codes].reverse().map((k) => `${k}:0`)], '', abort.signal, env);
      } else if (plan.action === 'scroll') await runner(['mousemove', '--wheel', '-y', String(data.amount)], '', abort.signal, env);
      else await runner(['click', plan.action === 'rightClick' ? '0xC1' : '0xC0'], '', abort.signal, env);
      if (abort.signal.aborted) throw new Error('Action arrêtée.');
      return { ok: true };
    } finally { clearInterval(watcher); if (active === abort) active = null; }
  }
  function stop() {
    stopped = true; plans.clear();
    active?.abort();
  }
  async function capture(target) {
    if (!status().session || !status().capture) throw new Error('La capture d’une fenêtre nécessite Hyprland et grim.');
    const win = await window(target);
    if (!await hypr.dispatch(`hl.dsp.focus({ window = "address:${win.address}" })`, `focuswindow address:${win.address}`)) throw new Error('Focus refusé.');
    const front = await hypr.query('activewindow');
    if (front?.address !== win.address) throw new Error('Le focus a changé.');
    const image = await new Promise((resolve, reject) => execFile('grim', ['-g', `${win.at[0]},${win.at[1]} ${win.size[0]}x${win.size[1]}`, '-t', 'jpeg', '-q', '70', '-'],
      { encoding: 'buffer', timeout: 5000, maxBuffer: 12 * 1024 * 1024 }, (err, bytes) => err ? reject(new Error('Capture refusée.')) : resolve(bytes)));
    const after = await window(target); const activeWindow = await hypr.query('activewindow');
    if (activeWindow?.address !== win.address || JSON.stringify([after.at, after.size]) !== JSON.stringify([win.at, win.size])) throw new Error('La fenêtre a changé pendant la capture.');
    return { image: image.toString('base64'), width: win.size[0], height: win.size[1], at: win.at };
  }
  return { status, prepare, execute, stop, capture, window };
}
module.exports = { createDesktopInput, SHORTCUTS };
