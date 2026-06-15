# Audit du projet : tab-screen

**Date :** 2026-06-11
**Stack détectée :** Node.js 18+, Express 5, Socket.IO 4, Vanilla JS, CommonJS
**Taille estimée :** 18 fichiers source, ~5 800 lignes (hors node_modules, cache, graphify)
**Audité par :** AuditExpert

## Résumé exécutif

Projet fonctionnel de tableau de bord temps réel pour écran secondaire/tablette, avec météo, musique et paroles synchronisées. Le code frontend est remarquablement soigné (système de performance tiers, animations FLIP, extraction de couleurs, transitions). En revanche, **la sécurité est préoccupante** : des clés API en clair dans `.env` (non tracké mais présent sur disque), IPs utilisateurs stockées sans privacy, dépendance malveillante `fs@0.0.1-security`, serveur HTTP sans HTTPS ni Helmet. L'absence totale de tests, de linting et de CI/CD constitue une dette technique majeure.

## Vue d'ensemble

| Catégorie | Critiques | Importants | Mineurs |
|---|---|---|---|
| Architecture & Structure | 0 | 2 | 1 |
| Dépendances | 1 | 1 | 1 |
| Qualité du code | 0 | 4 | 3 |
| Sécurité | 2 | 3 | 1 |
| Configuration & Déploiement | 0 | 2 | 2 |
| Performance | 0 | 0 | 2 |
| Documentation | 0 | 2 | 2 |
| **Total** | **3** | **14** | **12** |

## Problèmes par sévérité

### 🔴 Critiques

#### 1. Dépendance malveillante / inutile — `package.json:13`
- **Catégorie :** Dépendances
- **Description :** Le package `fs@0.0.1-security` est listé comme dépendance. `fs` est un module natif de Node.js. Ce package npm est une implémentation vide connue pour être un placeholder malveillant/typosquatting. Il est marqué « extraneous » par npm.
- **Impact :** Surface d'attaque inutile, confiance en l'arbre de dépendances compromise, gabarit de dépendance.
- **Recommandation :** Supprimer `fs` de `dependencies` dans `package.json` et exécuter `npm prune`.

#### 2. Adresse IP des expéditeurs de messages stockée et exposée — `server.js:331`
- **Catégorie :** Sécurité
- **Description :** Le champ `ip` de chaque message est stocké dans `cache/messages.json` et servi sans anonymisation via `GET /api/messages`. L'historique expose l'IP réelle (cf. `historique.html:179`). Aucun consentement ni mécanisme de purge RGPD.
- **Impact :** Violation RGPD potentielle. Exposition d'adresses IP (donnée personnelle) sans protection, sans durée de conservation limitée.
- **Recommandation :** Anonymiser les IP (dernier octet à 0) ou les supprimer après 24h. Ajouter une politique de conservation.

