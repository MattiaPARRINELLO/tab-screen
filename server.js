// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const lyricsCache = require('./services/lyricsCache');

// ──────────────────────────────────────────────
// Push notifications (VAPID)
// ──────────────────────────────────────────────

const webPush = require('web-push');
const VAPID_KEYS_PATH = path.join(__dirname, 'cache', 'vapid-keys.json');
const SUBSCRIPTIONS_PATH = path.join(__dirname, 'cache', 'subscriptions.json');

function loadVapidKeys() {
    try {
        if (fs.existsSync(VAPID_KEYS_PATH)) {
            return JSON.parse(fs.readFileSync(VAPID_KEYS_PATH, 'utf8'));
        }
    } catch (e) { console.error('[vapid] Erreur lecture clés:', e.message); }
    return null;
}

function saveVapidKeys(keys) {
    try {
        fs.mkdirSync(path.dirname(VAPID_KEYS_PATH), { recursive: true });
        fs.writeFileSync(VAPID_KEYS_PATH, JSON.stringify(keys, null, 2));
    } catch (e) { console.error('[vapid] Erreur écriture clés:', e.message); }
}

let vapidKeys = loadVapidKeys();
if (!vapidKeys) {
    console.log('[vapid] Génération de nouvelles clés…');
    vapidKeys = webPush.generateVAPIDKeys();
    saveVapidKeys(vapidKeys);
}

webPush.setVapidDetails(
    'mailto:admin@tab-screen.local',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

function loadSubscriptions() {
    try {
        if (fs.existsSync(SUBSCRIPTIONS_PATH)) {
            return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_PATH, 'utf8'));
        }
    } catch (e) { console.error('[push] Erreur lecture abonnements:', e.message); }
    return [];
}

function saveSubscriptions(subs) {
    try {
        fs.mkdirSync(path.dirname(SUBSCRIPTIONS_PATH), { recursive: true });
        fs.writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify(subs, null, 2));
    } catch (e) { console.error('[push] Erreur écriture abonnements:', e.message); }
}

let subscriptions = loadSubscriptions();
console.log(`[push] ${subscriptions.length} abonnement(s) au démarrage`);

dotenv.config();

const PORT = process.env.PORT || 3000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const VILLE = process.env.VILLE || 'Franconville';
const VILLE_SHORT = process.env.VILLE_SHORT || VILLE;
const NO_LYRICS_PATH = path.join(__dirname, 'cache', 'no-lyrics.json');
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://youyou.mprnl.fr';

if (!OPENWEATHER_API_KEY) console.warn('[config] ⚠  OPENWEATHER_API_KEY manquante');
if (!LASTFM_API_KEY) console.warn('[config] ⚠  LASTFM_API_KEY manquante');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin === CORS_ORIGIN || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ──────────────────────────────────────────────
// Push notification routes
// ──────────────────────────────────────────────

app.get('/api/push/public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/push/subscribe', (req, res) => {
    const sub = req.body;
    if (!sub || !sub.endpoint) {
        return res.status(400).json({ error: 'Abonnement invalide' });
    }
    const exists = subscriptions.some(s => s.endpoint === sub.endpoint);
    if (!exists) {
        subscriptions.push(sub);
        saveSubscriptions(subscriptions);
        console.log(`[push] Nouvel abonnement (${subscriptions.length} total)`);
    }
    res.json({ ok: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
    const sub = req.body;
    if (!sub || !sub.endpoint) {
        return res.status(400).json({ error: 'Abonnement invalide' });
    }
    const before = subscriptions.length;
    subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
    if (subscriptions.length < before) {
        saveSubscriptions(subscriptions);
        console.log(`[push] Désabonnement (${subscriptions.length} restant(s))`);
    }
    res.json({ ok: true });
});

app.post('/api/push/send', async (req, res) => {
    const { title, body } = req.body;
    if (!title && !body) {
        return res.status(400).json({ error: 'Titre ou message requis' });
    }

    const payload = JSON.stringify({
        title: title || 'Tab Screen',
        body: body || '',
    });

    const results = await Promise.allSettled(
        subscriptions.map(sub =>
            webPush.sendNotification(sub, payload).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    return { expired: true, sub };
                }
                throw err;
            })
        )
    );

    const expiredEndpoints = results
        .filter(r => r.status === 'fulfilled' && r.value?.expired)
        .map(r => r.value.sub.endpoint);

    if (expiredEndpoints.length > 0) {
        subscriptions = subscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
        saveSubscriptions(subscriptions);
    }

    res.json({ ok: true, sent: subscriptions.length, expired: expiredEndpoints.length });
});

