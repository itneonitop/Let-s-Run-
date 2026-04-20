/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from './store';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Users, Play, Loader2, ArrowRight, ShieldHalf, Globe, ChevronDown } from 'lucide-react';
import Game from './components/Game';
import { Language, translations } from './lib/translations';

export default function App() {
  const { isPlaying, isLoading, connect, language, setLanguage } = useGameStore();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    connect();
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window));
    };
    checkMobile();
  }, [connect]);

  const t = translations[language];

  return (
    <div className="min-h-screen bg-[#050505] text-[#F2F2F2] font-sans selection:bg-orange-500 selection:text-white">
      {/* Language Selector Top Right */}
      <div className="fixed top-8 right-8 z-50">
        <div className="relative group">
          <button 
            className="flex items-center gap-2 bg-white/5 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest"
          >
            <Globe size={14} className="text-orange-500" />
            {language}
            <ChevronDown size={14} />
          </button>
          
          <div className="absolute top-full right-0 mt-2 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 grid grid-cols-3 gap-1 w-64 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
            {Object.keys(translations).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang as Language)}
                className={`px-3 py-2 rounded-lg text-center text-[10px] font-black uppercase transition-all ${language === lang ? 'bg-orange-500 text-white' : 'hover:bg-white/10 text-gray-500'}`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!isPlaying ? (
          <Menu key="menu" t={t} />
        ) : (
          <>
            <Game key="game" />
            {isMobile && <MobileControls />}
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isLoading && <LoadingScreen key="loading" />}
      </AnimatePresence>
    </div>
  );
}

