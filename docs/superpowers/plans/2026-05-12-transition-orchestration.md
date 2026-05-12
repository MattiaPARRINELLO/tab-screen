# Transition Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered independent animations in `screen.html` with a centralized timeline orchestrator for 4 coordinated transition types.

**Architecture:** Add a `createTimeline()` utility with `.phase()` / `.play()` API + cancellation. Refactor `handleMusicData()`, `hideMusicCard()` to build and play timelines instead of calling raw `el.animate()` / `setTimeout`. CSS changes: `--theme-transition` 1.2s → 600ms, progress bar 200ms linear → 300ms spring easing.

**Tech Stack:** Vanilla JS (Web Animations API), CSS custom properties. No new dependencies.

**Scope:** `public/screen.html` only.

---

### Task 1: CSS timing changes

**Files:** Modify `public/screen.html`

- [ ] **Step 1: Change `--theme-transition` from 1.2s to 600ms**

Find: `--theme-transition: 1.2s;` (line ~102)
Replace with: `--theme-transition: 600ms;`

- [ ] **Step 2: Change progress bar width transition to spring easing**

Find: `width 200ms linear,` in `.music-progress-bar` block (line ~980)
Replace with: `width 300ms cubic-bezier(0.34, 1.56, 0.64, 1),`

- [ ] **Step 3: Commit CSS changes**

```bash
git add public/screen.html
git commit -m "style: shorten theme transition to 600ms, progress bar to spring easing"
```

---

### Task 2: Add Timeline orchestrator and helpers

**Files:** Modify `public/screen.html` (add JS functions before `handleMusicData`)

- [ ] **Step 1: Add `createTimeline()` orchestrator**

Insert before the `handleMusicData` function (before line ~3139):

```javascript
      let activeTimelineId = 0;

      function createTimeline() {
        const id = ++activeTimelineId;
        const phases = [];

        return {
          phase(name, delayMs, durationMs, callback) {
            phases.push({ name, delayMs, durationMs, callback });
            return this;
          },
          play() {
            const maxEnd = phases.reduce((max, p) => {
              const end = p.delayMs + p.durationMs;
              return end > max ? end : max;
            }, 0);
            const runningPhases = phases.map((p) => {
              return new Promise((resolve) => {
                setTimeout(() => {
                  if (activeTimelineId !== id) { resolve(); return; }
                  try { p.callback(); } catch (e) {}
                  setTimeout(resolve, p.durationMs);
                }, p.delayMs);
              });
            });
            return new Promise((resolve) => {
              setTimeout(resolve, maxEnd);
            }).then(() => {
              if (activeTimelineId === id) activeTimelineId = 0;
            });
          }
        };
      }
```

- [ ] **Step 2: Add `glideProgressBar(fromPct, toPct, durationMs)` helper**

Insert after `createTimeline`:

```javascript
      function glideProgressBar(fromPct, toPct, durationMs) {
        if (PERF.tier >= 4) {
          progressBar.style.width = `${toPct}%`;
          return;
        }
        const start = performance.now();
        function step() {
          const elapsed = performance.now() - start;
          const t = Math.min(elapsed / durationMs, 1);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
          const current = fromPct + (toPct - fromPct) * eased;
          progressBar.style.width = `${current}%`;
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
```

- [ ] **Step 3: Add `pulseElement(el, times, durationMs)` helper**

Insert after `glideProgressBar`:

```javascript
      function pulseElement(el, times, durationMs) {
        if (!el || PERF.tier >= 4) return;
        const start = performance.now();
        const period = durationMs / times;
        function step() {
          const elapsed = performance.now() - start;
          if (elapsed >= durationMs) {
            el.style.transform = '';
            el.style.opacity = '1';
            return;
          }
          const phase = (elapsed % period) / period;
          const s = 1 + 1.5 * Math.sin(phase * Math.PI * 2) * (1 - elapsed / durationMs);
          el.style.transform = `scale(${s})`;
          el.style.opacity = `${0.4 + 0.6 * (1 - elapsed / durationMs)}`;
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
```

- [ ] **Step 4: Commit orchestrator + helpers**

```bash
git add public/screen.html
git commit -m "feat: add timeline orchestrator + glide/pulse animation helpers"
```

---

### Task 3: Refactor `handleMusicData` to use timelines

