# Message PWA + Push Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `message.html` into a full PWA with offline queue, push notifications, and a dedicated notification-sending page.

**Architecture:** 
- PWA: manifest.json + SVG icon + service worker (cache-first shell, push events, update detection)
- Offline: IndexedDB queue for messages sent without connectivity
- Push: web-push npm package, VAPID keys stored in cache/, subscriptions in cache/subscriptions.json
- Pages: message.html (PWA entry), notify.html (notification sender)

**Tech Stack:** Express 5, Socket.IO 4, web-push, IndexedDB, Service Worker API, Push API

---

### Task 1: SVG App Icon

**Files:**
- Create: `public/icons/icon.svg`

- [ ] **Step 1: Create icon directory and SVG file**

```bash
mkdir -p /home/mattia/tab-screen/public/icons
```

- [ ] **Step 2: Write SVG icon**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#4ecdc4"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="#0f131c"/>
  <rect x="16" y="16" width="480" height="480" rx="80" fill="url(#bg)" opacity="0.12"/>
  <g transform="translate(256,260)" fill="none" stroke="url(#bg)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
    <path d="M-140,-80 L140,-80 C160,-80 175,-65 175,-45 L175,45 C175,65 160,80 140,80 L-140,80 C-160,80 -175,65 -175,45 L-175,-45 C-175,-65 -160,-80 -140,-80 Z" fill="rgba(167,139,250,0.08)" stroke="url(#bg)"/>
    <path d="M-175,-40 L0,50 L175,-40" stroke="url(#bg)"/>
  </g>
  <circle cx="400" cy="120" r="36" fill="#4ecdc4" opacity="0.9"/>
  <circle cx="410" cy="108" r="12" fill="#fff" opacity="0.9"/>
</svg>
```

- [ ] **Step 3: Commit**

```bash
git add public/icons/icon.svg && git commit -m "feat: add PWA app icon"
```

---

### Task 2: Web App Manifest

**Files:**
- Create: `public/manifest.json`

- [ ] **Step 1: Write manifest.json**

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
  "icons": [
    {
      "src": "/icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json && git commit -m "feat: add web app manifest"
```

---

### Task 3: Service Worker

**Files:**
- Create: `public/sw.js`

- [ ] **Step 1: Write service worker with caching, push handling, and update mechanism**

```javascript
const CACHE = 'message-pwa-v1';
const STATIC = [
  '/message.html',
  '/manifest.json',
  '/icons/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // API calls: network only
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const { title, body } = data;
    event.waitUntil(
      self.registration.showNotification(title || 'Message', {
        body: body || '',
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg',
        vibrate: [200, 100, 200],
        tag: 'message-notification',
        data: { url: '/message.html' }
      })
    );
  } catch (e) {
    // not JSON or invalid
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/message.html') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/message.html');
    })
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add public/sw.js && git commit -m "feat: add service worker with cache, push, updates"
```

---

### Task 4: Modify message.html — PWA meta, SW registration, offline queue, push subscription, mobile UX

**Files:**
- Modify: `public/message.html`

- [ ] **Step 1: Add PWA meta tags in `<head>`**

After the viewport meta tag on line 5, add:

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Message">
<link rel="apple-touch-icon" href="/icons/icon.svg">
<link rel="apple-touch-startup-image" href="/icons/icon.svg">
<link rel="manifest" href="/manifest.json">
```

Change the viewport meta to disable zoom:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
```

- [ ] **Step 2: Add mobile-optimized CSS**

Replace the `<style>` block (lines 8-135) with an expanded version that includes:

```css
/* Keep all existing styles PLUS these additions: */

/* Mobile-optimized button */
button {
  height: 56px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}

/* Safe areas for notched phones */
.card {
  padding-bottom: calc(2.5rem + env(safe-area-inset-bottom, 0px));
}

/* Prevent zoom on iOS textarea */
textarea {
  font-size: 16px;
}

/* Update indicator banner */
#updateBanner {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  padding: 12px 20px;
  background: rgba(15, 19, 28, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
  font-size: 0.85rem;
  color: #eef2f7;
  animation: bannerSlideDown 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
}

#updateBanner.visible {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

#updateBanner button {
  display: inline-block;
  width: auto;
  height: auto;
  padding: 8px 20px;
  background: linear-gradient(135deg, #a78bfa, #4ecdc4);
  border: none;
  border-radius: 0.7rem;
  color: #fff;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

#updateBanner .dismiss-update {
  background: none;
  border: none;
  color: #5a6678;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 4px 8px;
}

@keyframes bannerSlideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Offline indicator */
#offlineIndicator {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  background: rgba(245, 158, 11, 0.92);
  backdrop-filter: blur(8px);
  border-radius: 1rem;
  padding: 8px 18px;
  font-size: 0.8rem;
  font-weight: 500;
  color: #07090f;
  display: none;
  z-index: 100;
  white-space: nowrap;
}

#offlineIndicator.visible {
  display: block;
}
```

