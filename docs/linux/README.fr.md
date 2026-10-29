# Linux, CachyOS et Hyprland

Capri utilise **X11**, ou **XWayland sous Hyprland**, pour son overlay transparent,
son positionnement et les clics à travers. Le Wayland natif n'est pas pris en charge.
Les fenêtres Wayland des autres applications sont suivies par `hyprctl`.

## CachyOS / Arch

Installer les paquets système (Node.js 22.12 minimum) :

```sh
sudo pacman -S --needed nodejs npm gtk3 nss alsa-lib libxss libxtst mesa xorg-xwayland
npm ci
npm start
```

Pour les captures, les applications et le multimédia :

```sh
sudo pacman -S --needed grim glib2 playerctl wireplumber wl-clipboard
```

`grim` capture le moniteur Wayland choisi ; `gio` (glib2) ouvre les applications,
`playerctl` pilote les lecteurs MPRIS, `wpctl` (wireplumber) règle le volume et
`wl-clipboard` fournit la sélection pour `--ask-selection`. Ces outils sont facultatifs :
le diagnostic signale les fonctions indisponibles. Le chat local nécessite Ollama,
par exemple `sudo pacman -S ollama`, puis `sudo systemctl enable --now ollama` et
le choix/téléchargement d’un modèle dans le menu de Capri.

Lancer depuis un terminal **dans la session Hyprland** : `DISPLAY` et
`HYPRLAND_INSTANCE_SIGNATURE` doivent être hérités. `hyprctl` est fourni par
Hyprland. Aucun accès root n'est nécessaire pour lancer Capri.

Pour générer les paquets :

```sh
npm run dist:linux
```

Les fichiers sont dans `dist/`. Pour l'AppImage :

```sh
chmod +x dist/Capri-*.AppImage
./dist/Capri-*.AppImage
```

Si FUSE n'est pas disponible, extraire l'AppImage avec `--appimage-extract`, puis
lancer `squashfs-root/AppRun`, ou utiliser l'archive `tar.gz` et son exécutable `capri`.
`npm run dist:win` conserve la génération de l'installateur Windows.

## Configuration Hyprland

Ajouter une règle pour que le gestionnaire de fenêtres ne transforme pas l'overlay
plein écran en fenêtre carrelée. Vérifie ta version avec `hyprctl version`.

Avec une configuration **Lua**, copier [capri.hyprland.lua](capri.hyprland.lua)
dans `~/.config/hypr/`, puis ajouter à `hyprland.lua` :

```lua
dofile(os.getenv("HOME") .. "/.config/hypr/capri.hyprland.lua")
```

Ce fichier fournit la règle d’overlay et des raccourcis facultatifs ; remplacer
`capri` par le chemin réel de l’exécutable ou de l’AppImage si nécessaire.

Avec une configuration **hyprlang** (`hyprland.conf`, par exemple Hyprland 0.54),
utiliser :

```ini
windowrule {
    name = capri-overlay
    match:class = ^(capri)$
    match:title = ^(Capri Overlay)$
    float = on
    pin = on
    no_initial_focus = on
    no_blur = on
    no_shadow = on
    border_size = 0
}
```

Recharger avec `hyprctl reload`. Sur une ancienne version, utiliser les règles
équivalentes documentées par cette version. Vérifier la classe effective avec
`hyprctl clients` si une règle ne s'applique pas.

Pour une première validation, régler les moniteurs à une échelle de **1** et ne pas
activer `xwayland:force_zero_scaling`. Les coordonnées Hyprland sont logiques ;
le placement avec échelles fractionnaires ou différentes entre écrans reste à
valider sur une machine réelle. Ne pas forcer `--ozone-platform=wayland` : les API
Electron nécessaires au déplacement et aux clics à travers y sont limitées.

Une barre avec module de tray (par exemple Waybar avec `tray`) permet d'accéder au
menu. Le clic droit sur Capri ouvre également son menu. Sous Hyprland, un raccourci
peut être réservé au compositeur : utiliser le menu si Ctrl+Alt+C ne fonctionne pas.
Ollama est facultatif et doit être installé/démarré séparément pour le chat local.

### Commandes, mémoire et démarrage

Le menu propose **Prise en main**, **Ma mémoire**, **Interagir avec une fenêtre**
et **Économiser les ressources**. Ces panneaux locaux fonctionnent sans modèle IA.
La visite se présente au premier démarrage et reste accessible ensuite.

Capri étant lancée, les commandes suivantes ouvrent directement les panneaux :

```sh
capri --guide
capri --memory
capri --windows
capri --talk
```

Exemples facultatifs pour `hyprland.conf` (adapter le chemin de `capri`) :

```ini
bind = SUPER SHIFT, C, exec, capri --talk
bind = SUPER SHIFT, M, exec, capri --memory
bind = SUPER SHIFT, W, exec, capri --windows
bind = SUPER SHIFT, R, togglespecialworkspace, capri-minimized
exec-once = capri
```

Le dernier raccourci permet de retrouver les fenêtres réduites même après avoir
quitté Capri. `exec-once` est facultatif et reste sous ton contrôle ; Capri ne
modifie pas ta configuration Hyprland.

### Agir sur une fenêtre

Choisir **Interagir avec une fenêtre**, puis l’application et l’identifiant de
la fenêtre : **Mettre devant**, **Réduire**, **Agrandir** ou **Restaurer**.
Dans le chat, `agrandis Firefox` ou `réduis kitty` ouvre le même sélecteur.
Chaque action attend un clic **Confirmer**, puis la fenêtre est vérifiée à nouveau.
Une fenêtre fermée ou remplacée entre-temps ne reçoit pas l’action.