app.get('/api/push/subscriptions/count', (req, res) => {
    res.json({ count: subscriptions.length });
});

app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));

app.get('/notify', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'notify.html'));
});

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** fetch avec timeout automatique (AbortController) */
function fetchWithTimeout(url, timeoutMs = 5000, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

// ──────────────────────────────────────────────
// Cache météo en mémoire (évite un appel API par requête)
// ──────────────────────────────────────────────

const weatherCache = { coords: null, weather: null, forecast: null };
const TTL = {
    coords: 24 * 3600e3, // coordonnées : 24 h (ne changent jamais)
    weather: 10 * 60e3,   // météo : 10 min
    forecast: 30 * 60e3,   // prévisions : 30 min
};
const isFresh = (entry, ttl) => entry && (Date.now() - entry.ts) < ttl;

async function getCoords() {
    if (isFresh(weatherCache.coords, TTL.coords)) return weatherCache.coords.data;

    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(VILLE)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) throw new Error(`OpenWeather geocoding HTTP ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data) || !data.length) throw new Error(`Ville introuvable : ${VILLE}`);
    const { lat, lon } = data[0];
    console.log(`[weather] Coordonnées ${VILLE} : ${lat}, ${lon}`);
    weatherCache.coords = { data: { lat, lon }, ts: Date.now() };
    return { lat, lon };
}

// ──────────────────────────────────────────────
// Icônes météo
// ──────────────────────────────────────────────

const weatherIconMap = {
    '01d': 'clear_day', '01n': 'clear_night',
    '02d': 'partly_cloudy_day', '02n': 'partly_cloudy_night',
    '03d': 'mostly_cloudy_day', '03n': 'mostly_cloudy_night',
    '04d': 'cloudy', '04n': 'cloudy',
    '09d': 'showers_rain', '09n': 'showers_rain',
    '10d': 'rain_with_cloudy_dark', '10n': 'rain_with_cloudy_dark',
    '11d': 'strong_thunderstorms', '11n': 'strong_thunderstorms',
    '13d': 'snow_with_cloudy_dark', '13n': 'snow_with_cloudy_dark',
    '50d': 'haze_fog_dust_smoke', '50n': 'haze_fog_dust_smoke',
};

// ──────────────────────────────────────────────
// État musique
// ──────────────────────────────────────────────

let currentMusic = { title: '', artist: '', position: 0, duration: 0 };
const LAST_MUSIC_PATH = path.join(__dirname, 'cache', 'last-music-end.json');
let lastMusicEndAt = null;

function loadLastMusicEndAt() {
    try {
        if (fs.existsSync(LAST_MUSIC_PATH)) {
            const data = JSON.parse(fs.readFileSync(LAST_MUSIC_PATH, 'utf8'));
            return data.lastMusicEndAt || null;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function saveLastMusicEndAt() {
    try {
        fs.mkdirSync(path.dirname(LAST_MUSIC_PATH), { recursive: true });
        fs.writeFileSync(LAST_MUSIC_PATH, JSON.stringify({ lastMusicEndAt }));
    } catch (e) { console.error('[music] Erreur écriture lastMusicEndAt:', e.message); }
}

lastMusicEndAt = loadLastMusicEndAt();
let musicFetchGen = 0;

// ──────────────────────────────────────────────
// Routes statiques
// ──────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/screen', (req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));
app.get('/screen/low-end', (req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));
app.get('/cache', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cache.html')));
app.get('/message', (req, res) => res.sendFile(path.join(__dirname, 'public', 'message.html')));
app.get('/music', (req, res) => res.sendFile(path.join(__dirname, 'public', 'music.html')));
app.get('/historique', (req, res) => res.sendFile(path.join(__dirname, 'public', 'historique.html')));

// ──────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────

const MESSAGES_PATH = path.join(__dirname, 'cache', 'messages.json');

function loadMessages() {
    try {
        if (fs.existsSync(MESSAGES_PATH)) {
            return JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf8'));
        }
    } catch (e) { console.error('[messages] Erreur lecture:', e.message); }
    return [];
}

function saveMessages(msgs) {
    try {
        fs.mkdirSync(path.dirname(MESSAGES_PATH), { recursive: true });
        fs.writeFileSync(MESSAGES_PATH, JSON.stringify(msgs, null, 2));
    } catch (e) { console.error('[messages] Erreur écriture:', e.message); }
}

function normalizeMessageHistory(msgs) {
    if (!Array.isArray(msgs)) return { normalized: [], changed: false };
    let hasActiveMessage = false;
    let changed = false;

    const normalized = msgs.map((msg) => {
        if (!msg || typeof msg !== 'object') { changed = true; return null; }
        if (msg.dismissedAt) return msg;

        if (!hasActiveMessage) {
            hasActiveMessage = true;
            return { ...msg };
        }

        changed = true;
        return { ...msg, dismissedAt: msg.sentAt || Date.now() };
    }).filter(Boolean);

    return { normalized, changed };
}

let messageHistory = loadMessages();
const normalizedMessages = normalizeMessageHistory(messageHistory);
messageHistory = normalizedMessages.normalized;
if (normalizedMessages.changed) saveMessages(messageHistory);

let pendingMessage = messageHistory.find((msg) => !msg.dismissedAt) || null;

app.post('/api/message', async (req, res) => {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Message vide' });
    if (text.length > 500) return res.status(400).json({ error: 'Message trop long (500 caractères max)' });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const entry = { text, sentAt: Date.now(), ip };

    if (pendingMessage && !pendingMessage.dismissedAt) {
        pendingMessage.dismissedAt = Date.now();
    }
    pendingMessage = entry;
    messageHistory.unshift(entry);          // plus récent en premier
    saveMessages(messageHistory);

    io.emit('popupMessage', pendingMessage);

    // Envoyer une notification push à tous les abonnés
    const pushPayload = JSON.stringify({
        title: '💌 Nouveau message',
        body: text.length > 80 ? text.slice(0, 80) + '…' : text,
    });

    const results = await Promise.allSettled(
        subscriptions.map(sub =>
            webPush.sendNotification(sub, pushPayload).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    return { expired: true, endpoint: sub.endpoint };
                }
                throw err;
            })
        )
    );

    const expiredEndpoints = results
        .filter(r => r.status === 'fulfilled' && r.value?.expired)
        .map(r => r.value.endpoint);

    if (expiredEndpoints.length > 0) {
        subscriptions = subscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
        saveSubscriptions(subscriptions);
    }

    const succeeded = results.filter(r => r.status === 'fulfilled' && !r.value?.expired).length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[push] Message envoyé via push : ${succeeded} envoyé(s), ${expiredEndpoints.length} expiré(s), ${failed} échec(s)`);

    res.json({ ok: true });
});

