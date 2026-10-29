# Paramètres, voix et contrôle du bureau

Ouvrir **Paramètres…** depuis le menu de Capri, ou lancer `capri --settings`.
Depuis les sources : `npm start -- --settings`. La fenêtre est indépendante de
l’overlay ; elle peut être déplacée et redimensionnée normalement sous Hyprland.
Ses libellés sont actuellement en français. Le choix de langue règle les réponses
de Capri et les panneaux existants.

## Les 12 onglets

| Onglet | Fonctions |
| --- | --- |
| Général | Prénom, personnalité, langue, visite guidée et accès rapide. |
| IA & connexions | Fournisseur, clé, serveur personnalisé, vérification des modèles, modèle de discussion. |
| Voix | Microphone, maintien pour parler, écoute continue ou OpenAI Realtime, fournisseurs et voix. |
| Mémoire | Recherche, ajout, correction, suppression, export et import après aperçu. |
| Projets | Contexte séparé, activation, renommage et suppression. |
| Routines | Applications et espaces Hyprland ; cartes réordonnables à la souris ou au clavier. |
| Reprise & tâches | Derniers échanges, résumé enregistré et tâches propres à la conversation. |
| Guidage & contrôle | Capture de la fenêtre choisie, repère visuel avec une IA de vision, clics et saisie confirmés. |
| Concentration | Minuteur travail/pause et notifications. |
| Apparence | Accent, opacité, effets, taille, sons, position et jusqu’à 8 profils. |
| Performances | Équilibré, économie, discret, automatique sur batterie, écran et suivi du pointeur. |
| Diagnostic | Capacités de la session, outils manquants et commandes à copier. |

## Configurer la voix

Pour commencer, choisir un fournisseur dans **IA & connexions**, puis **Connecter
et vérifier**. La transcription, la discussion et la synthèse peuvent utiliser
des fournisseurs différents. Le bouton de connexion vérifie l’accès et les modèles ;
la disponibilité d’un modèle audio précis se vérifie avec un échange ou l’exemple vocal.

Dans **Voix**, enregistrer la clé du fournisseur, choisir les modèles et cliquer
sur **Enregistrer la voix**. OpenAI et Groq réutilisent leur clé de discussion si
elle existe. Les variables `OPENAI_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY` et
`AZURE_SPEECH_KEY` sont également reconnues pour la voix. Sans trousseau chiffré sûr,
les nouvelles clés restent uniquement dans la session. Voir [le stockage](STORAGE.fr.md).

| Étape | Choix proposés | Exemple de modèle |
| --- | --- | --- |
| Transcription | OpenAI, Groq | `whisper-1`, `whisper-large-v3-turbo` |
| Discussion | Le fournisseur de chat de Capri, local ou cloud | Le modèle choisi dans IA & connexions |
| Synthèse | OpenAI, ElevenLabs, Azure Speech ou aucune | `gpt-4o-mini-tts`, `eleven_multilingual_v2` |

ElevenLabs demande un identifiant de voix. Azure demande la région de la ressource
et un nom de voix, par exemple `westeurope` et `fr-FR-DeniseNeural`. Les noms de
modèles et de voix restent modifiables pour suivre les offres des fournisseurs.
**Tester ce fournisseur** vérifie l’authentification et l’accès à son catalogue ;
**Écouter un exemple** effectue une synthèse avec les réglages enregistrés.

- **Maintenir pour parler** : maintenir le bouton ou la barre d’espace lorsqu’il
  a le focus, puis relâcher pour transcrire et répondre. L’enregistrement s’arrête
  au bout de 30 secondes maximum. Le texte peut aussi être saisi sans microphone.
- **Écoute continue** : activer explicitement l’écoute ; chaque pause après une
  prise de parole envoie un extrait. Le microphone est suspendu pendant la réponse
  et reprend ensuite. La détection du silence dépend du bruit ambiant.
- **OpenAI Realtime** : conversation audio directe avec `gpt-realtime` et la voix
  OpenAI choisie. Ce mode utilise une clé OpenAI et une session éphémère WebRTC,
  indépendamment du fournisseur de discussion. Il permet les interruptions vocales.

L’indicateur montre quand le micro est actif. **Tout arrêter**, le changement de
projet, le changement d’onglet, la réduction ou la fermeture de la fenêtre coupe
le micro et la lecture. En mode maintien, perdre le focus annule aussi l’écoute.
Un refus du micro laisse le champ de texte disponible.

L’audio est envoyé au fournisseur choisi ; les transcriptions et réponses passent
par le modèle de discussion, ou directement par OpenAI en Realtime. Les souvenirs
généraux et ceux du projet actif accompagnent les échanges. Les tours terminés sont
enregistrés dans l’historique local borné ; les enregistrements audio ne sont pas
écrits sur disque. Ces services peuvent facturer les appels. Leurs clés et les
API réelles doivent être configurées et essayées avec votre compte.

## Mémoire, reprise et tâches

