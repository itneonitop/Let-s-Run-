var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_vite = require("vite");
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_meta = {};
var __filename = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = import_path.default.dirname(__filename);
async function startServer() {
  const app = (0, import_express.default)();
  const httpServer = (0, import_http.createServer)(app);
  const io = new import_socket.Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ["polling", "websocket"],
    allowUpgrades: true,
    pingTimeout: 3e4,
    pingInterval: 25e3
  });
  const PORT = Number(process.env.PORT) || 3e3;
  app.get(["/api/health", "/health"], (req, res) => {
    res.json({ status: "ok", time: Date.now() });
  });
  const rooms = {};
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.on("create-room", ({ name, maxPlayers, mode, teamsCount, isPublic }) => {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const seed = Math.floor(Math.random() * 1e6);
      rooms[roomCode] = {
        players: {
          [socket.id]: { id: socket.id, name, ready: false, color: "#ff0000", pos: [0, 1, 0], team: 0, progress: 0 }
        },
        settings: { maxPlayers, mode, teamsCount, isPublic },
        started: false,
        pickedItems: [],
        seed,
        levelOffset: 0
      };
      socket.join(roomCode);
      socket.emit("room-created", { roomCode, room: rooms[roomCode] });
    });
    socket.on("join-room", ({ name, roomCode }) => {
      const room = rooms[roomCode];
      if (room) {
        if (room.started) {
          socket.emit("error", "Game already started");
          return;
        }
        if (Object.keys(room.players).length < room.settings.maxPlayers) {
          room.players[socket.id] = { id: socket.id, name, ready: false, color: "#00ff00", pos: [0, 1, 0], team: 1, progress: 0 };
          socket.join(roomCode);
          socket.emit("sync-items", room.pickedItems);
          io.to(roomCode).emit("room-updated", room);
        } else {
          socket.emit("error", "Room is full");
        }
      } else {
        socket.emit("error", "Room not found");
      }
    });
    socket.on("quick-play", ({ name }) => {
      const availableRooms = Object.entries(rooms).filter(([code, room]) => {
        return room.settings.isPublic && !room.started && Object.keys(room.players).length < room.settings.maxPlayers;
      });
      if (availableRooms.length > 0) {
        const [roomCode] = availableRooms[Math.floor(Math.random() * availableRooms.length)];
        const room = rooms[roomCode];
        room.players[socket.id] = { id: socket.id, name, ready: false, color: "#00ff00", pos: [0, 1, 0], team: 1 };
        socket.join(roomCode);
        socket.emit("sync-items", room.pickedItems);
        socket.emit("room-created", { roomCode, room });
        io.to(roomCode).emit("room-updated", room);
      } else {
        socket.emit("error", "No public rooms available");
      }
    });
    socket.on("select-team", ({ roomCode, team }) => {
      const room = rooms[roomCode];
      if (room && room.players[socket.id]) {
        room.players[socket.id].team = team;
        const colors = ["#ff4400", "#0077ff", "#00ff44", "#ffff00"];
        room.players[socket.id].color = colors[(team - 1) % colors.length];
        io.to(roomCode).emit("room-updated", room);
      }
    });
    socket.on("toggle-ready", (roomCode) => {
      const room = rooms[roomCode];
      if (room && room.players[socket.id]) {
        room.players[socket.id].ready = !room.players[socket.id].ready;
        const players = Object.values(room.players);
        const allReady = players.length >= 2 && players.every((p) => p.ready);
        if (allReady && !room.started) {
          room.started = true;
          room.winners = [];
          room.eliminated = [];
          room.ended = false;
          for (const pid in room.players) {
            room.players[pid].won = false;
            room.players[pid].lost = false;
          }
          io.to(roomCode).emit("game-start", room);
        } else {
          io.to(roomCode).emit("room-updated", room);
        }
      }
    });
    socket.on("player-eliminated", (roomCode) => {
      const room = rooms[roomCode];
      if (room && room.players[socket.id]) {
        room.players[socket.id].lost = true;
        const players = Object.values(room.players);
        const stillIn = players.filter((p) => !p.lost && !p.won);
        if (stillIn.length === 1 && players.length > 1 && !room.ended) {
          const winnerId = stillIn[0].id;
          room.players[winnerId].won = true;
          room.ended = true;
          io.to(roomCode).emit("game-won-broadcast", { id: winnerId, name: room.players[winnerId].name });
        }
        io.to(roomCode).emit("room-updated", room);
      }
    });
    socket.on("game-won", ({ roomCode }) => {
      const room = rooms[roomCode];
      if (room && room.players[socket.id] && !room.players[socket.id].won) {
        room.players[socket.id].won = true;
        io.to(roomCode).emit("game-won-broadcast", { id: socket.id, name: room.players[socket.id].name });
        io.to(roomCode).emit("room-updated", room);
        const players = Object.values(room.players);
        const remaining = players.filter((p) => !p.won && !p.lost);
        if (remaining.length === 0) {
          room.ended = true;
        }
      }
    });
    socket.on("update-pos", ({ roomCode, pos, progress }) => {
      const room = rooms[roomCode];
      if (room && room.players[socket.id]) {
        room.players[socket.id].pos = pos;
        if (progress !== void 0) room.players[socket.id].progress = progress;
        socket.to(roomCode).emit("player-moved", { id: socket.id, pos });
        const players = Object.values(room.players);
        const minProgress = Math.min(...players.filter((p) => !p.lost).map((p) => p.progress || 0));
        if (minProgress >= room.levelOffset + 5) {
          room.levelOffset += 5;
          io.to(roomCode).emit("level-shifted", room.levelOffset);
        }
      }
    });
    socket.on("pick-item", ({ roomCode, itemId }) => {
      const room = rooms[roomCode];
      if (!room) return;
      if (room.pickedItems.includes(itemId)) return;
      room.pickedItems.push(itemId);
      io.to(roomCode).emit("item-picked", itemId);
      const picker = room.players[socket.id];
      const itemTypeIdx = itemId % 6;
      switch (itemTypeIdx) {
        case 0:
          socket.emit("apply-effect", { type: "boost", duration: 15e3 });
          break;
        case 1:
          if (room.settings.mode === "team") {
            for (const id in room.players) {
              if (room.players[id].team !== picker.team) {
                io.to(id).emit("apply-effect", { type: "slow", duration: 15e3 });
              }
            }
          } else {
            socket.to(roomCode).emit("apply-effect", { type: "slow", duration: 15e3 });
          }
          break;
        case 2:
          if (room.settings.mode === "team") {
            for (const id in room.players) {
              if (room.players[id].team !== picker.team) {
                io.to(id).emit("teleport-other", { type: "prev" });
              }
            }
          } else {
            socket.to(roomCode).emit("teleport-other", { type: "prev" });
          }
          break;
        case 3:
          socket.emit("apply-effect", { type: "skip-segment", penalty: "heart" });
          break;
        case 4:
          socket.emit("apply-effect", { type: "low-gravity", duration: 15e3 });
          break;
        case 5:
          socket.emit("apply-effect", { type: "extra-life" });
          break;
      }
    });
    socket.on("disconnect", () => {
      for (const roomCode in rooms) {
        const room = rooms[roomCode];
        if (room && room.players[socket.id]) {
          delete room.players[socket.id];
          if (Object.keys(room.players).length === 0) {
            delete rooms[roomCode];
          } else {
            if (room.started && !room.ended) {
              const players = Object.values(room.players);
              const stillIn = players.filter((p) => !p.lost && !p.won);
              if (stillIn.length === 1) {
                const winnerId = stillIn[0].id;
                room.players[winnerId].won = true;
                room.ended = true;
                io.to(roomCode).emit("game-won-broadcast", { id: winnerId, name: room.players[winnerId].name });
              } else if (stillIn.length === 0) {
                room.ended = true;
              }
            }
            io.to(roomCode).emit("room-updated", room);
          }
        }
      }
    });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
