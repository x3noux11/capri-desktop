import { el, button, actions, hint, card, field, select, row, setErrorHandler, run } from './ui.js';
import { CloudVoice } from './cloud-voice.js';

const desk = window.desk;
const content = document.querySelector('#content');
const status = document.querySelector('#status');
const tabs = [
  ['general', '01', 'Général'], ['ai', '02', 'IA & connexions'], ['voice', '03', 'Voix'], ['memory', '04', 'Mémoire'],
  ['projects', '05', 'Projets'], ['routines', '06', 'Routines'], ['activity', '07', 'Reprise & tâches'],
  ['control', '08', 'Guidage & contrôle'], ['focus', '09', 'Concentration'], ['appearance', '10', 'Apparence'],
  ['performance', '11', 'Performances'], ['diagnostics', '12', 'Diagnostic'],
];
let state; let cfg; let route = location.hash.slice(1) || 'general'; let renderId = 0;
let memoryScope = null; let routineDraft = null; let routineResult = null; let controlTarget = ''; let captured = null; let guidePoint = null;
let toastTimer;
let remoteHeld = false;
function notify(message, error = false) {
  clearTimeout(toastTimer); status.textContent = message; status.classList.toggle('error', error);
  toastTimer = setTimeout(() => { status.textContent = ''; }, error ? 15000 : 6000);
}
setErrorHandler((e) => notify(e.message || String(e), true));
async function api(name, request) {
  const result = await desk[name](request);
  if (!result.ok) throw new Error(result.error || 'Opération impossible.');
  return result.value;
}
const voice = new CloudVoice({ api, config: () => cfg, notify });
async function save(patch, redraw = true) {
  cfg = await api('config', patch);
  notify('Enregistré.'); if (redraw) await render(); return cfg;
}
const input = (value = '', attrs = {}) => el('input', { value, ...attrs });
const textArea = (value = '', max = 2000) => el('textarea', { maxlength: String(max), value });
const scopeName = (id) => id ? cfg.projects.find((p) => p.id === id)?.name || 'Projet supprimé' : 'Général';
const scopeOptions = () => [['', 'Conversation générale'], ...cfg.projects.map((p) => [p.id, p.name])];
const badge = (value, good = false) => el('span', { class: `badge${good ? ' good' : ''}` }, value);
function checkbox(label, checked, change) {
  const control = input('', { type: 'checkbox', checked, onchange: run(() => change(control.checked)) });
  return el('label', { class: 'check' }, control, label);
}
async function confirm(title, detail) {
  const d = document.querySelector('#confirm');
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-detail').textContent = detail;
  d.returnValue = 'cancel'; d.oncancel = () => { d.returnValue = 'cancel'; };
  d.showModal(); return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true }));
}
async function navigate(tab) {
  if (!tabs.some(([id]) => id === tab)) tab = 'general';
  if (route === 'voice' && tab !== route) await voice.stop();
  route = tab; location.hash = tab; await render();
}
function updateScope() {
  const scope = document.querySelector('#scope'); scope.replaceChildren(...scopeOptions().map(([id, name]) => el('option', { value: id, selected: id === cfg.activeProject }, name)));
}
document.querySelector('#scope').addEventListener('change', run(async (e) => { await voice.stop(); await save({ activeProject: e.target.value }); }));
async function refresh() { state = await api('state'); cfg = state.config; updateScope(); return state; }
async function render() {
  if (!cfg) return;
  const epoch = ++renderId;
  if (!tabs.some(([id]) => id === route)) route = 'general';
  document.querySelector('#page-title').textContent = tabs.find(([id]) => id === route)[2];
  document.querySelector('#navigation').replaceChildren(...tabs.map(([id, index, label]) => button('', () => navigate(id), id === route ? 'active' : '',
    { 'data-tab': id, 'aria-current': id === route ? 'page' : 'false' })));
  [...document.querySelector('#navigation').children].forEach((node, i) => node.append(el('span', { class: 'nav-icon' }, tabs[i][1]), tabs[i][2]));
  document.documentElement.style.setProperty('--accent', cfg.appearance.accent); updateScope();
  document.querySelector('#desktop-status').textContent = [state.system.distribution, state.system.session].filter(Boolean).join(' / ');
  document.querySelector('#storage-status').textContent = state.keyStorage.persistent ? 'Clés : trousseau chiffré' : 'Clés : session uniquement sans trousseau sûr';
  const node = await views[route]();
  if (epoch !== renderId) return;
  content.replaceChildren(node);
  if (route === 'voice') voice.mount(document.querySelector('#voice-live'));
  window.studioReady = true;
}