- [ ] **Step 3: Add the `<body>` overlay elements**

After the opening `<body>` tag (line 137), add:

```html
<div id="updateBanner">
  <span>Nouvelle version disponible</span>
  <button id="updateBtn">Mettre à jour</button>
  <button class="dismiss-update" id="dismissUpdate">✕</button>
</div>
<div id="offlineIndicator">📡 Hors-ligne</div>
```

- [ ] **Step 4: Replace the inline `<script>` with enhanced version**

Replace the entire `<script>` block (lines 150-198) with:

```html
<script>
  const textarea = document.getElementById("msg");
  const counter  = document.getElementById("counter");
  const btn      = document.getElementById("btn");
  const feedback = document.getElementById("feedback");

  textarea.addEventListener("input", () => {
    const len = textarea.value.length;
    counter.textContent = `${len} / 500`;
    counter.classList.toggle("warn", len > 400);
  });

  // ── Offline queue (IndexedDB) ────────────────
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('message-pwa', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('pending')) {
          db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function savePending(text) {
    const db = await openDB();
    const tx = db.transaction('pending', 'readwrite');
    tx.objectStore('pending').add({ text, sentAt: Date.now() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function flushQueue() {
    const db = await openDB();
    const tx = db.transaction('pending', 'readonly');
    const store = tx.objectStore('pending');
    const all = await new Promise(res => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
    });
    if (!all.length) return;
    const delTx = db.transaction('pending', 'readwrite');
    for (const entry of all) {
      try {
        const res = await fetch('/api/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: entry.text }),
        });
        if (res.ok) {
          delTx.objectStore('pending').delete(entry.id);
        }
      } catch (e) {
        // Still offline, will retry later
        break;
      }
    }
    await new Promise(res => { delTx.oncomplete = res; });
  }

  // Flush pending on load
  if (navigator.onLine) flushQueue();

  // Flush when coming back online
  window.addEventListener('online', () => {
    document.getElementById('offlineIndicator').classList.remove('visible');
    flushQueue();
  });

  window.addEventListener('offline', () => {
    document.getElementById('offlineIndicator').classList.add('visible');
  });

  // ── Send message ────────────────────────────
  btn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) return;

    btn.disabled = true;
    feedback.textContent = "";
    feedback.className = "feedback";

    try {
      // If offline, save to IndexedDB
      if (!navigator.onLine) {
        await savePending(text);
        feedback.textContent = "📡 Mis en file d'attente (hors-ligne)";
        feedback.className = "feedback success";
        textarea.value = "";
        counter.textContent = "0 / 500";
        btn.disabled = false;
        return;
      }

      const res = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        feedback.textContent = "Message envoyé ✓";
        feedback.className = "feedback success";
        textarea.value = "";
        counter.textContent = "0 / 500";
      } else {
        const err = await res.json();
        feedback.textContent = err.error || "Erreur lors de l'envoi";
        feedback.className = "feedback error";
      }
    } catch {
      // Network error — save to offline queue
      try {
        await savePending(text);
        feedback.textContent = "📡 Mis en file d'attente (hors-ligne)";
        feedback.className = "feedback success";
        textarea.value = "";
        counter.textContent = "0 / 500";
      } catch {
        feedback.textContent = "Impossible de joindre le serveur";
        feedback.className = "feedback error";
      }
    } finally {
      btn.disabled = false;
    }
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) btn.click();
  });

  // ── PWA: Service Worker registration ──────
  if ('serviceWorker' in navigator) {
    let updateBanner = document.getElementById('updateBanner');
    let updateBtn = document.getElementById('updateBtn');
    let dismissUpdate = document.getElementById('dismissUpdate');

    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Check for updates on page load
      reg.update();

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            updateBanner.classList.add('visible');
          }
        });
      });
    }).catch(() => {});

    updateBtn.addEventListener('click', () => {
      navigator.serviceWorker.ready.then(reg => {
        if (reg.waiting) {
          reg.waiting.postMessage('SKIP_WAITING');
        }
      });
    });

    dismissUpdate.addEventListener('click', () => {
      updateBanner.classList.remove('visible');
    });

    // Listen for controller change → reload
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  // ── PWA: Push subscription ─────────────────
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    async function subscribeToPush(reg) {
      try {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(await getVapidPublicKey()),
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch (e) {
        // Permission denied or push not available
      }
    }

    async function getVapidPublicKey() {
      const res = await fetch('/api/push/vapid-public-key');
      return res.text();
    }

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(base64);
      return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    navigator.serviceWorker.ready.then(reg => {
      // Check if already subscribed
      reg.pushManager.getSubscription().then(sub => {
        if (!sub) {
          // Only prompt if permission is already granted
          if (Notification.permission === 'granted') {
            subscribeToPush(reg);
          }
          // Don't request permission proactively — the user
          // will be prompted by the browser when they interact
        }
      });
    });
  }

  // Auto-focus textarea (for mobile)
  setTimeout(() => textarea.focus(), 500);
</script>
```

