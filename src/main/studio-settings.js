'use strict';
const { UUID } = require('./workspace-settings');
const record = (v) => v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const text = (v, max) => typeof v === 'string' && v.length <= max && !v.includes('\0');
const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const keys = (v, names) => record(v) && Object.keys(v).every((k) => names.includes(k));
const DEFAULTS = {
  speech: { input: 'openai', inputModel: 'whisper-1', output: 'openai', outputModel: 'gpt-4o-mini-tts',
    voice: 'alloy', elevenVoice: '', azureRegion: 'westeurope', azureVoice: 'fr-FR-DeniseNeural',
    mode: 'push', microphone: '', speakReplies: true, rate: 1 },
  focus: { until: 0, phase: 'work', workMinutes: 25, breakMinutes: 5 },
  appearance: { accent: '#bb79ff', panelOpacity: 0.96, effectIntensity: 1 },
  appearanceProfiles: [], worklog: [], performanceProfile: 'balanced', notificationMode: 'all',
};
const validAppearance = (v) => keys(v, ['accent', 'panelOpacity', 'effectIntensity'])
  && /^#[0-9a-f]{6}$/i.test(v.accent) && number(v.panelOpacity, 0.5, 1) && number(v.effectIntensity, 0, 1);
function validSetting(name, v) {
  if (name === 'speech') return keys(v, Object.keys(DEFAULTS.speech))
    && ['openai', 'groq'].includes(v.input) && ['openai', 'elevenlabs', 'azure', 'none'].includes(v.output)
    && ['push', 'continuous', 'realtime'].includes(v.mode) && text(v.inputModel, 100) && v.inputModel.trim()
    && text(v.outputModel, 100) && v.outputModel.trim() && text(v.voice, 100) && /^[\w-]{1,80}$/.test(v.voice)
    && text(v.elevenVoice, 100) && /^[a-z0-9-]{1,40}$/.test(v.azureRegion)
    && /^[a-zA-Z0-9-]{1,100}$/.test(v.azureVoice) && text(v.microphone, 300)
    && typeof v.speakReplies === 'boolean' && number(v.rate, 0.5, 2);
  if (name === 'focus') return keys(v, Object.keys(DEFAULTS.focus)) && number(v.until, 0, Number.MAX_SAFE_INTEGER)
    && ['work', 'break'].includes(v.phase) && Number.isInteger(v.workMinutes) && number(v.workMinutes, 1, 180)
    && Number.isInteger(v.breakMinutes) && number(v.breakMinutes, 1, 60);
  if (name === 'appearance') return validAppearance(v);
  if (name === 'performanceProfile') return ['balanced', 'eco', 'quiet', 'auto'].includes(v);
  if (name === 'notificationMode') return ['all', 'important', 'off'].includes(v);
  if (name === 'appearanceProfiles') return Array.isArray(v) && v.length <= 8 && new Set(v.map((p) => p?.id)).size === v.length
    && v.every((p) => keys(p, ['id', 'name', 'appearance', 'scale', 'volume', 'motion']) && UUID.test(p.id)
      && text(p.name, 80) && p.name.trim() && validAppearance(p.appearance) && number(p.scale, 0.2, 2)
      && number(p.volume, 0, 1) && ['auto', 'full', 'reduced'].includes(p.motion));
  if (name === 'worklog') return Array.isArray(v) && v.length <= 21 && new Set(v.map((p) => p?.scope)).size === v.length
    && v.every((p) => keys(p, ['scope', 'summary', 'tasks']) && (p.scope === '' || UUID.test(p.scope))
      && text(p.summary, 2000) && Array.isArray(p.tasks) && p.tasks.length <= 50
      && new Set(p.tasks.map((t) => t?.id)).size === p.tasks.length
      && p.tasks.every((t) => keys(t, ['id', 'text', 'done']) && UUID.test(t.id) && text(t.text, 300) && t.text.trim() && typeof t.done === 'boolean'));
  return false;
}
function effectiveConfig(cfg, { now = Date.now(), battery = false } = {}) {
  const focusActive = cfg.focus.until > now && cfg.focus.phase === 'work';
  const eco = cfg.performanceProfile === 'eco' || (cfg.performanceProfile === 'auto' && battery);
  const quiet = cfg.performanceProfile === 'quiet' || focusActive;
  return { ...cfg, focusActive, lowPower: cfg.lowPower || eco || quiet,
    wander: cfg.wander && !quiet, possess: cfg.possess && !quiet, pcReact: cfg.pcReact && !quiet,
    motion: quiet ? 'reduced' : cfg.motion, volume: quiet ? Math.min(cfg.volume, 0.2) : cfg.volume };
}
function resume(history, log = { summary: '', tasks: [] }) {
  return { summary: log.summary, tasks: log.tasks,
    lastRequest: [...history].reverse().find((m) => m.role === 'user')?.content.slice(0, 1200) || '',
    lastReply: [...history].reverse().find((m) => m.role === 'assistant')?.content.slice(0, 1600) || '' };
}
module.exports = { DEFAULTS, validSetting, effectiveConfig, resume };
