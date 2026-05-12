# Design: Version low-end pour `/screen`

**Date:** 2026-05-12
**Status:** Approved

---

## Objectif

Créer une version optimisée de la page `/screen` pour les devices peu puissants, avec :
- Même layout visuel
- Désactivation progressive et automatique des effets lourds
- Route dédiée `/screen/low-end`
- Auto-détection de performances sur `/screen` avec suggestion de bascule

---

## Architecture

### Approche : fichier unique + classes CSS

Un seul fichier `public/screen.html` est modifié pour intégrer le système de dégradation. Les deux routes (`/screen` et `/screen/low-end`) servent le même fichier. Le JavaScript dans la page détecte la route et ajuste le comportement.

### Composants du système

1. **Moniteur FPS** — mesure les performances via `requestAnimationFrame`
2. **Système de tiers** — 5 niveaux progressifs de désactivation d'effets
3. **Classes CSS conditionnelles** — les règles CSS utilisent les classes sur `<body>` pour activer/désactiver les effets
4. **Auto-régulation** — montée/descente automatique des tiers selon FPS
5. **Toggle manuel** — icône discret pour overrider le tier
6. **Bannière de suggestion** — sur `/screen` uniquement, propose de passer en `/screen/low-end` si FPS bas

---

## Tiers d'effets

Du plus lourd au plus léger. Chaque tier hérite des désactivations du tier précédent.

### Tier 0 — Tous les effets actifs

Comportement actuel inchangé. Aucune classe ajoutée.

### Tier 1 — Léger

**Classe CSS :** `body.perf-tier-1`

- Désactive le grain SVG (`body::after`)
- Réduit `backdrop-filter` de `blur(32px)` à `blur(12px)` (voire `blur(8px)` sur petits écrans)
- Désactive l'animation `ambient` sur `body::before`

### Tier 2 — Modéré

**Classe CSS :** `body.perf-tier-2` (cumulatif avec tier 1)

- Supprime complètement `backdrop-filter` sur les cards
- Cache les orbes 2 et 3 (`#bgOrb2`, `#bgOrb3` → `display: none`)
- Réduit le flou de l'orbe 1 à 40px (au lieu de 80px)

### Tier 3 — Important

**Classe CSS :** `body.perf-tier-3` (cumulatif)

- Cache tous les orbes (`#bgOrb1`, `#bgOrb2`, `#bgOrb3`)
- Désactive l'animation `washDrift` de l'overlay couleur album
- Désactive `coverPulse` sur la pochette d'album
- Désactive `weatherFloat` sur l'icône météo
- Désactive `timeGlow` sur l'heure
- Désactive les animations `breathe` (box-shadow) sur les cards
- Passe les transitions CSS `--theme-transition` à `0s` (instantané)
- Réduit le flou dans les keyframes WAAPI (animations de changement de morceau : `blur(2px)` au lieu de `blur(4px)`)

### Tier 4 — Urgence

**Classe CSS :** `body.perf-tier-4` (cumulatif)

- Désactive TOUTES les animations CSS décoratives (`animation: none` sur les éléments décoratifs)
- Désactive ColorThief — utilise une palette neutre prédéfinie (tons sombres, pas d'extraction de palette)
- Désactive le morphing FLIP (`animateMusicMorphTransition` devient no-op, pas d'appel à `el.animate()`)
- Réduit `setInterval(updateActiveLyric, 250)` à `500ms`
- Réduit `setInterval(updateProgressBar, 250)` à `500ms`
- Passe `will-change` à `auto` sur tous les éléments

---

## Seuils FPS et régulation

### Mesure

- Moyenne glissante sur 2 secondes (environ 120 frames à 60fps)
- Mise à jour toutes les 500ms

### Descente de tier

- Condition : FPS moyen < 45 pendant 3 secondes consécutives
- Action : incrémenter le tier (+1)
- Cooldown : 10 secondes minimum entre deux descentes

### Montée de tier

- Condition : FPS moyen > 55 pendant 5 secondes consécutives
- Action : décrémenter le tier (-1)
- Cooldown : 15 secondes minimum entre deux montées

### Comportement initial

- Sur `/screen` : démarre au **tier 0** (tout activé), puis s'adapte
- Sur `/screen/low-end` : démarre au **tier 3**, puis peut remonter si FPS bon

---

## Comportement des routes

### `GET /screen` (existant)

Comportement inchangé pour le rendu initial. Le moniteur FPS s'active après chargement :
- Si le tier atteint 2 ou plus dans les 10 premières secondes → afficher la bannière de suggestion
- Bannière : "Device lent détecté — [Passer en mode optimisé](/screen/low-end)"

### `GET /screen/low-end` (nouveau)

- `server.js` : ajouter `app.get('/screen/low-end', (req, res) => res.sendFile(...))` servant le même `screen.html`
- Le JS détecte `window.location.pathname === '/screen/low-end'` et démarre au tier 3
- Pas de bannière de suggestion sur cette page

---

## Toggle manuel

- Position : fixé en bas à droite de l'écran
- Apparence : petit icône (⚡ ou roue dentée), `opacity: 0.2`, passe à `opacity: 1` au hover
- Comportement : clic → cycle entre les tiers (0→1→2→3→4→0) ou ouvre un petit menu
- Désactive temporairement l'auto-régulation (timeout de 60s avant reprise)

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `server.js` | Ajout de `GET /screen/low-end` |
| `public/screen.html` | Ajout du système complet : moniteur FPS, classes CSS, auto-régulation, toggle, bannière |

Aucun nouveau fichier créé.

---

## Non inclus (hors scope)

- Modification d'autres pages (`/`, `/cache`, `/message`, `/historique`)
- Changement de la grille ou du layout
- Compression ou minification des assets
- Modification du backend Socket.IO
