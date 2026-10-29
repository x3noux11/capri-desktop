const EN = {
  projects: 'My projects', routines: 'Hyprland routines', general: 'General conversation', selected: 'Selected',
  add: 'Create', back: 'Back', close: 'Close', next: 'Next', save: 'Save', remove: 'Delete', edit: 'Edit',
  name: 'Name', select: 'Use this project', memories: 'Project memories', rename: 'Rename', cancel: 'Cancel', yes: 'Confirm',
  projectHow: 'Select a project to use its own memories and conversation. General memories stay available in every project.',
  deleteProject: 'Delete this project, its memories and its conversation, including recovery backups?',
  empty: 'Nothing saved yet.', failed: 'Could not save. Try again.',
  routineHow: 'Choose installed applications and workspaces. A matching open window is moved; otherwise the application is launched. Each run needs confirmation.',
  run: 'Run', addStep: 'Add an application', workspace: 'Workspace', stepHow: 'Workspace number, from 1 to 99.',
  search: 'Which application?', searchHow: 'Enter part of the installed application name.', noApps: 'No matching installed applications.',
  confirmRun: 'Apply this routine? Existing matching windows may move. New application placement depends on the application and compositor.',
  sent: 'Instructions sent to Hyprland.', partial: 'The routine stopped. Some earlier steps may have completed.',
  unavailable: 'Routines require a Hyprland session and gio (glib2). You can still prepare and save them here.',
  deleteRoutine: 'Delete this routine?',
};
const FR = {
  projects: 'Mes projets', routines: 'Routines Hyprland', general: 'Conversation générale', selected: 'Sélectionné',
  add: 'Créer', back: 'Retour', close: 'Fermer', next: 'Suivant', save: 'Enregistrer', remove: 'Supprimer', edit: 'Modifier',
  name: 'Nom', select: 'Utiliser ce projet', memories: 'Souvenirs du projet', rename: 'Renommer', cancel: 'Annuler', yes: 'Confirmer',
  projectHow: 'Choisis un projet pour retrouver ses souvenirs et sa conversation. Les souvenirs généraux restent disponibles dans chaque projet.',
  deleteProject: 'Supprimer ce projet, ses souvenirs et sa conversation, y compris leurs sauvegardes de récupération ?',
  empty: 'Rien d’enregistré pour le moment.', failed: 'Enregistrement impossible. Réessaie.',
  routineHow: 'Choisis les applications installées et leurs espaces de travail. Une fenêtre correspondante est déplacée ; sinon, l’application est lancée. Chaque exécution attend ta confirmation.',
  run: 'Exécuter', addStep: 'Ajouter une application', workspace: 'Espace', stepHow: 'Numéro de l’espace de travail, de 1 à 99.',
  search: 'Quelle application ?', searchHow: 'Écris une partie du nom de l’application installée.', noApps: 'Aucune application installée ne correspond.',
  confirmRun: 'Appliquer cette routine ? Les fenêtres correspondantes déjà ouvertes peuvent être déplacées. Le placement des nouvelles fenêtres dépend de l’application et du compositeur.',
  sent: 'Instructions envoyées à Hyprland.', partial: 'La routine s’est arrêtée. Certaines étapes précédentes ont pu être appliquées.',
  unavailable: 'Il faut une session Hyprland et gio (glib2) pour exécuter une routine. Tu peux déjà la préparer et l’enregistrer ici.',
  deleteRoutine: 'Supprimer cette routine ?',
};