- [ ] **Step 5: Commit**

```bash
git add public/message.html && git commit -m "feat: PWA meta, offline queue, push, updates on message page"
```

---

### Task 5: Create notify.html

**Files:**
- Create: `public/notify.html`

- [ ] **Step 1: Write notify.html**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Envoyer une notification</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #07090f;
        font-family: "Inter", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        padding: 1.5rem;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background:
          radial-gradient(ellipse 70% 60% at 20% 20%, rgba(167, 139, 250, 0.08) 0%, transparent 70%),
          radial-gradient(ellipse 60% 50% at 80% 80%, rgba(78, 205, 196, 0.06) 0%, transparent 70%);
        pointer-events: none;
      }

      .card {
        position: relative;
        width: 100%;
        max-width: 480px;
        background: rgba(15, 19, 28, 0.85);
        backdrop-filter: blur(24px) saturate(1.4);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 2rem;
        padding: 2.5rem;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
      }

      .icon {
        text-align: center;
        font-size: 2.2rem;
        margin-bottom: 1.25rem;
        animation: pulse 2.4s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.12); }
      }

      h1 {
        color: #eef2f7;
        font-size: 1.3rem;
        font-weight: 600;
        text-align: center;
        margin-bottom: 0.4rem;
      }

      .subtitle {
        color: #5a6678;
        font-size: 0.82rem;
        text-align: center;
        margin-bottom: 2rem;
      }

      label {
        display: block;
        color: #7e8a9e;
        font-size: 0.82rem;
        font-weight: 500;
        margin-bottom: 0.4rem;
      }

      input, textarea {
        width: 100%;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1.1rem;
        color: #eef2f7;
        font-family: inherit;
        font-size: 1rem;
        line-height: 1.6;
        padding: 1rem 1.2rem;
        outline: none;
        transition: border-color 0.2s, background 0.2s;
      }

      input::placeholder, textarea::placeholder { color: #3d4a5c; }

      input:focus, textarea:focus {
        border-color: rgba(167, 139, 250, 0.4);
        background: rgba(255, 255, 255, 0.06);
      }

      input {
        margin-bottom: 1.25rem;
        font-size: 16px;
      }

      textarea {
        min-height: 120px;
        resize: vertical;
        margin-bottom: 1.5rem;
        font-size: 16px;
      }

      button {
        width: 100%;
        height: 56px;
        background: linear-gradient(135deg, #a78bfa, #4ecdc4);
        border: none;
        border-radius: 1.1rem;
        color: #fff;
        font-family: inherit;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: 0.01em;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        transition: opacity 0.18s, transform 0.18s;
      }

      button:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
      button:active:not(:disabled) { transform: translateY(0); }
      button:disabled { opacity: 0.4; cursor: default; }

      .feedback {
        margin-top: 1.1rem;
        text-align: center;
        font-size: 0.9rem;
        font-weight: 500;
        min-height: 1.3em;
        transition: opacity 0.3s;
      }

      .feedback.success { color: #4ecdc4; }
      .feedback.error   { color: #f87171; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">🔔</div>
      <h1>Envoyer une notification</h1>
      <p class="subtitle">Le message apparaîtra sur son téléphone</p>

      <label for="title">Titre</label>
      <input id="title" type="text" placeholder="Ex: Mattia 💜" maxlength="100" />

      <label for="msg">Message</label>
      <textarea id="msg" placeholder="Écris ton message…" maxlength="500"></textarea>

      <button id="btn" type="button">Envoyer la notification</button>
      <div class="feedback" id="feedback"></div>
    </div>

    <script>
      const titleInput = document.getElementById("title");
      const msgInput   = document.getElementById("msg");
      const btn        = document.getElementById("btn");
      const feedback   = document.getElementById("feedback");

      btn.addEventListener("click", async () => {
        const title = titleInput.value.trim() || "Message de Mattia";
        const text  = msgInput.value.trim();
        if (!text) return;

        btn.disabled = true;
        feedback.textContent = "";
        feedback.className = "feedback";

        try {
          const res = await fetch("/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, body: text }),
          });

          if (res.ok) {
            const data = await res.json();
            feedback.textContent = `Notification envoyée ✓ (${data.count} appareil(s))`;
            feedback.className = "feedback success";
            msgInput.value = "";
          } else {
            const err = await res.json();
            feedback.textContent = err.error || "Erreur lors de l'envoi";
            feedback.className = "feedback error";
          }
        } catch {
          feedback.textContent = "Impossible de joindre le serveur";
          feedback.className = "feedback error";
        } finally {
          btn.disabled = false;
        }
      });

      msgInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) btn.click();
      });

      setTimeout(() => titleInput.focus(), 500);
    </script>
  </body>