app.get('/api/messages', (req, res) => res.json(messageHistory));

// ──────────────────────────────────────────────
// Météo
// ──────────────────────────────────────────────

app.get('/api/weather', async (req, res) => {
    // Retourner depuis le cache si frais
    if (isFresh(weatherCache.weather, TTL.weather)) {
        return res.json(weatherCache.weather.data);
    }

    try {
        const { lat, lon } = await getCoords();
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${OPENWEATHER_API_KEY}`;
        const resp = await fetchWithTimeout(url, 6000);
        if (!resp.ok) throw new Error(`OpenWeather weather HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.weather || !data.weather[0]) throw new Error('Réponse météo invalide');

        const iconCode = data.weather[0].icon;
        const payload = {
            name: VILLE_SHORT,
            temp: Math.round(data.main.temp),
            desc: data.weather[0].description,
            icon: weatherIconMap[iconCode] || 'cloudy',
        };

        weatherCache.weather = { data: payload, ts: Date.now() };
        res.json(payload);
    } catch (e) {
        console.error('[weather] Erreur :', e.message);
        res.status(500).json({ error: 'Erreur météo' });
    }
});

app.get('/api/forecast', async (req, res) => {
    if (isFresh(weatherCache.forecast, TTL.forecast)) {
        return res.json(weatherCache.forecast.data);
    }

    try {
        const { lat, lon } = await getCoords();
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${OPENWEATHER_API_KEY}`;
        const resp = await fetchWithTimeout(url, 6000);
        if (!resp.ok) throw new Error(`OpenWeather forecast HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.list || !Array.isArray(data.list)) throw new Error('Réponse prévisions invalide');

        const list = data.list.slice(0, 5).map(f => ({
            dt: f.dt,
            temp: Math.round(f.main.temp),
            description: f.weather[0].description,
            icon: weatherIconMap[f.weather[0].icon] || 'cloudy',
        }));

        const payload = { list };
        weatherCache.forecast = { data: payload, ts: Date.now() };
        res.json(payload);
    } catch (err) {
        console.error('[forecast] Erreur :', err.message);
        res.status(500).json({ error: 'Erreur prévisions' });
    }
});

