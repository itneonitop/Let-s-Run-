import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  pingTimeout: 30000,
  pingInterval: 25000,
});

const PORT = Number(process.env.PORT) || 3000;

// Health check endpoint for cloud monitoring (Render / Railway)
app.get(['/', '/api/health', '/health'], (req, res) => {
  res.json({
    status: 'online',
    server: "Let's Run Game Server",
    activeRooms: Object.keys(rooms).length,
    time: Date.now()
  });
});

// Game state
const rooms = {};

const getPublicRoomsList = () => {
  return Object.entries(rooms)
    .filter(([_, room]) => room.settings.isPublic)
    .map(([code, room]) => ({
      roomCode: code,
      playerCount: Object.keys(room.players).length,
      maxPlayers: room.settings.maxPlayers,
      mode: room.settings.mode,
      teamsCount: room.settings.teamsCount || 2,
      started: room.started,
      hostName: Object.values(room.players)[0]?.name || 'Host',
    }));
};

const broadcastPublicRooms = () => {
  io.emit('rooms-list', getPublicRoomsList());
};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('get-rooms', () => {
    socket.emit('rooms-list', getPublicRoomsList());
  });

  socket.on('create-room', ({ name, maxPlayers, mode, teamsCount, isPublic }) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const seed = Math.floor(Math.random() * 1000000);
    rooms[roomCode] = {
      players: {
        [socket.id]: { id: socket.id, name, ready: false, color: '#ff4400', pos: [0, 1, 0], team: 0, progress: 0 }
      },
      settings: { maxPlayers, mode, teamsCount, isPublic },
      started: false,
      pickedItems: [],
      seed,
      levelOffset: 0
    };
    socket.join(roomCode);
    socket.emit('room-created', { roomCode, room: rooms[roomCode] });
    broadcastPublicRooms();
  });

  socket.on('join-room', ({ name, roomCode }) => {
    const room = rooms[roomCode];
    if (room) {
      if (room.started) {
        socket.emit('error', 'Игра уже началась');
        return;
      }
      if (Object.keys(room.players).length < room.settings.maxPlayers) {
        room.players[socket.id] = { id: socket.id, name, ready: false, color: '#0077ff', pos: [0, 1, 0], team: 1, progress: 0 };
        socket.join(roomCode);
        socket.emit('sync-items', room.pickedItems);
        socket.emit('room-created', { roomCode, room });
        io.to(roomCode).emit('room-updated', room);
        broadcastPublicRooms();
      } else {
        socket.emit('error', 'Комната заполнена');
      }
    } else {
      socket.emit('error', 'Комната не найдена');
    }
  });

  socket.on('quick-play', ({ name }) => {
    const availableRooms = Object.entries(rooms).filter(([code, room]) => {
      return room.settings.isPublic && !room.started && Object.keys(room.players).length < room.settings.maxPlayers;
    });

    if (availableRooms.length > 0) {
      const [roomCode] = availableRooms[Math.floor(Math.random() * availableRooms.length)];
      const room = rooms[roomCode];
      room.players[socket.id] = { id: socket.id, name, ready: false, color: '#00ff44', pos: [0, 1, 0], team: 1 };
      socket.join(roomCode);
      socket.emit('sync-items', room.pickedItems);
      socket.emit('room-created', { roomCode, room });
      io.to(roomCode).emit('room-updated', room);
      broadcastPublicRooms();
    } else {
      socket.emit('error', 'Нет свободных открытых комнат');
    }
  });

  socket.on('select-team', ({ roomCode, team }) => {
    const room = rooms[roomCode];
    if (room && room.players[socket.id]) {
      room.players[socket.id].team = team;
      const colors = ['#ff4400', '#0077ff', '#00ff44', '#ffff00'];
      room.players[socket.id].color = colors[(team - 1) % colors.length];
      io.to(roomCode).emit('room-updated', room);
    }
  });

  socket.on('toggle-ready', (roomCode) => {
    const room = rooms[roomCode];
    if (room && room.players[socket.id]) {
      room.players[socket.id].ready = !room.players[socket.id].ready;
      const players = Object.values(room.players);
      const allReady = players.length >= 1 && players.every(p => p.ready);
      
      if (allReady && !room.started) {
        room.started = true;
        room.winners = [];
        room.eliminated = [];
        room.ended = false;
        for (const pid in room.players) {
          room.players[pid].won = false;
          room.players[pid].lost = false;
        }
        io.to(roomCode).emit('game-start', room);
        broadcastPublicRooms();
      } else {
        io.to(roomCode).emit('room-updated', room);
      }
    }
  });

  socket.on('start-game', (roomCode) => {
    const room = rooms[roomCode];
    if (room && !room.started) {
      room.started = true;
      room.winners = [];
      room.eliminated = [];
      room.ended = false;
      for (const pid in room.players) {
        room.players[pid].won = false;
        room.players[pid].lost = false;
      }
      io.to(roomCode).emit('game-start', room);
      broadcastPublicRooms();
    }
  });

  socket.on('player-eliminated', (roomCode) => {
    const room = rooms[roomCode];
    if (room && room.players[socket.id]) {
      room.players[socket.id].lost = true;
      const players = Object.values(room.players);
      const stillIn = players.filter(p => !p.lost && !p.won);
      
      if (stillIn.length === 1 && players.length > 1 && !room.ended) {
        const winnerId = stillIn[0].id;
        room.players[winnerId].won = true;
        room.ended = true;
        io.to(roomCode).emit('game-won-broadcast', { id: winnerId, name: room.players[winnerId].name });
      }
      io.to(roomCode).emit('room-updated', room);
    }
  });

  socket.on('game-won', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.players[socket.id] && !room.players[socket.id].won) {
      room.players[socket.id].won = true;
      io.to(roomCode).emit('game-won-broadcast', { id: socket.id, name: room.players[socket.id].name });
      io.to(roomCode).emit('room-updated', room);
      
      const players = Object.values(room.players);
      const remaining = players.filter(p => !p.won && !p.lost);
      if (remaining.length === 0) {
        room.ended = true;
      }
    }
  });

  socket.on('update-pos', ({ roomCode, pos, progress }) => {
    const room = rooms[roomCode];
    if (room && room.players[socket.id]) {
      room.players[socket.id].pos = pos;
      if (progress !== undefined) room.players[socket.id].progress = progress;
      socket.to(roomCode).emit('player-moved', { id: socket.id, pos });

      const players = Object.values(room.players);
      const minProgress = Math.min(...players.filter(p => !p.lost).map(p => p.progress || 0));
      
      if (minProgress >= room.levelOffset + 5) {
        room.levelOffset += 5;
        io.to(roomCode).emit('level-shifted', room.levelOffset);
      }
    }
  });

  socket.on('pick-item', ({ roomCode, itemId }) => {
    const room = rooms[roomCode];
    if (!room || room.pickedItems.includes(itemId)) return;
    
    room.pickedItems.push(itemId);
    io.to(roomCode).emit('item-picked', itemId);
    
    const picker = room.players[socket.id];
    const itemTypeIdx = itemId % 6; 
    
    switch (itemTypeIdx) {
      case 0: // Speed Boost
        socket.emit('apply-effect', { type: 'boost', duration: 15000 });
        break;
      case 1: // Slow Others
        if (room.settings.mode === 'team') {
          for (const id in room.players) {
            if (room.players[id].team !== picker.team) {
              io.to(id).emit('apply-effect', { type: 'slow', duration: 15000 });
            }
          }
        } else {
          socket.to(roomCode).emit('apply-effect', { type: 'slow', duration: 15000 });
        }
        break;
      case 2: // Teleport Back
        if (room.settings.mode === 'team') {
          for (const id in room.players) {
            if (room.players[id].team !== picker.team) {
              io.to(id).emit('teleport-other', { type: 'prev' });
            }
          }
        } else {
          socket.to(roomCode).emit('teleport-other', { type: 'prev' });
        }
        break;
      case 3: // Skip Level + Lose Heart
        socket.emit('apply-effect', { type: 'skip-segment', penalty: 'heart' });
        break;
      case 4: // Low Gravity
        socket.emit('apply-effect', { type: 'low-gravity', duration: 15000 });
        break;
      case 5: // Extra Life
        socket.emit('apply-effect', { type: 'extra-life' });
        break;
    }
  });

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (room && room.players[socket.id]) {
        delete room.players[socket.id];
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomCode];
        } else {
          if (room.started && !room.ended) {
            const players = Object.values(room.players);
            const stillIn = players.filter(p => !p.lost && !p.won);
            if (stillIn.length === 1) {
              const winnerId = stillIn[0].id;
              room.players[winnerId].won = true;
              room.ended = true;
              io.to(roomCode).emit('game-won-broadcast', { id: winnerId, name: room.players[winnerId].name });
            } else if (stillIn.length === 0) {
              room.ended = true;
            }
          }
          io.to(roomCode).emit('room-updated', room);
        }
      }
    }
    broadcastPublicRooms();
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Dedicated Game Server running on port ${PORT}`);
});
