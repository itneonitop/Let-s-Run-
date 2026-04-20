import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, useKeyboardControls, PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store';

export function LocalPlayer() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const controlsRef = useRef<any>(null!);
  const [, getKeys] = useKeyboardControls();
  const lastCheckpoint = useRef<THREE.Vector3>(new THREE.Vector3(0, 10, 0));
  const { socket, room, roomCode, gameStatus, levelData, recordDeath, gainLife, lost, won, settings, spectatingId } = useGameStore();

  // Physics state
  const velocity = useRef(new THREE.Vector3());
  const [currentSpeed, setCurrentSpeed] = useState(15);
  const [currentGravity, setCurrentGravity] = useState(-40);
  const [statusEffect, setStatusEffect] = useState<string | null>(null);
  const jumpForce = 16;
  const gravity = currentGravity;
  const isGrounded = useRef(false);
  const coyoteTime = useRef(0);
  const jumpBuffer = useRef(0);

  // Free camera / Locking logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (meshRef.current) {
          if (document.pointerLockElement) {
            document.exitPointerLock();
          } else if (settings.lockedCursor) {
            const canvas = document.querySelector('canvas');
            canvas?.requestPointerLock();
          }
        }
      }
    };
    
    const attemptLock = () => {
      if (settings.lockedCursor && !document.pointerLockElement) {
        const canvas = document.querySelector('canvas');
        canvas?.requestPointerLock();
      }
    };

    const handleWindowClick = () => {
      if (settings.lockedCursor && !document.pointerLockElement) {
        attemptLock();
      }
    };

    if (gameStatus === 'playing' && settings.lockedCursor) {
      attemptLock();
      window.addEventListener('click', handleWindowClick);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleWindowClick);
    };
  }, [settings.lockedCursor, gameStatus]);

  // Camera smooth follow variables
  const lastDirection = useRef(new THREE.Vector3(0, 0, -1));
  const cameraTarget = useRef(new THREE.Vector3());
  const cameraPosition = useRef(new THREE.Vector3());

  // Powerup logic
  useEffect(() => {
    if (!socket) return;
    
    socket.on('apply-effect', (effect) => {
      const { type, duration, penalty } = effect;
      
      if (type === 'extra-life') {
        gainLife();
        return;
      }

      if (type === 'skip-segment') {
        // Find next segment
        if (levelData && levelData.segments.length > 0) {
            const currentIdx = meshRef.current.userData?.lastSegment || 0;
            const nextIdx = currentIdx + 1;
            const nextSeg = levelData.segments.find(s => (s as any).id === nextIdx);
            if (nextSeg) {
                meshRef.current.position.set(nextSeg.pos[0], nextSeg.pos[1] + 5, nextSeg.pos[2]);
            }
        }
        if (penalty === 'heart') {
            recordDeath(); // Decrease heart
        }
        return;
      }

      setStatusEffect(type);
      if (type === 'slow') setCurrentSpeed(8);
      if (type === 'boost') setCurrentSpeed(25);
      if (type === 'low-gravity') setCurrentGravity(-15);
      
      if (duration) {
        setTimeout(() => {
          setStatusEffect(null);
          setCurrentSpeed(15);
          setCurrentGravity(-40);
        }, duration);
      }
    });

    socket.on('teleport-other', ({ type }) => {
        if (type === 'prev' && levelData) {
            const currentIdx = meshRef.current.userData?.lastSegment || 0;
            const prevIdx = Math.max(0, currentIdx - 1);
            const prevSeg = levelData.segments.find(s => (s as any).id === prevIdx);
            if (prevSeg) {
                meshRef.current.position.set(prevSeg.pos[0], prevSeg.pos[1] + 5, prevSeg.pos[2]);
            } else {
                // Fallback to origin or start of window
                const firstSeg = levelData.segments[0];
                meshRef.current.position.set(firstSeg.pos[0], firstSeg.pos[1] + 5, firstSeg.pos[2]);
            }
        }
    });

    return () => { 
        socket.off('apply-effect');
        socket.off('teleport-other');
    };
  }, [socket, levelData, gainLife, recordDeath]);

  // Watch for loss
  useEffect(() => {
    if (lost && roomCode && socket) {
      socket.emit('player-eliminated', roomCode);
    }
  }, [lost, roomCode, socket]);

  const gameReadyTime = useRef<number | null>(null);

  useFrame((state, delta) => {
    const keys: any = getKeys();
    const mobileInputs = useGameStore.getState().mobileInputs;
    
    // Gamepad support
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0]; // Primary gamepad
    
    const pos = meshRef.current.position;
    
    // Freeze during countdown
    if (gameStatus === 'starting') {
      pos.set(0, 5, 0); // Elevation to avoid floor collision glitches
      velocity.current.set(0, 0, 0);
      gameReadyTime.current = null;
      return;
    }

    if (gameStatus === 'playing' && gameReadyTime.current === null) {
      gameReadyTime.current = state.clock.getElapsedTime();
    }

    // Spectating logic overrides
    if (lost || won) {
      if (!spectatingId) return;
    }

    // Movement if not spectating or if we are still alive
    if (!lost && !won) {
      // Mobile Look rotation
      if (mobileInputs.look.x !== 0 || mobileInputs.look.y !== 0) {
        state.camera.rotation.y -= mobileInputs.look.x * 2;
        // Vertically rotate
        state.camera.rotation.x -= mobileInputs.look.y * 2;
        // Clamp vertical look
        state.camera.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, state.camera.rotation.x));
        state.camera.rotation.z = 0; // Prevent tilt
      }

      // Camera Direction
      const camDir = new THREE.Vector3();
      state.camera.getWorldDirection(camDir);
      camDir.y = 0;
      camDir.normalize();
      const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();

      // Movement Inputs
      let inputX = 0;
      if (keys.left) inputX -= 1;
      if (keys.right) inputX += 1;
      
      let inputZ = 0;
      if (keys.forward || keys.up) inputZ += 1;
      if (keys.backward || keys.back) inputZ -= 1;

      // Add Gamepad inputs
      if (gp) {
        if (Math.abs(gp.axes[0]) > 0.1) inputX += gp.axes[0];
        if (Math.abs(gp.axes[1]) > 0.1) inputZ -= gp.axes[1];
      }

      // Add Mobile inputs
      inputX += mobileInputs.move.x;
      inputZ += mobileInputs.move.y;
      
      inputX = Math.max(-1, Math.min(1, inputX));
      inputZ = Math.max(-1, Math.min(1, inputZ));
      
      // Auto-run logic overrides Z input if enabled
      const isAutoRun = settings.autoRun && gameStatus === 'playing';
      if (isAutoRun) {
        inputZ = 1;
      }
      
      // Calculate final movement vector
      const moveDir = new THREE.Vector3();
      moveDir.add(camRight.clone().multiplyScalar(inputX));
      moveDir.add(camDir.clone().multiplyScalar(inputZ));
      if (moveDir.length() > 0) {
        moveDir.normalize();
        lastDirection.current.lerp(moveDir, 0.1);
      }

      const speed = currentSpeed;
      
      // Update velocity
      velocity.current.y += gravity * delta;
      
      // Potential movement for result
      const moveX = moveDir.x * speed * delta;
      const moveZ = moveDir.z * speed * delta;
      const moveY = velocity.current.y * delta;
      
      // Collision Detection
      isGrounded.current = false;
      let currentSegmentId = -1;

      if (levelData) {
        const playerRadius = 0.5;
        const playerHeight = 2;
        const playerHalfHeight = playerHeight / 2;
        
        // 1. Resolve Horizontal movement (X then Z)
        const checkHorizontal = (axis: 'x' | 'z', offset: number) => {
          pos[axis] += offset;
          const allObjects = [...levelData.segments, ...levelData.platforms];
          const verticalMargin = 0.2; // Don't collide horizontally if we are just barely touching the top/bottom

          for (const obj of allObjects) {
             const isSwapped = Math.abs(Math.sin(obj.rotation?.[1] || 0)) > 0.5;
             const hw = (isSwapped ? obj.scale[2] : obj.scale[0]) / 2;
             const hh = obj.scale[1] / 2;
             const hd = (isSwapped ? obj.scale[0] : obj.scale[2]) / 2;
             
             // Check if vertically overlapping with the block decently
             const vOverlap = pos.y + playerHalfHeight - verticalMargin > obj.pos[1] - hh && 
                              pos.y - playerHalfHeight + verticalMargin < obj.pos[1] + hh;
             if (!vOverlap) continue;

             const hOverlapX = pos.x + playerRadius > obj.pos[0] - hw && pos.x - playerRadius < obj.pos[0] + hw;
             const hOverlapZ = pos.z + playerRadius > obj.pos[2] - hd && pos.z - playerRadius < obj.pos[2] + hd;

             if (hOverlapX && hOverlapZ) {
                // Determine push out direction
                if (axis === 'x') {
                  const pushLeft = (obj.pos[0] - hw) - (pos.x + playerRadius);
                  const pushRight = (obj.pos[0] + hw) - (pos.x - playerRadius);
                  pos.x += Math.abs(pushLeft) < Math.abs(pushRight) ? pushLeft : pushRight;
                } else {
                  const pushBack = (obj.pos[2] - hd) - (pos.z + playerRadius);
                  const pushForward = (obj.pos[2] + hd) - (pos.z - playerRadius);
                  pos.z += Math.abs(pushBack) < Math.abs(pushForward) ? pushBack : pushForward;
                }
             }
          }
        };

        checkHorizontal('x', moveX);
        checkHorizontal('z', moveZ);

        // 2. Resolve Vertical movement
        pos.y += moveY;
        const allObjects = [...levelData.segments, ...levelData.platforms];
        for (const obj of allObjects) {
          const isSwapped = Math.abs(Math.sin(obj.rotation?.[1] || 0)) > 0.5;
          const hw = (isSwapped ? obj.scale[2] : obj.scale[0]) / 2;
          const hh = obj.scale[1] / 2;
          const hd = (isSwapped ? obj.scale[0] : obj.scale[2]) / 2;
          
          const topY = obj.pos[1] + hh;
          const bottomY = obj.pos[1] - hh;

          const hOverlapX = pos.x + playerRadius > obj.pos[0] - hw && pos.x - playerRadius < obj.pos[0] + hw;
          const hOverlapZ = pos.z + playerRadius > obj.pos[2] - hd && pos.z - playerRadius < obj.pos[2] + hd;

          if (hOverlapX && hOverlapZ) {
            // Check for grounding (falling down/standing on top)
            const prevFootY = pos.y - playerHalfHeight - moveY;
            const currentFootY = pos.y - playerHalfHeight;
            const crossedSurface = prevFootY >= topY - 0.1 && currentFootY <= topY + 0.1;

            if (velocity.current.y <= 0 && crossedSurface) {
              pos.y = topY + playerHalfHeight;
              velocity.current.y = 0;
              isGrounded.current = true;
              currentSegmentId = (obj as any).id ?? -1;
              
              if (obj.type === 'trampoline') {
                velocity.current.y = 40;
              } else if (obj.type === 'checkpoint') {
                const cpPos = new THREE.Vector3(...obj.pos).add(new THREE.Vector3(0, 5, 0));
                if (lastCheckpoint.current.distanceTo(cpPos) > 2) {
                  lastCheckpoint.current.copy(cpPos);
                  gainLife();
                }
              }
              break;
            }
            
            // Check for ceiling (jumping up/hitting from below)
            if (velocity.current.y > 0 && pos.y + playerHalfHeight >= bottomY - 0.1 && pos.y + playerHalfHeight <= bottomY + 0.3) {
              pos.y = bottomY - playerHalfHeight;
              velocity.current.y = 0;
            }
          }
        }
      } else {
        // Fallback if no level data
        pos.x += moveX;
        pos.z += moveZ;
        pos.y += moveY;
      }
      
      // Update progress if we are on a segment
      if (currentSegmentId !== -1) {
        if (!meshRef.current.userData) meshRef.current.userData = {};
        meshRef.current.userData.lastSegment = Math.max(meshRef.current.userData.lastSegment || 0, currentSegmentId);
      }
      
      // Jumping
      const isJumping = keys.jump || (gp?.buttons[0].pressed) || mobileInputs.jump;
      coyoteTime.current = isGrounded.current ? 0.2 : coyoteTime.current - delta; 
      jumpBuffer.current = isJumping ? 0.25 : jumpBuffer.current - delta; 
      
      if (jumpBuffer.current > 0 && coyoteTime.current > 0) {
        velocity.current.y = jumpForce;
        coyoteTime.current = 0;
        jumpBuffer.current = 0;
      }

      // Fall reset
      if (pos.y < -15) {
        recordDeath();
        
        // Endless mode: Check if current checkpoint is still valid (roughly)
        // If not, we fall back to the earliest segment in levelData
        const isCPValid = levelData?.segments.some(s => 
          Math.abs(s.pos[0] - lastCheckpoint.current.x) < 50 && 
          Math.abs(s.pos[2] - lastCheckpoint.current.z) < 50
        );

        if (!isCPValid && levelData && levelData.segments.length > 0) {
           const firstSeg = levelData.segments[0];
           pos.set(firstSeg.pos[0], firstSeg.pos[1] + 5, firstSeg.pos[2]);
        } else {
           pos.copy(lastCheckpoint.current);
        }
        
        velocity.current.set(0, 0, 0);
      }
    }

    // Camera follow logic
    let targetX = pos.x;
    let targetY = pos.y;
    let targetZ = pos.z;

    if (spectatingId && room?.players[spectatingId]) {
      const p = room.players[spectatingId];
      if (p.pos) {
        targetX = p.pos[0];
        targetY = p.pos[1];
        targetZ = p.pos[2];
      }
    }

    const followSpeed = spectatingId ? 1 : 0.1;

    if (!spectatingId) {
      // Forced First Person
      state.camera.position.set(targetX, targetY + 0.8, targetZ);
      // No more forced lookAt here, so the user can rotate freely
    } else {
      // Spectating (still uses follow camera logic)
      const idealOffset = new THREE.Vector3(0, 4, 8);
      cameraPosition.current.lerp(new THREE.Vector3(targetX + idealOffset.x, targetY + idealOffset.y, targetZ + idealOffset.z), followSpeed);
      state.camera.position.copy(cameraPosition.current);
      state.camera.lookAt(targetX, targetY + 1, targetZ);
    }

    // Collision with items
    if (levelData?.items && !lost && !won) {
      for (const item of levelData.items) {
        const dx = pos.x - item.pos[0];
        const dy = pos.y - item.pos[1];
        const dz = pos.z - item.pos[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 2) {
          socket?.emit('pick-item', { roomCode, itemId: item.id });
        }
      }
    }

    if (socket && state.clock.getElapsedTime() % 0.05 < 0.01) {
      const progress = meshRef.current.userData?.lastSegment || 0;
      socket.emit('update-pos', { roomCode, pos: [pos.x, pos.y, pos.z], progress });
    }
  });

  return (
    <>
      <mesh ref={meshRef} position={[0, 1, 0]}>
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial 
          color={
            statusEffect === 'boost' ? '#00ffff' : 
            statusEffect === 'slow' ? '#ff00ff' : 
            statusEffect === 'low-gravity' ? '#00ff00' :
            statusEffect === 'teleport' ? '#ff0000' :
            '#ff4400'
          } 
          emissive={statusEffect ? 'white' : 'black'}
          emissiveIntensity={0.5}
        />
        {statusEffect && (
          <mesh position={[0, 2, 0]}>
            <sphereGeometry args={[0.2]} />
            <meshStandardMaterial color={statusEffect === 'boost' ? 'cyan' : 'magenta'} />
          </mesh>
        )}
        <pointLight position={[0, 5, 0]} intensity={2} distance={50} color="white" />
        <spotLight position={[0, 10, 10]} angle={0.5} penumbra={1} intensity={2} castShadow />
      </mesh>
      {!spectatingId && <PointerLockControls ref={controlsRef} selector="#canvas-root" />}
    </>
  );
}

export function RemotePlayer({ pos, color }: { pos: [number, number, number], color: string }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.lerp(new THREE.Vector3(...pos), 0.2);
    }
  });

  return (
    <mesh ref={meshRef} position={pos}>
      <boxGeometry args={[1, 2, 1]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
