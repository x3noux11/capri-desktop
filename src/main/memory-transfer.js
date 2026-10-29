'use strict';
const { validProjects } = require('./workspace-settings');
const facts = (v) => Array.isArray(v) && v.length <= 30 && v.every((s) => typeof s === 'string' && s.trim() && s.length <= 200);
function exportMemories(cfg) {
  return { format: 'capri-memory-v1', memories: [...cfg.memories], projects: structuredClone(cfg.projects) };
}
function importMemories(text, cfg) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 256 * 1024) throw new Error('Fichier trop volumineux.');
  const value = JSON.parse(text);
  if (!value || value.format !== 'capri-memory-v1' || !facts(value.memories) || !validProjects(value.projects)
    || Object.keys(value).some((k) => !['format', 'memories', 'projects'].includes(k))) throw new Error('Format de souvenirs invalide.');
  const merge = (a, b) => {
    const result = [...new Set([...a, ...b])];
    if (result.length > 30) throw new Error('La fusion dépasserait 30 souvenirs dans une portée.');
    return result;
  };
  const projects = structuredClone(cfg.projects);
  for (const p of value.projects) {
    const existing = projects.find((n) => n.id === p.id);
    if (existing) existing.memories = merge(existing.memories, p.memories);
    else projects.push(p);
  }
  if (projects.length > 20) throw new Error('La fusion dépasserait 20 projets.');
  return { memories: merge(cfg.memories, value.memories), projects };
}
module.exports = { exportMemories, importMemories };
