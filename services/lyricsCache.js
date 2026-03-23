
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const zlib = require('zlib');
const { promisify } = require('util');
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const CACHE_DIR = path.join(__dirname, '..', 'cache', 'lyrics');
const MAX_AGE_DAYS = 30; // keep entries for 30 days

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function keyHash(artist, track, album) {
    const key = `${artist || ''}|||${track || ''}|||${album || ''}`.toLowerCase();
    return crypto.createHash('sha1').update(key).digest('hex');
}

function baseCachePath(hash) {
    return path.join(CACHE_DIR, hash);
}

function minifyLRC(lrc) {
    if (!lrc || typeof lrc !== 'string') return lrc;
    const lines = lrc.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = lines.map(l => l.replace(/\s{2,}/g, ' ')).join('\n');
    return out;
}

async function readCache(hash) {
    try {
        const base = baseCachePath(hash);
        const gzPath = base + '.gz';
        const jsonPath = base + '.json';

        if (fs.existsSync(gzPath)) {
            const buf = await fs.promises.readFile(gzPath);
            const decompressed = await gunzipAsync(buf);
            const obj = JSON.parse(decompressed.toString('utf8'));
            return obj;
        }

        // Fallback for old json files: convert to gz on first read
        if (fs.existsSync(jsonPath)) {
            const content = await fs.promises.readFile(jsonPath, 'utf8');
            const obj = JSON.parse(content);
            try {
                const compressed = await gzipAsync(Buffer.from(JSON.stringify(obj)), { level: zlib.constants.Z_BEST_COMPRESSION });
                await fs.promises.writeFile(gzPath, compressed);
                try { await fs.promises.unlink(jsonPath); } catch (e) { }
            } catch (e) { }
            return obj;
        }

        return null;
    } catch (e) {
        return null;
    }
}

async function writeCache(hash, obj) {
    try {
        const base = baseCachePath(hash);
        const gzPath = base + '.gz';
        const toStore = JSON.stringify(obj);
        const compressed = await gzipAsync(Buffer.from(toStore), { level: zlib.constants.Z_BEST_COMPRESSION });
        await fs.promises.writeFile(gzPath, compressed);
        console.log(`lyricsCache: wrote ${gzPath} (${compressed.length} bytes)`);
    } catch (e) {
        console.error('lyricsCache: write error', e);
    }
}

async function fetchFromRemote(artist, track, album) {
    try {
        const pickSynced = (data) => {
            if (!Array.isArray(data) || data.length === 0) return null;
            const match = data.find(item => item && typeof item.syncedLyrics === 'string' && item.syncedLyrics.trim());
            return match ? match.syncedLyrics : null;
        };

        // 1) Precise get by dedicated fields (album optional)
        const getParams = new URLSearchParams({ track_name: track, artist_name: artist });
        if (album && String(album).trim()) {
            getParams.set('album_name', String(album).trim());
        }
        const getRes = await fetch(`https://lrclib.net/api/get?${getParams.toString()}`);
        if (getRes.ok) {
            const getData = await getRes.json();
            if (getData && typeof getData.syncedLyrics === 'string' && getData.syncedLyrics.trim()) {
                return getData.syncedLyrics;
            }
        }

        // 2) Strict search by dedicated fields
        const strictParams = new URLSearchParams({ track_name: track, artist_name: artist });
        if (album && String(album).trim()) {
            strictParams.set('album_name', String(album).trim());
        }
        const strictRes = await fetch(`https://lrclib.net/api/search?${strictParams.toString()}`);
        if (strictRes.ok) {
            const strictData = await strictRes.json();
            const strictSynced = pickSynced(strictData);
            if (strictSynced) return strictSynced;
        }

        // 3) Fallback global search with quoted query
        const quotedQuery = `"${(track || '').trim()} ${(artist || '').trim()}"`.trim();
        const quotedParams = new URLSearchParams({ q: quotedQuery });
        const quotedRes = await fetch(`https://lrclib.net/api/search?${quotedParams.toString()}`);
        if (quotedRes.ok) {
            const quotedData = await quotedRes.json();
            const quotedSynced = pickSynced(quotedData);
            if (quotedSynced) return quotedSynced;
        }

        // 4) Fallback global search without quotes
        const looseQuery = `${(track || '').trim()} ${(artist || '').trim()}`.trim();
        if (!looseQuery) return null;
        const looseParams = new URLSearchParams({ q: looseQuery });
        const looseRes = await fetch(`https://lrclib.net/api/search?${looseParams.toString()}`);
        if (!looseRes.ok) return null;
        const looseData = await looseRes.json();
        return pickSynced(looseData);
    } catch (e) {
        return null;
    }
}

