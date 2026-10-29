'use strict';
const BASES = { openai: 'https://api.openai.com/v1', groq: 'https://api.groq.com/openai/v1' };
const KEY_IDS = { openai: 'openai', groq: 'groq', elevenlabs: 'speech-elevenlabs', azure: 'speech-azure' };
const MAX_AUDIO = 20 * 1024 * 1024;
const xml = (v) => String(v).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
function createSpeech({ getConfig, getKeys, fetcher = fetch, env = process.env } = {}) {
  function key(provider) {
    const value = getKeys()[KEY_IDS[provider]] || env[{ openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY',
      elevenlabs: 'ELEVENLABS_API_KEY', azure: 'AZURE_SPEECH_KEY' }[provider]];
    if (!value) throw Object.assign(new Error('Clé vocale absente. Configure le fournisseur dans Voix.'), { code: 'nokey' });
    return value;
  }
  async function request(url, options = {}, signal) {
    const res = await fetcher(url, { ...options, signal: AbortSignal.any([AbortSignal.timeout(60000), ...(signal ? [signal] : [])]) });
    if (!res.ok) throw Object.assign(new Error(res.status === 401 || res.status === 403 ? 'Clé refusée par le fournisseur vocal.'
      : res.status === 429 ? 'Limite ou quota du fournisseur vocal atteint.' : `Le fournisseur vocal a répondu HTTP ${res.status}.`), { code: `http${res.status}` });
    return res;
  }
  async function audioBody(res) {
    if (Number(res.headers.get('content-length')) > MAX_AUDIO) throw new Error('Réponse audio trop volumineuse.');
    const chunks = []; let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_AUDIO) throw new Error('Réponse audio trop volumineuse.');
      chunks.push(Buffer.from(chunk));
    }
    return { data: new Uint8Array(Buffer.concat(chunks)), mime: 'audio/mpeg' };
  }
  async function transcribe(data, mime = 'audio/webm', signal) {
    if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > MAX_AUDIO
      || !/^audio\/(webm|ogg|wav|mp4|mpeg)(;.*)?$/.test(mime)) throw new Error('Enregistrement audio invalide ou trop volumineux.');
    const cfg = getConfig().speech; const provider = cfg.input;
    if (!BASES[provider]) throw new Error('Transcription indisponible.');
    const body = new FormData();
    body.set('file', new Blob([data], { type: mime }), `voice.${/ogg/.test(mime) ? 'ogg' : /mp4/.test(mime) ? 'mp4' : /wav/.test(mime) ? 'wav' : 'webm'}`);
    body.set('model', cfg.inputModel); body.set('response_format', 'json');
    const res = await request(`${BASES[provider]}/audio/transcriptions`, {
      method: 'POST', headers: { authorization: `Bearer ${key(provider)}` }, body,
    }, signal);
    const value = await res.json();
    if (typeof value.text !== 'string') throw new Error('La transcription reçue est invalide.');
    return value.text.trim().slice(0, 6000);
  }
  async function speak(text, signal) {
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('Texte vocal invalide (4 000 caractères maximum).');
    const cfg = getConfig().speech; const provider = cfg.output;
    if (provider === 'none') return null;
    let res;
    if (provider === 'openai') res = await request(`${BASES.openai}/audio/speech`, { method: 'POST',
      headers: { authorization: `Bearer ${key(provider)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.outputModel, voice: cfg.voice, input: text, speed: cfg.rate, response_format: 'mp3' }),
    }, signal);
    else if (provider === 'elevenlabs') {
      if (!cfg.elevenVoice.trim()) throw new Error('Renseigne un identifiant de voix ElevenLabs.');
      res = await request(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.elevenVoice)}`, { method: 'POST',
        headers: { 'xi-api-key': key(provider), 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: cfg.outputModel, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      }, signal);
    } else if (provider === 'azure') {
      if (!/^[a-z0-9-]{1,40}$/.test(cfg.azureRegion) || !/^[a-zA-Z0-9-]{1,100}$/.test(cfg.azureVoice)) throw new Error('Région ou voix Azure invalide.');
      res = await request(`https://${cfg.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key(provider), 'content-type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'user-agent': 'Capri' },
        body: `<speak version="1.0" xml:lang="${xml(cfg.azureVoice.slice(0, 5))}"><voice name="${xml(cfg.azureVoice)}"><prosody rate="${cfg.rate >= 1 ? '+' : ''}${Math.round((cfg.rate - 1) * 100)}%">${xml(text)}</prosody></voice></speak>`,
      }, signal);
    } else throw new Error('Fournisseur de voix inconnu.');
    return audioBody(res);
  }
  async function test(provider, signal) {
    const cfg = getConfig().speech;
    let url; let headers;
    if (BASES[provider]) { url = `${BASES[provider]}/models`; headers = { authorization: `Bearer ${key(provider)}` }; }
    else if (provider === 'elevenlabs') { url = 'https://api.elevenlabs.io/v1/voices'; headers = { 'xi-api-key': key(provider) }; }
    else if (provider === 'azure' && /^[a-z0-9-]{1,40}$/.test(cfg.azureRegion)) {
      url = `https://${cfg.azureRegion}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
      headers = { 'Ocp-Apim-Subscription-Key': key(provider) };
    } else throw new Error('Fournisseur inconnu.');
    await request(url, { headers }, signal);
    return true;
  }
  async function realtime(instructions, signal) {
    const cfg = getConfig().speech;
    const res = await request(`${BASES.openai}/realtime/client_secrets`, { method: 'POST',
      headers: { authorization: `Bearer ${key('openai')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ session: { type: 'realtime', model: 'gpt-realtime', instructions,
        audio: { input: { transcription: { model: 'whisper-1' }, turn_detection: { type: 'server_vad', interrupt_response: true } },
          output: { voice: cfg.voice } } } }),
    }, signal);
    const result = await res.json(); const value = result.value || result.client_secret?.value;
    if (typeof value !== 'string' || value.length < 8 || value.length > 4096) throw new Error('Session vocale invalide.');
    return { value, expires: result.expires_at || result.client_secret?.expires_at || null };
  }
  return { transcribe, speak, test, realtime };
}
module.exports = { createSpeech, KEY_IDS, MAX_AUDIO };
