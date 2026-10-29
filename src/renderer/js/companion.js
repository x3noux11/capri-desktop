// Local controls work without an AI provider. Window actions always need a fresh click.
const EN = {
  quick: 'Getting started', memory: 'My memory', windows: 'Interact with a window', power: 'Save resources',
  next: 'Next', back: 'Back', close: 'Close', done: 'Ready', setup: 'Set up my chat', custom: 'Personalize', add: 'Add', edit: 'Edit', remove: 'Delete',
  clear: 'Delete all memories', history: 'Clear conversations', yes: 'Confirm', no: 'Cancel', save: 'Save',
  empty: 'No saved memories yet.', memoryHow: 'These facts survive restarts and are included in your AI chat. You decide what I keep.',
  memoryPrompt: 'A preference, a project, something to remember…', historyHow: 'Erase all general and project conversations and their recovery backups? Your personal memories stay.',
  clearHow: 'Delete every personal memory, including the recovery backup? Your conversations stay.',
  failed: 'I could not complete that. Refresh the diagnostic or try again.', saved: 'Saved.',
  noWindows: 'No controllable windows found. Window controls require Windows or Hyprland.',
  windowHow: 'Pick a window by application and workspace. I only act after you confirm; I do not read its contents.',
  confirm: 'Apply this action to this window?', stale: 'This window is gone, changed, or the compositor refused the action.',
  focus: 'Bring to front', minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore', applied: 'Action sent to the selected window.',
  minimized: 'Put aside', workspace: 'Workspace', loading: 'Reading the window list…',
  tour: [
    ['Make yourself at home.', 'Right-click me or my tray icon to open my menu. You can reopen this guide at any time.'],
    ['Let’s get to know each other.', '“Make her yours” sets your name and personality. “My memory” lets you add, edit and delete lasting facts. Conversations also survive restarts; clear them separately.'],
    ['Your desktop, when you ask.', 'Use “Interact with a window”, or say “maximize Firefox” in chat. Choose a window, check the action and confirm. On Hyprland, minimizing puts it in special:capri-minimized; Restore brings it back.'],
    ['Ready when you are.', 'Set up the AI chat from the menu. Try “remember that I use CachyOS”, “what do you remember?” or “help”. Enable “Save resources” for fewer idle drawings. Screenshots require a separate permission.'],
  ],
};
const FR = {
  quick: 'Prise en main', memory: 'Ma mémoire', windows: 'Interagir avec une fenêtre', power: 'Économiser les ressources',
  next: 'Suivant', back: 'Retour', close: 'Fermer', done: 'Prête', setup: 'Configurer mon chat', custom: 'Personnaliser', add: 'Ajouter', edit: 'Modifier', remove: 'Supprimer',
  clear: 'Effacer tous les souvenirs', history: 'Effacer les conversations', yes: 'Confirmer', no: 'Annuler', save: 'Enregistrer',
  empty: 'Aucun souvenir enregistré pour le moment.', memoryHow: 'Ces informations persistent après redémarrage et sont transmises au modèle de ton chat. Tu choisis ce que je garde.',
  memoryPrompt: 'Une préférence, un projet, quelque chose à retenir…', historyHow: 'Effacer toutes les conversations, générales et par projet, ainsi que leurs sauvegardes ? Tes souvenirs personnels restent.',
  clearHow: 'Supprimer tous les souvenirs personnels et leur sauvegarde de récupération ? Tes conversations restent.',
  failed: 'Je n’ai pas pu terminer. Actualise le diagnostic ou réessaie.', saved: 'Enregistré.',
  noWindows: 'Aucune fenêtre contrôlable trouvée. Il faut Windows ou une session Hyprland.',
  windowHow: 'Choisis une fenêtre par application et espace de travail. J’agis après ton clic de confirmation, sans lire son contenu.',
  confirm: 'Appliquer cette action à cette fenêtre ?', stale: 'Cette fenêtre a disparu, a changé ou le compositeur a refusé l’action.',
  focus: 'Mettre devant', minimize: 'Réduire', maximize: 'Agrandir', restore: 'Restaurer', applied: 'Action envoyée à la fenêtre choisie.',
  minimized: 'Mise de côté', workspace: 'Espace', loading: 'Lecture des fenêtres…',
  tour: [
    ['Installe-toi, je te montre.', 'Clic droit sur moi ou sur mon icône pour ouvrir le menu. Tu peux reprendre cette visite quand tu veux.'],
    ['Faisons connaissance.', '« La faire tienne » règle ton nom et ma personnalité. « Ma mémoire » permet d’ajouter, corriger et supprimer des souvenirs durables. Les conversations persistent aussi ; tu peux les effacer séparément.'],
    ['Ton bureau, si tu me le demandes.', 'Choisis « Interagir avec une fenêtre » ou écris « agrandis Firefox » dans le chat. Tu choisis la fenêtre, vérifies l’action et confirmes. Sous Hyprland, Réduire la range dans special:capri-minimized ; Restaurer la ramène.'],
    ['On est prêtes.', 'Configure le chat IA dans le menu. Essaie « souviens-toi que j’utilise CachyOS », « que sais-tu de moi ? » ou « aide ». « Économiser les ressources » ralentit les dessins au repos. Les captures demandent une permission séparée.'],
  ],
};
export const companionText = (lang) => lang === 'fr' ? FR : EN;

