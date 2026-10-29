'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = (v) => v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const name = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 80 && !/[\r\n\0]/.test(v);
const unique = (rows) => new Set(rows.map((r) => r.id)).size === rows.length;
const memories = (v) => Array.isArray(v) && v.length <= 30
  && v.every((s) => typeof s === 'string' && s.trim() && s.length <= 200);
function validProjects(v) {
  return Array.isArray(v) && v.length <= 20 && v.every((p) => record(p) && UUID.test(p.id)
    && name(p.name) && memories(p.memories)) && unique(v);
}
function validRoutines(v) {
  return Array.isArray(v) && v.length <= 12 && v.every((r) => record(r) && UUID.test(r.id) && name(r.name)
    && Array.isArray(r.steps) && r.steps.length > 0 && r.steps.length <= 8
    && r.steps.every((s) => record(s) && typeof s.desktopId === 'string' && s.desktopId.startsWith('/')
      && s.desktopId.endsWith('.desktop') && s.desktopId.length <= 4096 && !/[\r\n\0]/.test(s.desktopId)
      && Number.isInteger(s.workspace) && s.workspace >= 1 && s.workspace <= 99)
    && new Set(r.steps.map((s) => s.desktopId)).size === r.steps.length) && unique(v);
}
module.exports = { UUID, validProjects, validRoutines };