export class Workspaces {
  constructor({ guide, host, brain, companion }) { Object.assign(this, { guide, host, brain, companion }); }
  get t() { return this.brain.lang === 'fr' ? FR : EN; }
  buttons(...ids) { return ids.map((id) => ({ id, label: this.t[id] })); }
  ask(line, quote, actions) { return this.guide.ask({ face: 'look', line, quote, actions }); }
  async save(patch) {
    const result = await this.host.setConfig(patch);
    if (result.saveError) throw new Error('Could not save');
    return result;
  }
  async field(line, quote, actions = []) {
    return this.guide.askText({ face: 'look', line, quote, placeholder: line, send: this.t.save,
      actions: [...actions, ...this.buttons('cancel')] });
  }
  async named(quote = '') {
    const result = await this.field(this.t.name, quote);
    return result?.text?.trim().slice(0, 80) || null;
  }
  async projects() {
    let page = 0;
    const scene = this.guide.sceneId;
    for (;;) {
      const cfg = await this.host.getConfig();
      if (scene !== this.guide.sceneId) return;
      const rows = cfg.projects || [];
      page = Math.min(page, Math.max(0, Math.ceil(rows.length / 5) - 1));
      const part = rows.slice(page * 5, page * 5 + 5);
      const choice = await this.ask(this.t.projects, this.t.projectHow, [
        ...part.map((p, i) => ({ id: `p:${i}`, label: `${p.name}${p.id === cfg.activeProject ? ` · ${this.t.selected}` : ''}` })),
        { id: 'general', label: this.t.general }, ...(rows.length < 20 ? this.buttons('add') : []),
        ...(page ? this.buttons('back') : []), ...((page + 1) * 5 < rows.length ? this.buttons('next') : []), ...this.buttons('close'),
      ]);
      if (!choice || choice === 'close') return;
      if (choice === 'back') { page--; continue; }
      if (choice === 'next') { page++; continue; }
      if (choice === 'general') { await this.save({ activeProject: '' }); continue; }
      if (choice === 'add') {
        const name = await this.named();
        if (!name) return;
        await this.save({ projects: [...rows, { id: crypto.randomUUID(), name, memories: [] }] });
        continue;
      }
      const project = part[Number(choice.slice(2))];
      if (!project) return;
      const action = await this.ask(project.name, this.t.projectHow, this.buttons('select', 'memories', 'rename', 'remove', 'back'));
      if (!action) return;
      if (action === 'select') await this.save({ activeProject: project.id });
      if (action === 'memories') await this.companion.memory({ projectId: project.id });
      if (action === 'rename') {
        const name = await this.named(project.name);
        if (name) await this.save({ projects: rows.map((p) => p.id === project.id ? { ...p, name } : p) });
      }
      if (action === 'remove' && await this.ask(project.name, this.t.deleteProject, this.buttons('yes', 'cancel')) === 'yes') {
        await this.save({ projects: rows.filter((p) => p.id !== project.id),
          activeProject: cfg.activeProject === project.id ? '' : cfg.activeProject });
      }
    }
  }
  async routines({ name = '' } = {}) {
    let page = 0;
    const scene = this.guide.sceneId;
    for (;;) {
      const [cfg, apps] = await Promise.all([this.host.getConfig(), this.host.routineApps()]);
      if (scene !== this.guide.sceneId) return;
      const all = cfg.routines || [];
      const filtered = name ? all.filter((r) => r.name.toLocaleLowerCase() === name.toLocaleLowerCase()) : all;
      const rows = filtered.length ? filtered : all;
      page = Math.min(page, Math.max(0, Math.ceil(rows.length / 5) - 1));
      const part = rows.slice(page * 5, page * 5 + 5);
      const choice = await this.ask(this.t.routines, this.t.routineHow, [
        ...part.map((r, i) => ({ id: `r:${i}`, label: r.name })), ...(all.length < 12 ? this.buttons('add') : []),
        ...(page ? this.buttons('back') : []), ...((page + 1) * 5 < rows.length ? this.buttons('next') : []), ...this.buttons('close'),
      ]);
      if (!choice || choice === 'close') return;
      if (choice === 'back') { page--; continue; }
      if (choice === 'next') { page++; continue; }
      const routine = choice === 'add' ? null : part[Number(choice.slice(2))];
      if (!routine) {
        if (choice === 'add') await this.editRoutine(null, all, apps);
        continue;
      }
      const summary = this.summary(routine, apps);
      const action = await this.ask(routine.name, summary, this.buttons('run', 'edit', 'remove', 'back'));
      if (!action) return;
      if (action === 'edit') await this.editRoutine(routine, all, apps);
      if (action === 'remove' && await this.ask(routine.name, this.t.deleteRoutine, this.buttons('yes', 'cancel')) === 'yes') {
        await this.save({ routines: all.filter((r) => r.id !== routine.id) });
      }
      if (action === 'run' && await this.ask(routine.name, `${summary}\n\n${this.t.confirmRun}`, this.buttons('yes', 'cancel')) === 'yes') {
        await this.host.releaseFocus();
        const result = await this.host.runRoutine(routine.id, routine.steps);
        if (scene !== this.guide.sceneId) return;
        await this.ask(routine.name, result.code === 'unsupported' ? this.t.unavailable
          : `${result.ok ? this.t.sent : this.t.partial}\n${(result.steps || []).map((s) => `${s.ok ? '✓' : '×'} ${s.name} → ${this.t.workspace} ${s.workspace}`).join('\n')}`, this.buttons('back'));
      }
    }
  }
  summary(routine, apps) {
    return routine.steps.map((s, i) => `${i + 1}. ${apps.find((a) => a.id === s.desktopId)?.name || s.desktopId} → ${this.t.workspace} ${s.workspace}`).join('\n');
  }
  async chooseApp(apps) {
    const query = await this.field(this.t.search, this.t.searchHow);
    if (!query?.text) return null;
    const rows = apps.filter((a) => a.name.toLocaleLowerCase().includes(query.text.trim().toLocaleLowerCase()));
    let page = 0;
    for (;;) {
      const part = rows.slice(page * 6, page * 6 + 6);
      const choice = await this.ask(this.t.search, rows.length ? query.text : this.t.noApps, [
        ...part.map((a, i) => ({ id: `a:${i}`, label: a.name })), ...(page ? this.buttons('back') : []),
        ...((page + 1) * 6 < rows.length ? this.buttons('next') : []), ...this.buttons('cancel'),
      ]);
      if (!choice || choice === 'cancel') return null;
      if (choice === 'back') { page--; continue; }
      if (choice === 'next') { page++; continue; }
      return part[Number(choice.slice(2))] || null;
    }
  }
  async editRoutine(existing, all, apps) {
    const scene = this.guide.sceneId;
    const name = await this.named(existing?.name || '');
    if (!name) return;
    const routine = { id: existing?.id || crypto.randomUUID(), name, steps: structuredClone(existing?.steps || []) };
    for (;;) {
      if (scene !== this.guide.sceneId) return;
      const choice = await this.ask(name, this.summary(routine, apps) || this.t.empty, [
        ...routine.steps.map((_s, i) => ({ id: `s:${i}`, label: `${this.t.edit} ${i + 1}` })),
        ...(routine.steps.length < 8 ? this.buttons('addStep') : []), ...(routine.steps.length ? this.buttons('save') : []), ...this.buttons('cancel'),
      ]);
      if (!choice || choice === 'cancel') return;
      if (choice === 'save') {
        await this.save({ routines: [...all.filter((r) => r.id !== routine.id), routine] });
        return;
      }
      const index = choice.startsWith('s:') ? Number(choice.slice(2)) : -1;
      const app = index >= 0 ? apps.find((a) => a.id === routine.steps[index].desktopId)
        : await this.chooseApp(apps.filter((a) => !routine.steps.some((s) => s.desktopId === a.id)));
      if (!app && index < 0) return;
      const got = await this.field(this.t.workspace, `${app?.name || routine.steps[index].desktopId}\n${this.t.stepHow}`,
        index >= 0 ? this.buttons('remove') : []);
      if (!got) return;
      if (got?.action === 'remove') { routine.steps.splice(index, 1); continue; }
      if (!got?.text || !/^\d{1,2}$/.test(got.text.trim())) continue;
      const workspace = Number(got.text);
      if (workspace < 1 || workspace > 99) continue;
      if (index >= 0) routine.steps[index].workspace = workspace;
      else routine.steps.push({ desktopId: app.id, workspace });
    }
  }
}