La recherche porte sur les souvenirs de la portée choisie, générale ou projet.
Chaque portée contient au plus 30 faits. L’export JSON contient uniquement ces
faits et les noms/identifiants des projets, sans historique, clé ni routine.
L’import valide le format et présente les nombres après fusion avant confirmation.

**Reprise & tâches** affiche les derniers messages de la conversation active.
Le résumé est éditable ; **Proposer un résumé avec mon IA** envoie les derniers
messages de cette conversation et remplit un brouillon à relire et enregistrer.
Cette génération indépendante demande un modèle local ou cloud autre que Claude
Code. Jusqu’à 50 tâches peuvent être cochées ou retirées pour chaque portée.
Supprimer un projet supprime aussi son résumé et ses tâches.

## Guidage et interaction sous Hyprland

Installer `grim` pour les captures. Les clics et raccourcis demandent aussi
`ydotool` et un service `ydotoold` déjà configuré avec l’accès à `/dev/uinput`.
Le nom du service et ses droits dépendent du paquet de la distribution. Capri
n’installe pas de règles udev et ne démarre pas de service privilégié.

```sh
sudo pacman -S --needed grim ydotool
```

Le diagnostic vérifie le binaire et le socket. Par défaut, le socket attendu est
`$XDG_RUNTIME_DIR/.ydotool_socket`, ou `/tmp/.ydotool_socket` sans cette variable.
Si le service utilise un autre chemin, transmettre `YDOTOOL_SOCKET` à Capri.
Un socket présent ne prouve pas que son service acceptera les actions : les erreurs
sont signalées à l’exécution. Les autres fonctions de Capri restent accessibles
sans ces outils.

1. Choisir une fenêtre visible par application et identifiant, puis **Capturer**.
   L’image reste en mémoire pendant au plus une minute côté processus principal.
2. Cliquer dans l’image pour choisir les coordonnées, ou décrire la cible et
   **Analyser avec mon IA**. Ce dernier bouton demande confirmation avant d’envoyer
   l’image au modèle sélectionné, qui doit accepter les images. Un repère et une
   explication sont affichés ; aucune action n’est déclenchée par cette réponse.
3. Choisir clic, texte, raccourci ou défilement. **Vérifier puis exécuter** affiche
   la cible et l’action exacte ; confirmer dans les 30 secondes, sans déplacer la fenêtre.

Le processus, la classe, la visibilité, la géométrie et le focus sont revérifiés.
La saisie colle le texte Unicode avec Ctrl V, puis restaure tous les formats du
presse-papiers après un court délai si l’utilisateur ne l’a pas changé. Certaines
applications interdisent le collage. Dans un terminal, un texte contenant des
retours à la ligne peut déclencher des commandes : vérifier le texte de l’aperçu.

**Ctrl Alt Échap**, **Tout arrêter**, ou `capri --stop-control` annule les actions
en cours et les aperçus. Sous Wayland, réserver le raccourci dans Hyprland si
l’enregistrement Electron n’est pas disponible. Un contrôle du focus toutes les
75 ms interrompt une saisie en cours ; les événements déjà envoyés ne peuvent pas
être annulés. Le système d’entrée agit sur la fenêtre au premier plan : le contrôle
demande donc une cible visible et stable. Le placement avec échelles fractionnaires
et plusieurs écrans doit être vérifié dans la session réelle.

## Concentration, apparence et économie

Le minuteur propose des durées de travail et de pause réglables. Pendant le travail,
Capri réduit les animations, suspend les déplacements et réactions spontanées,
limite les sons et conserve les notifications importantes. Les préférences
habituelles reviennent à la fin ; le minuteur ne démarre pas une pause tout seul.

Le profil **Automatique** active l’économie lorsque le système signale la batterie.
**Discret** réduit aussi les animations et les interventions. Les choix dérivés
du minuteur ou de la batterie ne remplacent pas les préférences enregistrées.
Les profils d’apparence enregistrent l’accent, l’opacité, les effets, la taille,
le volume et les animations. Désactiver le suivi des couleurs du bureau pour
utiliser l’accent personnel sur l’overlay.

## Palette et raccourcis

**Ctrl K** dans les paramètres ouvre une recherche : onglets, projets, routines,
concentration et arrêt. Les routines affichent leur plan avant exécution.
**Ctrl Alt Espace** tente aussi d’ouvrir la palette depuis le bureau.
Sous Hyprland, les commandes suivantes peuvent être liées au compositeur :

```ini
bind = SUPER ALT, S, exec, capri --settings
bind = SUPER ALT, SPACE, exec, capri --palette
bind = SUPER ALT, V, exec, capri --voice
bind = SUPER ALT, ESCAPE, exec, capri --stop-control
```

Pour un bouton global à maintenir, choisir d’abord **Maintenir pour parler**,
garder Capri lancée, puis utiliser par exemple une touche sans modificateur :

```ini
bind = , F8, exec, capri --voice-start
bindr = , F8, exec, capri --voice-stop
```

Adapter le chemin de l’exécutable ou de l’AppImage. Les commandes de lancement
n’installent pas de raccourcis et ne modifient pas la configuration Hyprland.
