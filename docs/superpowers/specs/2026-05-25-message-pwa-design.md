# PWA Message — Design Spec

## Contexte

Transformer `public/message.html` en PWA complète pour permettre l'envoi de messages depuis un téléphone (iOS et Android) avec une expérience aussi proche que possible d'une app native.

## Objectifs

- Installation sur l'écran d'accueil (iOS + Android)
- Fonctionnement hors-ligne avec file d'attente de messages
- UX mobile optimisée (clavier, safe areas, tactile)
- Mise à jour facile de l'app
- Design icon custom

## Fichiers concernés

### Créés
- `public/icons/icon.svg` — Icône custom de l'app
- `public/manifest.json` — Web App Manifest
- `public/sw.js` — Service Worker

### Modifiés
- `public/message.html` — Meta tags PWA, SW registration, offline queue, UX mobile

## Architecture

### PWA Infrastructure

#### `manifest.json`
```json
{
  "name": "Message pour Mattia",
  "short_name": "Message",
  "description": "Envoyer un message qui s'affiche sur l'écran",
  "start_url": "/message.html",
  "display": "standalone",
  "background_color": "#07090f",
  "theme_color": "#a78bfa",
  "orientation": "portrait",
  "icons": [{ "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

- `display: standalone` — pas de barre d'adresse
- `orientation: portrait` — verrouillé en portrait
- Thème sombre (`#07090f`), violet (`#a78bfa`) comme theme_color

#### Service Worker (`sw.js`)

Stratégies de cache :
- **Cache-first** pour les assets statiques (HTML, CSS, manifest, icons)
- **Network-only** pour les appels API (`/api/message`, `/api/messages`)

Cycle de vie :
- `install` : précache le shell (message.html, manifest, icons)
- `activate` : nettoie les anciens caches, prend le contrôle immédiat
- `fetch` : cache-first pour statiques, network-only pour API
- `message` event : écoute les messages de la page (pour déclencher des mises à jour)

Mise à jour :
- À chaque navigation, le SW vérifie s'il y a une nouvelle version (via `updateViaCache: 'none'`)
- Si une nouvelle version est détectée, la page affiche un bouton "Nouvelle version disponible — Mettre à jour"
- Le bouton appelle `registration.waiting.postMessage('SKIP_WAITING')` puis recharge la page

#### iOS Support

Meta tags :
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Message">
<link rel="apple-touch-icon" href="/icons/icon.svg">
<link rel="apple-touch-startup-image" href="/icons/icon.svg">
```

#### Icône SVG

Icône minimaliste : enveloppe 💌 dans un carré aux bords arrondis, avec un dégradé violet-cyan. Design simple mais premium.

### Offline Queue

#### Architecture
```
message.html
  │
  ├─ En ligne → fetch POST /api/message → confirmation serveur
  │
  └─ Hors-ligne → IndexedDB (pendingMessages) → message stocké localement
                   → Dès que online → flush queue → POST chaque message
                   → Notification à l'utilisateur
```

#### Comportement UI
- Si `navigator.onLine === false` au moment de l'envoi :
  - Stocker le message dans IndexedDB (store `pending`)
  - Afficher "📡 Mis en file d'attente" en feedback
- Écouter `window.addEventListener('online', flushQueue)`
- Au chargement de la page, tenter de flush la queue
- Indicateur visuel du nombre de messages en attente

#### IndexedDB Schema
- DB name: `message-pwa`
- Store: `pending`
- Chaque entry: `{ text, sentAt, id }`

### UX Mobile

- Viewport : `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`
- Textarea : auto-focus au chargement (le clavier apparaît)
- Bouton d'envoi : hauteur 56px, largeur 100%, touch-action: manipulation
- Safe areas : `padding-bottom: env(safe-area-inset-bottom, 16px)`
- Status bar : `black-translucent` pour que le contenu passe sous la barre de statut
- `-webkit-tap-highlight-color: transparent`
- Animation de succès : transition douce, checkmark avec échelle
- Pas de zoom sur le textarea en iOS : `font-size: 16px` minimum

## Non-inclus (hors scope)

- Notification push — nécessite un service de push externe (Firebase, etc.)
- Authentification — l'accès au formulaire n'est pas restreint
- Édition/suppression de messages depuis l'historique

## Flux utilisateur

1. L'utilisateur ajoute l'app à l'écran d'accueil (via Safari "Share > Add to Home Screen" ou Chrome "Install")
2. Ouvre l'app → splash screen → formulaire directement
3. Tape le message → appuie sur Envoyer
4. Si connecté : message envoyé, feedback vert, formulaire réinitialisé
5. Si hors-ligne : message mis en file d'attente, feedback jaune/orange
6. Quand la connexion revient : messages envoyés automatiquement
7. Si une mise à jour est dispo : notification en haut de page avec bouton d'update

## Arborescence finale

```
public/
├── icons/
│   └── icon.svg          (nouveau)
├── manifest.json          (nouveau)
├── sw.js                  (nouveau)
├── message.html           (modifié)
├── screen.html            (inchangé)
├── historique.html        (inchangé)
├── index.html             (inchangé)
└── js/
    └── cache.js           (inchangé)
```
