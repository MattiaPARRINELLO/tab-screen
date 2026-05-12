# Screen Low-End Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic progressive performance degradation to the /screen dashboard, plus a dedicated /screen/low-end route that starts in degraded mode.

**Architecture:** Single-file approach — `screen.html` gets CSS tier classes, FPS monitor, auto-regulation, manual toggle, and a suggestion banner. `server.js` gets one new route serving the same file.

**Tech Stack:** Vanilla HTML/CSS/JS, Express 5, no new dependencies.

---

## File Structure

| File | Role |
|------|------|
| `server.js` | Add `GET /screen/low-end` route |
| `public/screen.html` | All CSS, HTML, and JS changes for the tier system |

---

### Task 1: Add /screen/low-end route in server.js

**Files:**
- Modify: `server.js:95`

- [ ] **Step 1: Add the route**

Insert after line 95 (`app.get('/screen', ...)`):

```javascript
app.get('/screen/low-end', (req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));
```

- [ ] **Step 2: Verify server starts**

Run: `node server.js` (then Ctrl+C after confirming no errors)

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add /screen/low-end route serving screen.html"
```

---

### Task 2: Add CSS performance tier rules in screen.html

**Files:**
- Modify: `public/screen.html` — insert after line 1605 (after the `.paused-animations` rule block, before `/* ========== POPUP MESSAGE ========== */`)

- [ ] **Step 1: Insert CSS tier rules**

Insert the following CSS block after line 1605:

```css
      /* ========== PERFORMANCE TIERS ========== */

      /* Tier 1 — disable grain, reduce backdrop-filter, stop ambient */
      body.perf-tier-1::after {
        display: none;
      }

      body.perf-tier-1 .card {
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }

      body.perf-tier-1::before {
        animation: none;
      }

      /* Tier 2 — remove backdrop-filter, hide orbs 2 & 3, reduce orb 1 blur */
      body.perf-tier-2 .card {
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }

      body.perf-tier-2 #bgOrb2,
      body.perf-tier-2 #bgOrb3 {
        display: none;
      }

      body.perf-tier-2 #bgOrb1 {
        filter: blur(40px);
      }

      /* Override responsive tweaks that set blur on orbs */
      @media (max-width: 1280px), (max-height: 800px) {
        body.perf-tier-2 #bgOrb1 {
          filter: blur(30px);
        }
      }

      /* Tier 3 — hide all orbs, disable decorative animations, instant transitions */
      body.perf-tier-3 .bg-orb {
        display: none;
      }

      body.perf-tier-3 .album-color-wash.active {
        animation: none;
      }

      body.perf-tier-3 .music-cover {
        animation: none;
      }

      body.perf-tier-3 .weather-icon {
        animation: none;
      }

      body.perf-tier-3 .time-display {
        animation: none;
      }

      body.perf-tier-3 .card:not(.hidden):not(#musicCard) {
        animation:
          cardEnter var(--duration-slow) var(--ease-spring) forwards;
      }

      body.perf-tier-3 .forecast-header::before {
        animation: none;
      }

      body.perf-tier-3 .lyrics-prestart-dot,
      body.perf-tier-3 .lyrics-prestart::before {
        animation: none;
      }

      body.perf-tier-3 .lyrics-loading-spinner {
        animation: none;
      }

      /* Cover pulse static at tier 3 */
      body.perf-tier-3 .music-cover {
        transform: scale(1);
      }

      /* Tier 4 — strip will-change hints, no-op all remaining decorative animations */
      body.perf-tier-4 .album-color-wash,
      body.perf-tier-4 .bg-orb,
      body.perf-tier-4 .card,
      body.perf-tier-4 .music-cover,
      body.perf-tier-4 .lyrics-wrapper,
      body.perf-tier-4 .music-bottom {
        will-change: auto;
      }

      body.perf-tier-4 .album-color-wash,
      body.perf-tier-4 .card::before,
      body.perf-tier-4 .card::after,
      body.perf-tier-4 .music-cover-wrapper::after {
        display: none;
      }

      body.perf-tier-4 .card {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      }

      body.perf-tier-4 #musicCard {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }

      /* ========== PERF TOGGLE BUTTON ========== */
      #perfToggleButton {
        position: fixed;
        bottom: 12px;
        right: 12px;
        z-index: 9999;
        background: rgba(15, 19, 28, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        color: var(--text-muted);
        font-size: 0.9rem;
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0.18;
        transition: opacity 0.3s, color 0.3s;
        user-select: none;
        -webkit-user-select: none;
        font-family: "Inter", -apple-system, sans-serif;
        line-height: 1;
        padding: 0;
      }

      #perfToggleButton:hover {
        opacity: 1;
        color: var(--text-secondary);
      }

      #perfToggleButton.manual-active {
        opacity: 1;
        color: rgba(var(--album-r), var(--album-g), var(--album-b), 0.8);
      }

      /* ========== SUGGESTION BANNER ========== */
      #perfBanner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9998;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 10px 20px;
        background: rgba(15, 19, 28, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.85rem;
        color: var(--text-secondary);
        gap: 12px;
        animation: bannerSlideDown 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      #perfBanner.visible {
        display: flex;
      }

      #perfBanner a {
        color: rgba(var(--album-r), var(--album-g), var(--album-b), 0.9);
        font-weight: 600;
        text-decoration: none;
        border-bottom: 1px solid rgba(var(--album-r), var(--album-g), var(--album-b), 0.3);
        transition: border-color 0.2s;
      }

      #perfBanner a:hover {
        border-color: rgba(var(--album-r), var(--album-g), var(--album-b), 0.7);
      }

      #perfBannerDismiss {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 1.1rem;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 4px;
        transition: color 0.2s;
      }

      #perfBannerDismiss:hover {
        color: var(--text-secondary);
      }

      @keyframes bannerSlideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
