// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const OPENWEATHER_API_KEY = 'b2d38bf82ded340fa00aba84a9b75373'; // Remplace par ta clé
const VILLE = 'Paris';
const LASTFM_API_KEY = '567072b8078523239f50efc119474c0c';


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
    '03d': 'cloud',
    '03n': 'cloud',
    '04d': 'cloud',
    '04n': 'cloud',
    '09d': 'rainy',
    '09n': 'rainy',
    '10d': 'rainy',
    '10n': 'rainy',
    '11d': 'thunderstorm',
    '11n': 'thunderstorm',
    '13d': 'snowing',
    '13n': 'snowing',
    '50d': 'foggy',
    '50n': 'foggy'
};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/screen', (req, res) => {
    res.sendFile(__dirname + '/public/screen.html');
});

app.get('/api/weather', async (req, res) => {
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${VILLE}&units=metric&lang=fr&appid=${OPENWEATHER_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        const iconCode = data.weather[0].icon;
        const materialIcon = weatherIconMap[iconCode] || 'cloud';

        res.json({
            name: data.name,
            temp: Math.round(data.main.temp),
            desc: data.weather[0].description,
            icon: materialIcon
        });
    } catch (e) {
        res.status(500).json({ error: 'Erreur météo' });
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