**Files:** Modify `public/screen.html`

- [ ] **Step 1: Build `songChange` timeline — replace `animateSongChangeIfNeeded` call**

In `handleMusicData()`, find the call to `animateSongChangeIfNeeded` (line ~3115). Replace the block from `await animateSongChangeIfNeeded(isSongChanged, () => {` through the closing `})` with a timeline:

```javascript
        // --- songChange timeline ---
        if (isSongChanged && canAnimateSongChange()) {
          const prevProgress = parseFloat(progressBar.style.width) || 0;
          const prevCover = coverEl ? { opacity: 1, transform: 'none', filter: 'blur(0px)' } : null;

          const staggerTargets = [
            { el: lyricsContainer, delayOut: 0, delayIn: 60 },
            { el: coverEl, delayOut: 30, delayIn: 0 },
            { el: trackEl, delayOut: 50, delayIn: 30 },
            { el: artistEl, delayOut: 65, delayIn: 50 },
            { el: musicBottomEl.querySelector(".music-progress-row"), delayOut: 80, delayIn: 70 },
          ].filter((t) => t.el);

          await createTimeline()
            .phase('content_out', 0, 250, () => {
              staggerTargets.forEach((t) => {
                t.el.animate(
                  [
                    { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
                    { opacity: 0, transform: "translateY(8px) scale(0.98)", filter: PERF.tier >= 3 ? "blur(2px)" : "blur(4px)" },
                  ],
                  { duration: 220, delay: t.delayOut, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
                );
              });
            })
            .phase('color_shift', 150, 400, () => {
              // color vars are already set by applyAlbumColors — the CSS transition handles the rest
            })
            .phase('progress_glide', 250, 200, () => {
              glideProgressBar(prevProgress, 0, 200);
            })
            .phase('content_in', 300, 500, () => {
              // Apply DOM updates first
              trackEl.textContent = data.title || "Titre inconnu";
              artistEl.textContent = data.artist || "Artiste inconnu";
              setCoverWithFallback(data.cover, { preserveExistingOnMissing: true, songKey: nextSongKey });

              staggerTargets.forEach((t) => {
                t.el.animate(
                  [
                    { opacity: 0, transform: "translateY(-12px) scale(0.97)", filter: PERF.tier >= 3 ? "blur(2px)" : "blur(4px)" },
                    { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
                  ],
                  { duration: 420, delay: t.delayIn, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }
                );
              });
            })
            .play();
        } else if (isSongChanged) {
          // No animation (hidden card or reduced motion / high perf tier)
          trackEl.textContent = data.title || "Titre inconnu";
          artistEl.textContent = data.artist || "Artiste inconnu";
          setCoverWithFallback(data.cover, { preserveExistingOnMissing: true, songKey: nextSongKey });
        }
```

- [ ] **Step 2: Add `canAnimateSongChange()` helper**

Insert before `handleMusicData`:

```javascript
      function canAnimateSongChange() {
        const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        return !prefersReduced && !musicCard.classList.contains("hidden") && PERF.tier < 4;
      }
```

- [ ] **Step 3: Build `positionJump` timeline — replace the needsResync block**

In the "same song visible" path, find the `needsResync` block (line ~3168). Replace the direct DOM mutations with a timeline:

```javascript
          if (needsResync) {
            if (musicTimeout) clearTimeout(musicTimeout);
            const prevProgress = parseFloat(progressBar.style.width) || 0;
            const newProgress = (newPos / (newDur || musicDuration)) * 100;

            musicInitialPosition = newPos;
            musicDuration = newDur || musicDuration;
            musicStartTime = Date.now();
            if (musicDurationEl) musicDurationEl.textContent = formatTime(musicDuration);

            if (lyricsInterval) { clearInterval(lyricsInterval); lyricsInterval = null; }

            await createTimeline()
              .phase('bar_pulse', 0, 300, () => {
                const thumb = progressBar.querySelector('::after') || progressBar;
                pulseElement(progressBar, 2, 300);
              })
              .phase('lyrics_glide', 100, 300, () => {
                // re-render and sync will happen in the next phases
              })
              .phase('bar_glide', 200, 300, () => {
                glideProgressBar(prevProgress, newProgress, 300);
              })
              .play();

            startProgressInterval();
            if (currentLyrics.length > 0) startLyricsSync();

            const remaining = musicDuration - newPos;
            if (remaining > 0) {
              musicTimeout = setTimeout(hideMusicCard, remaining * 1000);
            }
          }
```