```

- [ ] **Step 2: Commit**

```bash
git add public/screen.html
git commit -m "feat: add CSS performance tier rules, toggle button, and banner styles"
```

---

### Task 3: Add HTML elements for toggle button and banner

**Files:**
- Modify: `public/screen.html` — insert before `</body>` (before line 2953)

- [ ] **Step 1: Insert HTML elements**

Insert after the closing `</div>` of `.dashboard` (after line 1765) and before `<script src="/socket.io/socket.io.js">` (line 1767):

```html
    <button id="perfToggleButton" title="Performance tier" aria-label="Cycle performance tier">&#9889;</button>
    <div id="perfBanner">
      <span>Device lent detecté —</span>
      <a href="/screen/low-end">Passer en mode optimisé</a>
      <button id="perfBannerDismiss" aria-label="Fermer">&#10005;</button>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add public/screen.html
git commit -m "feat: add perf toggle button and suggestion banner HTML"
```

---

### Task 4: Add FPS monitor and tier management JavaScript

**Files:**
- Modify: `public/screen.html` — insert at the start of the `<script>` block, after line 1768

- [ ] **Step 1: Insert FPS monitor and tier management code**

Insert after `const socket = io();` (line 1769):

```javascript
      // ========== PERFORMANCE TIER SYSTEM ==========

      const PERF = {
        tier: 0,
        fpsHistory: [],
        lastTierChange: 0,
        manualOverride: false,
        manualTimer: null,
        lowFpsStart: 0,
        highFpsStart: 0,
        initTime: Date.now(),
        bannerShown: false,
        DESCENT_COOLDOWN: 10000,
        ASCENT_COOLDOWN: 15000,
        MANUAL_TIMEOUT: 60000,
      };

      function perfInit() {
        const isLowEndRoute = window.location.pathname === '/screen/low-end';
        perfSetTier(isLowEndRoute ? 3 : 0);
        perfStartFpsMonitor();
        perfBindToggle();
      }

      function perfSetTier(newTier) {
        if (newTier === PERF.tier) return;
        const now = Date.now();

        if (!PERF.manualOverride) {
          const isDescending = newTier > PERF.tier;
          const isAscending = newTier < PERF.tier;
          if (isDescending && now - PERF.lastTierChange < PERF.DESCENT_COOLDOWN) return;
          if (isAscending && now - PERF.lastTierChange < PERF.ASCENT_COOLDOWN) return;
        }

        for (let i = 1; i <= 4; i++) {
          document.body.classList.remove('perf-tier-' + i);
        }

        for (let i = 1; i <= newTier; i++) {
          document.body.classList.add('perf-tier-' + i);
        }

        if (newTier >= 3) {
          document.documentElement.style.setProperty('--theme-transition', '0s');
        } else {
          document.documentElement.style.removeProperty('--theme-transition');
        }

        PERF.tier = newTier;
        PERF.lastTierChange = now;
        PERF.lowFpsStart = 0;
        PERF.highFpsStart = 0;

        if (!PERF.bannerShown && newTier >= 2 &&
            window.location.pathname === '/screen' &&
            now - PERF.initTime < 10000) {
          perfShowBanner();
        }
      }

      function perfStartFpsMonitor() {
        let lastSampleTime = performance.now();
        let frameCount = 0;

        function tick(now) {
          frameCount++;

          if (now - lastSampleTime >= 500) {
            const elapsed = (now - lastSampleTime) / 1000;
            const fps = frameCount / elapsed;
            lastSampleTime = now;
            frameCount = 0;

            PERF.fpsHistory.push({ time: now, fps: fps });
            const cutoff = now - 4000;
            PERF.fpsHistory = PERF.fpsHistory.filter(function(h) { return h.time > cutoff; });

            perfEvaluateFps(now);
          }

          requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
      }

      function perfEvaluateFps(now) {
        if (PERF.manualOverride) return;
        if (PERF.fpsHistory.length < 4) return;

        var recent = PERF.fpsHistory.slice(-6);
        var sum = 0;
        for (var i = 0; i < recent.length; i++) sum += recent[i].fps;
        var avgFps = sum / recent.length;

        if (avgFps < 45) {
          if (!PERF.lowFpsStart) {
            PERF.lowFpsStart = now;
            PERF.highFpsStart = 0;
          } else if (now - PERF.lowFpsStart >= 3000) {
            PERF.lowFpsStart = 0;
            if (PERF.tier < 4) perfSetTier(PERF.tier + 1);
          }
        } else {
          PERF.lowFpsStart = 0;
        }

        if (avgFps > 55) {
          if (!PERF.highFpsStart) {
            PERF.highFpsStart = now;
          } else if (now - PERF.highFpsStart >= 5000) {
            PERF.highFpsStart = 0;
            if (PERF.tier > 0) perfSetTier(PERF.tier - 1);
          }
        } else {
          PERF.highFpsStart = 0;
        }
      }

      function perfBindToggle() {
        var btn = document.getElementById('perfToggleButton');
        if (!btn) return;

        btn.addEventListener('click', function() {
          PERF.manualOverride = true;
          if (PERF.manualTimer) clearTimeout(PERF.manualTimer);

          var nextTier = PERF.tier >= 4 ? 0 : PERF.tier + 1;
          perfSetTier(nextTier);
          btn.classList.add('manual-active');

          PERF.manualTimer = setTimeout(function() {
            PERF.manualOverride = false;
            btn.classList.remove('manual-active');
            PERF.manualTimer = null;
          }, PERF.MANUAL_TIMEOUT);
        });
      }

      function perfShowBanner() {
        if (PERF.bannerShown) return;
        PERF.bannerShown = true;
        var banner = document.getElementById('perfBanner');
        if (!banner) return;
        banner.classList.add('visible');

        var dismissBtn = document.getElementById('perfBannerDismiss');
        if (dismissBtn) {
          dismissBtn.addEventListener('click', function() {
            banner.classList.remove('visible');
          });
        }
      }

      function perfInterval(baseMs) {
        return PERF.tier >= 4 ? baseMs * 2 : baseMs;
      }
```

- [ ] **Step 2: Commit**

```bash
git add public/screen.html
git commit -m "feat: add FPS monitor and performance tier auto-regulation"
```

---

### Task 5: Make existing JavaScript tier-aware

**Files:**
- Modify: `public/screen.html` — several functions

- [ ] **Step 1: Skip ColorThief at tier 4 in applyAlbumColors**

Find the `applyAlbumColors` function (around line 2420). Insert an early return before the existing code:

Find:
```javascript
      function applyAlbumColors(img) {
        const colorThief = new ColorThief();
```

Replace with:
```javascript
      function applyAlbumColors(img) {
        if (PERF.tier >= 4) {
          const root = document.documentElement;
          root.style.setProperty("--album-r", "78");
          root.style.setProperty("--album-g", "205");
          root.style.setProperty("--album-b", "196");
          root.style.setProperty("--album-ar", "167");
          root.style.setProperty("--album-ag", "139");
          root.style.setProperty("--album-ab", "250");
          document.body.classList.add("music-theme-active");
          albumColorWash.classList.add("active");
          document.querySelectorAll(".bg-orb").forEach(function(o) { o.classList.add("active"); });
          return;
        }

        const colorThief = new ColorThief();
```

- [ ] **Step 2: Reduce blur in animateSongChangeIfNeeded at tier 3+**

Find the `animateSongChangeIfNeeded` function (around line 2591). There are two occurrences of `filter: "blur(4px)"` in the animation keyframes (one in the OUT animation, one in the IN animation). Change both from `filter: "blur(4px)"` to `filter: PERF.tier >= 3 ? "blur(2px)" : "blur(4px)"`.

Also, at tier 4, skip the entire staggered animation. Add `|| PERF.tier >= 4` to the early return:

Replace this:
```javascript
        if (!canAnimate) {
          applyUpdate();
          return;
        }
```

With:
```javascript
        if (!canAnimate || PERF.tier >= 4) {
          applyUpdate();
          return;
        }
```

- [ ] **Step 3: Skip FLIP animation in animateMusicMorphTransition at tier 4**

Find the `animateMusicMorphTransition` function (around line 2071). Add early return:

After `function animateMusicMorphTransition(enabled) {`, add:

```javascript
        if (PERF.tier >= 4) {
          musicCard.classList.toggle("fullscreen-mode", enabled);
          return;
        }
```

- [ ] **Step 4: Skip WAAPI animation in hideMusicCard at tier 4**

Find the `hideMusicCard` function (around line 2841). Modify the early return for reduced motion to also include tier 4:

Find:
```javascript
        if (prefersReducedMotion || musicCard.classList.contains("hidden")) {
```

Replace with:
```javascript
        if (prefersReducedMotion || musicCard.classList.contains("hidden") || PERF.tier >= 4) {
```

- [ ] **Step 5: Reduce interval timers at tier 4**

Find `startLyricsSync` (around line 2242). Change the hardcoded `250` to use `perfInterval()`:

Replace:
```javascript
        lyricsInterval = setInterval(function() {
```

With a dynamic interval. Add this helper function at the top of the script and use it:

In the existing code, find `lyricsInterval = setInterval(...` at line 2245:

Change the interval value from `250` to use a helper. The cleanest way: define a helper and use it inline.

Add this helper function right after the PERF system code (before line 1771 where `config` is defined):

```javascript
      function perfInterval(baseMs) {
        return PERF.tier >= 4 ? baseMs * 2 : baseMs;
      }
```

Then in `startLyricsSync`, change:
```javascript
        }, 250);
```
To:
```javascript
        }, perfInterval(250));
```

And in `startProgressInterval`, change:
```javascript
        }, 250); // slower updates to save CPU on low-power devices
```
To:
```javascript
        }, perfInterval(250));
```

- [ ] **Step 6: Add init call for perf system**

At the very end of the `<script>` block, after `init();` (line 2951), add:

```javascript
      perfInit();
```

- [ ] **Step 7: Commit**

```bash
git add public/screen.html
git commit -m "feat: make existing animations and timers tier-aware"
```

---

### Task 6: Verify the implementation

**Files:**
- None (verification only)

- [ ] **Step 1: Start the server and test both routes**

```bash
node server.js &
sleep 2
curl -s http://localhost:3000/screen | head -5
curl -s http://localhost:3000/screen/low-end | head -5
kill %1
```

Expected: Both routes return HTML content starting with `<!doctype html>`.

- [ ] **Step 2: Verify no syntax errors in the HTML/JS**

Run: `node -e "var fs = require('fs'); var html = fs.readFileSync('public/screen.html', 'utf8'); var scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g); if (scriptMatch) scriptMatch.forEach(function(s) { try { new Function(s.replace(/<\/?script>/g, '')); console.log('JS syntax OK'); } catch(e) { console.log('JS syntax error:', e.message); } });"`

- [ ] **Step 3: Verify CSS syntax**

Run: `node -e "var fs = require('fs'); var html = fs.readFileSync('public/screen.html', 'utf8'); var styleMatch = html.match(/<style>([\s\S]*?)<\/style>/); if (styleMatch) console.log('Style block found, length:', styleMatch[1].length); else console.log('No style block found');"`

- [ ] **Step 4: Commit final verification**

```bash
git add -A
git commit -m "chore: verification of low-end screen implementation"
```