Sous Hyprland, réduire déplace la fenêtre vers `special:capri-minimized`.
Restaurer ou mettre devant la ramène sur son espace d’origine ; après un redémarrage
de Capri, elle revient sur l’espace courant. Agrandir utilise l’état maximisé du
compositeur, sans forcer le plein écran. Les dispatchers Lua sont utilisés en
priorité, avec repli vers les dispatchers hyprlang pour les versions précédentes.
Les titres et contenus des fenêtres ne sont pas transmis au modèle. Le contrôle
ne simule pas encore de clics ou de saisie dans les autres applications.

### Mémoire et ressources

**Ma mémoire** affiche jusqu’à 30 souvenirs durables : ajouter, modifier,
supprimer un souvenir, tout effacer ou effacer séparément les conversations.
Les modifications prennent effet dans les prochains échanges. Les souvenirs et
le contexte récent sont transmis au fournisseur choisi pour le chat, local ou en
ligne. Les fichiers restent dans le dossier `userData` d’Electron (sous le dossier
de configuration XDG). Une suppression purge aussi la sauvegarde `.bak` ; les
fichiers `.corrupt-*` préservés pour récupération manuelle restent à gérer séparément.

L’historique conservé est borné à 60 messages et 48 000 caractères ; le contexte
conversationnel envoyé au modèle est limité à 20 messages et 16 000 caractères.
**Économiser les ressources** passe les dessins au repos de 12 à 6 par seconde
et la lecture du pointeur Hyprland de 20 à 10 fois par seconde. Les séquences
d’action gardent leur cadence. Le suivi des fenêtres s’arrête quand l’overlay est
masqué, notamment pendant le verrouillage ; il reprend lorsque l’overlay revient.

Pour conserver une clé API entre les lancements, un trousseau GNOME/libsecret ou
KWallet doit être disponible et déverrouillé. Sinon Capri utilise la clé uniquement
en mémoire pour la session ; elle ne la sauvegarde pas via `basic_text`. Voir le
[guide de stockage et de récupération](../STORAGE.fr.md).

## Diagnostic depuis le menu

Le menu de Capri propose **Diagnostic et fonctions disponibles**. Il indique la
session détectée, l’affichage X11/XWayland, la réponse de `hyprctl` et les fonctions
prises en charge. **Actualiser** relance les vérifications après une correction.

Les réglages indisponibles sont désactivés : par exemple, le démarrage automatique
Linux et la détection des autres IA ne sont pas encore intégrés. Le chat explique
aussi pourquoi une commande multimédia ou une fermeture d’application ne peut pas
être exécutée. L’assistant de configuration ne propose plus l’ouverture automatique
de Claude/Codex via Ollama sous Linux ; le diagnostic donne la commande manuelle.

Pour la capture Wayland, un portail détecté reste une **condition à vérifier**,
pas une preuve de fonctionnement : la permission et le bureau peuvent influer sur
le résultat. Un portail non actif peut démarrer à la demande. La présence de
`pw-cli` indique seulement que l’outil PipeWire est installé. L’intégration des
captures via les portails reste un chantier distinct.

**Copier le diagnostic** copie un rapport JSON limité aux états techniques, à la
distribution reconnue et aux versions de Capri/Electron. Il ne contient ni valeurs
de variables d’environnement, ni chemins personnels, ni titres de fenêtres, ni
conversations, ni sorties brutes des commandes. La visibilité effective du tray
reste inconnue : vérifier le module Waybar si l’icône manque.

## Fonctionnalités et limites

- Overlay, animations et hooks Claude/Codex/Antigravity : fonctionnement commun.
- Hyprland : suivi des fenêtres mappées sur les espaces visibles et spéciaux,
  fenêtres épinglées, fenêtre active, coordonnées relatives à l'écran de Capri.
  Les titres ne sont pas envoyés au rendu. Une panne de `hyprctl` vide la liste
  et le suivi reprend automatiquement quand le compositeur répond.
- Autres bureaux Linux : overlay disponible sous X11/XWayland, sans suivi des fenêtres.
- Recherche de fichiers : parcours des dossiers personnels, sans Windows Search.
- Ouverture des dossiers et fichiers : associations du bureau via Electron.
- Hyprland : catalogue des applications via les fichiers `.desktop` et `gio`,
  fermeture d’applications, contrôle ciblé des fenêtres et détection des jeux.
- Multimédia Linux : `playerctl` et `wpctl`. La détection des périphériques USB
  et des autres IA reste réservée à Windows.
- Captures d'écran : sous Wayland, permissions et sélection peuvent dépendre du
  portail (`xdg-desktop-portal-hyprland`, PipeWire) et de la version d'Electron.
- L'ordre d'occlusion des fenêtres et les applications plein écran peuvent limiter
  les effets dessinés par-dessus ; aucun protocole layer-shell n'est utilisé.

## Vérification

```sh
npm run test:linux
npm run test:hooks
npm run dev
```

Dans Hyprland, vérifier transparence, clic à travers hors personnage, glisser/déposer,
changement d'espace de travail, fermeture d'une fenêtre et passage entre écrans.
Les tests Node vérifient l'adaptateur ; ils ne remplacent pas ces essais graphiques.
