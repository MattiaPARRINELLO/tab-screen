
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

function keyHash(artist, track) {
  const key = `${artist || ''}|||${track || ''}`.toLowerCase();
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
        try { await fs.promises.unlink(jsonPath); } catch (e) {}
      } catch (e) {}
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

async function fetchFromRemote(artist, track) {
  try {
    const params = new URLSearchParams({ track_name: track, artist_name: artist });
    const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const match = data.find(item => item.syncedLyrics);
    if (!match || !match.syncedLyrics) return null;
    return match.syncedLyrics;
  } catch (e) {
    return null;
  }
}

async function getLyrics(track, artist) {
  ensureCacheDir();
  const hash = keyHash(artist, track);
  const existing = await readCache(hash);
  const now = Date.now();

  if (existing && existing.syncedLyrics && existing.timestamp) {
    const age = now - existing.timestamp;
    if (age <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
      return existing.syncedLyrics;
    }
  }

  // Not in cache or expired: fetch from remote
  const syncedRaw = await fetchFromRemote(artist, track);
  if (syncedRaw) {
    const synced = minifyLRC(syncedRaw);
    const obj = { track, artist, syncedLyrics: synced, timestamp: now };
    await writeCache(hash, obj);
    return synced;
  }

  // Return cached even if expired (fallback) to avoid empty result
  if (existing && existing.syncedLyrics) return existing.syncedLyrics;
  return null;
}

function pruneOld() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).map(f => path.join(CACHE_DIR, f));
  const now = Date.now();

  // Remove files older than MAX_AGE_DAYS
  for (const f of files) {
    try {
      const stat = fs.statSync(f);
      if (now - stat.mtimeMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
        fs.unlinkSync(f);
      }
    } catch (e) {}
  }
  // no size-based pruning (unlimited cache size per configuration)
}

function startCleanup() {
  // Run prune on startup and then once per day
  try { pruneOld(); } catch (e) {}
  setInterval(() => { try { pruneOld(); } catch (e) {} }, 24 * 60 * 60 * 1000);
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
        timestamp: obj.timestamp || stat.mtimeMs,
        size: stat.size,
        preview: typeof obj.syncedLyrics === 'string' ? obj.syncedLyrics.split('\n')[0] : null
      });
    } catch (e) {
      // ignore individual file errors
    }
  }
  // sort by timestamp desc
  out.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
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
