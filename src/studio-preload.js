'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (name) => (request) => ipcRenderer.invoke(`studio:${name}`, request);
const on = (name) => (fn) => {
  const listener = (_e, value) => fn(value);
  ipcRenderer.on(`studio:${name}`, listener);
  return () => ipcRenderer.removeListener(`studio:${name}`, listener);
};
contextBridge.exposeInMainWorld('desk', {
  state: call('state'), config: call('config'), provider: call('provider'), testProvider: call('testProvider'), key: call('key'),
  speechTest: call('speechTest'), transcribe: call('transcribe'), speak: call('speak'), stop: call('stop'), chat: call('chat'),
  realtime: call('realtime'), voicePair: call('voicePair'), resume: call('resume'), summary: call('summary'),
  memoryExport: call('memoryExport'), memoryImportPreview: call('memoryImportPreview'), memoryImport: call('memoryImport'),
  runRoutine: call('runRoutine'), windows: call('windows'), prepareInput: call('prepareInput'), executeInput: call('executeInput'),
  capture: call('capture'), guide: call('guide'), command: call('command'), copy: call('copy'),
  onConfig: on('config'), onCommand: on('command'), onDelta: on('delta'),
});
