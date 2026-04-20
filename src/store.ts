import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { Language } from './lib/translations';

interface GameState {
  socket: Socket | null;
  nickname: string;
  roomCode: string | null;
  room: any | null;
  isPlaying: boolean;
  isLoading: boolean;
  gameStatus: 'lobby' | 'starting' | 'playing' | 'ended';
  error: string | null;
  levelData: { segments: any[]; platforms: any[]; items: any[] } | null;
  pickedItems: number[];
  deaths: number;
  lives: number;
  won: boolean;
  lost: boolean;
  spectatingId: string | null;
  mobileInputs: { move: { x: number, y: number }, look: { x: number, y: number }, jump: boolean };
  language: Language;
  settings: {
    autoRun: boolean;
    freeCamera: boolean;
    firstPerson: boolean;
    lockedCursor: boolean;
  };
  
  connect: () => void;
  setLanguage: (lang: Language) => void;
  setNickname: (name: string) => void;
  setLevelData: (data: { segments: any[]; platforms: any[]; items: any[] }) => void;
  setWon: (won: boolean) => void;
  setLost: (lost: boolean) => void;
  gainLife: () => void;
  setSpectatingId: (id: string | null) => void;
  setMobileInputs: (inputs: Partial<GameState['mobileInputs']>) => void;
  updateSettings: (settings: Partial<GameState['settings']>) => void;
  resetGame: () => void;
  leaveRoom: () => void;
  createRoom: (settings: { maxPlayers: number; mode: string; teamsCount: number; isPublic: boolean }) => void;
  quickPlay: () => void;
  joinRoom: (code: string) => void;
  selectTeam: (team: number) => void;
  toggleReady: () => void;
  setError: (err: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  recordDeath: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  nickname: '',
  roomCode: null,
  room: null,
  isPlaying: false,
  isLoading: false,
  gameStatus: 'lobby',
  error: null,
  levelData: null,
  pickedItems: [],
  deaths: 0,
  lives: 3,
  won: false,
  lost: false,
  spectatingId: null,
  mobileInputs: { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: false },
  language: 'en',
  settings: {
    autoRun: false,
    freeCamera: true, 
    firstPerson: true,
    lockedCursor: true,
  },

  connect: () => {
    if (get().socket) return;
    const socket = io();
    
    socket.on('room-created', ({ roomCode, room }) => {
      set({ roomCode, room });
    });
    
    socket.on('room-updated', (room) => {
      set({ room });
    });
    
    socket.on('game-start', (room) => {
      set({ 
        room, 
        isPlaying: true, 
        gameStatus: 'starting', 
        deaths: 0, 
        lives: 3, 
        won: false, 
        lost: false,
        pickedItems: [],
        spectatingId: null
      });
      setTimeout(() => set({ gameStatus: 'playing' }), 3000);
    });

    socket.on('item-picked', (itemId) => {
      set(state => ({ pickedItems: [...state.pickedItems, itemId] }));
    });

    socket.on('sync-items', (items) => {
      set({ pickedItems: items });
    });

    socket.on('game-won-broadcast', ({ id }) => {
      if (id === get().socket?.id) {
        set({ won: true });
      }
    });
    
    socket.on('error', (error) => {
      set({ error });
    });

    socket.on('level-shifted', (levelOffset) => {
      set(state => {
        if (state.room) {
          return { room: { ...state.room, levelOffset } };
        }
        return state;
      });
    });

    set({ socket });
  },

  setLanguage: (language) => set({ language }),
  setNickname: (nickname) => set({ nickname }),
  
  setLevelData: (levelData) => set({ levelData }),
  
  createRoom: (settings) => {
    const { socket, nickname } = get();
    if (socket && nickname) {
      socket.emit('create-room', { name: nickname, ...settings });
    }
  },
  
  quickPlay: () => {
    const { socket, nickname } = get();
    if (socket && nickname) {
      socket.emit('quick-play', { name: nickname });
    }
  },
  
  joinRoom: (roomCode) => {
    const { socket, nickname } = get();
    if (socket && nickname) {
      socket.emit('join-room', { name: nickname, roomCode: roomCode.toUpperCase() });
      set({ roomCode: roomCode.toUpperCase() });
    }
  },
  
  selectTeam: (team) => {
    const { socket, roomCode } = get();
    if (socket && roomCode) {
      socket.emit('select-team', { roomCode, team });
    }
  },
  
  toggleReady: () => {
    const { socket, roomCode } = get();
    if (socket && roomCode) {
      socket.emit('toggle-ready', roomCode);
    }
  },
  
  setError: (error) => set({ error }),
  setIsLoading: (isLoading) => set({ isLoading }),
  recordDeath: () => set(state => {
    const newLives = state.lives - 1;
    return { 
      deaths: state.deaths + 1,
      lives: Math.max(0, newLives),
      lost: newLives <= 0
    };
  }),
  gainLife: () => set(state => ({ lives: Math.min(3, state.lives + 1) })),
  setSpectatingId: (id) => set({ spectatingId: id }),
  setMobileInputs: (inputs: Partial<GameState['mobileInputs']>) => set(state => ({
    mobileInputs: { ...state.mobileInputs, ...inputs }
  })),
  setWon: (won: boolean) => set({ won }),
  setLost: (lost: boolean) => set({ lost }),
  updateSettings: (newSettings) => set(state => ({
    settings: { ...state.settings, ...newSettings }
  })),
  resetGame: () => set({ 
    isPlaying: false, 
    gameStatus: 'lobby', 
    deaths: 0, 
    lives: 3, 
    won: false, 
    lost: false,
    levelData: null,
    pickedItems: []
  }),
  leaveRoom: () => {
    const { socket, roomCode } = get();
    if (socket && roomCode) {
      socket.emit('leave-room', roomCode);
    }
    set({ 
      roomCode: null, 
      room: null, 
      isPlaying: false, 
      gameStatus: 'lobby',
      deaths: 0,
      lives: 3,
      won: false,
      lost: false
    });
  }
}));