- [ ] **Step 4: Handle `cardReveal` — card was hidden, now shown**

The `musicCard.classList.remove("hidden")` line already triggers `cardEnter` CSS animation. Replace the standalone progress bar reset + `startProgressInterval` with a lightweight timeline that staggers content in after the card enters:

```javascript
        // Show music card with animation — content staggers in after cardEnter
        musicCard.classList.remove("hidden");
        updateForecastLayout();

        createTimeline()
          .phase('card_enter', 0, 850, () => {
            // cardEnter CSS animation runs automatically via the .card:not(.hidden) rule
          })
          .phase('wash_in', 200, 650, () => {
            // album color wash and orbs activate — applyAlbumColors handles these
          })
          .phase('content_in', 400, 500, () => {
            // Content is already visible via the staggerTargets in the song change path,
            // or already set in the DOM. Nothing extra needed — this phase acts as
            // a guard ensuring the wash has settled before lyrics/progress start.
          })
          .play();

        // Smooth progress animation (throttled)
        startProgressInterval();
```

**Note:** The second `cardReveal` version above is optional — the main value-add is `songChange` and `positionJump`. If `cardReveal` is needed at all, it should simply delay `startProgressInterval` by ~600ms so the bar doesn't start moving before the card is fully visible. Let's do the simpler version:

```javascript
        musicCard.classList.remove("hidden");
        updateForecastLayout();
        startProgressInterval();
```

(Keep this path as-is — the cardEnter CSS animation handles the card itself, and content staggered entrance in songChange above handles the rest.)

- [ ] **Step 5: Commit handleMusicData refactor**

```bash
git add public/screen.html
git commit -m "refactor: orchestrate songChange and positionJump animations with timelines"
```

---

### Task 4: Refactor `hideMusicCard` to use `cardHide` timeline

**Files:** Modify `public/screen.html`

- [ ] **Step 1: Replace the fadeOut animation in `hideMusicCard`**

Find the `fadeOut` block in `hideMusicCard` (lines ~3300-3325). Replace with:

```javascript
        const cardHideTimeline = createTimeline()
          .phase('wash_out', 0, 300, () => {
            albumColorWash.classList.remove("active");
            document.querySelectorAll(".bg-orb").forEach((orb) => orb.classList.remove("active"));
            document.body.classList.remove("music-theme-active");
          })
          .phase('content_out', 150, 250, () => {
            // Reverse stagger: bar first, then artist, title, cover
            const targets = [
              { el: musicBottomEl.querySelector(".music-progress-row"), delay: 0 },
              { el: artistEl, delay: 30 },
              { el: trackEl, delay: 60 },
              { el: coverEl, delay: 90 },
            ].filter((t) => t.el);

            targets.forEach((t) => {
              t.el.animate(
                [
                  { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
                  { opacity: 0, transform: "translateY(8px) scale(0.98)", filter: "blur(4px)" },
                ],
                { duration: 220, delay: t.delay, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
              );
            });
          })
          .phase('card_fade', 350, 250, () => {
            musicCard.animate(
              [
                { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
                { opacity: 0, transform: "scale(0.96)", filter: "blur(6px)" },
              ],
              { duration: 250, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
            );
          });

        cardHideTimeline.play().then(() => {
          musicCard.classList.add("hidden");
          progressBar.style.width = "0%";
          if (musicDurationEl) musicDurationEl.textContent = "0:00";
          updateForecastLayout();
        });
```

- [ ] **Step 2: Commit hideMusicCard refactor**

```bash
git add public/screen.html
git commit -m "refactor: orchestrate cardHide with phased wash-out, content-out, card-fade timeline"
```

---

### Task 5: Verify

- [ ] **Step 1: Start server and check for JS errors**

```bash
npm start
# Open http://localhost:3000/screen in browser
# Check browser console for errors
# Send test music via curl to verify animations work
```

No compile step needed. The change is pure JS/CSS in a single file.

---

### Rollback Plan

The `animateSongChangeIfNeeded` function exists separately and can be called as fallback. It can be kept in the file (not deleted) during the refactor so reverting is just changing which function is called.