</html>
```

- [ ] **Step 2: Add route in server.js for notify.html**

Add after the `/message` route (line 98):

```javascript
app.get('/notify', (req, res) => res.sendFile(path.join(__dirname, 'public', 'notify.html')));
```

- [ ] **Step 3: Commit**

```bash
git add public/notify.html server.js && git commit -m "feat: add notification sending page"
```

---

### Task 6: Modify server.js — push notification infrastructure

**Files:**
- Modify: `server.js`
- Modify: `package.json`

- [ ] **Step 1: Add `web-push` to package.json**

```json
"web-push": "^3.6.7"
```

Add to the `dependencies` object.

- [ ] **Step 2: Add web-push require and VAPID setup in server.js**

Add after line 9 (`const lyricsCache = require(...)`):

```javascript
const webpush = require('web-push');
```

Add after the dotenv config block (line 16, around the API key warnings):

```javascript
// ── VAPID keys for push notifications ──
const VAPID_PATH = path.join(__dirname, 'cache', 'vapid-keys.json');
let vapidKeys = { publicKey: '', privateKey: '' };

try {
  if (fs.existsSync(VAPID_PATH)) {
    vapidKeys = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.mkdirSync(path.dirname(VAPID_PATH), { recursive: true });
    fs.writeFileSync(VAPID_PATH, JSON.stringify(vapidKeys, null, 2));
    console.log('[push] VAPID keys generated and saved');
  }
} catch (e) {
  console.error('[push] VAPID error:', e.message);
}

webpush.setVapidDetails(
  'mailto:' + (process.env.EMAIL || 'admin@localhost'),
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const SUBSCRIPTIONS_PATH = path.join(__dirname, 'cache', 'subscriptions.json');

function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_PATH, 'utf8'));
      return Array.isArray(data) ? data : [];
    }
  } catch (e) { console.error('[push] Erreur lecture subscriptions:', e.message); }
  return [];
}

function saveSubscriptions(subs) {
  try {
    fs.mkdirSync(path.dirname(SUBSCRIPTIONS_PATH), { recursive: true });
    fs.writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify(subs, null, 2));
  } catch (e) { console.error('[push] Erreur écriture subscriptions:', e.message); }
}

let pushSubscriptions = loadSubscriptions();
```

- [ ] **Step 3: Add push API endpoints in server.js**

Add before the `// ── Météo ──` section (or after the message routes, around line 168):

