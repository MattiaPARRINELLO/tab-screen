# Transition Orchestration — Tab Screen

**Date:** 2026-05-12
**Status:** Design approved, pending implementation
**Scope:** `public/screen.html` only

## Problem

Currently, each animation in the dashboard is triggered independently — staggered content fade, color theme CSS transition, card entrance, progress bar reset. They run in parallel without coordination:

- Color transition (1.2s) lags behind content animations (0.4-0.7s)
- Content fade-out and fade-in have a visual "gap" where nothing is visible (~60ms)
- Progress bar snaps to 0% abruptly on song change
- No visual feedback on position seek within the same track
- Card hide is a single raw fade-out, disconnected from content and ambient effects

The overall impression: animations feel "stitched together" rather than part of a single cohesive event.

## Solution

A central **timeline orchestrator** that replaces scattered `setTimeout` and independent CSS transitions with 4 choreographed timelines. Each timeline groups related animations into phases with precise relative timing and overlap.

### Orchestrator API

```javascript
function createTimeline() {
  // Returns a timeline object
  const phases = [];

  return {
    phase(name, delayMs, durationMs, callback) {
      phases.push({ name, delayMs, durationMs, callback });
      return this; // chainable
    },
    play() {
      // Returns a Promise that resolves when all phases complete
      // Also sets the current active timeline so it can be cancelled
    }
  };
}
```

- **Phases** are defined via `.phase(name, delayMs, durationMs, callback)` — chainable
- **`play()`** starts all `setTimeout` timers and returns a Promise that resolves after the longest phase
- **Cancellation:** A global `activeTimelineId` counter; `play()` increments it. Each phase checks `activeTimelineId` before executing its callback — if another timeline started in the meantime, the phase callback is skipped.

### The 4 Timelines

#### 1. `songChange` — New track arrives

Triggered when `isSongChanged === true` in `handleMusicData()`.

| Phase | Start (ms) | Dur (ms) | Description |
|-------|-----------|----------|-------------|
| CONTENT_OUT | 0 | 250 | Staggered fade-out of current content. Order: lyrics (0ms delay), cover (30ms), title (60ms), artist (90ms), progress bar (120ms). Each: opacity 1→0, translateY(+8px), blur(4px), ease-out |
| COLOR_SHIFT | 150 | 400 | Set `--theme-transition` to `600ms`. Trigger color variable changes to new album palette. Overlaps with both OUT and IN to eliminate the "blank" gap |
| PROGRESS_GLIDE | 250 | 200 | Glide progress bar width from current value to new 0% (or initial position) using spring-like easing instead of snapping |
| CONTENU_IN | 300 | 500 | Staggered fade-in of new content. Same stagger order as OUT. Cover: scale 0.92→1 with slight overshoot (scale(1.02) at 70% then scale(1)). Spring easing. |

**Duration:** ~800ms total (similar to current, but perceptually smoother — no gap)

#### 2. `cardReveal` — Music card appears from hidden state

Triggered when card was hidden and new music data arrives.

| Phase | Start (ms) | Dur (ms) | Description |
|-------|-----------|----------|-------------|
| CARD_ENTER | 0 | 850 | Keep the existing `cardEnter` CSS animation (blur→clear, scale 1.02→1, translateY(-12px→0)) |
| COLOR_WASH_IN | 200 | 650 | Activate color orbs and background wash gradually, synced with card clarity |
| CONTENU_IN | 400 | 500 | Staggered content entrance (cover, title, artist, bar) — same as songChange CONTENU_IN but delayed |

**Duration:** ~900ms

#### 3. `positionJump` — Seek within same track

Triggered when same track is already displayed but position diff > 2s.

| Phase | Start (ms) | Dur (ms) | Description |
|-------|-----------|----------|-------------|
| BAR_PULSE | 0 | 300 | Show the progress bar thumb/dot. Pulse it twice (scale 1→2.5→1→2.5→1) using keyframe-like JS animation. Then hide it. |
| LYRICS_GLIDE | 100 | 300 | Lyrics container: slide lines vertically toward the new active line. Use requestAnimationFrame-based smooth scroll to target position |
| BAR_GLIDE | 200 | 300 | Progress bar width glides to new percentage with spring easing |

**Duration:** ~500ms total. Lightweight, informative, non-disruptive.

#### 4. `cardHide` — Track ends, hide music card

Triggered by `hideMusicCard()` (end-of-track timeout).

| Phase | Start (ms) | Dur (ms) | Description |
|-------|-----------|----------|-------------|
| COLOR_WASH_OUT | 0 | 300 | Fade out the color orbs and background wash first — the "ambiance" recedes |
| CONTENU_OUT | 150 | 250 | Content fades out in reverse stagger order: bar (0ms), artist (30ms), title (60ms), cover (90ms). Same transform as songChange OUT |
| CARD_FADE | 350 | 250 | The card itself fades out and slightly scales down (scale(0.98)), easing ease-in |

**Duration:** ~600ms total. Feels like "the music drifts away."

### CSS Changes

- `--theme-transition`: change from `1.2s` to `600ms`. The current 1.2s value was set independently and now the orchestrator controls timing, so a shorter fixed value is appropriate.
- Progress bar transition: changed to `300ms cubic-bezier(0.34, 1.56, 0.64, 1)` for spring overshoot feel.
- No new CSS classes needed — timelines use existing animation classes plus inline style manipulation.

### Easing Presets

| Name | CSS equivalent | Use |
|------|---------------|-----|
| `spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Cover scale-in, progress glide |
| `easeOut` | `cubic-bezier(0.16, 1, 0.3, 1)` | Content out (fade/blur) |
| `easeIn` | `cubic-bezier(0.4, 0, 1, 1)` | Card fade out |
| `easeInOut` | `cubic-bezier(0.65, 0, 0.35, 1)` | Color shift, washes |

### Helper Functions

- `glideProgressBar(fromPct, toPct, durationMs)` — animates bar width via `requestAnimationFrame` with spring easing
- `pulseElement(el, times, durationMs)` — pulses an element's scale
- `animateCSS(el, props, durationMs, easing)` — generic CSS property animator using `element.animate()` Web Animations API

### Integration Points

In `handleMusicData()`:
- `isSongChanged`: cancel any running timeline → build and play `songChange` timeline
- Card was hidden: cancel → build and play `cardReveal` timeline
- Same track, position diff > 2s: cancel → build and play `positionJump` timeline

In `hideMusicCard()`:
- Cancel running timeline → build and play `cardHide` timeline

### Non-Goals

- No changes to the server (`server.js`)
- No changes to lyrics cache (`services/lyricsCache.js`)
- No changes to performance tier system (all animations respect `currentPerfTier`)
- No new external dependencies
