import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const PORT = 3000;

  // Game state: rooms = { [roomCode]: { players: { [id]: { name, ready, color, pos, team } }, settings: { maxPlayers, mode, teamsCount } } }
  const rooms: Record<string, any> = {};

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', ({ name, maxPlayers, mode, teamsCount, isPublic }) => {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const seed = Math.floor(Math.random() * 1000000);
      rooms[roomCode] = {
        players: {
          [socket.id]: { id: socket.id, name, ready: false, color: '#ff0000', pos: [0, 1, 0], team: 0, progress: 0 }
        },
        settings: { maxPlayers, mode, teamsCount, isPublic },
        started: false,
        pickedItems: [],
        seed,
        levelOffset: 0
      };
      socket.join(roomCode);
      socket.emit('room-created', { roomCode, room: rooms[roomCode] });
    });

    socket.on('join-room', ({ name, roomCode }) => {
      const room = rooms[roomCode];
      if (room) {
        if (room.started) {
          socket.emit('error', 'Game already started');
          return;
        }
        if (Object.keys(room.players).length < room.settings.maxPlayers) {
          room.players[socket.id] = { id: socket.id, name, ready: false, color: '#00ff00', pos: [0, 1, 0], team: 1, progress: 0 };
          socket.join(roomCode);
          socket.emit('sync-items', room.pickedItems);
          io.to(roomCode).emit('room-updated', room);
        } else {
          socket.emit('error', 'Room is full');
        }
      } else {
        socket.emit('error', 'Room not found');
      }
    });

    socket.on('quick-play', ({ name }) => {
      // Find a public room that hasn't started and isn't full
      const availableRooms = Object.entries(rooms).filter(([code, room]) => {
        return room.settings.isPublic && !room.started && Object.keys(room.players).length < room.settings.maxPlayers;
      });

      if (availableRooms.length > 0) {
        const [roomCode] = availableRooms[Math.floor(Math.random() * availableRooms.length)];
        // Reuse join logic indirectly
        const room = rooms[roomCode];
        room.players[socket.id] = { id: socket.id, name, ready: false, color: '#00ff00', pos: [0, 1, 0], team: 1 };
        socket.join(roomCode);
        socket.emit('sync-items', room.pickedItems);
        socket.emit('room-created', { roomCode, room }); // Client uses room-created to move to lobby
        io.to(roomCode).emit('room-updated', room);
      } else {
        socket.emit('error', 'No public rooms available');
      }
    });

    socket.on('select-team', ({ roomCode, team }) => {
      const room = rooms[roomCode];
      if (room && room.players[socket.id]) {
        room.players[socket.id].team = team;
        // Assign colors based on team
        const colors = ['#ff4400', '#0077ff', '#00ff44', '#ffff00'];
        room.players[socket.id].color = colors[(team - 1) % colors.length];
        io.to(roomCode).emit('room-updated', room);
      }
    });

    socket.on('toggle-ready', (roomCode) => {
      const room = rooms[roomCode];
      if (room && room.players[socket.id]) {
        room.players[socket.id].ready = !room.players[socket.id].ready;
        
        // Check if all ready to start
        const players = Object.values(room.players) as any[];
        const allReady = players.length >= 2 && players.every(p => p.ready);
        
        if (allReady && !room.started) {
          room.started = true;
          room.winners = [];
          room.eliminated = [];
          room.ended = false;
          // Reset players state for the game
          for (const pid in room.players) {
            room.players[pid].won = false;
            room.players[pid].lost = false;
          }
          io.to(roomCode).emit('game-start', room);
        } else {
          io.to(roomCode).emit('room-updated', room);
        }
      }
    });

    socket.on('player-eliminated', (roomCode) => {
      const room = rooms[roomCode];
      if (room && room.players[socket.id]) {
        room.players[socket.id].lost = true;
        
        const players = Object.values(room.players) as any[];
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
        // Optionally end the game if first person wins or continue depending on design
        // Here we broadcast the win
        io.to(roomCode).emit('game-won-broadcast', { id: socket.id, name: room.players[socket.id].name });
        io.to(roomCode).emit('room-updated', room);
        
        // Check if game should end (e.g. only one person left who hasn't finished or lost)
        const players = Object.values(room.players) as any[];
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

        // Check level shift: if everyone's progress > room.levelOffset + 5
        // (Step on 6th checkpoint relative to offset)
        const players = Object.values(room.players) as any[];
        const minProgress = Math.min(...players.filter(p => !p.lost).map(p => p.progress || 0));
        
        if (minProgress >= room.levelOffset + 5) {
          room.levelOffset += 5;
          io.to(roomCode).emit('level-shifted', room.levelOffset);
        }
      }
    });

    socket.on('pick-item', ({ roomCode, itemId }) => {
      const room = rooms[roomCode];
      if (!room) return;
      
      // Check if already picked
      if (room.pickedItems.includes(itemId)) return;
      
      room.pickedItems.push(itemId);
      io.to(roomCode).emit('item-picked', itemId);
      
      const picker = room.players[socket.id];
      // Item type is deterministic based on ID
      const itemTypeIdx = itemId % 6; 
      
      switch (itemTypeIdx) {
        case 0: // Cyan: Speed Boost (Self)
          socket.emit('apply-effect', { type: 'boost', duration: 15000 });
          break;
        case 1: // Magenta: Slow (Others)
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
        case 2: // Red: Teleport Opponents Back (Debuff)
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
        case 3: // Yellow: Skip Level + Loss Heart (Semi-Buff)
          socket.emit('apply-effect', { type: 'skip-segment', penalty: 'heart' });
          break;
        case 4: // Green: Low Gravity (Self)
          socket.emit('apply-effect', { type: 'low-gravity', duration: 15000 });
          break;
        case 5: // Gold: Extra Life / Shield (Self)
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
            // Check if game should end because only one person left
            if (room.started && !room.ended) {
              const players = Object.values(room.players) as any[];
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
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
