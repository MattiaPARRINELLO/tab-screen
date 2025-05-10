// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const dotenv = require('dotenv');

dotenv.config();


const PORT = process.env.PORT || 3000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY
const VILLE = 'Franconville' // Ville par défaut;
const VILLE_SHORT = 'Franconville' // Ville courte pour l'affichage
const LASTFM_API_KEY = process.env.LASTFM_API_KEY

function convertVilleToCoords(ville) {
    // http://api.openweathermap.org/geo/1.0/direct?q={city name},{state code},{country code}&limit={limit}&appid={API key}
    try {
        const url = `http://api.openweathermap.org/geo/1.0/direct?q=${ville}&limit=1&appid=${OPENWEATHER_API_KEY}`;
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.length > 0) {
                    const { lat, lon } = data[0];
                    console.log(`Coordonnées de ${ville}: Latitude: ${lat}, Longitude: ${lon}`);
                    return [lat, lon];
                } else {
                    console.error('Ville non trouvée');
                }
            })
            .catch(err => console.error('Erreur:', err));
    }
    catch (err) {
        console.error('Erreur:', err);
    }
    return [0, 0]; // Valeurs par défaut si la ville n'est pas trouvée
}
let currentConfig = {
    showTime: true,
    showWeather: true,
    showMessage: false,
    showMusic: true,
    showSeconds: false,
    message: '',
    color: '#00aaff'
};

let currentMusic = {
    title: '',
    artist: '',
    position: 0,
    duration: 0
};

app.use(express.static('public'));
app.use(express.json());

const weatherIconMap = {
    '01d': 'clear_day',
    '01n': 'clear_night',
    '02d': 'partly_cloudy_day',
    '02n': 'partly_cloudy_night',
    '03d': 'mostly_cloudy_day',
    '03n': 'mostly_cloudy_night',
    '04d': 'cloudy',
    '04n': 'cloudy',
    '09d': 'showers_rain',
    '09n': 'showers_rain',
    '10d': 'rain_with_cloudy_dark',
    '10n': 'rain_with_cloudy_dark',
    '11d': 'strong_thunderstorms',
    '11n': 'strong_thunderstorms',
    '13d': 'snow_with_cloudy_dark',
    '13n': 'snow_with_cloudy_dark',
    '50d': 'haze_fog_dust_smoke',
    '50n': 'haze_fog_dust_smoke',
    '12d': 'scattered_showers_day',
    '12n': 'scattered_showers_night',
    '14d': 'isolated_thunderstorms',
    '14n': 'isolated_thunderstorms',
    '15d': 'sleet_hail',
    '15n': 'sleet_hail',
    '16d': 'snow_with_rain_dark',
    '16n': 'snow_with_rain_dark',
    '17d': 'blizzard',
    '17n': 'blizzard',
    '18d': 'drizzle',
    '18n': 'drizzle',
    '19d': 'flurries',
    '19n': 'flurries',
    '20d': 'scattered_snow_showers_day',
    '20n': 'scattered_snow_showers_night',
    '21d': 'heavy_snow',
    '21n': 'heavy_snow',
    '22d': 'mixed_rain_hail_sleet',
    '22n': 'mixed_rain_hail_sleet',
    '23d': 'isolated_scattered_thunderstorms_day',
    '23n': 'isolated_scattered_thunderstorms_night',
    '24d': 'scattered_showers_day',
    '24n': 'scattered_showers_night',
    '25d': 'cloudy_with_rain_dark',
    '25n': 'cloudy_with_rain_dark',
    '26d': 'cloudy_with_snow_dark',
    '26n': 'cloudy_with_snow_dark'
}


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/screen', (req, res) => {
    res.sendFile(__dirname + '/public/screen.html');
});

app.get('/api/weather', async (req, res) => {
    try {
        const [lat, lon] = convertVilleToCoords(VILLE);
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${VILLE_SHORT}&units=metric&lang=fr&appid=${OPENWEATHER_API_KEY}`;
        console.log('URL:', url);
        const response = await fetch(url);
        const data = await response.json();
        const iconCode = data.weather[0].icon;
        const materialIcon = weatherIconMap[iconCode] || 'cloud';

        res.json({
            name: VILLE_SHORT,
            temp: Math.round(data.main.temp),
            desc: data.weather[0].description,
            icon: materialIcon
        });
    } catch (e) {
        console.error('Erreur récupération météo:', e);
        res.status(500).json({ error: 'Erreur météo' });
    }
});

app.get("/api/forecast", async (req, res) => {
    console.log("Requête prévisions météo reçue");
    try {
        const [lat, lon] = convertVilleToCoords(VILLE);
        const url = `https://api.openweathermap.org/data/2.5/forecast/?q=${VILLE_SHORT}&units=metric&appid=${OPENWEATHER_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        const simplified = data.list.slice(0, 5).map(f => {
            const iconCode = f.weather[0].icon;
            const materialIcon = weatherIconMap[iconCode] || 'cloud';

            return {
                dt: f.dt,
                temp: Math.round(f.main.temp),
                description: f.weather[0].description,
                icon: materialIcon
            };
        });

        res.json({ list: simplified });
    } catch (err) {
        console.error("Erreur prévisions météo :", err);
        res.status(500).json({ error: "err" });
    }
});

// Reçoit les infos musicales depuis Tasker ou autre
app.post('/api/music', async (req, res) => {
    const { title, artist, position, duration } = req.body;
    if (title && artist) {
        currentMusic = {
            title,
            artist,
            position: Number(position),
            duration: Number(duration),
            cover: '' // par défaut
        };

        try {
            const query = `artist:"${artist}" track:"${title}"`;
            const deezerRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`);
            const deezerData = await deezerRes.json();
            if (deezerData.data && deezerData.data.length > 0) {
                //search in the results where the title and artist match
                const track = deezerData.data.find(item => item.title.toLowerCase() === title.toLowerCase() && item.artist.name.toLowerCase() === artist.toLowerCase());
                if (track) {
                    currentMusic.cover = track.album.cover_xl || '';
                    currentMusic.deezerId = track.id;
                } else {
                    currentMusic.cover = await getAlbumCover(title, artist);
                }
            }
        } catch (err) {
            console.error("Erreur fetch Deezer:", err);
        }

        io.emit('musicData', currentMusic);
    }

    res.sendStatus(200);
});

io.on('connection', (socket) => {
    socket.emit('displayContent', currentConfig);

    socket.on('updateContent', (data) => {
        currentConfig = { ...currentConfig, ...data };
        console.log('Configuration mise à jour:', currentConfig);
        io.emit('displayContent', currentConfig);
    });
});

async function getAlbumCover(title, artist) {
    try {
        const url = `http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`;
        const response = await fetch(url);
        const data = await response.json();

        const image = data?.track?.album?.image?.find(img => img.size === 'extralarge')?.['#text'];
        return image || '';
    } catch (e) {
        console.error('Erreur récupération cover:', e);
        return '';
    }
}

server.listen(PORT, () => {
    console.log(`Serveur sur http://localhost:${PORT}`);
});
