'use strict';

// Clipboard insertion preserves Unicode and the user's keyboard layout. Snapshot every
// available format before writing; do not overwrite a clipboard the user changed meanwhile.
function createClipboardPaste({ clipboard, ClipboardItem, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return async function paste(text, sendShortcut, signal) {
    let total = 0;
    const snapshot = [];
    for (const item of await clipboard.read()) {
      // Electron can represent an empty X11 clipboard as one item with no formats.
      if (!item.types.length) continue;
      const data = {};
      for (const type of item.types) {
        const value = await item.getType(type); total += value.size || JSON.stringify(value).length;
        if (total > 20 * 1024 * 1024) throw new Error('Le presse-papiers est trop volumineux pour être préservé.');
        data[type] = value;
      }
      snapshot.push(new ClipboardItem(data));
    }
    signal.throwIfAborted();
    await clipboard.writeText(text);
    try { signal.throwIfAborted(); await sendShortcut(); await wait(500); signal.throwIfAborted(); }
    finally {
      if (await clipboard.readText() === text) {
        if (snapshot.length) await clipboard.write(snapshot); else clipboard.clear();
      }
    }
  };
}
module.exports = { createClipboardPaste };