export function localCommand(text) {
  const s = text.trim().replace(/[.!?]+\s*$/, '').trim();
  if (/^(?:param[eè]tres|settings|r[eé]glages)$/i.test(s)) return { kind: 'settingsPanel' };
  if (/^(?:mode vocal|voice mode)$/i.test(s)) return { kind: 'voicePanel' };
  if (/^(?:mes projets|my projects|projects|projets)$/i.test(s)) return { kind: 'projectPanel' };
  if (/^(?:mes routines|routines|routines hyprland)$/i.test(s)) return { kind: 'routinePanel' };
  const routine = /^(?:pr[ée]pare (?:mon |l['’])?espace|lance la routine|run routine|prepare workspace)\s+(.{1,80})$/iu.exec(s);
  if (routine) return { kind: 'routinePanel', name: routine[1] };
  if (/^(?:aide|help|prise en main|getting started)[.!?]*$/i.test(s)) return { kind: 'tour' };
  if (/^(?:ma mémoire|mes souvenirs|my memory|what do you remember|que sais-tu de moi|qu['’]est-ce que tu sais de moi|que te rappelles-tu)[.!?]*$/i.test(s)) return { kind: 'memory' };
  const match = /^(?:capri[, ]+)?(agrandis|réduis|reduis|restaure|mets devant|mets au premier plan|maximize|minimize|restore|focus)\s+(.{2,80}?)\s*[.!?]*$/iu.exec(s);
  if (!match) return null;
  const actions = { agrandis: 'maximize', réduis: 'minimize', reduis: 'minimize', restaure: 'restore', 'mets devant': 'focus', 'mets au premier plan': 'focus' };
  return { kind: 'window', action: actions[match[1].toLowerCase()] || match[1].toLowerCase(), name: match[2] };
}

export class Companion {
  constructor({ guide, host, brain, chat }) { Object.assign(this, { guide, host, brain, chat }); }
  get t() { return companionText(this.brain.lang); }
  async open(topic, options) {
    if (this.chat.open) this.guide.panel.hide(); // release chat focus before a local scene
    try {
      let followUp;
      await this.guide.scene(async () => { followUp = await this[topic](options); });
      if (followUp === 'setup') await this.guide.setup.chat();
      if (followUp === 'custom') await this.guide.custom.open();
    }
    catch { await this.guide.scene(() => this.guide.ask({ face: 'aside', line: this.t.failed, actions: this.guide.ok() })); }
  }
  async save(memories, projectId = null) {
    let patch = { memories };
    if (projectId) {
      const cfg = await this.host.getConfig();
      if (!cfg.projects.some((p) => p.id === projectId)) throw new Error('Project removed');
      patch = { projects: cfg.projects.map((p) => p.id === projectId ? { ...p, memories } : p) };
    }
    const result = await this.host.setConfig(patch);
    if (result.saveError) throw new Error('Memory was not saved');
    if (projectId) this.brain.custom.projects = result.projects;
    else this.brain.custom.memories = result.memories;
  }
  async tour() {
    let followUp;
    for (let i = 0; i < this.t.tour.length;) {
      const [line, quote] = this.t.tour[i];
      const last = i === this.t.tour.length - 1;
      const action = await this.guide.ask({ face: 'look', line, quote, badge: `${i + 1} / ${this.t.tour.length}`,
        actions: [{ id: 'next', label: last ? this.t.done : this.t.next, primary: true },
          ...(last ? [{ id: 'setup', label: this.t.setup }, { id: 'custom', label: this.t.custom }] : []),
          ...(i ? [{ id: 'back', label: this.t.back }] : []), { id: 'close', label: this.t.close }] });
      if (!action || action === 'close') return;
      if (action === 'back') i--; else { i++; followUp = action; }
    }
    await this.host.setConfig({ companionTour: true });
    return followUp;
  }
  async memory({ projectId = null } = {}) {
    const scene = this.guide.sceneId;
    let page = 0;
    for (;;) {
      const cfg = await this.host.getConfig();
      if (scene !== this.guide.sceneId) return;
      const project = projectId && cfg.projects?.find((p) => p.id === projectId);
      if (projectId && !project) return;
      const items = project ? project.memories : cfg.memories || [];
      page = Math.min(page, Math.max(0, Math.ceil(items.length / 5) - 1));
      const visible = items.slice(page * 5, page * 5 + 5);
      const action = await this.guide.ask({ face: 'smug', line: `${this.t.memory} · ${project ? project.name : this.brain.lang === 'fr' ? 'Général' : 'General'} · ${items.length} / 30`,
        quote: `${this.t.memoryHow}\n\n${visible.length ? visible.map((m, i) => `${page * 5 + i + 1}. ${m}`).join('\n') : this.t.empty}`,
        actions: [...visible.map((_m, i) => ({ id: `item:${i}`, label: `${this.t.edit} ${page * 5 + i + 1}` })),
          ...(items.length < 30 ? [{ id: 'add', label: this.t.add, primary: true }] : []),
          ...(page ? [{ id: 'back', label: this.t.back }] : []),
          ...((page + 1) * 5 < items.length ? [{ id: 'next', label: this.t.next }] : []),
          ...(items.length ? [{ id: 'clear', label: this.t.clear }] : []),
          { id: 'history', label: this.t.history }, { id: 'close', label: this.t.close }] });
      if (!action || action === 'close') return;
      if (action === 'back') { page--; continue; }
      if (action === 'next') { page++; continue; }
      if (action === 'clear' || action === 'history') {
        const yes = await this.guide.ask({ face: 'aside', line: this.t[action], quote: this.t[`${action}How`],
          actions: [{ id: 'yes', label: this.t.yes, primary: true }, { id: 'no', label: this.t.no }] });
        if (!yes) return;
        if (yes === 'yes') {
          if (action === 'clear') await this.save([], projectId);
          else if (!await this.host.forgetChats()) throw new Error('Could not clear history');
        }
        continue;
      }
      const index = action.startsWith('item:') ? page * 5 + Number(action.slice(5)) : -1;
      const result = await this.guide.askText({ face: 'look', line: index < 0 ? this.t.add : this.t.edit,
        quote: index < 0 ? this.t.memoryHow : items[index], placeholder: this.t.memoryPrompt, send: this.t.save,
        actions: [...(index >= 0 ? [{ id: 'remove', label: this.t.remove }] : []), { id: 'back', label: this.t.back }] });
      if (!result) return;
      if (result.action === 'remove') await this.save(items.filter((_m, i) => i !== index), projectId);
      else if (result.text?.trim()) {
        const value = result.text.trim().slice(0, 200);
        if (index < 0) { if (!items.includes(value)) items.push(value); }
        else items[index] = value;
        await this.save(items, projectId);
      }
    }
  }
  async windows({ name = '', action: requested } = {}) {
    const scene = this.guide.sceneId;
    const rows = await this.host.controlWindows();
    if (scene !== this.guide.sceneId) return;
    const key = name.toLocaleLowerCase();
    const matching = name ? rows.filter((w) => w.name.toLocaleLowerCase().includes(key)) : rows;
    const windows = matching.length ? matching : rows;
    if (!windows.length) { await this.guide.ask({ face: 'aside', line: this.t.noWindows, actions: this.guide.ok() }); return; }
    let page = 0;
    for (;;) {
      const part = windows.slice(page * 5, page * 5 + 5);
      const label = (w) => `${w.name}${w.workspace != null ? ` · ${this.t.workspace} ${w.workspace}` : ''}${w.minimized ? ` · ${this.t.minimized}` : ''} · ${w.id}`;
      const pick = await this.guide.ask({ face: 'look', line: this.t.windows, quote: this.t.windowHow,
        actions: [...part.map((w, i) => ({ id: `win:${i}`, label: label(w) })),
          ...(page ? [{ id: 'back', label: this.t.back }] : []),
          ...((page + 1) * 5 < windows.length ? [{ id: 'next', label: this.t.next }] : []), { id: 'close', label: this.t.close }] });
      if (!pick || pick === 'close') return;
      if (pick === 'back') { page--; continue; }
      if (pick === 'next') { page++; continue; }
      const target = part[Number(pick.slice(4))];
      if (!target) return;
      const action = requested || await this.guide.ask({ face: 'look', line: label(target),
        actions: [...['focus', 'minimize', 'maximize', 'restore'].map((id) => ({ id, label: this.t[id] })), { id: 'no', label: this.t.no }] });
      if (!action || action === 'no') return;
      const confirm = await this.guide.ask({ face: 'aside', line: `${this.t[action]} · ${label(target)}`, quote: this.t.confirm,
        actions: [{ id: 'yes', label: this.t.yes, primary: true }, { id: 'no', label: this.t.no }] });
      if (confirm !== 'yes') return;
      // Hand back keyboard and restore follow_mouse before an action can change focus.
      await this.host.releaseFocus();
      const result = await this.host.controlWindow(target, action);
      await this.guide.ask({ face: result.ok ? 'smug' : 'aside', line: result.ok ? this.t.applied : this.t.stale, actions: this.guide.ok() });
      return;
    }
  }
}