function MobileControls() {
  const setMobileInputs = useGameStore(state => state.setMobileInputs);
  const moveTouchStart = useRef<{ x: number, y: number } | null>(null);
  const lookTouchStart = useRef<{ x: number, y: number } | null>(null);

  const handleJoystickStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    moveTouchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleJoystickMove = (e: React.TouchEvent) => {
    if (!moveTouchStart.current) return;
    const touch = Array.from(e.touches).find(t => 
      Math.abs(t.clientX - moveTouchStart.current!.x) < 200 && 
      Math.abs(t.clientY - moveTouchStart.current!.y) < 200
    );
    if (!touch) return;

    const dx = touch.clientX - moveTouchStart.current.x;
    const dy = touch.clientY - moveTouchStart.current.y;
    const maxDist = 50;
    
    setMobileInputs({ move: { x: dx / maxDist, y: -(dy / maxDist) } });
  };

  const handleJoystickEnd = () => {
    moveTouchStart.current = null;
    setMobileInputs({ move: { x: 0, y: 0 } });
  };

  const handleLookStart = (e: React.TouchEvent) => {
    // Only handle if on right side and not the jump button
    const touch = e.touches[0];
    if (touch.clientX > window.innerWidth / 2) {
      lookTouchStart.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleLookMove = (e: React.TouchEvent) => {
    if (!lookTouchStart.current) return;
    const touch = Array.from(e.touches).find(t => t.clientX > window.innerWidth / 2);
    if (!touch) return;

    const dx = touch.clientX - lookTouchStart.current.x;
    const dy = touch.clientY - lookTouchStart.current.y;
    
    // Sensitivity
    const sensitivity = 0.005;
    setMobileInputs({ look: { x: dx * sensitivity, y: dy * sensitivity } });
    
    // Reset start for delta behavior
    lookTouchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleLookEnd = () => {
    lookTouchStart.current = null;
    setMobileInputs({ look: { x: 0, y: 0 } });
  };

  return (
    <div 
      className="fixed inset-0 z-40 pointer-events-auto select-none"
      onTouchStart={handleLookStart}
      onTouchMove={handleLookMove}
      onTouchEnd={handleLookEnd}
    >
      {/* Visual Joystick */}
      <div 
        className="absolute bottom-12 left-12 w-32 h-32 rounded-full bg-white/10 border-2 border-white/20 pointer-events-auto flex items-center justify-center touch-none"
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
      >
        <div className="w-12 h-12 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50" />
      </div>

      {/* Right Jump Button */}
      <div 
        className="absolute bottom-12 right-12 w-24 h-24 rounded-full bg-orange-500/80 border-4 border-white/30 pointer-events-auto flex items-center justify-center active:scale-95 transition-transform touch-none"
        onTouchStart={(e) => {
          e.stopPropagation();
          setMobileInputs({ jump: true });
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          setMobileInputs({ jump: false });
        }}
      >
        <ShieldHalf size={32} className="text-white" />
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-6"
    >
      <div className="relative">
        <Loader2 size={64} className="animate-spin text-orange-500" />
        <div className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black uppercase italic tracking-tighter">Warming up engines...</h2>
        <p className="text-gray-500 font-mono text-xs uppercase tracking-widest animate-pulse">Building procedural track</p>
      </div>
    </motion.div>
  );
}

function Menu({ t }: { t: any }) {
  const [view, setView] = useState<'main' | 'create' | 'join' | 'lobby'>('main');
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [mode, setMode] = useState<'ffa' | 'team'>('ffa');
  const [teamsCount, setTeamsCount] = useState(2);
  const [isPublic, setIsPublic] = useState(true);
  
  const { 
    nickname, setNickname, createRoom, joinRoom, selectTeam, quickPlay,
    roomCode, room, toggleReady, error, setError
  } = useGameStore();

  useEffect(() => {
    if (roomCode && room) {
      setView('lobby');
    }
  }, [roomCode, room]);

  const handleCreate = () => {
    if (!name) return setError("Enter your nickname first!");
    setNickname(name);
    createRoom({ maxPlayers, mode, teamsCount, isPublic });
  };
  
  const handleQuickPlay = () => {
    if (!name) return setError("Enter your nickname first!");
    setNickname(name);
    quickPlay();
  };

  const handleJoin = () => {
    if (!name) return setError("Enter your nickname first!");
    if (!code) return setError("Enter room code!");
    setNickname(name);
    joinRoom(code);
  };
  
  const myPlayer = room?.players[useGameStore.getState().socket?.id || ''];

  const crystals = [
    { color: '#00ffff', name: t.crystal_cyan_name, effect: t.crystal_cyan_effect, desc: t.crystal_cyan_desc, type: t.crystal_buff },
    { color: '#ff00ff', name: t.crystal_magenta_name, effect: t.crystal_magenta_effect, desc: t.crystal_magenta_desc, type: t.crystal_debuff },
    { color: '#ff0000', name: t.crystal_red_name, effect: t.crystal_red_effect, desc: t.crystal_red_desc, type: t.crystal_debuff },
    { color: '#ffff00', name: t.crystal_yellow_name, effect: t.crystal_yellow_effect, desc: t.crystal_yellow_desc, type: t.crystal_semibuff },
    { color: '#00ff00', name: t.crystal_green_name, effect: t.crystal_green_effect, desc: t.crystal_green_desc, type: t.crystal_buff },
    { color: '#ffcc00', name: t.crystal_gold_name, effect: t.crystal_gold_effect, desc: t.crystal_gold_desc, type: t.crystal_buff },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-6 overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="z-10 w-full max-w-md space-y-8"
      >
        <div className="text-center space-y-2">
          <h1 className="text-8xl font-black tracking-tighter italic uppercase text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-400">
            {t.game_name}
          </h1>
          <p className="text-orange-500 font-mono tracking-widest uppercase text-sm">3D Multiplayer Parkour Madness</p>
        </div>

        {error && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-center font-medium"
          >
            {error}
            <button onClick={() => setError(null)} className="ml-4 underline">Close</button>
          </motion.div>
        )}

        {view === 'main' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-500 font-bold">{t.nickname}</label>
              <input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="YOUR NAME..."
                className="w-full bg-white/5 border-2 border-white/10 p-4 rounded-2xl text-xl font-bold focus:border-orange-500 outline-none transition-all placeholder:text-white/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={handleQuickPlay}
                className="col-span-2 bg-orange-500 text-white p-6 rounded-3xl font-black uppercase flex flex-col items-center justify-center gap-2 hover:scale-105 transition-transform shadow-xl shadow-orange-500/20"
              >
                <div className="flex items-center gap-3">
                  <Play fill="currentColor" size={24} />
                  <span className="text-xl">{t.quick_play}</span>
                </div>
              </button>
              <button 
                onClick={() => setView('create')}
                className="bg-white/5 border-2 border-white/10 p-6 rounded-3xl font-black uppercase flex flex-col items-center gap-2 hover:bg-white/10 transition-all text-xs"
              >
                <Rocket size={24} />
                {t.create_room}
              </button>
              <button 
                onClick={() => setView('join')}
                className="bg-white/5 border-2 border-white/10 p-6 rounded-3xl font-black uppercase flex flex-col items-center gap-2 hover:bg-white/10 transition-all text-xs"
              >
                <Users size={24} />
                {t.join_room}
              </button>
              
              <button 
                onClick={() => setShowEncyclopedia(true)}
                className="col-span-2 bg-white/5 border border-white/10 p-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-white/10 transition-all text-gray-400"
              >
                {t.crystal_encyclopedia}
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {showEncyclopedia && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
            >
              <div className="bg-black border border-white/10 w-full max-w-lg rounded-[40px] p-8 max-h-[80vh] overflow-y-auto custom-scrollbar space-y-8 shadow-2xl">
                <div className="flex justify-between items-center">
                   <h2 className="text-3xl font-black uppercase italic tracking-tighter">{t.crystal_encyclopedia}</h2>
                   <button onClick={() => setShowEncyclopedia(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all">
                      <ChevronDown className="rotate-90" />
                   </button>
                </div>
                
                <div className="grid gap-6">
                  {crystals.map((c, i) => (
                    <div key={i} className="flex gap-6 items-center p-4 bg-white/5 rounded-3xl border border-white/5 group hover:bg-white/10 transition-all">
                       <div 
                         className="w-16 h-16 rounded-2xl rotate-45 flex-shrink-0 flex items-center justify-center shadow-lg"
                         style={{ backgroundColor: c.color, boxShadow: `0 0 20px ${c.color}66` }}
                       >
                         <div className="w-1/2 h-1/2 bg-white/20 rounded-full animate-pulse" />
                       </div>
                       <div className="space-y-1">
                         <div className="flex items-center gap-2">
                            <span className="font-black text-xs uppercase tracking-widest">{c.name}</span>
                            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-bold opacity-50">{c.type}</span>
                         </div>
                         <h3 className="font-black text-lg italic uppercase leading-none tracking-tight">{c.effect}</h3>
                         <p className="text-xs text-white/50">{c.desc}</p>
                       </div>
                    </div>
                  ))}
                </div>
                
                <p className="text-center text-[10px] font-mono text-gray-500 uppercase tracking-widest">{t.crystal_collect_hint}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {view === 'create' && (
          <div className="space-y-6 bg-white/5 p-8 rounded-[40px] border border-white/10 backdrop-blur-xl">
            <h2 className="text-2xl font-black uppercase italic">{t.create_room}</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-gray-500">Max Players (2-50)</label>
                <input 
                  type="number" 
                  min="2" max="50"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                  className="w-full bg-black/50 border border-white/10 p-4 rounded-xl outline-none focus:border-orange-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-gray-500">Game Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setMode('ffa')}
                    className={`p-4 rounded-xl font-bold transition-all ${mode === 'ffa' ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/50'}`}
                  >
                    FFA
                  </button>
                  <button 
                    onClick={() => setMode('team')}
                    className={`p-4 rounded-xl font-bold transition-all ${mode === 'team' ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/50'}`}
                  >
                    TEAMS
                  </button>
                </div>
              </div>

              {mode === 'team' && (
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-gray-500">{t.teams_count} (2-4)</label>
                  <div className="flex gap-2">
                    {[2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setTeamsCount(n)}
                        className={`flex-1 p-3 rounded-xl font-bold transition-all ${teamsCount === n ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/50'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-gray-500">{t.visibility}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setIsPublic(true)}
                    className={`p-3 rounded-xl font-bold transition-all text-xs ${isPublic ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/50'}`}
                  >
                    {t.public}
                  </button>
                  <button 
                    onClick={() => setIsPublic(false)}
                    className={`p-3 rounded-xl font-bold transition-all text-xs ${!isPublic ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/50'}`}
                  >
                    {t.private}
                  </button>
                </div>
              </div>

              <button 
                onClick={handleCreate}
                className="w-full bg-white text-black p-5 rounded-2xl font-black uppercase flex items-center justify-center gap-2 hover:bg-orange-500 hover:text-white transition-all shadow-xl shadow-orange-500/20"
              >
                {t.play} <Play fill="currentColor" size={20} />
              </button>
              <button onClick={() => setView('main')} className="w-full text-gray-500 font-bold uppercase text-xs">{t.back_to_menu}</button>
            </div>
          </div>
        )}

        {view === 'join' && (
          <div className="space-y-6 bg-white/5 p-8 rounded-[40px] border border-white/10 backdrop-blur-xl">
            <h2 className="text-2xl font-black uppercase italic">{t.enter_room_code}</h2>
            <div className="space-y-4">
              <input 
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCDEF"
                className="w-full bg-black/50 border-2 border-white/10 p-6 rounded-2xl text-4xl text-center font-black outline-none focus:border-orange-500 tracking-widest placeholder:text-white/10"
              />
              <button 
                onClick={handleJoin}
                className="w-full bg-white text-black p-5 rounded-2xl font-black uppercase flex items-center justify-center gap-2 hover:bg-orange-500 hover:text-white transition-all shadow-xl shadow-orange-500/20"
              >
                {t.join_room} <ArrowRight size={20} />
              </button>
              <button onClick={() => setView('main')} className="w-full text-gray-500 font-bold uppercase text-xs">{t.back_to_menu}</button>
            </div>
          </div>
        )}

        {view === 'lobby' && room && (
          <div className="space-y-6">
            <div className="bg-white/5 p-8 rounded-[40px] border border-white/10 backdrop-blur-xl space-y-6">
              <div className="text-center space-y-1 relative group">
                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-[0.2em]">{t.room_code}</p>
                <div className="flex flex-col items-center gap-2">
                  <h2 className="text-6xl font-black tracking-tighter italic text-orange-500">{roomCode}</h2>
                  <button 
                    onClick={() => {
                      if (roomCode) {
                        navigator.clipboard.writeText(roomCode);
                        const btn = document.getElementById('copy-btn');
                        if (btn) btn.innerText = t.copied;
                        setTimeout(() => {
                          if (btn) btn.innerText = t.copy_code;
                        }, 2000);
                      }
                    }}
                    id="copy-btn"
                    className="text-[10px] bg-white/10 hover:bg-white/20 text-white/50 px-3 py-1 rounded-full font-bold transition-all uppercase"
                  >
                    {t.copy_code}
                  </button>
                </div>
              </div>

              {room.settings.mode === 'team' && (
                <div className="space-y-3 p-4 bg-white/5 rounded-[24px] border border-white/5">
                   <p className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2">
                    <ShieldHalf size={12} /> {t.select_team}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[...Array(room.settings.teamsCount || 2)].map((_, i) => {
                      const teamNum = i + 1;
                      return (
                        <button 
                          key={teamNum}
                          onClick={() => selectTeam(teamNum)}
                          className={`p-4 rounded-xl font-bold transition-all border-2 ${
                            myPlayer?.team === teamNum 
                              ? 'bg-orange-500 border-orange-400 text-white' 
                              : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                          }`}
                        >
                          Team {teamNum}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2">
                  {t.racers} ({Object.keys(room.players).length}/{room.settings.maxPlayers})
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {Object.values(room.players).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-white/20" style={{ backgroundColor: p.color }} />
                        <span className="font-bold">{p.name} {p.id === useGameStore.getState().socket?.id && "(YOU)"}</span>
                      </div>
                      {p.ready ? (
                        <span className="text-[10px] bg-green-500 text-black px-2 py-1 rounded-full font-black uppercase italic">{t.ready}</span>
                      ) : (
                        <span className="text-[10px] bg-white/10 text-white/50 px-2 py-1 rounded-full font-black uppercase italic">...</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={toggleReady}
                className={`w-full p-6 rounded-3xl font-black uppercase text-xl flex items-center justify-center gap-3 transition-all ${
                  room.players[useGameStore.getState().socket?.id || '']?.ready 
                    ? 'bg-green-500 text-black shadow-lg shadow-green-500/20' 
                    : 'bg-white text-black hover:bg-orange-500 hover:text-white'
                }`}
              >
                {room.players[useGameStore.getState().socket?.id || '']?.ready ? (
                  <>Ready <Loader2 className="animate-spin" size={24} /></>
                ) : (
                  <>{t.ready} <Play fill="currentColor" size={24} /></>
                )}
              </button>
            </div>
            
            <p className="text-center text-xs text-gray-500 font-medium">{t.waiting_players}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