```javascript
// ── Push notifications ────────────────────────────

app.get('/api/push/vapid-public-key', (req, res) => {
  res.type('text/plain').send(vapidKeys.publicKey);
});

app.post('/api/push/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Subscription invalide' });

  // Avoid duplicates
  const existing = pushSubscriptions.findIndex(s => s.endpoint === sub.endpoint);
  if (existing >= 0) {
    pushSubscriptions[existing] = sub;
  } else {
    pushSubscriptions.push(sub);
  }
  saveSubscriptions(pushSubscriptions);
  res.json({ ok: true });
});

app.post('/api/push/send', async (req, res) => {
  const { title, body } = req.body;
  if (!body) return res.status(400).json({ error: 'Message vide' });

  const payload = JSON.stringify({
    title: title || 'Message de Mattia',
    body: String(body).slice(0, 500),
  });

  let success = 0;
  let failed = [];

  for (let i = pushSubscriptions.length - 1; i >= 0; i--) {
    try {
      await webpush.sendNotification(pushSubscriptions[i], payload);
      success++;
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        // Subscription expired or gone
        failed.push(i);
      } else {
        console.error('[push] Erreur envoi:', e.message);
      }
    }
  }

  // Remove expired subscriptions
  if (failed.length > 0) {
    pushSubscriptions = pushSubscriptions.filter((_, i) => !failed.includes(i));
    saveSubscriptions(pushSubscriptions);
  }

  res.json({ ok: true, count: success });
});
```

- [ ] **Step 4: Commit**

```bash
git add server.js package.json && git commit -m "feat: add push notification infrastructure"
```

---

### Task 7: Add link to notify.html in screen.html

**Files:**
- Modify: `public/screen.html`

- [ ] **Step 1: Add a subtle "Notifications" link**

After the perf toggle button (around line 1977), add:

```html
<a href="/notify" id="notifyLink" aria-label="Envoyer une notification" title="Envoyer une notification">🔔</a>
```

Add this CSS in the `<style>` block (after the perf toggle button CSS around line 1758):

```css
#notifyLink {
  position: fixed;
  bottom: 54px;
  right: 12px;
  z-index: 9999;
  font-size: 1rem;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 19, 28, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  text-decoration: none;
  opacity: 0.18;
  transition: opacity 0.3s;
  cursor: pointer;
}

#notifyLink:hover {
  opacity: 1;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/screen.html && git commit -m "feat: add notification link in screen dashboard"
```

---

### Task 8: Create .gitkeep for cache dir and install dependencies

**Files:**
- Create: `cache/.gitkeep` (if directory is gitignored)

- [ ] **Step 1: Ensure cache dir has a gitkeep (optional, cache is usually in .gitignore)**

```bash
ls /home/mattia/tab-screen/cache/ 2>/dev/null || mkdir -p /home/mattia/tab-screen/cache
```

- [ ] **Step 2: Install web-push**

```bash
npm install web-push
```

- [ ] **Step 3: Start server and verify**

```bash
node server.js
```

Expected: server starts on port 3000, VAPID keys generated in cache/vapid-keys.json.

- [ ] **Step 4: Manual verification**

```bash
curl http://localhost:3000/message.html | head -5
# Expected: HTML with meta tags, manifest link, etc.
curl http://localhost:3000/manifest.json
# Expected: manifest JSON
curl http://localhost:3000/sw.js
# Expected: service worker JavaScript
curl http://localhost:3000/notify
# Expected: notify.html page
curl http://localhost:3000/api/push/vapid-public-key
# Expected: public VAPID key (base64 string)
```

- [ ] **Step 5: Commit install**

```bash
git add package.json package-lock.json && git commit -m "chore: add web-push dependency"
```

---

### Verification Summary

| Check | Expected |
|-------|----------|
| `manifest.json` served | JSON with correct fields |
| `sw.js` served | JavaScript with cache/push/update handlers |
| `message.html` loads | Shows form, registers SW on supported browsers |
| `notify.html` loads | Shows title + message form |
| `POST /api/push/send` with no subscriptions | Returns `{ ok: true, count: 0 }` |
| VAPID keys created | `cache/vapid-keys.json` exists with public/private |
| Offline queue | IndexedDB store `message-pwa.pending` created on first offline send |
| iOS meta tags | `apple-mobile-web-app-capable`, `apple-touch-icon` present |
