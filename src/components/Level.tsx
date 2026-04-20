import React, { useMemo, useRef, useEffect, useState, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';

const SEGMENT_LENGTH = 30;
const WINDOW_SIZE = 25; // Continuous segments to keep in memory
const LOOKAHEAD = 15;   // How many segments to generate ahead of player

interface SegmentData {
  id: number;
  pos: [number, number, number];
  color: string;
  scale: [number, number, number];
  rotation: [number, number, number];
  type?: string;
  endPos: THREE.Vector3;
  endAngle: number;
}

export function Level() {
  const floorRef = useRef<THREE.InstancedMesh>(null!);
  const platformRef = useRef<THREE.InstancedMesh>(null!);
  const gridRef = useRef<THREE.GridHelper>(null!);
  const { room, socket, pickedItems, setLevelData } = useGameStore();
  const levelOffset = room?.levelOffset || 0;

  const [activeSegments, setActiveSegments] = useState<SegmentData[]>([]);
  const [items, setItems] = useState<{ node: React.ReactNode, id: number, pos: [number, number, number] }[]>([]);
  
  // Deterministic segment generation based on index and seed
  const getSegmentAtIndices = (startIndex: number, count: number, seed: number) => {
    // To generate segments from startIndex to startIndex+count, 
    // we need to know the state (pos/angle) at startIndex.
    // We compute it by iterating from 0.
    
    let state = { pos: new THREE.Vector3(0, -0.2, 0), angle: 0 };
    const allSegments: SegmentData[] = [];
    const allItems: any[] = [];

    // Starting platform
    const startPlatform: SegmentData = {
      id: -1,
      pos: [0, -0.2, 0],
      color: '#333',
      scale: [15, 0.6, 15],
      rotation: [0, 0, 0],
      endPos: new THREE.Vector3(0, -0.2, 0),
      endAngle: 0
    };
    if (startIndex <= -1) allSegments.push(startPlatform);

    const rng = (idx: number, offset: number) => {
      const x = Math.sin(seed + idx * 1337.42 + offset) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < startIndex + count; i++) {
        const index = i;
        const difficulty = rng(i, 1) > 0.4 ? 'easy' : 'heavy';
        const color = new THREE.Color().setHSL((index * 0.05) % 1, 0.7, 0.6).getStyle();
        const segmentTypes = ['straight', 'turn', 'stairs', 'trampoline', 'zig-zag', 'spiral', 'thin-path'];
        const segmentType = index === 0 ? 'straight' : (index % 5 === 0 ? 'checkpoint' : (segmentTypes[Math.floor(rng(i, 2) * segmentTypes.length)]));

        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.angle);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.angle);

        const currentSegNodes: any[] = [];
        const newEndPos = state.pos.clone();
        let newEndAngle = state.angle;

        if (segmentType === 'straight') {
          const count = 3;
          const gap = difficulty === 'heavy' ? 8 : 4;
          const platScale: [number, number, number] = [difficulty === 'heavy' ? 4 : 8, 0.6, (SEGMENT_LENGTH / count) - gap];
          for (let j = 0; j < count; j++) {
            const subPos = state.pos.clone().add(forward.clone().multiplyScalar(j * (SEGMENT_LENGTH / count) + (SEGMENT_LENGTH / count / 2)));
            currentSegNodes.push({ pos: subPos.toArray(), color, scale: platScale, rotation: [0, state.angle, 0] });
          }
          newEndPos.add(forward.clone().multiplyScalar(SEGMENT_LENGTH));
        } else if (segmentType === 'zig-zag') {
          const points = 5;
          const pointGap = SEGMENT_LENGTH / points;
          for (let j = 0; j < points; j++) {
            const sideOffset = (j % 2 === 0 ? 1 : -1) * 4;
            const subPos = state.pos.clone().add(forward.clone().multiplyScalar(j * pointGap + pointGap/2)).add(right.clone().multiplyScalar(sideOffset));
            currentSegNodes.push({ pos: subPos.toArray(), color, scale: [4, 0.6, pointGap - 1], rotation: [0, state.angle, 0] });
          }
          newEndPos.add(forward.clone().multiplyScalar(SEGMENT_LENGTH));
        } else if (segmentType === 'thin-path') {
          currentSegNodes.push({ pos: state.pos.clone().add(forward.clone().multiplyScalar(SEGMENT_LENGTH / 2)).toArray(), color, scale: [1.5, 0.6, SEGMENT_LENGTH], rotation: [0, state.angle, 0] });
          newEndPos.add(forward.clone().multiplyScalar(SEGMENT_LENGTH));
        } else if (segmentType === 'turn') {
          const turnAngle = (rng(i, 3) > 0.5 ? 1 : -1) * Math.PI / 2;
          const radius = 15;
          currentSegNodes.push({ pos: state.pos.clone().add(forward.clone().multiplyScalar(radius/2)).toArray(), color: '#555', scale: [radius, 0.6, radius], rotation: [0, state.angle, 0] });
          newEndPos.add(forward.clone().multiplyScalar(radius));
          newEndAngle += turnAngle;
          newEndPos.add(new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), newEndAngle).multiplyScalar(radius/2));
        } else if (segmentType === 'stairs') {
          const steps = 6;
          const stepLen = 4;
          const stepRise = difficulty === 'heavy' ? 1.2 : 0.6;
          for (let j = 0; j < steps; j++) {
            const subPos = state.pos.clone().add(forward.clone().multiplyScalar(j * stepLen + stepLen/2));
            subPos.y += j * stepRise;
            currentSegNodes.push({ pos: subPos.toArray(), color, scale: [8, 0.6, stepLen - 1], rotation: [0, state.angle, 0] });
          }
          newEndPos.add(forward.clone().multiplyScalar(steps * stepLen));
          newEndPos.y += steps * stepRise;
        } else if (segmentType === 'trampoline') {
          const jumpLen = 30;
          currentSegNodes.push({ pos: state.pos.clone().add(forward.clone().multiplyScalar(2)).toArray(), color, scale: [8, 0.6, 4], rotation: [0, state.angle, 0] });
          currentSegNodes.push({ pos: state.pos.clone().add(forward.clone().multiplyScalar(jumpLen/2)).toArray(), color: '#00ff00', scale: [4, 1, 4], rotation: [0, state.angle, 0], type: 'trampoline' });
          currentSegNodes.push({ pos: state.pos.clone().add(forward.clone().multiplyScalar(jumpLen-2)).toArray(), color, scale: [8, 0.6, 4], rotation: [0, state.angle, 0] });
          newEndPos.add(forward.clone().multiplyScalar(jumpLen));
        } else if (segmentType === 'checkpoint') {
          currentSegNodes.push({ pos: state.pos.clone().add(forward.clone().multiplyScalar(5)).toArray(), color: '#ffff00', scale: [12, 0.6, 10], rotation: [0, state.angle, 0], type: 'checkpoint' });
          newEndPos.add(forward.clone().multiplyScalar(10));
        }

        // Only add to result if in range
        if (i >= startIndex) {
            currentSegNodes.forEach(node => allSegments.push({ ...node, id: i }));
            if (i % 5 === 0 && i > 0) {
                const itemPos = state.pos.clone().add(new THREE.Vector3(0, 2, 0));
                
                // Color mapping matches server logic (itemId % 6)
                const colors = ['#00ffff', '#ff00ff', '#ff0000', '#ffff00', '#00ff00', '#ffcc00'];
                const itemColor = colors[i % 6];

                allItems.push({
                   id: i,
                   pos: itemPos.toArray() as [number, number, number],
                   node: (
                    <mesh key={`item-${i}`} position={itemPos}>
                        <octahedronGeometry args={[0.8]} />
                        <meshStandardMaterial color={itemColor} emissive={itemColor} emissiveIntensity={1} />
                        <pointLight color={itemColor} intensity={2} distance={5} />
                    </mesh>
                   )
                });
            }
        }

        state.pos.copy(newEndPos);
        state.angle = newEndAngle;
    }

    return { allSegments, allItems };
  };

  useEffect(() => {
    const seed = room?.seed || 12345;
    // Window is 10 segments as requested, with a bit of lookaround (e.g. 15 total)
    const { allSegments, allItems } = getSegmentAtIndices(levelOffset - 1, 12, seed);
    setActiveSegments(allSegments);
    setItems(allItems);
  }, [levelOffset, room?.seed]);

  useFrame((state) => {
    const playerPos = state.camera.position;
    if (gridRef.current) {
      gridRef.current.position.x = Math.round(playerPos.x / 100) * 100;
      gridRef.current.position.z = Math.round(playerPos.z / 100) * 100;
    }
  });

  // Sync level data for collisions
  useEffect(() => {
    const visibleItemsPos = items.filter(item => !pickedItems.includes(item.id)).map(item => ({ pos: item.pos, id: item.id }));
    setLevelData({ 
        segments: activeSegments.filter(s => !s.type), 
        platforms: activeSegments.filter(s => s.type), 
        items: visibleItemsPos 
    });
  }, [activeSegments, items, pickedItems, setLevelData]);

  // Update instanced mesh
  useLayoutEffect(() => {
    if (!floorRef.current || !platformRef.current) return;

    const floorSegs = activeSegments.filter(s => !s.type);
    const platSegs = activeSegments.filter(s => s.type);

    const tempObject = new THREE.Object3D();
    const tempColor = new THREE.Color();

    floorSegs.forEach((s, i) => {
      tempObject.position.set(...s.pos);
      tempObject.scale.set(...s.scale);
      tempObject.rotation.set(...s.rotation);
      tempObject.updateMatrix();
      floorRef.current.setMatrixAt(i, tempObject.matrix);
      tempColor.set(s.color);
      floorRef.current.setColorAt(i, tempColor);
    });
    
    platSegs.forEach((p, i) => {
      tempObject.position.set(...p.pos);
      tempObject.scale.set(...p.scale);
      tempObject.rotation.set(...p.rotation);
      tempObject.updateMatrix();
      platformRef.current.setMatrixAt(i, tempObject.matrix);
    });
    
    floorRef.current.count = floorSegs.length;
    platformRef.current.count = platSegs.length;
    
    floorRef.current.instanceMatrix.needsUpdate = true;
    if (floorRef.current.instanceColor) floorRef.current.instanceColor.needsUpdate = true;
    platformRef.current.instanceMatrix.needsUpdate = true;
  }, [activeSegments]);

  const visibleItemsNodes = useMemo(() => {
    return items.filter(item => !pickedItems.includes(item.id)).map(item => item.node);
  }, [items, pickedItems]);

  return (
    <group>
      <gridHelper ref={gridRef} args={[2000, 100, '#222', '#111']} position={[0, -10, 0]} />
      
      <instancedMesh ref={floorRef} args={[undefined, undefined, 500]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      
      <instancedMesh ref={platformRef} args={[undefined, undefined, 200]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={0.5} />
      </instancedMesh>

      {visibleItemsNodes}
    </group>
  );
}
