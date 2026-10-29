import { el, button, actions, hint, run } from './ui.js';

export class CloudVoice {
  constructor({ api, config, notify }) {
    Object.assign(this, { api, config, notify });
    this.epoch = 0; this.active = false; this.held = false; this.continuous = false;
    window.desk.onDelta((piece) => { if (this.busy && this.reply) { this.answer += piece; this.reply.textContent = this.answer; } });
    window.addEventListener('blur', () => { if (this.config().speech.mode === 'push' && this.held) this.stop(); });
    window.addEventListener('beforeunload', () => this.stop());
  }
  mount(root) {
    this.state = el('div', { class: 'voice-state', role: 'status', 'aria-live': 'polite', id: 'voice-status' }, 'Micro éteint');
    this.transcript = el('p', { class: 'voice-log', id: 'voice-transcript' });
    this.reply = el('div', { class: 'voice-log', id: 'voice-answer', 'aria-live': 'polite' });
    const hold = button(this.config().speech.mode === 'push' ? 'Maintenir pour parler' : 'Démarrer la conversation', () => {}, 'primary hold', { id: 'voice-start' });
    hold.addEventListener('pointerdown', run(async (e) => {
      if (e.button !== 0) return;
      hold.setPointerCapture(e.pointerId);
      if (this.config().speech.mode === 'push') { this.held = true; await this.start(); }
      else if (this.active) await this.stop(); else await this.start();
    }));
    hold.addEventListener('pointerup', run(async () => { if (this.config().speech.mode === 'push') { this.held = false; await this.finish(); } }));
    hold.addEventListener('pointercancel', () => this.stop());
    hold.addEventListener('keydown', run(async (e) => {
      if (e.code !== 'Space' || e.repeat) return; e.preventDefault();
      if (this.config().speech.mode === 'push') { this.held = true; await this.start(); } else if (this.active) await this.stop(); else await this.start();
    }));
    hold.addEventListener('keyup', run(async (e) => { if (e.code === 'Space' && this.config().speech.mode === 'push') { e.preventDefault(); this.held = false; await this.finish(); } }));
    this.typed = el('textarea', { placeholder: 'Ou écrivez votre message…', maxlength: '6000', 'aria-label': 'Message à Capri', id: 'voice-message' });
    root.append(this.state, hint('Le microphone n’est activé qu’à votre demande. L’audio et la transcription sont envoyés aux fournisseurs sélectionnés. Les réponses sont générées par IA.'),
      actions(hold, button('Tout arrêter', () => this.stop(), 'danger', { id: 'voice-stop' }), button('Activer le son', () => this.remote?.play())),
      el('h3', {}, 'Vous'), this.transcript, el('h3', {}, 'Capri'), this.reply,
      this.typed, actions(button('Envoyer', async () => {
        if (this.active || this.busy) throw new Error('Terminez l’échange vocal avant d’envoyer un message écrit.');
        const text = this.typed.value.trim(); if (text) { this.typed.value = ''; await this.send(text); }
      }, '', { id: 'voice-send' })));
  }
  status(text, listening = false) {
    if (this.state) { this.state.textContent = text; this.state.classList.toggle('listening', listening); }
  }
  releaseMic() {
    clearInterval(this.vad); clearTimeout(this.limit);
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
    this.audioContext?.close().catch(() => {}); this.audioContext = null;
  }
  async stop(notifyMain = true) {
    this.epoch++; this.held = this.continuous = this.active = this.busy = false;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null; this.releaseMic();
    this.connectionAbort?.abort(); this.connectionAbort = null;
    this.channel?.close(); this.peer?.close(); this.channel = this.peer = null;
    if (this.audio) { this.audio.pause(); this.audio = null; }
    this.playbackDone?.(); this.playbackDone = null;
    if (this.remote) { this.remote.pause(); this.remote.srcObject = null; this.remote = null; }
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl); this.audioUrl = null;
    this.status('Micro éteint');
    if (notifyMain) await this.api('stop').catch(() => {});
  }
  async start() {
    if (this.active || this.busy) return;
    this.active = true;
    const epoch = ++this.epoch;
    try {
      if (this.config().speech.mode === 'realtime') return await this.realtime(epoch);
      this.continuous = this.config().speech.mode === 'continuous';
      await this.record(epoch);
    } catch (e) { if (epoch === this.epoch) { this.notify(e.message, true); await this.stop(); } }
  }
  async record(epoch) {
    this.status('Autorisation du microphone…');
    const mic = this.config().speech.microphone;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(mic && { deviceId: { exact: mic } }), echoCancellation: true, noiseSuppression: true }, video: false });
    if (epoch !== this.epoch || (!this.held && !this.continuous)) { stream.getTracks().forEach((t) => t.stop()); this.active = false; this.status('Micro éteint'); return; }
    this.stream = stream;
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((s) => MediaRecorder.isTypeSupported(s));
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); this.recorder = recorder;
    const chunks = []; this.heard = !this.continuous;
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = run(async () => {
      if (epoch !== this.epoch || this.recorder !== recorder) return;
      const heard = this.heard; const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      this.releaseMic(); this.recorder = null;
      if (epoch !== this.epoch) return;
      try {
        if (heard && blob.size > 100) {
          this.status('Transcription cloud…');
          const text = await this.api('transcribe', { data: new Uint8Array(await blob.arrayBuffer()), mime: blob.type });
          if (epoch !== this.epoch) return;
          if (text) await this.send(text, epoch);
        }
        if (epoch === this.epoch && this.continuous) await this.record(epoch);
        else if (epoch === this.epoch) { this.active = false; this.status('Micro éteint'); }
      } catch (e) { if (epoch === this.epoch) { this.notify(e.message, true); await this.stop(); } }
    });
    recorder.start(250); this.status(this.continuous ? 'Écoute continue · arrêt à tout moment' : 'À l’écoute · relâchez pour envoyer', true);
    this.limit = setTimeout(() => this.finish(), 30000);
    if (this.continuous) {
      this.audioContext = new AudioContext(); const analyser = this.audioContext.createAnalyser(); analyser.fftSize = 1024;
      this.audioContext.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize); let lastVoice = performance.now();
      this.vad = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, x) => sum + ((x - 128) / 128) ** 2, 0) / data.length);
        if (rms > 0.035) { this.heard = true; lastVoice = performance.now(); }
        if (this.heard && performance.now() - lastVoice > 1200) this.finish();
      }, 80);
    }
  }
  async finish() {
    clearInterval(this.vad); clearTimeout(this.limit);
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }
  async send(text, epoch = this.epoch) {
    if (this.busy || this.peer) return;
    this.busy = true; this.answer = ''; this.transcript.textContent = text; this.reply.textContent = '';
    this.status('Capri réfléchit…');
    try {
      const answer = await this.api('chat', { text, scope: this.config().activeProject });
      if (epoch !== this.epoch) return;
      this.reply.textContent = answer; this.answer = answer;
      if (this.config().speech.speakReplies && this.config().speech.output !== 'none') {
        this.status('Préparation de la voix…');
        const audio = await this.api('speak', answer.slice(0, 4000));
        if (epoch !== this.epoch || !audio) return;
        this.audioUrl = URL.createObjectURL(new Blob([audio.data], { type: audio.mime }));
        this.audio = new Audio(this.audioUrl); this.status('Capri parle…');
        await new Promise((resolve, reject) => { this.audio.onended = resolve; this.audio.onerror = () => reject(new Error('Lecture audio impossible.')); this.audio.play().catch(reject); this.playbackDone = resolve; });
        URL.revokeObjectURL(this.audioUrl); this.audioUrl = null; this.audio = null;
      }
      if (epoch === this.epoch) this.status('Micro éteint');
    } finally { if (epoch === this.epoch) this.busy = false; }
  }
  async realtime(epoch) {
    this.status('Connexion OpenAI Realtime…');
    const session = await this.api('realtime');
    if (epoch !== this.epoch) return;
    const mic = this.config().speech.microphone;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: mic ? { deviceId: { exact: mic }, echoCancellation: true } : true });
    if (epoch !== this.epoch) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream; this.peer = new RTCPeerConnection(); const peer = this.peer;
    this.remote = new Audio(); this.remote.autoplay = true;
    peer.ontrack = (e) => { if (epoch !== this.epoch || !this.remote) return; this.remote.srcObject = e.streams[0]; this.remote.play().catch(() => this.notify('Cliquez sur « Activer le son ».')); };
    stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
    const channel = peer.createDataChannel('oai-events'); this.channel = channel;
    const users = new Map(); const responses = new Map(); const answers = new Map(); let latestUser = '';
    const flush = run(async (id) => {
      if (epoch !== this.epoch || !users.get(id) || !answers.get(id)) return;
      const user = users.get(id); const answer = answers.get(id); users.delete(id); answers.delete(id);
      await this.api('voicePair', { scope: session.scope, user: user.slice(0, 6000), answer: answer.slice(0, 6000) });
    });
    channel.onmessage = (event) => {
      if (epoch !== this.epoch) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'error') { this.notify('OpenAI Realtime a refusé une opération. Vérifiez le modèle, la voix et le quota.', true); return; }
        if (message.type === 'input_audio_buffer.committed') latestUser = message.item_id;
        if (message.type === 'conversation.item.input_audio_transcription.completed') {
          users.set(message.item_id, message.transcript || ''); this.transcript.textContent = message.transcript || ''; flush(message.item_id);
        }
        if (message.type === 'response.created') { responses.set(message.response.id, latestUser); this.answer = ''; }
        if (['response.output_audio_transcript.delta', 'response.audio_transcript.delta', 'response.output_text.delta'].includes(message.type)) {
          this.answer += message.delta || ''; this.reply.textContent = this.answer;
        }
        if (message.type === 'response.done' && message.response.status === 'completed') {
          const answer = (message.response.output || []).flatMap((o) => o.content || []).map((c) => c.transcript || c.text || '').join('\n') || this.answer;
          const id = responses.get(message.response.id); responses.delete(message.response.id);
          if (id && answer) { answers.set(id, answer); flush(id); }
        }
      } catch { this.notify('Événement vocal illisible.', true); }
    };
    channel.onopen = () => {
      for (const m of session.history) channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: m.role,
        content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.content }] } }));
      this.status('OpenAI Realtime · micro actif', true);
    };
    peer.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(peer.connectionState) && epoch === this.epoch) { this.notify('Conversation Realtime interrompue.', true); this.stop(); } };
    const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
    this.connectionAbort = new AbortController();
    const response = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp,
      headers: { authorization: `Bearer ${session.value}`, 'content-type': 'application/sdp' }, signal: this.connectionAbort.signal });
    if (!response.ok) throw new Error(`OpenAI Realtime : HTTP ${response.status}.`);
    if (epoch !== this.epoch) return;
    await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
  }
}
