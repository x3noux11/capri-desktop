'use strict';

const MAX_MESSAGES = 60;
const MAX_CONTENT = 6000;
const MAX_TOTAL = 48000;

function normalizeHistory(history) {
  if (!Array.isArray(history)) throw new Error('Invalid chat history');
  const kept = [];
  let total = 0;
  for (const row of history.slice(-MAX_MESSAGES).reverse()) {
    if (!row || !['user', 'assistant'].includes(row.role) || typeof row.content !== 'string') continue;
    const content = row.content.slice(0, Math.min(MAX_CONTENT, MAX_TOTAL - total));
    if (!content) continue;
    kept.push({ role: row.role, content });
    total += content.length;
    if (total >= MAX_TOTAL) break;
  }
  return kept.reverse();
}

function normalizeMemory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid memory');
  return { history: normalizeHistory(value.history ?? []), claude: value.claude ?? null };
}

module.exports = { normalizeHistory, normalizeMemory };
