import React, { useEffect, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Stars, KeyboardControls, Environment } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Users, Timer } from 'lucide-react';
import { LocalPlayer, RemotePlayer } from './Player';
import { Level } from './Level';
import { useGameStore } from '../store';
import { translations } from '../lib/translations';

export default function Game() {
  const { socket, room, roomCode, setIsLoading, gameStatus, deaths, won, lives, lost, leaveRoom, spectatingId, setSpectatingId, language } = useGameStore();
  const [remotePlayers, setRemotePlayers] = useState<Record<string, any>>({});
  const [countdown, setCountdown] = useState(3);
  const [showFall, setShowFall] = useState(false);
  const prevDeaths = useRef(deaths);
  const t = translations[language];

  const handleNextSpectate = () => {
    if (!room) return;
    const players = (Object.values(room.players) as any[]).filter(p => p.id !== socket?.id);
    if (players.length === 0) return;
    
    const currentIndex = players.findIndex(p => p.id === spectatingId);
    const nextIndex = (currentIndex + 1) % players.length;
    setSpectatingId(players[nextIndex].id);
  };

  useEffect(() => {
    if ((lost || won) && !spectatingId && room) {
      const activePlayers = (Object.values(room.players) as any[]).filter(p => !p.won && p.id !== socket?.id);
      if (activePlayers.length > 0) {
        setSpectatingId(activePlayers[0].id);
      }
    }
  }, [lost, won, room, spectatingId, socket, setSpectatingId]);

  useEffect(() => {
    if (deaths > prevDeaths.current) {
      setShowFall(true);
      const timer = setTimeout(() => setShowFall(false), 1000);
      prevDeaths.current = deaths;
      return () => clearTimeout(timer);
    }
  }, [deaths]);
  
  useEffect(() => {
    if (gameStatus === 'starting') {
      const interval = setInterval(() => {
        setCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameStatus]);

  // If team mode and 'separate parkour' is desired, we could offset levels
  const isTeamMode = room?.settings.mode === 'team';
  const teamsCount = room?.settings.teamsCount || 1;

  useEffect(() => {
    if (!socket) return;
    
    socket.on('player-moved', ({ id, pos }) => {
      setRemotePlayers(prev => ({
        ...prev,
        [id]: { ...(prev[id] || {}), pos }
      }));
    });

    return () => {
      socket.off('player-moved');
    };
  }, [socket]);

  const otherPlayers = Object.keys(room?.players || {}).filter(id => id !== socket?.id);

  return (
    <div className="fixed inset-0 w-full h-full bg-black">
      <KeyboardControls
        map={[
          { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
          { name: 'right', keys: ['ArrowRight', 'KeyD'] },
          { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
          { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
          { name: 'up', keys: ['ArrowUp', 'KeyW'] },
          { name: 'back', keys: ['ArrowDown', 'KeyS'] },
          { name: 'jump', keys: ['Space'] },
        ]}
      >
        <div id="canvas-root" className="w-full h-full">
          <Canvas shadows gl={{ antialias: true }} camera={{ far: 20000, position: [0, 10, 20] }}>
          <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
          <Stars radius={1000} depth={500} count={5000} factor={4} saturation={0} fade speed={1} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
          
          <React.Suspense fallback={null}>
            <Level />
            
            <LocalPlayer />
            {otherPlayers.map(id => (
              <RemotePlayer 
                key={id} 
                pos={remotePlayers[id]?.pos || [0, 1, 0]} 
                color={room.players[id]?.color || '#ffffff'} 
              />
            ))}
          </React.Suspense>
          
          <Environment preset="city" />
        </Canvas>
        </div>
      </KeyboardControls>

      {/* Countdown Overlay */}
      <AnimatePresence>
        {gameStatus === 'starting' && countdown > 0 && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 2, opacity: 0 }}
            key="countdown"
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <h1 className="text-[200px] font-black italic uppercase text-orange-500 drop-shadow-[0_0_50px_rgba(255,165,0,0.5)]">
              {countdown}
            </h1>
          </motion.div>
        )}
        {gameStatus === 'starting' && countdown === 0 && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 2, opacity: 0 }}
            key="go"
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <h1 className="text-[200px] font-black italic uppercase text-white drop-shadow-[0_0_50px_rgba(255,255,255,0.5)]">
              GO!
            </h1>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {won && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl"
          >
            <div className="text-center space-y-8 p-12 bg-white/5 border border-white/10 rounded-[40px] shadow-[0_0_100px_rgba(255,165,0,0.3)]">
              <Trophy size={120} className="mx-auto text-orange-500 animate-bounce" />
              <div className="space-y-2">
                <h1 className="text-7xl font-black italic uppercase text-white tracking-tighter">
                  {t.you_won}
                </h1>
                <p className="text-orange-500 font-bold tracking-[0.3em] uppercase">{t.racers}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                  <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-1">{t.racing_in}</p>
                  <p className="text-3xl font-black text-white italic">01:24</p>
                </div>
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                  <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-1">{t.you_fell}</p>
                  <p className="text-3xl font-black text-white italic">{deaths}</p>
                </div>
              </div>

              <button 
                onClick={leaveRoom}
                className="w-full bg-orange-500 hover:bg-orange-600 text-black font-black uppercase italic py-5 rounded-2xl transition-all hover:scale-[1.02] active:scale-95 text-xl"
              >
                {t.back_to_menu}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lost && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-2xl"
          >
            <div className="text-center space-y-8 p-12 bg-white/5 border border-red-500/20 rounded-[40px] shadow-[0_0_100px_rgba(255,0,0,0.2)]">
              <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-red-500">
                <span className="text-4xl font-black text-red-500">X</span>
              </div>
              <div className="space-y-2">
                <h1 className="text-7xl font-black italic uppercase text-white tracking-tighter">
                  {t.you_lost}
                </h1>
                <p className="text-red-500 font-bold tracking-[0.3em] uppercase">{t.you_fell}</p>
              </div>

              <button 
                onClick={leaveRoom}
                className="w-full bg-white text-black font-black uppercase italic py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-95"
              >
                {t.back_to_menu}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFall && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
          >
            <div className="bg-red-600 px-12 py-6 rounded-3xl shadow-[0_0_100px_rgba(255,0,0,0.5)] transform -rotate-3 border-4 border-white">
              <h1 className="text-5xl font-black italic uppercase text-white tracking-tighter">
                {t.you_fell}
              </h1>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD */}
      <div className="absolute top-8 left-8 z-20 pointer-events-none space-y-4">
        <div className="bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-2xl space-y-1">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">{t.racing_in}</p>
          <p className="text-xl font-black italic uppercase text-orange-500">{roomCode}</p>
        </div>

        <div className="bg-red-500/80 backdrop-blur-md p-3 rounded-2xl space-y-1 flex items-center gap-3">
          <span className="text-[10px] uppercase font-bold text-white tracking-widest">{t.lives}</span>
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <div 
                key={i} 
                className={`w-3 h-3 rounded-full ${i < lives ? 'bg-white shadow-[0_0_10px_white]' : 'bg-white/20'}`} 
              />
            ))}
          </div>
        </div>
        
        {isTeamMode && (
          <div className="bg-orange-500 text-black p-3 rounded-xl font-black uppercase italic text-xs flex items-center gap-2">
            <Users size={14} /> Team {room.players[socket?.id || '']?.team}
          </div>
        )}
      </div>
      
      <div className="absolute top-8 right-8 z-20 pointer-events-none text-right">
         <div className="bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-2xl space-y-2">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">{t.racers}</p>
            {Object.values(room.players).map((p: any) => (
              <div key={p.id} className="flex items-center justify-end gap-2">
                <span className={`text-xs font-bold ${p.id === socket?.id ? 'text-orange-500' : 'text-white'}`}>
                  {p.name} {isTeamMode && <span className="text-[10px] text-gray-500">(T{p.team})</span>}
                </span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              </div>
            ))}
         </div>
      </div>
      
      {/* Spectating Controls */}
      <AnimatePresence>
        {(lost || won) && spectatingId && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-[100]"
          >
            <div className="bg-black/90 backdrop-blur-2xl p-6 rounded-[32px] border-2 border-orange-500/50 shadow-[0_0_50px_rgba(249,115,22,0.3)] flex flex-col items-center gap-3 min-w-[300px]">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500 animate-pulse">{t.spectating}</span>
                <h3 className="text-3xl font-black italic uppercase text-white tracking-widest">
                  {room?.players[spectatingId]?.name || 'Unknown'}
                </h3>
              </div>
              <div className="flex gap-3 w-full">
                <button 
                  onClick={handleNextSpectate}
                  className="flex-1 bg-white text-black py-4 rounded-2xl font-black uppercase text-xs hover:bg-orange-500 hover:text-white transition-all transform hover:scale-105 active:scale-95 shadow-xl"
                >
                  {t.next_player}
                </button>
                <button 
                  onClick={leaveRoom}
                  className="flex-1 bg-red-600/20 border-2 border-red-600/50 text-red-500 py-4 rounded-2xl font-black uppercase text-xs hover:bg-red-600 hover:text-white transition-all transform hover:scale-105 active:scale-95"
                >
                  {t.back_to_menu}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
