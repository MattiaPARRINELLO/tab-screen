# PWA Message + Push Notifications — Design Spec

## Contexte

Transformer `public/message.html` en PWA complète pour permettre l'envoi de messages depuis un téléphone, avec système de notifications push bidirectionnel.

## Objectifs

- Installation sur l'écran d'accueil (iOS + Android)
- Fonctionnement hors-ligne avec file d'attente de messages
- UX mobile optimisée (clavier, safe areas, tactile)
- Mise à jour facile de l'app
- Design icon custom
- Notifications push : l'utilisateur peut envoyer des notifications vers le téléphone de sa copine

## Fichiers concernés

### Créés
- `public/icons/icon.svg` — Icône custom de l'app
- `public/manifest.json` — Web App Manifest
- `public/sw.js` — Service Worker
- `public/notify.html` — Page d'envoi de notifications (pour l'utilisateur)

### Modifiés
- `public/message.html` — Meta tags PWA, SW registration, offline queue, push subscription, UX mobile
- `public/screen.html` — Ajout d'un bouton "Notifications" pour accéder à notify.html
- `server.js` — Push notification endpoints, VAPID keys, web-push
- `package.json` — Ajout de `web-push`

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
- **Network-only** pour les appels API (`/api/message`, `/api/messages`, `/api/push/*`)

Cycle de vie :
- `install` : précache le shell (message.html, manifest, icons)
- `activate` : nettoie les anciens caches, prend le contrôle immédiat
- `fetch` : cache-first pour statiques, network-only pour API

Mise à jour :
- À chaque navigation, le SW vérifie s'il y a une nouvelle version
- Si détectée, la page affiche "Nouvelle version disponible — Mettre à jour"
- Le bouton appelle `registration.waiting.postMessage('SKIP_WAITING')` puis recharge

Push events :
- `push` : reçoit les données push, affiche une notification système
- `notificationclick` : ferme la notification, ouvre `message.html`

#### iOS Support

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Message">
<link rel="apple-touch-icon" href="/icons/icon.svg">
<link rel="apple-touch-startup-image" href="/icons/icon.svg">
```

#### Icône SVG

Icône minimaliste : enveloppe 💌 dans un carré aux bords arrondis, avec un dégradé violet-cyan.

### Offline Queue (message.html)

```
message.html
  │
  ├─ En ligne → fetch POST /api/message → confirmation serveur
  │
  └─ Hors-ligne → IndexedDB (pendingMessages) → message stocké localement
                   → Dès que online → flush queue → POST chaque message
                   → Notification à l'utilisateur
```

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

### Push Notification System (écran → téléphone)

#### Schéma général

```
notify.html (ou screen.html)
  │ POST /api/push/send { title, body }
  ▼
server.js
  │ lit toutes les subscriptions dans cache/subscriptions.json
  │ webpush.sendNotification(subscription, payload)
  ▼
Service Worker (sur le téléphone de la copine)
  │ event.push → self.registration.showNotification(title, { body, icon })
  ▼
Notification système affichée
  │ tap → notificationclick → ouvre message.html
```

#### Point d'envoi : notify.html

Nouvelle page dédiée pour l'utilisateur :
- Champ "Titre" (customisable, ex: "Mattia 💜")
- Champ "Message" (textarea)
- Bouton "Envoyer"
- Design sombre cohérent avec le reste
- Non listée dans la PWA (accessible uniquement via l'URL directe ou via un lien depuis screen.html)

#### Server-side push

Package : `web-push`

VAPID keys :
- Générées automatiquement au premier démarrage du serveur
- Stockées dans `cache/vapid-keys.json` (persistant)
- Sujet : `mailto:${process.env.EMAIL || 'admin@localhost'}`

Endpoints :

`POST /api/push/subscribe` :
- Body : `{ endpoint, keys: { p256dh, auth } }` (PushSubscription JSON)
- Stocke la subscription dans `cache/subscriptions.json`
- Pas de doublons (vérifie par endpoint)

`POST /api/push/send` :
- Body : `{ title, body }`
- Envoie une push notification à toutes les subscriptions enregistrées
- Nettoie les subscriptions expirées (qui retournent une erreur 410 Gone)

#### Push subscription (message.html)

Au chargement de la PWA :
1. Vérifie si Notification.permission === 'granted'
2. Si oui → subscribe via `registration.pushManager.subscribe()`
3. Envoie la subscription au serveur via POST /api/push/subscribe
4. Si permission non accordée → ne rien faire (pas de demande intrusive)

#### Service Worker push handling

```javascript
self.addEventListener('push', event => {
  const data = event.data.json();
  const { title, body } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      vibrate: [200, 100, 200],
      tag: 'message',
      data: { url: '/message.html' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/message.html'));
});
```

### UX Mobile (message.html)

- Viewport : `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`
- Textarea : auto-focus au chargement (le clavier apparaît)
- Bouton d'envoi : hauteur 56px, largeur 100%, touch-action: manipulation
- Safe areas : `padding-bottom: env(safe-area-inset-bottom, 16px)`
- Status bar : `black-translucent` pour que le contenu passe sous la barre de statut
- `-webkit-tap-highlight-color: transparent`
- Animation de succès : transition douce, checkmark avec échelle
- Pas de zoom sur le textarea en iOS : `font-size: 16px` minimum

## Flux utilisateur

### Flux 1 : Copine envoie un message (existant, amélioré)
1. Ajoute l'app à l'écran d'accueil
2. Ouvre l'app → formulaire
3. Tape le message → Envoyer
4. Si en ligne : envoyé, feedback vert
5. Si hors-ligne : mis en file d'attente, envoie dès que connecté

### Flux 2 : Utilisateur envoie une notification push
1. Ouvre `notify.html` (ou lien depuis screen.html)
2. Tape un titre (ex: "Mattia 💜") et un message
3. Envoie → le serveur push vers le téléphone de la copine
4. Elle reçoit une notification système (même si l'app est fermée)
5. Elle tape → ouvre la PWA → voit le message

## Arborescence finale

```
public/
├── icons/
│   └── icon.svg          (nouveau)
├── manifest.json          (nouveau)
├── sw.js                  (nouveau)
├── notify.html            (nouveau)
├── message.html           (modifié)
├── screen.html            (modifié — lien vers notify)
├── historique.html        (inchangé)
├── index.html             (inchangé)
└── js/
    └── cache.js           (inchangé)

server.js                  (modifié)
package.json               (modifié)
cache/
├── messages.json          (existant)
└── subscriptions.json     (nouveau — stockage push subscriptions)
└── vapid-keys.json        (nouveau — clés VAPID persistantes)
```
