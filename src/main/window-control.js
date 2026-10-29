'use strict';

// Only enumerated windows and four fixed operations. No shell, arbitrary input or titles.
const ADDRESS = /^0x[0-9a-f]{1,16}$/i;
const ACTIONS = new Set(['focus', 'minimize', 'maximize', 'restore']);
const STASH = 'special:capri-minimized';

function createWindowControl({ platform = process.platform, env = process.env, pid = process.pid,
  hypr = require('./hyprland'), powershell = require('./apps').powershell } = {}) {
  const supported = platform === 'win32' || (platform === 'linux' && Boolean(env.HYPRLAND_INSTANCE_SIGNATURE));
  const origins = new Map();
  let busy = false;
  async function list() {
    if (!supported) return [];
    if (platform === 'win32') {
      const out = await powershell('Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | '
        + 'ForEach-Object { [pscustomobject]@{ id = $_.MainWindowHandle.ToInt64().ToString(); pid = $_.Id; name = $_.ProcessName } } | ConvertTo-Json -Compress');
      return [].concat(out ? JSON.parse(out) : []).filter((w) => w && w.pid !== pid
        && Number.isSafeInteger(w.pid) && /^[1-9][0-9]{0,18}$/.test(w.id)
        && !/^(capri|electron|explorer|dwm|shellexperiencehost|lockapp)$/i.test(w.name))
        .map((w) => ({ id: w.id, pid: w.pid, name: String(w.name).slice(0, 80) }));
    }
    const clients = await hypr.query('clients');
    if (!Array.isArray(clients)) throw new Error('Invalid window list');
    const rows = clients.filter((w) => w?.mapped && ADDRESS.test(w.address) && Number.isSafeInteger(w.pid)
      && w.pid > 0 && w.pid !== pid && w.class && !/^capri(-desktop)?$/i.test(w.class));
    const live = new Set(rows.map((w) => w.address));
    for (const id of origins.keys()) if (!live.has(id)) origins.delete(id);
    return rows.map((w) => ({ id: w.address, pid: w.pid, name: String(w.class).slice(0, 80),
      workspace: Number.isInteger(w.workspace?.id) ? w.workspace.id : null,
      minimized: w.workspace?.name === STASH }));
  }

  async function move(win, workspace, follow) {
    return hypr.dispatch(`hl.dsp.window.move({ window = "address:${win.id}", workspace = "${workspace}", follow = ${follow} })`,
      `${follow ? 'movetoworkspace' : 'movetoworkspacesilent'} ${workspace},address:${win.id}`);
  }

  async function act(target, action) {
    if (!supported) return { ok: false, code: 'unsupported' };
    if (!ACTIONS.has(action) || !target || typeof target.id !== 'string' || !Number.isSafeInteger(target.pid)) return { ok: false, code: 'invalid' };
    if (busy) return { ok: false, code: 'busy' };
    busy = true;
    try {
      // Re-enumerate on the click: a closed/replaced window must never inherit permission.
      const win = (await list()).find((w) => w.id === target.id && w.pid === target.pid && w.name === target.name);
      if (!win) return { ok: false, code: 'gone' };
      if (platform === 'win32') {
        const command = { focus: 5, minimize: 6, maximize: 3, restore: 9 }[action];
        const out = await powershell(`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class CapriWindow { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int n); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }'; `
          + `$h = [IntPtr][long]${win.id}; [uint32]$owner = 0; [void][CapriWindow]::GetWindowThreadProcessId($h, [ref]$owner); `
          + `if ($owner -ne ${win.pid}) { throw 'Window changed' }; `
          + (action === 'focus' ? '[void][CapriWindow]::ShowWindowAsync($h, $(if ([CapriWindow]::IsIconic($h)) { 9 } else { 5 })); '
            : `[void][CapriWindow]::ShowWindowAsync($h, ${command}); `)
          + (action === 'focus' ? '[CapriWindow]::SetForegroundWindow($h)' : "'True'"));
        return { ok: out.trim().toLowerCase() === 'true', code: 'refused' };
      }
      if (action === 'minimize') {
        if (win.minimized) return { ok: true };
        const ok = await move(win, STASH, false);
        if (ok && Number.isInteger(win.workspace)) origins.set(win.id, { pid: win.pid, workspace: win.workspace });
        return { ok };
      }
      if (win.minimized) {
        const saved = origins.get(win.id);
        const workspace = saved?.pid === win.pid ? saved.workspace : (await hypr.query('activeworkspace'))?.id;
        if (!Number.isInteger(workspace) || workspace <= 0 || !await move(win, workspace, true)) return { ok: false, code: 'refused' };
        origins.delete(win.id);
      }
      if (action === 'focus') return { ok: await hypr.dispatch(`hl.dsp.focus({ window = "address:${win.id}" })`, `focuswindow address:${win.id}`) };
      const mode = action === 'maximize' ? 1 : 0;
      // Lua has a window selector. Older Hyprland only applies fullscreenstate to focus:
      // a single compositor batch focuses the selected window and sets an explicit state.
      const lua = await hypr.request(`dispatch hl.dsp.window.fullscreen_state({ window = "address:${win.id}", internal = ${mode}, client = ${mode}, action = "set" })`);
      if (lua.trim() === 'ok') return { ok: true };
      const result = await hypr.request(`[[BATCH]]dispatch focuswindow address:${win.id};dispatch fullscreenstate ${mode} ${mode} set`);
      return { ok: result.trim().split(/\s+/).every((part) => part === 'ok') };
    } catch { return { ok: false, code: 'failed' }; }
    finally { busy = false; }
  }
  return { list, act, supported };
}

module.exports = { createWindowControl };