// ──────────────────────────────────────────────
// Musique — reçu depuis Tasker / autre client
// ──────────────────────────────────────────────

app.post('/api/music', async (req, res) => {
    const { title, artist, album, position, duration } = req.body;

    if (!title || !artist) return res.sendStatus(400);

    // Si un morceau était en cours, enregistrer quand il s'est arrêté
    if (currentMusic.title) { lastMusicEndAt = Date.now(); saveLastMusicEndAt(); }

    const fetchGen = ++musicFetchGen;
    const startTime = Date.now();

    currentMusic = {
        title,
        artist,
        album: album || '',
        position: Number(position) || 0,
        duration: Number(duration) || 0,
        cover: '',
        startTime,
    };

    // Répondre et émettre immédiatement (sans attendre la cover)
    res.sendStatus(200);
    io.emit('musicData', currentMusic);

    // Chercher la cover de façon asynchrone, puis réémettre si trouvée
    fetchCover(title, artist).then(cover => {
        if (!cover || fetchGen !== musicFetchGen) return;
        currentMusic.cover = cover;
        io.emit('musicData', { ...currentMusic, position: (currentMusic.position || 0) + (Date.now() - startTime) / 1000 });
    }).catch(() => { });
});

/** Retire les suffixes parasites d'un titre ("feat.", "(Radio Edit)", etc.) */
function normalizeTitle(title) {
    return title
        .replace(/\s*[\(\[](feat\.?|ft\.?|featuring|with)[^\)\]]*[\)\]]/gi, '')
        .replace(/\s*[-–—]\s*(radio edit|single|remaster.*|live.*|acoustic.*|version.*)$/gi, '')
        .trim() || title;
}

/** Meilleure cover disponible parmi les champs Deezer */
function bestDeezerCover(item) {
    const album = item && item.album;
    if (!album) return '';
    return album.cover_xl || album.cover_big || album.cover_medium || '';
}

/** Cherche sur Deezer avec une requête donnée, retourne la meilleure cover */
async function deezerSearch(query, title, artist) {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
    const resp = await fetchWithTimeout(url, 7000);
    if (!resp.ok) { console.error('[cover] Deezer HTTP', resp.status); return ''; }
    const data = await resp.json();
    if (!data.data?.length) return '';

    const titleLow = title.toLowerCase();
    const artistLow = artist.toLowerCase();
    const normLow = normalizeTitle(title).toLowerCase();

    // 1. Match exact titre + artiste
    const exact = data.data.find(
        i => i.title.toLowerCase() === titleLow
            && i.artist.name.toLowerCase() === artistLow
    );
    if (exact) return bestDeezerCover(exact);

    // 2. Match titre normalisé + artiste
    const normMatch = data.data.find(
        i => i.title.toLowerCase() === normLow
            && i.artist.name.toLowerCase() === artistLow
    );
    if (normMatch) return bestDeezerCover(normMatch);

    // 3. Premier résultat contenant le titre normalisé
    const partial = data.data.find(
        i => i.title.toLowerCase().includes(normLow)
    );
    if (partial) return bestDeezerCover(partial);

    // 4. Premier résultat tout court
    return bestDeezerCover(data.data[0]);
}