function stripFeatTags(s) {
    if (!s || typeof s !== 'string') return s;
    let out = s;
    // remove parenthetical/bracketed feat parts e.g. (feat. X) or [feat X]
    out = out.replace(/\s*[\(\[][^\)\]]*(?:feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]/i, '');
    // remove trailing " - feat X" or similar
    out = out.replace(/\s*[-–—:]\s*(?:feat\.?|ft\.?|featuring)\b.*$/i, '');
    // remove inline " feat. X" at end
    out = out.replace(/\s+(?:feat\.?|ft\.?|featuring)\b.*$/i, '');
    return out.trim();
}

function generateVariants(originalTrack, originalArtist) {
    const variants = [];
    const t = (originalTrack || '').trim();
    const a = (originalArtist || '').trim();
    // start with original
    variants.push({ track: t, artist: a });

    // stripped track (remove feat tags)
    const strippedTrack = stripFeatTags(t);
    if (strippedTrack && strippedTrack.toLowerCase() !== t.toLowerCase()) {
        variants.push({ track: strippedTrack, artist: a });
    }

    // stripped artist
    const strippedArtist = stripFeatTags(a);
    if (strippedArtist && strippedArtist.toLowerCase() !== a.toLowerCase()) {
        variants.push({ track: t, artist: strippedArtist });
        if (strippedTrack && strippedTrack.toLowerCase() !== t.toLowerCase()) {
            variants.push({ track: strippedTrack, artist: strippedArtist });
        }
    }

    // unique by track|artist
    const seen = new Set();
    return variants.filter(v => {
        const key = `${(v.track || '').toLowerCase()}|||${(v.artist || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function getLyrics(track, artist, album) {
    ensureCacheDir();
    const hash = keyHash(artist, track, album);
    const existing = await readCache(hash);
    const now = Date.now();

    if (existing && existing.syncedLyrics && existing.timestamp) {
        const age = now - existing.timestamp;
        if (age <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
            return existing.syncedLyrics;
        }
    }

    // Not in cache or expired: fetch from remote
    // Try fetching with a few sensible variants (remove feat info etc.)
    const variants = generateVariants(track, artist);
    let found = null;
    for (const v of variants) {
        const syncedRaw = await fetchFromRemote(v.artist, v.track, album);
        if (syncedRaw) {
            found = { syncedRaw, used: v };
            break;
        }
    }

    if (found) {
        const synced = minifyLRC(found.syncedRaw);
        // store metadata with original track/artist but note used variant in stored track if desired
        const obj = { track, artist, album: album || null, syncedLyrics: synced, timestamp: now };
        await writeCache(hash, obj);
        return synced;
    }

    // Return cached even if expired (fallback) to avoid empty result
    if (existing && existing.syncedLyrics) return existing.syncedLyrics;
    return null;
}

function pruneOld() {
    // Cache désormais persistant : pas de suppression automatique
    ensureCacheDir();
}

function startCleanup() {
    // Cache persistant : nettoyage désactivé
    ensureCacheDir();
}

module.exports = { getLyrics, startCleanup };

async function listCached() {
    ensureCacheDir();
    const out = [];
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.gz'));
    for (const f of files) {
        const p = path.join(CACHE_DIR, f);
        try {
            const stat = fs.statSync(p);
            const buf = await fs.promises.readFile(p);
            const decompressed = await gunzipAsync(buf);
            const obj = JSON.parse(decompressed.toString('utf8'));
            out.push({
                file: f,
                track: obj.track || null,
                artist: obj.artist || null,
                album: obj.album || null,
                timestamp: obj.timestamp || stat.mtimeMs,
                size: stat.size,
                preview: typeof obj.syncedLyrics === 'string' ? obj.syncedLyrics.split('\n')[0] : null
            });
        } catch (e) {
            // ignore individual file errors
        }
    }
    // sort by timestamp desc
    out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return out;
}

async function readEntryByFile(fileName) {
    ensureCacheDir();
    try {
        if (!fileName || typeof fileName !== 'string') return null;
        // sanitize: only allow basenames
        const base = path.basename(fileName);
        const p = path.join(CACHE_DIR, base);
        if (!fs.existsSync(p)) return null;
        const buf = await fs.promises.readFile(p);
        const decompressed = await gunzipAsync(buf);
        const obj = JSON.parse(decompressed.toString('utf8'));
        return obj;
    } catch (e) {
        return null;
    }
}

module.exports = { getLyrics, startCleanup, listCached, readEntryByFile };

async function tryVariants(track, artist, album) {
    ensureCacheDir();
    const hash = keyHash(artist, track, album);
    const variants = generateVariants(track, artist);
    for (const v of variants) {
        try {
            const syncedRaw = await fetchFromRemote(v.artist, v.track, album);
            if (syncedRaw) {
                const synced = minifyLRC(syncedRaw);
                const obj = { track, artist, album: album || null, syncedLyrics: synced, timestamp: Date.now() };
                await writeCache(hash, obj);
                return { syncedLyrics: synced, used: v };
            }
        } catch (e) {
            // continue to next variant
        }
    }
    return null;
}

module.exports = { getLyrics, startCleanup, listCached, readEntryByFile, tryVariants };
