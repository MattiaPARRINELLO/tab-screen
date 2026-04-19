// server.js
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const fetch      = require('node-fetch');
const fs         = require('fs');
const path       = require('path');
const dotenv     = require('dotenv');
const lyricsCache = require('./services/lyricsCache');

dotenv.config();

const PORT               = process.env.PORT || 3000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const LASTFM_API_KEY      = process.env.LASTFM_API_KEY;
const VILLE               = process.env.VILLE       || 'Franconville';
const VILLE_SHORT         = process.env.VILLE_SHORT || VILLE;
const NO_LYRICS_PATH      = path.join(__dirname, 'cache', 'no-lyrics.json');

if (!OPENWEATHER_API_KEY) console.warn('[config] ⚠  OPENWEATHER_API_KEY manquante');
if (!LASTFM_API_KEY)      console.warn('[config] ⚠  LASTFM_API_KEY manquante');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static('public'));
app.use(express.json());

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
    coords:   24 * 3600e3, // coordonnées : 24 h (ne changent jamais)
    weather:  10 * 60e3,   // météo : 10 min
    forecast: 30 * 60e3,   // prévisions : 30 min
};
const isFresh = (entry, ttl) => entry && (Date.now() - entry.ts) < ttl;

async function getCoords() {
    if (isFresh(weatherCache.coords, TTL.coords)) return weatherCache.coords.data;

    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(VILLE)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
    const res  = await fetchWithTimeout(url, 6000);
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
    '01d': 'clear_day',                        '01n': 'clear_night',
    '02d': 'partly_cloudy_day',                '02n': 'partly_cloudy_night',
    '03d': 'mostly_cloudy_day',                '03n': 'mostly_cloudy_night',
    '04d': 'cloudy',                           '04n': 'cloudy',
    '09d': 'showers_rain',                     '09n': 'showers_rain',
    '10d': 'rain_with_cloudy_dark',            '10n': 'rain_with_cloudy_dark',
    '11d': 'strong_thunderstorms',             '11n': 'strong_thunderstorms',
    '13d': 'snow_with_cloudy_dark',            '13n': 'snow_with_cloudy_dark',
    '50d': 'haze_fog_dust_smoke',              '50n': 'haze_fog_dust_smoke',
};

// ──────────────────────────────────────────────
// État musique
// ──────────────────────────────────────────────

let currentMusic = { title: '', artist: '', position: 0, duration: 0 };

// ──────────────────────────────────────────────
// Routes statiques
// ──────────────────────────────────────────────

app.get('/',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/screen', (req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));
app.get('/cache',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'cache.html')));

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
        const url  = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${OPENWEATHER_API_KEY}`;
        const resp = await fetchWithTimeout(url, 6000);
        const data = await resp.json();

        const iconCode = data.weather[0].icon;
        const payload  = {
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
        const url  = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${OPENWEATHER_API_KEY}`;
        const resp = await fetchWithTimeout(url, 6000);
        const data = await resp.json();

        const list = data.list.slice(0, 5).map(f => ({
            dt:          f.dt,
            temp:        Math.round(f.main.temp),
            description: f.weather[0].description,
            icon:        weatherIconMap[f.weather[0].icon] || 'cloudy',
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

    currentMusic = {
        title,
        artist,
        album:     album || '',
        position:  Number(position)  || 0,
        duration:  Number(duration)  || 0,
        cover:     '',
        startTime: Date.now(),
    };

    // Répondre et émettre immédiatement (sans attendre la cover)
    res.sendStatus(200);
    io.emit('musicData', currentMusic);

    // Chercher la cover de façon asynchrone, puis réémettre si trouvée
    fetchCover(title, artist).then(cover => {
        if (!cover) return;
        // Vérifier que la musique n'a pas changé entre-temps
        if (currentMusic.title !== title || currentMusic.artist !== artist) return;
        currentMusic.cover = cover;
        io.emit('musicData', { ...currentMusic, position: currentMusic.position + (Date.now() - currentMusic.startTime) / 1000 });
    }).catch(() => {});
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
    return item.album.cover_xl || item.album.cover_big || item.album.cover_medium || '';
}

/** Cherche sur Deezer avec une requête donnée, retourne la meilleure cover */
async function deezerSearch(query, title, artist) {
    const url  = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
    const resp = await fetchWithTimeout(url, 7000);
    const data = await resp.json();
    if (!data.data?.length) return '';

    const titleLow  = title.toLowerCase();
    const artistLow = artist.toLowerCase();
    const normLow   = normalizeTitle(title).toLowerCase();

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
        const url  = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`;
        const resp = await fetchWithTimeout(url, 6000);
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
    if (!currentMusic.title) return;

    const elapsed         = (Date.now() - (currentMusic.startTime || Date.now())) / 1000;
    const adjustedPosition = currentMusic.position + elapsed;

    if (adjustedPosition < currentMusic.duration) {
        socket.emit('musicData', { ...currentMusic, position: adjustedPosition });
    }
});

// ──────────────────────────────────────────────
// Paroles
// ──────────────────────────────────────────────

app.get('/api/lyrics', async (req, res) => {
    const track  = req.query.track  || req.query.track_name  || req.query.trackName;
    const artist = req.query.artist || req.query.artist_name || req.query.artistName;
    const album  = req.query.album  || req.query.album_name  || req.query.albumName;

    if (!track || !artist) return res.status(400).json({ error: 'Missing track or artist' });

    try {
        const syncedLyrics = await lyricsCache.getLyrics(track, artist, album);
        if (syncedLyrics) return res.json({ syncedLyrics });

        const fallback = await lyricsCache.tryVariants(track, artist, album);
        if (fallback?.syncedLyrics) {
            return res.json({ syncedLyrics: fallback.syncedLyrics, usedVariant: fallback.used });
        }

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
    if (!fs.existsSync(NO_LYRICS_DIR))  fs.mkdirSync(NO_LYRICS_DIR, { recursive: true });
    if (!fs.existsSync(NO_LYRICS_PATH)) fs.writeFileSync(NO_LYRICS_PATH, '[]', 'utf8');
}

async function addNoLyricsEntry(track, artist) {
    ensureNoLyricsFile();
    const safeTrack  = String(track  || '').trim();
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
    try   { ensureNoLyricsFile(); res.sendFile(NO_LYRICS_PATH); }
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