/** Cherche la cover sur Deezer (3 stratégies) puis Last.fm en fallback */
async function fetchCover(title, artist) {
    const norm = normalizeTitle(title);

    // Stratégies Deezer du plus précis au plus large
    const queries = [
        `artist:"${artist}" track:"${title}"`,
        ...(norm !== title ? [`artist:"${artist}" track:"${norm}"`] : []),
        `${artist} ${norm}`,
    ];

    for (const query of queries) {
        try {
            const cover = await deezerSearch(query, title, artist);
            if (cover) {
                console.log(`[cover] Deezer OK : ${query.slice(0, 60)}`);
                return cover;
            }
        } catch (e) {
            console.error('[cover] Deezer :', e.message);
        }
    }

    // Last.fm fallback
    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`;
        const resp = await fetchWithTimeout(url, 6000);
        if (!resp.ok) { console.error('[cover] Last.fm HTTP', resp.status); return ''; }
        const data = await resp.json();
        const cover = data?.track?.album?.image?.find(img => img.size === 'extralarge')?.['#text'] || '';
        if (cover) console.log('[cover] Last.fm OK');
        return cover;
    } catch (e) {
        console.error('[cover] Last.fm :', e.message);
        return '';
    }
}

// ──────────────────────────────────────────────
// Socket.IO — rattrapage à la connexion
// ──────────────────────────────────────────────

io.on('connection', socket => {
    // Rattrapage musique
    if (currentMusic.title) {
        const elapsed = (Date.now() - (currentMusic.startTime || Date.now())) / 1000;
        const adjustedPosition = currentMusic.position + elapsed;
        if (adjustedPosition < currentMusic.duration) {
            socket.emit('musicData', { ...currentMusic, position: adjustedPosition });
        } else if (lastMusicEndAt === null) {
            lastMusicEndAt = (currentMusic.startTime || Date.now()) + (currentMusic.duration - currentMusic.position) * 1000;
            saveLastMusicEndAt();
        }
    }

    // Rattrapage message en attente (persiste après refresh)
    if (pendingMessage) {
        socket.emit('popupMessage', pendingMessage);
    }

    // Le client signale que le message a été fermé → on l'efface
    socket.on('dismissMessage', () => {
        if (pendingMessage && !pendingMessage.dismissedAt) {
            pendingMessage.dismissedAt = Date.now();
            saveMessages(messageHistory);
        }
        pendingMessage = null;
        // Propager la fermeture à tous les autres écrans ouverts
        socket.broadcast.emit('dismissMessage');
    });

    // Le client demande explicitement l'état musique actuel
    // (utile après visibilitychange sur tablette quand la position a sauté).
    // On évite d'envoyer un musicData avec position >= duration car le client
    // n'a pas de gestion propre pour ce cas → on envoie musicStateEnded à la place.
    socket.on('requestMusicState', () => {
        if (currentMusic.title) {
            const elapsed = (Date.now() - (currentMusic.startTime || Date.now())) / 1000;
            const adjustedPosition = currentMusic.position + elapsed;
            if (adjustedPosition < currentMusic.duration) {
                socket.emit('musicData', { ...currentMusic, position: adjustedPosition });
                return;
            }
            if (lastMusicEndAt === null) {
                lastMusicEndAt = (currentMusic.startTime || Date.now()) + (currentMusic.duration - currentMusic.position) * 1000;
                saveLastMusicEndAt();
            }
        }
        socket.emit('musicStateEnded', { lastMusicEndAt });
    });
});

// ──────────────────────────────────────────────
// Paroles
// ──────────────────────────────────────────────

app.get('/api/lyrics', async (req, res) => {
    const track = req.query.track || req.query.track_name || req.query.trackName;
    const artist = req.query.artist || req.query.artist_name || req.query.artistName;
    const album = req.query.album || req.query.album_name || req.query.albumName;

    if (!track || !artist) return res.status(400).json({ error: 'Missing track or artist' });

    try {
        const syncedLyrics = await lyricsCache.getLyrics(track, artist, album);
        if (syncedLyrics) return res.json({ syncedLyrics });

        await addNoLyricsEntry(track, artist);
        return res.status(404).json({ error: 'Paroles introuvables' });
    } catch (err) {
        console.error('[lyrics] Erreur :', err.message);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

app.get('/api/lyrics-cache', async (req, res) => {
    try {
        res.json({ list: await lyricsCache.listCached() });
    } catch (err) {
        console.error('[lyrics-cache] Erreur :', err.message);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

app.get('/api/lyrics-cache/:file', async (req, res) => {
    try {
        const entry = await lyricsCache.readEntryByFile(req.params.file);
        if (!entry) return res.status(404).json({ error: 'Fichier introuvable' });
        res.json({ entry });
    } catch (err) {
        console.error('[lyrics-cache/:file] Erreur :', err.message);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// ──────────────────────────────────────────────
// No-lyrics list
// ──────────────────────────────────────────────

const NO_LYRICS_DIR = path.dirname(NO_LYRICS_PATH);

function ensureNoLyricsFile() {
    if (!fs.existsSync(NO_LYRICS_DIR)) fs.mkdirSync(NO_LYRICS_DIR, { recursive: true });
    if (!fs.existsSync(NO_LYRICS_PATH)) fs.writeFileSync(NO_LYRICS_PATH, '[]', 'utf8');
}

async function addNoLyricsEntry(track, artist) {
    ensureNoLyricsFile();
    const safeTrack = String(track || '').trim();
    const safeArtist = String(artist || '').trim();
    if (!safeTrack && !safeArtist) return;

    let list = [];
    try {
        const parsed = JSON.parse(await fs.promises.readFile(NO_LYRICS_PATH, 'utf8'));
        if (Array.isArray(parsed)) {
            list = parsed
                .map(item => {
                    if (Array.isArray(item) && item.length >= 2)
                        return [String(item[0] || '').trim(), String(item[1] || '').trim()];
                    if (typeof item === 'string') {
                        const m = item.match(/^\[\[(.*?),\s*(.*?)\s*\]\]$/);
                        if (m) return [m[1].trim(), m[2].trim()];
                    }
                    return null;
                })
                .filter(Boolean);
        }
    } catch { list = []; }

    if (!list.some(([t, a]) => t === safeTrack && a === safeArtist)) {
        list.push([safeTrack, safeArtist]);
        await fs.promises.writeFile(NO_LYRICS_PATH, JSON.stringify(list, null, 2), 'utf8');
    }
}

app.get('/nolyrics', (req, res) => {
    try { ensureNoLyricsFile(); res.sendFile(NO_LYRICS_PATH); }
    catch (err) { console.error('[nolyrics]', err.message); res.status(500).json([]); }
});

app.post('/api/nolyrics/reset', async (req, res) => {
    try {
        ensureNoLyricsFile();
        await fs.promises.writeFile(NO_LYRICS_PATH, '[]', 'utf8');
        res.json({ ok: true });
    } catch (err) {
        console.error('[nolyrics/reset]', err.message);
        res.status(500).json({ ok: false });
    }
});

// ──────────────────────────────────────────────
// Debug / logs distants
// ──────────────────────────────────────────────

const DEBUG_LOGS = [];
const MAX_DEBUG_LOGS = 500;

function captureLog(level, args) {
    const entry = { level, msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), ts: Date.now() };
    DEBUG_LOGS.push(entry);
    if (DEBUG_LOGS.length > MAX_DEBUG_LOGS) DEBUG_LOGS.splice(0, DEBUG_LOGS.length - MAX_DEBUG_LOGS);
}

// Rediriger console vers le buffer de debug
['log', 'warn', 'error', 'info'].forEach(lvl => {
    const orig = console[lvl];
    console[lvl] = function () { captureLog(lvl, Array.from(arguments)); return orig.apply(console, arguments); };
});

app.post('/api/debug/log', (req, res) => {
    const { level, message, stack } = req.body || {};
    if (message) captureLog(level || 'client', [message + (stack ? '\n' + stack : '')]);
    res.json({ ok: true });
});

app.get('/api/debug/logs', (req, res) => {
    const n = parseInt(req.query.n) || 100;
    res.json({ logs: DEBUG_LOGS.slice(-n) });
});

// ──────────────────────────────────────────────
// Process-level error handlers
// ──────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
    console.error('[process] Unhandled Rejection:', reason instanceof Error ? reason.message : reason);
});

process.on('uncaughtException', (err) => {
    console.error('[process] Uncaught Exception:', err.message);
    // Ne pas quitter — laisser Express continuer à servir
});

// ──────────────────────────────────────────────
// Démarrage
// ──────────────────────────────────────────────

// Préchauffer les coordonnées au démarrage (évite la latence au 1er appel météo)
if (OPENWEATHER_API_KEY) {
    getCoords().catch(e => console.error('[startup] Coordonnées :', e.message));
}

try { lyricsCache.startCleanup(); } catch (e) { console.error('[startup] Lyrics cache :', e); }

server.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT}`);
});
