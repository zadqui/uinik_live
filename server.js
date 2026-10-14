const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
// Sirve la página desde ./public si existe; si no, desde la raíz (solo estos archivos)
const root = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
['index.html', 'logo.png', 'icon.png', 'hero.webp'].forEach((f) => app.get('/' + f, (req, res) => res.sendFile(path.join(root, f))));

io.on('connection', (socket) => {
  let tiktok = null;

  const close = () => {
    if (tiktok) { try { tiktok.disconnect(); } catch (e) {} tiktok = null; }
  };

  socket.on('connect-live', async (username) => {
    close();
    username = String(username || '').replace('@', '').trim();
    if (!username) return socket.emit('status', { ok: false, msg: 'Escribe tu usuario de TikTok.' });

    tiktok = new WebcastPushConnection(username);
    try {
      const state = await tiktok.connect();
      socket.emit('status', { ok: true, msg: `Conectado al live de @${username}`, room: state.roomId });
    } catch (err) {
      return socket.emit('status', { ok: false, msg: 'No se pudo conectar. ¿Tu live está activo?' });
    }

    tiktok.on('chat', (d) => socket.emit('chat', {
      user: d.uniqueId, name: d.nickname, text: d.comment, avatar: d.profilePictureUrl
    }));
    tiktok.on('gift', (d) => {
      if (d.giftType === 1 && !d.repeatEnd) return; // evita repetir regalos en racha
      socket.emit('gift', { name: d.nickname, gift: d.giftName, count: d.repeatCount, img: d.giftPictureUrl });
    });
    tiktok.on('member', (d) => socket.emit('join', { name: d.nickname }));
    tiktok.on('follow', (d) => socket.emit('follow', { name: d.nickname, avatar: d.profilePictureUrl }));
    tiktok.on('streamEnd', () => socket.emit('status', { ok: false, msg: 'El live terminó.' }));
    tiktok.on('disconnected', () => socket.emit('status', { ok: false, msg: 'Desconectado.' }));
  });

  socket.on('disconnect', close);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`UINIK LIVE en http://localhost:${PORT}`));