const views = {
  general() {
    const root = el('div');
    root.append(el('section', { class: 'card hero' }, el('div', {}, el('p', { class: 'eyebrow' }, 'UNE PLACE POUR VOTRE COMPAGNON'),
      el('h2', {}, cfg.userName ? `Bienvenue, ${cfg.userName}.` : 'Faites comme chez vous.'),
      el('p', {}, 'Une voix, une mémoire et votre bureau à portée de main.'), actions(button('Parler avec Capri', () => navigate('voice'), 'primary'), button('Reprendre ma session', () => navigate('activity')))),
      el('img', { src: '../../assets/capri/capri-face.png', alt: 'Capri' })));
    const facts = cfg.memories.length + cfg.projects.reduce((n, p) => n + p.memories.length, 0);
    root.append(el('div', { class: 'stats' }, ...[[cfg.projects.length, 'PROJETS'], [facts, 'SOUVENIRS'], [cfg.routines.length, 'ROUTINES']].map(([n, label]) => el('div', { class: 'stat' }, el('span', {}, label), el('strong', {}, n)))));
    const name = input(cfg.userName, { maxlength: '24', id: 'user-name' });
    const persona = textArea(cfg.persona, 500);
    const language = select(cfg.lang, [['auto', 'Langue du système'], ['fr', 'Français'], ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['ru', 'Русский']]);
    root.append(card('Faisons connaissance', field('Comment vous appeler ?', name), field('Comment souhaitez-vous que Capri vous parle ?', persona),
      field('Langue de Capri', language), actions(button('Enregistrer', () => save({ userName: name.value.trim(), persona: persona.value.trim(), lang: language.value }), 'primary', { id: 'save-general' }))));
    root.append(card('À portée de main', actions(button('Visite guidée', () => api('command', { name: 'companionTour' })), button('Palette de commandes · Ctrl K', openPalette), button('Diagnostic', () => navigate('diagnostics'))),
      hint('Pour le lancement automatique sous Hyprland, ajoutez « exec-once = capri » à votre configuration. Les raccourcis peuvent aussi être réservés dans Hyprland.')));
    return root;
  },
  ai() {
    const provider = select(cfg.provider, state.providers.map((p) => [p.id, p.label]), { id: 'ai-provider' });
    const key = input('', { type: 'password', autocomplete: 'new-password', placeholder: 'Laisser vide pour garder la clé actuelle', id: 'ai-key' });
    const url = input(cfg.customUrl, { placeholder: 'http://127.0.0.1:1234/v1', id: 'ai-url' });
    const model = input(cfg.chatModel || '', { placeholder: 'Automatique si vide', id: 'ai-model', list: 'ai-models' });
    const modelList = el('datalist', { id: 'ai-models' }); const result = el('div', { id: 'ai-result', class: 'preview' });
    const test = async () => { const r = await api('testProvider'); modelList.replaceChildren(...r.models.slice(0, 300).map((m) => el('option', { value: m })));
      result.textContent = `${r.local ? 'IA locale' : 'Fournisseur en ligne'} · ${r.models.length} modèle(s) disponibles.\n${r.models.slice(0, 8).join(', ')}`; };
    return el('div', {}, card('Le moteur de vos conversations', hint('Le fournisseur de discussion est indépendant de la transcription et de la voix. La mémoire du projet actif accompagne vos prochains échanges.'),
      field('Fournisseur', provider), field('Clé API', key), field('Adresse du serveur personnalisé', url),
      actions(button('Connecter et vérifier', async () => {
        const r = await api('provider', { provider: provider.value, ...(key.value.trim() && { key: key.value.trim() }), ...(url.value.trim() && { url: url.value.trim() }) });
        key.value = ''; if (!r.ok) throw new Error(r.error); await refresh(); await render(); notify('Connexion vérifiée et enregistrée.');
      }, 'primary', { id: 'ai-connect' }), button('Tester la connexion actuelle', test, '', { id: 'ai-test' })), result),
      card('Modèle', field('Nom du modèle', model), modelList, actions(button('Enregistrer le modèle', () => save({ chatModel: model.value.trim() || null }), 'primary'))),
      card('Stockage des clés', hint(`${state.keyStorage.persistent ? 'Un trousseau chiffré est disponible.' : 'Sans trousseau sûr, les nouvelles clés restent uniquement en mémoire pour cette session.'} Les clés ne sont jamais affichées ni incluses dans les exports de souvenirs.`),
        hint(`Fournisseurs configurés : ${state.keys.join(', ') || 'aucun'}.`)));
  },
  async voice() {
    const s = cfg.speech;
    const mode = select(s.mode, [['push', 'Maintenir pour parler'], ['continuous', 'Écoute continue avec pauses'], ['realtime', 'OpenAI Realtime · conversation directe']], { id: 'speech-mode' });
    const source = select(s.input, [['openai', 'OpenAI'], ['groq', 'Groq']], { id: 'speech-input' });
    const sourceModel = input(s.inputModel, { id: 'speech-input-model' });
    source.addEventListener('change', () => { sourceModel.value = source.value === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1'; });
    const output = select(s.output, [['openai', 'OpenAI'], ['elevenlabs', 'ElevenLabs'], ['azure', 'Azure Speech'], ['none', 'Réponses écrites uniquement']], { id: 'speech-output' });
    const outputModel = input(s.outputModel, { id: 'speech-output-model' });
    output.addEventListener('change', () => { if (output.value === 'elevenlabs') outputModel.value = 'eleven_multilingual_v2'; else if (output.value === 'openai') outputModel.value = 'gpt-4o-mini-tts'; });
    const voiceName = input(s.voice, { id: 'speech-voice' }); const eleven = input(s.elevenVoice, { placeholder: 'Identifiant fourni par ElevenLabs' });
    const region = input(s.azureRegion); const azure = input(s.azureVoice);
    let devices = []; try { devices = await navigator.mediaDevices.enumerateDevices(); } catch { /* text fallback stays usable */ }
    const microphones = select(s.microphone, [['', 'Microphone par défaut'], ...devices.filter((d) => d.kind === 'audioinput').map((d, i) => [d.deviceId, d.label || `Microphone ${i + 1}`])]);
    const rate = input(s.rate, { type: 'number', min: '0.5', max: '2', step: '0.1' });
    const read = input('', { type: 'checkbox', checked: s.speakReplies });
    const keyProvider = select('openai', [['openai', 'OpenAI'], ['groq', 'Groq'], ['elevenlabs', 'ElevenLabs'], ['azure', 'Azure Speech']]);
    const key = input('', { type: 'password', autocomplete: 'new-password', placeholder: 'Clé du fournisseur vocal', id: 'speech-key' });
    const saveSpeech = async () => { await voice.stop(); await save({ speech: { input: source.value, inputModel: sourceModel.value.trim(), output: output.value,
      outputModel: outputModel.value.trim(), voice: voiceName.value.trim(), elevenVoice: eleven.value.trim(), azureRegion: region.value.trim(), azureVoice: azure.value.trim(),
      mode: mode.value, microphone: microphones.value, speakReplies: read.checked, rate: Number(rate.value) } }); };
    return el('div', {}, card('Conversation vocale', el('div', { id: 'voice-live' })),
      card('Votre configuration vocale', field('Mode', mode), field('Microphone', microphones),
        hint('OpenAI Realtime utilise directement OpenAI pour l’écoute et la voix. Les deux autres modes utilisent les fournisseurs ci-dessous, puis votre modèle de discussion.'),
        el('div', { class: 'grid' }, el('div', {}, field('Transcription', source), field('Modèle de transcription', sourceModel)),
          el('div', {}, field('Synthèse vocale', output), field('Modèle de synthèse', outputModel))),
        field('Voix OpenAI / Realtime', voiceName), field('Identifiant de voix ElevenLabs', eleven),
        el('div', { class: 'grid' }, field('Région Azure', region), field('Voix Azure', azure)), field('Vitesse (OpenAI / Azure)', rate),
        el('label', { class: 'check' }, read, 'Lire les réponses à voix haute'),
        actions(button('Enregistrer la voix', saveSpeech, 'primary', { id: 'save-speech' }), button('Écouter un exemple', async () => {
          await voice.stop(); const audio = await api('speak', 'Salut, c’est Capri. On reprend là où on en était ?');
          if (audio) {
            voice.audioUrl = URL.createObjectURL(new Blob([audio.data], { type: audio.mime })); voice.audio = new Audio(voice.audioUrl);
            voice.audio.onended = () => { URL.revokeObjectURL(voice.audioUrl); voice.audioUrl = null; voice.audio = null; };
            await voice.audio.play();
          }
        }))),
      card('Clés et vérification', field('Fournisseur à configurer', keyProvider), field('Clé API', key),
        actions(button('Enregistrer la clé', async () => { const r = await api('key', { provider: keyProvider.value, key: key.value }); key.value = ''; await refresh(); notify(r.storage === 'session' ? 'Clé conservée pour cette session.' : 'Clé chiffrée dans le trousseau.'); }, 'primary'),
          button('Tester ce fournisseur', async () => { await api('speechTest', keyProvider.value); notify('Fournisseur vocal accessible.'); })),
        hint('Les appels vocaux peuvent consommer le quota du fournisseur choisi. Aucune clé ni aucun audio ne sont inclus dans les exports de souvenirs.')));
  },
  memory() {
    const scope = validMemoryScope(); const scopeSelect = select(scope, [['', 'Souvenirs généraux'], ...cfg.projects.map((p) => [p.id, p.name])], { id: 'memory-scope' });
    scopeSelect.addEventListener('change', () => { memoryScope = scopeSelect.value; render(); });
    const items = scope ? cfg.projects.find((p) => p.id === scope).memories : cfg.memories;
    const query = input('', { type: 'search', placeholder: 'Rechercher dans les souvenirs…', class: 'list-search', id: 'memory-search' });
    const list = el('div', { id: 'memory-list' });
    const write = (memories) => save(scope ? { projects: cfg.projects.map((p) => p.id === scope ? { ...p, memories } : p) } : { memories });
    const show = () => {
      const rows = items.map((text, index) => ({ text, index })).filter((m) => m.text.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()));
      list.replaceChildren(...rows.map(({ text, index }) => {
        const edit = input(text, { maxlength: '200', 'aria-label': `Souvenir ${index + 1}` });
        return row(edit, button('Enregistrer', () => { const value = edit.value.trim(); if (!value) throw new Error('Écrivez un souvenir.'); return write(items.map((m, i) => i === index ? value : m)); }, 'small'),
          button('Supprimer', async () => { if (await confirm('Supprimer ce souvenir ?', text)) await write(items.filter((_m, i) => i !== index)); }, 'small danger'));
      }), ...(!rows.length ? [el('div', { class: 'empty' }, 'Aucun souvenir à afficher.')] : []));
    };
    query.addEventListener('input', show); show();
    const add = input('', { placeholder: 'Une préférence, une décision, un détail à retenir…', maxlength: '200', id: 'memory-new' });
    return el('div', {}, card('Ce que Capri garde en mémoire', field('Portée', scopeSelect),
      hint('Les souvenirs généraux accompagnent tous les projets. Seuls les souvenirs du projet actif sont ajoutés à ses conversations.'),
      badge(`${scopeName(scope)} · ${items.length} / 30`), query, list, field('Ajouter un souvenir', add),
      actions(button('Ajouter', () => { const value = add.value.trim(); if (!value) throw new Error('Écrivez un souvenir.'); if (items.length >= 30) throw new Error('30 souvenirs maximum.'); return write([...new Set([...items, value])]); }, 'primary', { id: 'memory-add' }))),
      card('Vos données restent sous votre contrôle', hint('L’export contient uniquement les souvenirs généraux et ceux des projets. L’import fusionne les faits après un aperçu, sans importer de clés ni de commandes.'),
        actions(button('Exporter les souvenirs', async () => { if (await api('memoryExport')) notify('Export enregistré.'); }), button('Importer un fichier', async () => {
          const p = await api('memoryImportPreview'); if (!p) return;
          if (await confirm('Fusionner ces souvenirs ?', `Souvenirs généraux après fusion : ${p.memories}\n${p.projects.map((s) => `${s.name} : ${s.count}`).join('\n')}`)) { cfg = await api('memoryImport', p.token); await render(); notify('Souvenirs importés.'); }
        }))));
  },
  projects() {
    const name = input('', { placeholder: 'Nom du projet', maxlength: '80', id: 'project-new' });
    const root = el('div', {}, card('Un contexte pour chaque projet', hint('Sélectionner un projet retrouve sa conversation et ses souvenirs. La sélection ne change pas le dossier de Claude Code.'),
      field('Nouveau projet', name), actions(button('Créer le projet', () => { const value = name.value.trim(); if (!value) throw new Error('Donnez un nom au projet.');
        return save({ projects: [...cfg.projects, { id: crypto.randomUUID(), name: value, memories: [] }] }); }, 'primary', { id: 'project-create' }))));
    for (const p of cfg.projects) {
      const edit = input(p.name, { maxlength: '80', 'aria-label': `Nom de ${p.name}` });
      root.append(card(p.name, badge(p.id === cfg.activeProject ? 'Projet actif' : `${p.memories.length} souvenir(s)`, p.id === cfg.activeProject), field('Nom', edit),
        actions(button('Activer', () => save({ activeProject: p.id }), 'primary'), button('Enregistrer le nom', () => save({ projects: cfg.projects.map((q) => q.id === p.id ? { ...q, name: edit.value.trim() } : q) })),
          button('Souvenirs', () => { memoryScope = p.id; return navigate('memory'); }),
          button('Supprimer', async () => { if (await confirm(`Supprimer « ${p.name} » ?`, 'Ses souvenirs, sa conversation et ses tâches locales seront effacés, ainsi que leurs sauvegardes de récupération.')) await save({ projects: cfg.projects.filter((q) => q.id !== p.id), activeProject: cfg.activeProject === p.id ? '' : cfg.activeProject }); }, 'danger'))));
    }
    return root;
  },
  routines() {
    const picker = select(routineDraft?.id || '', [['', 'Choisir une routine'], ...cfg.routines.map((r) => [r.id, r.name])], { id: 'routine-select' });
    picker.addEventListener('change', () => { routineDraft = structuredClone(cfg.routines.find((r) => r.id === picker.value) || null); render(); });
    const root = el('div', {}, card('Votre bureau, prêt à travailler', hint('Créez une routine d’applications et d’espaces Hyprland. Glissez les cartes pour réordonner les étapes, ou utilisez les flèches.'),
      field('Routine', picker), actions(button('Nouvelle routine', () => { if (cfg.routines.length >= 12) throw new Error('12 routines maximum.'); routineDraft = { id: crypto.randomUUID(), name: 'Nouvelle routine', steps: [] }; render(); }, 'primary', { id: 'routine-new' }))));
    if (!routineDraft) return root;
    const draft = routineDraft; const name = input(draft.name, { maxlength: '80', id: 'routine-name', oninput: (e) => { draft.name = e.target.value; } });
    const board = el('div', { class: 'board', id: 'routine-board' });
    const move = (from, to) => { if (to < 0 || to >= draft.steps.length) return; const [step] = draft.steps.splice(from, 1); draft.steps.splice(to, 0, step); render(); };
    draft.steps.forEach((step, i) => {
      const workspace = input(step.workspace, { type: 'number', min: '1', max: '99', 'aria-label': 'Espace de travail', onchange: (e) => { step.workspace = Number(e.target.value); } });
      const node = el('article', { class: 'step', draggable: true, ondragstart: (e) => e.dataTransfer.setData('text/plain', String(i)),
        ondragover: (e) => { e.preventDefault(); node.classList.add('drag-over'); }, ondragleave: () => node.classList.remove('drag-over'),
        ondrop: (e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(from) && from >= 0 && from < draft.steps.length) move(from, i); } },
        el('header', {}, el('strong', {}, `${i + 1}. ${state.apps.find((a) => a.id === step.desktopId)?.name || step.desktopId}`)), field('Espace', workspace),
        actions(button('↑', () => move(i, i - 1), 'small', { 'aria-label': 'Monter l’étape' }), button('↓', () => move(i, i + 1), 'small', { 'aria-label': 'Descendre l’étape' }),
          button('Retirer', () => { draft.steps.splice(i, 1); render(); }, 'small danger')));
      board.append(node);
    });
    const available = state.apps.filter((a) => !draft.steps.some((s) => s.desktopId === a.id));
    const appPicker = select('', [['', 'Choisir une application installée'], ...available.map((a) => [a.id, a.name])], { id: 'routine-app' });
    const workspace = input(draft.steps.length + 1, { type: 'number', min: '1', max: '99', id: 'routine-workspace' });
    root.append(card('Éditer le plan', field('Nom', name), board,
      el('div', { class: 'grid' }, field('Application', appPicker), field('Espace de destination', workspace)),
      actions(button('Ajouter au plan', () => { if (!appPicker.value) throw new Error('Choisissez une application.'); if (draft.steps.length >= 8) throw new Error('8 étapes maximum.');
        const n = Number(workspace.value); if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error('Choisissez un espace de 1 à 99.'); draft.steps.push({ desktopId: appPicker.value, workspace: n }); render(); }, '', { id: 'routine-add-step' })),
      actions(button('Enregistrer', async () => { await save({ routines: [...cfg.routines.filter((r) => r.id !== draft.id), structuredClone(draft)] }); }, 'primary', { id: 'routine-save' }),
        button('Dupliquer', () => { if (cfg.routines.length >= 12) throw new Error('12 routines maximum.'); routineDraft = { ...structuredClone(draft), id: crypto.randomUUID(), name: `${draft.name} copie`.slice(0, 80) }; render(); }),
        button('Exécuter…', () => executeRoutine(draft), '', { id: 'routine-run' }),
        button('Supprimer', async () => { if (await confirm('Supprimer cette routine ?', draft.name)) { const id = draft.id; routineDraft = null; await save({ routines: cfg.routines.filter((r) => r.id !== id) }); } }, 'danger'))));
    if (routineResult) root.append(card('Résultat', el('p', {}, routineResult.ok ? 'Instructions envoyées à Hyprland.' : `Routine interrompue (${routineResult.code}).`),
      ...routineResult.steps.map((s) => row(`${s.name} → espace ${s.workspace}`, badge(s.ok ? s.kind === 'move' ? 'Déplacée' : 'Lancement demandé' : 'Refusé', s.ok)))));
    return root;
  },
  async activity() {
    const scope = cfg.activeProject; const data = await api('resume', scope); const summary = textArea(data.summary, 2000);
    const write = (log) => save({ worklog: [...cfg.worklog.filter((p) => p.scope !== scope), { scope, ...log }] });
    const task = input('', { placeholder: 'Une prochaine étape…', maxlength: '300', id: 'task-new' });
    return el('div', {}, card(`On en était là · ${scopeName(scope)}`, hint('Le résumé enregistré et les tâches appartiennent à cette conversation. Une génération IA utilise uniquement les derniers messages de cette portée.'),
      el('h3', {}, 'Dernière demande'), el('p', { class: 'preview' }, data.lastRequest || 'Aucun échange pour le moment.'),
      el('h3', {}, 'Dernière réponse'), el('p', { class: 'preview' }, data.lastReply || '—'), field('Résumé et décisions', summary),
      actions(button('Enregistrer le résumé', () => write({ summary: summary.value.trim(), tasks: data.tasks }), 'primary', { id: 'summary-save' }),
        button('Proposer un résumé avec mon IA', async () => { summary.value = (await api('summary', scope)).slice(0, 2000); notify('Proposition prête. Relisez-la avant de l’enregistrer.'); }))),
      card('Prochaines étapes', ...data.tasks.map((t) => row(el('label', { class: `check${t.done ? ' task-done' : ''}` }, input('', { type: 'checkbox', checked: t.done,
        onchange: run((e) => write({ summary: data.summary, tasks: data.tasks.map((q) => q.id === t.id ? { ...q, done: e.target.checked } : q) })) }), t.text),
        button('Retirer', () => write({ summary: data.summary, tasks: data.tasks.filter((q) => q.id !== t.id) }), 'small danger'))),
        field('Ajouter une tâche', task), actions(button('Ajouter', () => { const text = task.value.trim(); if (!text) throw new Error('Écrivez une tâche.'); return write({ summary: data.summary, tasks: [...data.tasks, { id: crypto.randomUUID(), text, done: false }] }); }, 'primary', { id: 'task-add' }))));
  },
  async control() {
    const windows = await api('windows');
    if (!windows.some((w) => w.id === controlTarget)) controlTarget = windows[0]?.id || '';
    const targetPicker = select(controlTarget, windows.map((w) => [w.id, `${w.name} · ${w.workspace == null ? w.id : `espace ${w.workspace} · ${w.id}`}`]), { id: 'control-window' });
    targetPicker.addEventListener('change', () => { controlTarget = targetPicker.value; captured = guidePoint = null; render(); });
    const target = windows.find((w) => w.id === controlTarget);
    const action = select('click', [['click', 'Clic gauche'], ['rightClick', 'Clic droit'], ['type', 'Saisir du texte'], ['key', 'Raccourci clavier'], ['scroll', 'Faire défiler']], { id: 'control-action' });
    const x = input(guidePoint?.x == null ? 50 : Math.round(guidePoint.x * 100), { type: 'number', min: '0', max: '100', id: 'control-x' });
    const y = input(guidePoint?.y == null ? 50 : Math.round(guidePoint.y * 100), { type: 'number', min: '0', max: '100', id: 'control-y' });
    const text = textArea('', 2000); const key = select('Enter', ['Enter', 'Escape', 'Tab', 'Backspace', 'Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+L', 'Ctrl+Z'].map((v) => [v, v]));
    const amount = input(3, { type: 'number', min: '-10', max: '10' });
    const question = input('', { placeholder: 'Ex. Où activer le mode sombre ?', maxlength: '1000', id: 'guide-question' });
    const root = el('div', {}, card('Une fenêtre, une action à la fois', hint('Choisissez une fenêtre visible. La cible et sa position sont vérifiées à nouveau au moment de l’action. Arrêt immédiat : Ctrl Alt Échap ou capri --stop-control.'),
      state.input.ready ? badge('Contrôle disponible', true) : hint('Le contrôle nécessite Hyprland, ydotool et son service configuré. Le diagnostic donne les prérequis.'),
      field('Fenêtre', targetPicker), actions(button('Actualiser les fenêtres', async () => { await refresh(); await render(); }), button('Tout arrêter', () => api('stop'), 'danger', { id: 'control-stop' }))));
    const captureCard = card('Voir et guider', hint('La capture reste en mémoire. Seul le bouton « Analyser » envoie cette image à votre fournisseur de discussion, qui doit accepter les images.'),
      actions(button('Capturer la fenêtre choisie', async () => { if (!target) throw new Error('Choisissez une fenêtre.'); captured = await api('capture', target); guidePoint = null; await render(); }, '', { id: 'window-capture' })));
    if (captured) {
      const image = el('img', { src: `data:image/jpeg;base64,${captured.image}`, alt: 'Capture de la fenêtre choisie' });
      const preview = el('div', { class: 'capture' }, image);
      preview.addEventListener('click', (e) => { const r = image.getBoundingClientRect(); x.value = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) * 100 / r.width))); y.value = Math.round(Math.max(0, Math.min(100, (e.clientY - r.top) * 100 / r.height))); });
      if (guidePoint?.x != null) { const marker = el('span', { class: 'marker' }); marker.style.left = `${guidePoint.x * 100}%`; marker.style.top = `${guidePoint.y * 100}%`; preview.append(marker); }
      captureCard.append(preview, field('Ce que vous cherchez', question), actions(button('Analyser avec mon IA', async () => {
        if (!await confirm('Envoyer cette capture à votre IA ?', `Fournisseur : ${cfg.provider}\nDemande : ${question.value}`)) return;
        guidePoint = await api('guide', { token: captured.token, question: question.value }); await render();
      }, 'primary', { id: 'window-guide' })), guidePoint ? el('p', { class: 'preview' }, guidePoint.explanation) : null);
    }
    root.append(captureCard, card('Préparer une interaction', field('Action', action), el('div', { class: 'grid' }, field('X dans la fenêtre (%)', x), field('Y dans la fenêtre (%)', y)),
      hint('Vous pouvez cliquer dans la capture pour choisir X et Y. La saisie colle le texte pour respecter les accents et le clavier, puis restaure le presse-papiers s’il n’a pas changé.'), field('Texte à saisir', text), field('Raccourci', key), field('Défilement (−10 à 10)', amount),
      actions(button('Vérifier puis exécuter…', async () => {
        if (!target) throw new Error('Choisissez une fenêtre.');
        const data = { x: Number(x.value) / 100, y: Number(y.value) / 100, text: text.value, key: key.value, amount: Number(amount.value) };
        const p = await api('prepareInput', { target, action: action.value, data });
        const detail = `${target.name} · ${target.id}\nAction : ${action.options[action.selectedIndex].text}\n${action.value === 'type' ? data.text : action.value === 'key' ? data.key : `Position : ${x.value} %, ${y.value} %${action.value === 'scroll' ? ` · ${data.amount} crans` : ''}`}\n\nCet aperçu expire dans 30 secondes. La fenêtre ne doit pas bouger.`;
        if (await confirm('Appliquer à cette fenêtre ?', detail)) { await api('executeInput', p.token); notify('Action envoyée à la fenêtre choisie.'); }
      }, 'primary', { id: 'control-prepare' }))));
    return root;
  },
  focus() {
    const focus = cfg.focus; const work = input(focus.workMinutes, { type: 'number', min: '1', max: '180' }); const rest = input(focus.breakMinutes, { type: 'number', min: '1', max: '60' });
    const start = (phase) => save({ focus: { ...focus, workMinutes: Number(work.value), breakMinutes: Number(rest.value), phase,
      until: Date.now() + Number(phase === 'work' ? work.value : rest.value) * 60000 } });
    return el('div', {}, card('Un peu de place pour se concentrer', hint('Pendant le travail : animations réduites, déplacements et réactions spontanées suspendus, sons discrets et notifications importantes seulement. Vos réglages habituels reviennent à la fin.'),
      badge(focus.until > Date.now() ? focus.phase === 'work' ? 'Session en cours' : 'Pause en cours' : 'Au repos', focus.until > Date.now()),
      el('div', { class: 'timer', id: 'focus-timer', 'data-until': focus.until }, timerLabel(focus.until)),
      el('div', { class: 'grid' }, field('Travail (minutes)', work), field('Pause (minutes)', rest)),
      actions(button('Commencer le travail', () => start('work'), 'primary', { id: 'focus-start' }), button('Prendre une pause', () => start('break')), button('Arrêter', () => save({ focus: { ...focus, until: 0 } }), 'danger', { id: 'focus-stop' }))),
      card('Notifications', field('Notifications du bureau', select(cfg.notificationMode, [['all', 'Toutes'], ['important', 'Importantes uniquement'], ['off', 'Aucune']], { onchange: run((e) => save({ notificationMode: e.target.value })) })), hint('Les demandes de permission dans les assistants restent visibles.')));
  },
  appearance() {
    const accent = input(cfg.appearance.accent, { type: 'color', id: 'appearance-accent' });
    const opacity = input(cfg.appearance.panelOpacity, { type: 'range', min: '0.5', max: '1', step: '0.01' });
    const intensity = input(cfg.appearance.effectIntensity, { type: 'range', min: '0', max: '1', step: '0.05' });
    const scale = input(cfg.scale, { type: 'range', min: '0.2', max: '2', step: '0.05' });
    const volume = input(cfg.volume, { type: 'range', min: '0', max: '1', step: '0.05' });
    const motion = select(cfg.motion, [['auto', 'Comme le système'], ['full', 'Toutes'], ['reduced', 'Réduites']]);
    const name = input('', { placeholder: 'Nom du profil', maxlength: '80' });
    const values = () => ({ appearance: { accent: accent.value, panelOpacity: Number(opacity.value), effectIntensity: Number(intensity.value) }, scale: Number(scale.value), volume: Number(volume.value), motion: motion.value });
    return el('div', {}, card('À votre image', field('Couleur d’accent des panneaux', accent), checkbox('Suivre les couleurs du bureau lorsqu’elles sont disponibles', cfg.riceColors, (v) => save({ riceColors: v })),
      field('Opacité des panneaux', opacity), field('Intensité des effets', intensity), field('Taille de Capri', scale), field('Volume des sons', volume), field('Animations', motion),
      actions(button('Appliquer', () => save(values()), 'primary', { id: 'appearance-save' }), button('Placer à gauche', () => api('command', { name: 'place', side: 'left' })), button('Placer à droite', () => api('command', { name: 'place', side: 'right' }))),
      checkbox('Couper les sons', cfg.muted, (v) => save({ muted: v }))),
      card('Profils enregistrés', ...cfg.appearanceProfiles.map((p) => row(p.name,
        button('Appliquer', () => save({ appearance: p.appearance, scale: p.scale, volume: p.volume, motion: p.motion }), 'small'),
        button('Supprimer', () => save({ appearanceProfiles: cfg.appearanceProfiles.filter((q) => q.id !== p.id) }), 'small danger'))),
        field('Enregistrer ces réglages dans un profil', name), actions(button('Créer le profil', () => { if (!name.value.trim()) throw new Error('Donnez un nom au profil.');
          return save({ appearanceProfiles: [...cfg.appearanceProfiles, { id: crypto.randomUUID(), name: name.value.trim(), ...values() }] }); }, '', { id: 'profile-save' }))));
  },
  performance() {
    const profile = select(cfg.performanceProfile, [['balanced', 'Équilibré'], ['eco', 'Économie'], ['quiet', 'Discret'], ['auto', 'Automatique selon la batterie']], { id: 'performance-profile' });
    const display = select(cfg.displayId == null ? '' : String(cfg.displayId), [['', 'Écran principal'], ...state.screens.map((s) => [String(s.id), s.label])]);
    return el('div', {}, card('Choisir le bon rythme', hint('Économie réduit les dessins au repos et la lecture du pointeur. Discret réduit aussi les animations et les interventions. Automatique active l’économie sur batterie.'),
      field('Profil', profile), actions(button('Appliquer le profil', () => save({ performanceProfile: profile.value }), 'primary', { id: 'performance-save' })),
      checkbox('Économie de ressources supplémentaire', cfg.lowPower, (v) => save({ lowPower: v })), checkbox('Laisser Capri se déplacer', cfg.wander, (v) => save({ wander: v })),
      checkbox('Réagir à l’état du PC', cfg.pcReact, (v) => save({ pcReact: v }))),
      card('Affichage', field('Écran de Capri', display), actions(button('Choisir cet écran', () => save({ displayId: display.value ? Number(display.value) : null }))),
        checkbox('Suivre le pointeur entre les écrans', cfg.follow, (v) => save({ follow: v })), hint('Les modes OpenGL et logiciel du menu Affichage nécessitent un redémarrage de Capri.')));
  },
  async diagnostics() {
    await refresh(); const system = state.system;
    const root = el('div', {}, card('Cette session', badge(`${system.distribution} · ${system.session}`), hint(`Capri ${system.appVersion} · Electron ${system.electronVersion}`),
      actions(button('Actualiser', () => render(), 'primary', { id: 'diagnostics-refresh' }), button('Copier le diagnostic', async () => { await api('copy', JSON.stringify({ ...system, input: state.input }, null, 2)); notify('Diagnostic copié.'); }))));
    root.append(card('Fonctions disponibles', ...Object.entries(system.features).map(([id, f]) => row(el('div', {}, el('strong', {}, system.text?.features?.[id] || featureName(id)),
      f.reason ? hint(system.text?.reasons?.[f.reason] || f.reason) : null), badge(f.status === 'supported' ? 'Disponible' : f.status === 'conditional' ? 'À vérifier' : 'Indisponible', f.status === 'supported')))));
    root.append(card('Contrôle des fenêtres', row('Session Hyprland', badge(state.input.session ? 'Oui' : 'Non', state.input.session)),
      row('ydotool installé', badge(state.input.tool ? 'Oui' : 'Non', state.input.tool)), row('Socket ydotoold disponible', badge(state.input.daemon ? 'Oui' : 'Non', state.input.daemon)),
      row('Captures avec grim', badge(state.input.capture ? 'Oui' : 'Non', state.input.capture)),
      hint('ydotoold doit déjà être configuré avec les droits sur /dev/uinput. Capri ne lance pas de service privilégié. Renseignez YDOTOOL_SOCKET si votre service utilise un autre socket.')));
    const commands = ['sudo pacman -S --needed xorg-xwayland grim glib2 playerctl wireplumber wl-clipboard ydotool', 'hyprctl version', 'command -v grim gio playerctl wpctl ydotool', 'exec-once = capri'];
    root.append(card('Commandes utiles sur CachyOS / Arch', hint('Ces commandes sont proposées pour être copiées. Vérifiez le service ydotool fourni par votre distribution et votre configuration Hyprland.'),
      ...commands.map((command) => row(el('code', { class: 'diagnostic-command' }, command), button('Copier', () => api('copy', command), 'small')))));
    return root;
  },
};
function validMemoryScope() { const scope = memoryScope ?? cfg.activeProject; return scope && !cfg.projects.some((p) => p.id === scope) ? '' : scope; }
function featureName(id) { return ({ overlay: 'Affichage', windowTracking: 'Suivi des fenêtres', windowControl: 'Gestion des fenêtres', screenCapture: 'Capture', appCatalog: 'Applications', media: 'Multimédia' })[id] || id; }
function timerLabel(until) { const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
async function executeRoutine(draft) {
  const saved = cfg.routines.find((r) => r.id === draft.id);
  if (!saved || JSON.stringify(saved) !== JSON.stringify(draft)) throw new Error('Enregistrez le plan avant de l’exécuter.');
  const summary = draft.steps.map((s) => `${state.apps.find((a) => a.id === s.desktopId)?.name || s.desktopId} → espace ${s.workspace}`).join('\n');
  if (!await confirm(`Exécuter « ${draft.name} » ?`, `${summary}\n\nUne fenêtre correspondante déjà ouverte sera déplacée ; sinon l’application sera lancée.`)) return;
  routineResult = await api('runRoutine', { id: draft.id, steps: draft.steps });
  await render(); if (!routineResult.ok) notify(`Routine arrêtée : ${routineResult.code}.`, true);
}

function paletteItems() {
  return [
    ...tabs.map(([id, _n, label]) => ({ label: `Ouvrir · ${label}`, action: () => navigate(id) })),
    { label: 'Retour à la conversation générale', action: () => save({ activeProject: '' }) },
    { label: 'Arrêter la voix et le contrôle', action: () => { voice.stop(); return api('stop'); } },
    { label: `Concentration · démarrer ${cfg.focus.workMinutes} minutes`, action: () => save({ focus: { ...cfg.focus, until: Date.now() + cfg.focus.workMinutes * 60000, phase: 'work' } }) },
    { label: 'Concentration · arrêter', action: () => save({ focus: { ...cfg.focus, until: 0 } }) },
    ...cfg.projects.map((p) => ({ label: `Projet · ${p.name}`, action: () => save({ activeProject: p.id }) })),
    ...cfg.routines.map((r) => ({ label: `Routine · ${r.name}`, action: async () => { routineDraft = structuredClone(r); await navigate('routines'); await executeRoutine(r); } })),
  ];
}
function openPalette() {
  const dialog = document.querySelector('#palette'); const query = document.querySelector('#palette-query'); const list = document.querySelector('#palette-list');
  const show = () => { list.replaceChildren(...paletteItems().filter((i) => i.label.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())).map((item) => button(item.label, () => { dialog.close(); return item.action(); }))); };
  query.value = ''; query.oninput = show; show(); if (!dialog.open) dialog.showModal(); query.focus();
  dialog.onkeydown = (e) => {
    const buttons = [...list.querySelectorAll('button')]; const i = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); buttons[Math.min(i + 1, buttons.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) query.focus(); else buttons[i - 1]?.focus(); }
    if (e.key === 'Enter' && document.activeElement === query) { e.preventDefault(); buttons[0]?.click(); }
  };
}
document.querySelector('#palette-open').addEventListener('click', openPalette);
document.querySelector('.brand').addEventListener('click', run(async (e) => { e.preventDefault(); await navigate('general'); }));
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { voice.stop(); api('stop').catch(() => {}); } });
setInterval(() => { const timer = document.querySelector('#focus-timer'); if (timer) timer.textContent = timerLabel(Number(timer.dataset.until)); }, 1000);
desk.onConfig((next) => {
  const changedScope = cfg && next.activeProject !== cfg.activeProject;
  cfg = next; if (changedScope) voice.stop();
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (state && (changedScope || (!editing && !voice.active && !voice.busy))) render().catch((e) => notify(e.message, true));
});
desk.onCommand(run(async (command) => {
  if (command.type === 'voiceStart') remoteHeld = true;
  if (command.type === 'voiceStop') remoteHeld = false;
  if (command.type === 'stopVoice') { remoteHeld = false; await voice.stop(false); return; }
  if (!cfg) { await refresh(); }
  if (command.type === 'navigate') { await navigate(command.tab); if (command.palette) openPalette(); }
  if (command.type === 'voiceStart') { await navigate('voice'); if (remoteHeld) { voice.held = true; await voice.start(); } }
  if (command.type === 'voiceStop') { voice.held = false; if (cfg.speech.mode === 'push') await voice.finish(); else await voice.stop(); }
}));
refresh().then(render).catch((e) => notify(e.message, true));