#### 3. Clés API visibles dans `.env` non commité mais présent sur le disque — `.env`
- **Catégorie :** Sécurité
- **Description :** Le fichier `.env` contient des clés API en clair (OpenWeather, Last.fm, IDFM). Bien que `.env` soit dans `.gitignore`, tout accès au serveur (`cat .env`, backup, partage d'écran) expose ces secrets.
- **Impact :** Risque de vol de clés API, utilisation abusive, facturation non souhaitée.
- **Recommandation :** Utiliser un gestionnaire de secrets (ex: `.env` chiffré, passage par variables d'environnement système, ou outil comme `sops`). Documenter les clés manquantes dans les logs au démarrage (déjà fait) mais ne pas les laisser en clair sur le filesystem.

### 🟡 Importants

#### Architecture & Structure

#### 4. Monolithe de 777 lignes — `server.js`
- **Catégorie :** Architecture & Structure
- **Description :** Tout le backend (routes, cache, helpers, websocket, push, météo, musique, paroles, debug) tient dans un seul fichier `server.js`. Les dossiers `routes/` et `config/` existent mais sont totalement vides.
- **Impact :** Maintenance difficile, complexité cyclomatique élevée, conflits de merge fréquents, pas de séparation des responsabilités.
- **Recommandation :** Découper en `routes/weather.js`, `routes/music.js`, `routes/push.js`, `services/weather.js`, `services/push.js`, etc. Supprimer les dossiers vides.

#### 5. Pas de tests automatisés — `package.json:10`
- **Catégorie :** Qualité du code
- **Description :** Le script `test` est un placeholder : `echo \"Error: no test specified\" && exit 1`. Aucun fichier de test présent dans le projet (zéro fichier `*.test.js`, `*.spec.js`, `__tests__/`).
- **Impact :** Aucune garantie de non-régression. Toute modification est risquée. Impossible de faire du TDD ou d'avoir une CI fiable.
- **Recommandation :** Ajouter Vitest ou Jest. Commencer par des tests d'intégration sur les endpoints API critiques (`POST /api/music`, `GET /api/weather`, `POST /api/message`).

#### 6. Pas de linting ni de formatage — aucune config eslint/prettier
- **Catégorie :** Qualité du code
- **Description :** Aucun fichier `.eslintrc*`, `.prettierrc*`, `oxlint.json` ou équivalent. Le style du code est incohérent entre les fichiers (ex: `server.js` utilise des `require` normaux, `public/js/cache.js` utilise `async IIFE`, etc.).
- **Impact :** Incohérences de style, bugs silencieux, code difficile à relire.
- **Recommandation :** Configurer ESLint + Prettier. Ajouter un script `lint` et `format` dans `package.json`.

#### 7. Gestion d'erreurs inconsistante — `server.js:25,33,55,61,249,283,406,635`
- **Catégorie :** Qualité du code
- **Description :** Plusieurs blocs `catch` avalent les erreurs sans log (`/* ignore */` ligne 249, `.catch(() => {})` ligne 475) ou ne loggent que superficiellement. Le gestionnaire `uncaughtException` (ligne 759-762) empêche le processus de quitter, ce qui peut laisser l'application dans un état corrompu.
- **Impact :** Bugs difficiles à diagnostiquer, état potentiellement incohérent, fuites mémoire.
- **Recommandation :** Logger toutes les erreurs avec stack trace. Remplacer `/* ignore */` par au moins `console.error`. `uncaughtException` ne devrait pas empêcher la sortie — utiliser `pm2` ou un orchestrateur pour le redémarrage.

#### 8. Stocks d'adresses IP sans consentement ni durée de vie — `server.js:331` et `historique.html:179`
- **Catégorie :** Sécurité
- **Description :** Historique des messages avec IP brute affichée dans l'interface `historique.html`. Aucun mécanisme de purge, aucun consentement utilisateur, aucun .env pour activer/désactiver.
- **Impact :** Non-conformité RGPD (article 5-1-c : minimisation des données).
- **Recommandation :** Rendre le logging IP optionnel via variable d'environnement (`LOG_IP=false`). Anonymiser les IP stockées après 24h.

#### 9. Pas de HTTPS, pas de security headers — `server.js:80`
- **Catégorie :** Sécurité
- **Description :** Le serveur utilise `http.createServer` (pas de HTTPS). Aucun middleware de type Helmet.js pour les headers de sécurité (CSP, X-Frame-Options, HSTS, etc.). Le CORS est configuré manuellement mais basique.
- **Impact :** Vulnérabilité aux attaques MITM, clickjacking, XSS via headers manquants.
- **Recommandation :** Ajouter `helmet` et éventuellement un reverse proxy HTTPS (nginx/caddy). Configurer CSP.

#### 10. Données sensibles en cache non protégées — `cache/subscriptions.json`
- **Catégorie :** Sécurité
- **Description :** Les push subscriptions (contenant des endpoints uniques) sont stockées en clair dans `cache/subscriptions.json`. Les clés VAPID aussi en clair. Le dossier `cache/` n'est pas accessible via le serveur statique, mais tout accès direct au filesystem les expose.
- **Impact :** Risque modéré : ces données ne sont pas servies via HTTP mais sont en clair sur le disque.
- **Recommandation :** Déplacer `cache/` hors de la racine web. Vérifier que `express.static` ne sert pas `cache/`.

#### 11. Pas de CI/CD — aucun fichier `.github/`, `.gitlab-ci.yml`, etc.
- **Catégorie :** Configuration & Déploiement
- **Description :** Aucune pipeline CI ne valide les changements. Aucun déploiement automatisé.
- **Impact :** Tout changement est déployé manuellement, risque d'erreur humaine.
- **Recommandation :** Ajouter GitHub Actions pour lint + test (quand ils existeront) + déploiement.

#### 12. README insuffisant — `README.md`
- **Catégorie :** Documentation
- **Description :** Le README manque d'informations cruciales : API endpoints, architecture, variables d'environnement, comment contribuer, licence réelle (badge MIT mais pas de fichier LICENSE).
- **Impact :** Nouveaux développeurs perdent du temps à comprendre le projet.
- **Recommandation :** Documenter tous les endpoints API. Ajouter un fichier LICENSE. Documenter l'architecture.

#### 13. Pas de CHANGELOG ni versioning sémantique
- **Catégorie :** Documentation
- **Description :** Le `package.json` reste en `1.0.0` depuis le début. Aucun CHANGELOG. Impossible de savoir ce qui a changé entre deux déploiements.
- **Impact :** Traçabilité zéro des évolutions.
- **Recommandation :** Commencer un CHANGELOG.md, utiliser `npm version` pour versionner.

### 🟢 Mineurs

#### 14. Dossier `routes/` et `config/` vides — racine
- **Catégorie :** Architecture & Structure
- **Description :** Ces répertoires existent (dans git) mais sont vides. Ils suggèrent une architecture qui n'a pas été implémentée.
- **Recommandation :** Supprimer les dossiers vides inutilisés.

#### 15. `node_modules/fs` installé par erreur — `package.json:13`
- **Catégorie :** Dépendances
- **Description :** Le package `fs@0.0.1-security` est un package extraneous installé dans `node_modules`. Il est inutile car `fs` est natif.
- **Recommandation :** `npm uninstall fs`.

#### 16. Pas de lockfile commité ? — `package-lock.json` existe bien
- **Catégorie :** Dépendances
- **Description :** Bon point : `package-lock.json` est présent et commité. *(Note : vérifié OK)*
- **Recommandation :** RAS — c'est bien.

#### 17. Fonctions longues sans découpage — `server.js:445-476`, `public/screen.html` script complet (~400 lignes)
- **Catégorie :** Qualité du code
- **Description :** La gestion de la musique dans `screen.html` est un script inline de ~400 lignes avec des fonctions qui dépassent 50 lignes (`handleMusicData`, `hideMusicCard`). Pas de séparation en modules.
- **Recommandation :** Extraire le frontend JS dans des fichiers séparés (`public/js/screen.js`, `public/js/music.js`, `public/js/lyrics.js`).

#### 18. Noms de variables peu explicites — `server.js:202,239,261,725`
- **Catégorie :** Qualité du code
- **Description :** `isFresh` est une fonction (nom de variable booléen), `musicFetchGen`, `fetchGen`, `currentMusic` mêlé à `lastMusicEndAt`, etc.
- **Recommandation :** Renommer `isFresh` → `isEntryFresh` ou `isCacheFresh`. Groupe de constantes TTL dans un objet nommé.

#### 19. Injection possible via paramètres non validés — `public/screen.html` et `server.js`
- **Catégorie :** Sécurité
- **Description :** Les paramètres `track`, `artist`, `album` de `GET /api/lyrics` sont passés directement à LRCLib sans échappement suffisant. Aussi, le HTML dans `historique.html:181` utilise `escHtml` correctement, mais `screen.html:2459-2481` injecte via `innerHTML` des données météo (risque bas car OpenWeather est fiable).
- **Impact :** Théoriquement faible mais XSS possible si une API tierce est compromise.
- **Recommandation :** Valider et échapper toutes les entrées. Utiliser `textContent` plutôt que `innerHTML` partout où c'est possible.

#### 20. Pas de `.dockerignore` ni Dockerfile optimisé
- **Catégorie :** Configuration & Déploiement
- **Description :** Le projet a un `Dockerfile` ? Non, pas de Dockerfile du tout. La configuration de déploiement est absente.
- **Recommandation :** Si déploiement conteneurisé : ajouter Dockerfile multi-stage avec `.dockerignore`.

#### 21. Intervalle météo redondant — `public/screen.html:2452`
- **Catégorie :** Performance
- **Description :** `setInterval(getWeather, 30 * 60000)` = 30 min. Le cache serveur a un TTL de 10 min. Donc une requête inutile sur 3 sera servie depuis le cache serveur, mais il y a mieux : laisser le cache serveur gérer.
- **Recommandation :** Aligner les TTL client et serveur, ou utiliser un polling plus intelligent (ex: après chaque rafraîchissement, planifier le suivant à TTL_serveur + epsilon).

#### 22. `package.json:4` champ description vide
- **Catégorie :** Documentation
- **Description :** `"description": ""` — champ vide.
- **Recommandation :** Ajouter une description comme "Tableau de bord temps réel pour écran secondaire."

#### 23. La gestion de `VILLE_SHORT` peut prêter à confusion — `.env.example:13`
- **Catégorie :** Documentation
- **Description :** `VILLE_SHORT` a `VILLE` comme valeur par défaut, mais n'est pas documenté dans le README ni dans le `.env.example` commenté.
- **Recommandation :** Ajouter une ligne de commentaire explicative.

## Statistiques

- **Fichiers analysés :** 18 fichiers source (hors node_modules, cache, graphify, docs, .git)
- **Lignes de code :** ~5 800 (777 server.js + 298 services/lyricsCache.js + 3 682 screen.html + autres HTML/JS/CSS)
- **Tests :** 0 fichiers, 0 tests
- **Couverture :** 0%
- **Dépendances :** 5 directes (dont 1 malveillante `fs`), ~96 dans node_modules
- **Âge du projet :** 108 commits, 1 auteur, premier commit inconnu

## Prochaine action recommandée

1. **🔴 Urgent** : Supprimer `fs@0.0.1-security` de `package.json`
2. **🔴 Urgent** : Rendre le logging IP optionnel ou anonymisé (conformité RGPD)
3. **🟡 Prioritaire** : Mettre en place ESLint + tests de base (au moins smoke test des endpoints)
4. **🟡 Prioritaire** : Refactorer `server.js` en modules séparés
