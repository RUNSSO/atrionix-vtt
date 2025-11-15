// ===============================
// ATRIONIX – SERVIDOR FINAL ONLINE
// ===============================

const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// Servidor HTTP
const server = http.createServer(app);

// Socket.io
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Porta automática do Railway/Render
const PORT = process.env.PORT || 3000;

// Arquivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// ===============================
//  EVENTOS DO SOCKET.IO
// ===============================
io.on("connection", (socket) => {
  console.log("Novo cliente conectado:", socket.id);

  // Evento genérico para relay
  socket.on("sync", (data) => {
    socket.broadcast.emit("sync", data);
  });

  // Flip de token
  socket.on("token:flip", (data) => {
    socket.broadcast.emit("token:flipped", data);
  });

  // Movimentação de token
  socket.on("token:move", (data) => {
    socket.broadcast.emit("token:moved", data);
  });

  // Fog of War
  socket.on("fog:update", (data) => {
    socket.broadcast.emit("fog:update", data);
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

// Página principal
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Servidor Atrionix rodando na porta ${PORT}`);
});
