'use strict';

const { validRoutines } = require('./workspace-settings');
const quote = (s) => `'${s.replace(/'/g, "'\\''")}'`;
function luaString(s) {
  let marks = '=';
  while (s.includes(`]${marks}]`)) marks += '=';
  return `[${marks}[${s}]${marks}]`;
}
function createRoutines({ platform = process.platform, env = process.env, load,
  entries = require('./desktop-entries').entries, hypr = require('./hyprland'), pid = process.pid,
  exists = require('./platform').commandExists } = {}) {
  let busy = false;
  const supported = platform === 'linux' && Boolean(env.HYPRLAND_INSTANCE_SIGNATURE) && exists('gio');
  function catalog() {
    if (platform !== 'linux') return [];
    return entries().filter((e) => typeof e.id === 'string' && e.id.startsWith('/') && !/[\r\n\0]/.test(e.id)
      && !/^capri(-desktop)?$/i.test(e.file)).map(({ id, name }) => ({ id, name }));
  }
  async function run(id, expected) {
    if (!supported) return { ok: false, code: 'unsupported', steps: [] };
    if (busy) return { ok: false, code: 'busy', steps: [] };
    busy = true;
    const results = [];
    try {
      const routine = load().routines.find((r) => r.id === id);
      if (!routine || !validRoutines([routine])) return { ok: false, code: 'invalid', steps: [] };
      if (expected && JSON.stringify(expected) !== JSON.stringify(routine.steps)) return { ok: false, code: 'stale', steps: [] };
      const installed = entries(); // fresh: never trust a path supplied by the renderer
      const plan = routine.steps.map((s) => ({ ...s, app: installed.find((e) => e.id === s.desktopId) }));
      if (plan.some((s) => !s.app || /^capri(-desktop)?$/i.test(s.app.file))) return { ok: false, code: 'missing', steps: [] };
      // Check IPC before launching anything. Re-read clients for each step, since windows can close.
      await hypr.query('monitors');
      for (const step of plan) {
        const clients = await hypr.query('clients');
        if (!Array.isArray(clients)) throw new Error('Invalid window list');
        const keys = new Set([step.app.wmClass, step.app.file, step.app.file?.split('.').pop()].filter(Boolean).map((s) => s.toLowerCase()));
        const win = clients.find((c) => c?.mapped && c.pid !== pid && /^0x[0-9a-f]{1,16}$/i.test(c.address)
          && !/^capri(-desktop)?$/i.test(c.class || '') && keys.has(String(c.class || '').toLowerCase()));
        let ok;
        if (win) {
          ok = await hypr.dispatch(`hl.dsp.window.move({ window = "address:${win.address}", workspace = "${step.workspace}", follow = false })`,
            `movetoworkspacesilent ${step.workspace},address:${win.address}`);
        } else {
          const command = `gio launch ${quote(step.desktopId)}`;
          ok = await hypr.dispatch(`hl.dsp.exec_cmd(${luaString(command)}, { workspace = "${step.workspace} silent" })`,
            `exec [workspace ${step.workspace} silent] ${command}`);
        }
        results.push({ name: step.app.name, workspace: step.workspace, ok, kind: win ? 'move' : 'launch' });
        if (!ok) return { ok: false, code: 'refused', steps: results };
      }
      return { ok: true, steps: results };
    } catch { return { ok: false, code: 'failed', steps: results }; }
    finally { busy = false; }
  }
  return { catalog, run, supported };
}
module.exports = { createRoutines };
