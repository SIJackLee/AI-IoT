"use client";

import { Component, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Path,
  Quaternion,
  Shape,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type PointLight,
} from "three";
import styles from "./motion.module.css";

type Props = {
  t: number | null;
  h: number | null;
  soil: number | null;
  cds: number | null;
  fan: boolean;
  rgb: { r: number; g: number; b: number };
  lcd: string;
};

class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) return this.props.fallback;
    return this.props.children;
  }
}

/** 얇은 배선 세그먼트 (두 점 사이 실린더) */
function WireSeg({
  a,
  b,
  color,
  radius = 0.012,
}: {
  a: [number, number, number];
  b: [number, number, number];
  color: string;
  radius?: number;
}) {
  const { mid, len, quat } = useMemo(() => {
    const start = new Vector3(...a);
    const end = new Vector3(...b);
    const dir = end.clone().sub(start);
    const length = dir.length() || 0.001;
    const midPos = start.clone().add(end).multiplyScalar(0.5);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
    return { mid: midPos.toArray() as [number, number, number], len: length, quat: q };
  }, [a, b]);

  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[radius, radius, len, 6]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

function WirePath({
  points,
  color,
  radius,
}: {
  points: [number, number, number][];
  color: string;
  radius?: number;
}) {
  return (
    <group>
      {points.slice(0, -1).map((p, i) => (
        <WireSeg key={i} a={p} b={points[i + 1]} color={color} radius={radius} />
      ))}
    </group>
  );
}

/** 아크릴 판의 네모 배선 구멍 */
function SquarePass({
  position,
  size = 0.07,
  depth = 0.06,
  rotation,
}: {
  position: [number, number, number];
  size?: number;
  depth?: number;
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[size, depth, size]} />
        <meshStandardMaterial color="#05070c" roughness={1} />
      </mesh>
      <mesh position={[0, depth * 0.35, 0]}>
        <boxGeometry args={[size * 1.15, 0.01, size * 1.15]} />
        <meshStandardMaterial color="#1e293b" roughness={0.85} />
      </mesh>
    </group>
  );
}

function Box({
  args,
  position,
  rotation,
  color,
  opacity = 1,
  roughness = 0.5,
  metalness = 0,
  emissive,
  emissiveIntensity = 0,
}: {
  args: [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  opacity?: number;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissiveIntensity}
        depthWrite={opacity >= 0.95}
      />
    </mesh>
  );
}

/** 후면 아크릴 팬 구멍 (BackAcrylicPanel / FanRotor11 공유) */
const BACK_W = 1.45;
const BACK_H = 2.7;
const BACK_T = 0.04;
const BACK_Z = -0.62;
const FAN_HOLE_R = 0.3;
const FAN_HOLE_X = 0.12;
const FAN_HOLE_Y = 0.88; // 후면 상부 (제어보드와 겹치지 않게)

/**
 * 후면 아크릴 장착 DC 축류팬
 * - 프레임·블레이드 사이·아크릴 원형 구멍은 실제 관통(솔리드 채움 없음)
 */
function FanRotor11({ spinning, hot }: { spinning: boolean; hot: boolean }) {
  const ref = useRef<Group>(null);
  const bladeGeo = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0.075, -0.012);
    shape.quadraticCurveTo(0.16, -0.03, 0.25, -0.022);
    shape.quadraticCurveTo(0.29, -0.01, 0.3, 0.0);
    shape.quadraticCurveTo(0.29, 0.01, 0.25, 0.02);
    shape.quadraticCurveTo(0.16, 0.028, 0.075, 0.012);
    shape.closePath();
    const geo = new ExtrudeGeometry(shape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelSegments: 1,
      curveSegments: 12,
    });
    geo.translate(0, 0, -0.007);
    return geo;
  }, []);

  const frameGeo = useMemo(() => {
    const outer = 0.36;
    const shape = new Shape();
    shape.moveTo(-outer, -outer);
    shape.lineTo(outer, -outer);
    shape.lineTo(outer, outer);
    shape.lineTo(-outer, outer);
    shape.closePath();
    const hole = new Path();
    hole.absarc(0, 0, FAN_HOLE_R - 0.01, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new ExtrudeGeometry(shape, {
      depth: 0.11,
      bevelEnabled: false,
      curveSegments: 48,
    });
    g.translate(0, 0, -0.055);
    return g;
  }, []);

  useFrame((_, dt) => {
    if (!ref.current || !spinning) return;
    ref.current.rotation.z += dt * (hot ? 22 : 14);
  });

  const corners: [number, number][] = [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ];

  // 후면 바깥에 부착 — 축=Z, 블레이드 XY, 구멍과 정렬
  const fanZ = BACK_Z - BACK_T / 2 - 0.055;
  return (
    <group position={[FAN_HOLE_X, FAN_HOLE_Y, fanZ]}>
      <mesh geometry={frameGeo}>
        <meshStandardMaterial color="#0f172a" roughness={0.55} metalness={0.12} side={DoubleSide} />
      </mesh>

      <mesh position={[0, 0, 0.048]}>
        <torusGeometry args={[FAN_HOLE_R - 0.012, 0.012, 8, 48]} />
        <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0, -0.048]}>
        <torusGeometry args={[FAN_HOLE_R - 0.012, 0.01, 8, 40]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.1} />
      </mesh>

      {corners.map(([x, y], i) => (
        <group key={i} position={[x, y, 0]}>
          <Box args={[0.09, 0.09, 0.115]} color="#111827" roughness={0.5} />
          <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.01, 12]} />
            <meshStandardMaterial color="#64748b" metalness={0.55} roughness={0.35} />
          </mesh>
        </group>
      ))}

      {/* 바깥 가드 — 링/바만 */}
      <group position={[0, 0, -0.062]}>
        <mesh>
          <torusGeometry args={[0.26, 0.007, 8, 40]} />
          <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.25} />
        </mesh>
        <mesh>
          <torusGeometry args={[0.14, 0.006, 8, 32]} />
          <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.25} />
        </mesh>
        <Box args={[0.52, 0.012, 0.008]} color="#475569" metalness={0.2} roughness={0.4} />
        <Box args={[0.012, 0.52, 0.008]} color="#475569" metalness={0.2} roughness={0.4} />
      </group>

      {/* 로터: 블레이드+허브만 (사이 관통) */}
      <group ref={ref}>
        {Array.from({ length: 11 }, (_, i) => {
          const a = (i / 11) * Math.PI * 2;
          return (
            <mesh key={i} geometry={bladeGeo} rotation={[0, 0, a]}>
              <meshStandardMaterial
                color={spinning ? "#030712" : "#0f172a"}
                roughness={0.5}
                metalness={spinning ? 0.25 : 0.12}
                side={DoubleSide}
              />
            </mesh>
          );
        })}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.05, 0.04, 20]} />
          <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.25} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.018]}>
          <cylinderGeometry args={[0.038, 0.038, 0.005, 20]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.022]}>
          <cylinderGeometry args={[0.016, 0.016, 0.004, 12]} />
          <meshStandardMaterial
            color={spinning ? "#22c55e" : "#64748b"}
            emissive={spinning ? "#22c55e" : "#000000"}
            emissiveIntensity={spinning ? 0.45 : 0}
            roughness={0.4}
          />
        </mesh>
      </group>

      <group position={[0.2, -0.34, -0.02]}>
        <Box args={[0.06, 0.04, 0.04]} color="#1e293b" roughness={0.55} />
        <Box args={[0.01, 0.01, 0.06]} position={[-0.012, -0.02, -0.03]} color="#dc2626" roughness={0.5} />
        <Box args={[0.01, 0.01, 0.06]} position={[0.012, -0.02, -0.03]} color="#111827" roughness={0.5} />
      </group>

      {spinning ? (
        <pointLight
          position={[0, 0, 0.2]}
          color={hot ? "#fbbf24" : "#93c5c9"}
          intensity={hot ? 0.3 : 0.15}
          distance={1.2}
          decay={2}
        />
      ) : null}
    </group>
  );
}

/** FAN 헤더 → 후면 팬 */
function FanPowerWire() {
  const fanHdr: [number, number, number] = [0.32, -0.73, -0.68];
  const fanPlug: [number, number, number] = [
    FAN_HOLE_X + 0.18,
    FAN_HOLE_Y - 0.32,
    BACK_Z - 0.08,
  ];
  return (
    <group>
      <WirePath
        color="#dc2626"
        radius={0.008}
        points={[
          fanHdr,
          [0.35, -0.2, -0.7],
          [0.3, 0.3, -0.72],
          [FAN_HOLE_X + 0.15, FAN_HOLE_Y - 0.4, BACK_Z - 0.1],
          fanPlug,
        ]}
      />
      <WirePath
        color="#111827"
        radius={0.008}
        points={[
          [fanHdr[0] + 0.02, fanHdr[1], fanHdr[2]],
          [0.37, -0.18, -0.68],
          [0.32, 0.32, -0.7],
          [FAN_HOLE_X + 0.17, FAN_HOLE_Y - 0.38, BACK_Z - 0.09],
          [fanPlug[0] + 0.02, fanPlug[1], fanPlug[2]],
        ]}
      />
    </group>
  );
}

/** 후면 팬 → 챔버 안(+Z) 공기 입자 */
function AirflowParticles({ active, boost }: { active: boolean; boost: boolean }) {
  const group = useRef<Group>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: FAN_HOLE_X + (Math.random() - 0.5) * 0.35,
        y: FAN_HOLE_Y + (Math.random() - 0.5) * 0.35,
        z: BACK_Z + 0.08,
        s: 0.012 + Math.random() * 0.018,
        phase: Math.random() * Math.PI * 2,
      })),
    [],
  );

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.visible = active;
    if (!active) return;
    const speed = boost ? 1.8 : 1.1;
    g.children.forEach((child, i) => {
      const seed = seeds[i];
      child.position.z += dt * speed * 0.5;
      child.position.x = seed.x + Math.sin(child.position.z * 4 + seed.phase) * 0.04;
      child.position.y = seed.y + Math.cos(child.position.z * 3 + seed.phase) * 0.03;
      if (child.position.z > 0.45) {
        child.position.x = seed.x;
        child.position.y = seed.y;
        child.position.z = seed.z;
      }
      const mat = (child as Mesh).material as MeshBasicMaterial;
      mat.opacity = active ? 0.12 + Math.max(0, (0.4 - child.position.z) * 0.25) : 0;
    });
  });

  return (
    <group ref={group} visible={false}>
      {seeds.map((p) => (
        <mesh key={p.id} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.s, 6, 6]} />
          <meshBasicMaterial color="#93c5c9" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** 고습 시 내부 미스트 */
function HumidityMist({ level }: { level: number | null }) {
  const group = useRef<Group>(null);
  const active = level !== null && level >= 65;
  const seeds = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 0.9,
        z: (Math.random() - 0.5) * 0.8,
        y0: -0.2 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      })),
    [],
  );

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    g.visible = active;
    if (!active) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const s = seeds[i];
      child.position.y = s.y0 + ((t * 0.12 + s.phase) % 1.2);
      const mat = (child as Mesh).material as MeshBasicMaterial;
      mat.opacity = 0.08 + Math.sin(t * 2 + s.phase) * 0.04;
    });
  });

  return (
    <group ref={group} visible={false}>
      {seeds.map((p) => (
        <mesh key={p.id} position={[p.x, p.y0, p.z]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function RgbStrip({ rgb }: { rgb: { r: number; g: number; b: number } }) {
  const meshRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);
  const color = useMemo(() => new Color(rgb.r / 255, rgb.g / 255, rgb.b / 255), [rgb.r, rgb.g, rgb.b]);
  const level = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const on = level > 0.02;

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    mat.color.copy(color);
    mat.emissive.copy(color);
    if (!on) {
      mat.emissiveIntensity = 0;
      if (lightRef.current) lightRef.current.intensity = 0;
      return;
    }
    const pulse = 0.85 + level * 1.35 + Math.sin(clock.elapsedTime * (2.5 + level * 3)) * (0.15 + level * 0.25);
    mat.emissiveIntensity = pulse;
    if (lightRef.current) {
      lightRef.current.color.copy(color);
      lightRef.current.intensity = pulse * (0.7 + level * 0.8);
    }
  });

  return (
    <group>
      <mesh ref={meshRef} position={[0, 1.4, 0.15]}>
        <boxGeometry args={[0.9, 0.05, 0.12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={on ? 1.2 : 0} roughness={0.3} />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 1.5, 0.3]}
        intensity={on ? 1.1 : 0}
        color={color}
        distance={4.5}
        decay={2}
      />
    </group>
  );
}

/**
 * 1602 캐릭터 LCD + I2C 백팩 (0x27) — 키트 전면 아크릴 장착
 * 글라스 문구는 대시보드 lcd 미러(32자)와 동일
 */
function LcdScreen3D({ text }: { text: string }) {
  const glassRef = useRef<Mesh>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const tex = new CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }, []);

  useLayoutEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    // 글라스 베이스 (파란 백라이트 1602)
    ctx.fillStyle = "#041018";
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createLinearGradient(0, 0, 0, H);
    glow.addColorStop(0, "#0a2848");
    glow.addColorStop(0.5, "#0c3560");
    glow.addColorStop(1, "#071e38");
    ctx.fillStyle = glow;
    ctx.fillRect(10, 8, W - 20, H - 16);

    // 도트 매트릭스 느낌의 희미한 그리드
    ctx.fillStyle = "rgba(0, 30, 60, 0.4)";
    for (let y = 14; y < H - 12; y += 4) {
      for (let x = 18; x < W - 18; x += 4) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const raw = text.trim() === "" ? "" : text;
    const line1 = raw.slice(0, 16).padEnd(16, " ");
    const line2 = raw.slice(16, 32).padEnd(16, " ");

    ctx.font = "bold 40px 'Courier New', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(line1, 26, 42);
    ctx.fillText(line2, 26, 90);
    ctx.shadowBlur = 0;

    // 상단 가장자리 하이라이트
    ctx.fillStyle = "rgba(125, 211, 252, 0.1)";
    ctx.fillRect(10, 8, W - 20, 6);

    texture.needsUpdate = true;
  }, [text, texture]);

  useFrame(({ clock }) => {
    if (!glassRef.current) return;
    (glassRef.current.material as MeshStandardMaterial).emissiveIntensity =
      0.42 + Math.sin(clock.elapsedTime * 1.5) * 0.06;
  });

  // 실물 1602 ≈ 80×36mm 비율, 전면 아크릴 바깥에 살짝 돌출
  return (
    <group position={[0, -0.52, 0.66]}>
      {/* 메인 PCB */}
      <Box args={[0.88, 0.4, 0.018]} color="#15803d" roughness={0.55} metalness={0.08} />
      {/* PCB 가장자리 실크 */}
      <Box args={[0.86, 0.38, 0.002]} position={[0, 0, 0.01]} color="#166534" roughness={0.65} />

      {/* 검정 베젤 / 마스크 */}
      <Box args={[0.78, 0.3, 0.02]} position={[0, 0.01, 0.022]} color="#0f172a" roughness={0.7} />
      {/* 베젤 안쪽 단차 */}
      <Box args={[0.7, 0.24, 0.008]} position={[0, 0.01, 0.034]} color="#020617" roughness={0.85} />

      {/* 액정 글라스 */}
      <mesh ref={glassRef} position={[0, 0.01, 0.04]}>
        <planeGeometry args={[0.66, 0.2]} />
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#38bdf8"
          emissiveIntensity={0.45}
          roughness={0.35}
          metalness={0.05}
          toneMapped={false}
        />
      </mesh>
      {/* 글라스 반사 틴트 */}
      <mesh position={[0, 0.01, 0.041]}>
        <planeGeometry args={[0.66, 0.2]} />
        <meshStandardMaterial
          color="#7dd3fc"
          transparent
          opacity={0.06}
          roughness={0.1}
          metalness={0.4}
          depthWrite={false}
        />
      </mesh>

      {/* 네 모서리 장착 홀 */}
      {(
        [
          [-0.38, 0.15],
          [0.38, 0.15],
          [-0.38, -0.15],
          [0.38, -0.15],
        ] as [number, number][]
      ).map(([x, y], i) => (
        <group key={i} position={[x, y, 0.012]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.01, 12]} />
            <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.002]}>
            <cylinderGeometry args={[0.008, 0.008, 0.012, 10]} />
            <meshStandardMaterial color="#0f172a" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* 상단 16핀 헤더 실루엣 (베젤 뒤 PCB) */}
      {Array.from({ length: 16 }, (_, i) => {
        const x = -0.34 + i * 0.045;
        return (
          <Box
            key={i}
            args={[0.012, 0.012, 0.028]}
            position={[x, 0.175, -0.008]}
            color="#e2e8f0"
            metalness={0.55}
            roughness={0.35}
          />
        );
      })}

      {/* I2C 백팩 — 정면에서 왼쪽 */}
      <group position={[-0.22, -0.02, -0.028]}>
        <Box args={[0.32, 0.22, 0.018]} color="#1d4ed8" roughness={0.5} metalness={0.1} />
        {/* PCF8574 */}
        <Box args={[0.08, 0.06, 0.02]} position={[0.06, 0.02, 0.016]} color="#111827" roughness={0.45} />
        {/* 콘트라스트 트리머 (파란 볼륨) */}
        <mesh position={[-0.08, 0.04, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 0.022, 16]} />
          <meshStandardMaterial color="#2563eb" roughness={0.45} />
        </mesh>
        <mesh position={[-0.08, 0.04, 0.032]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.008, 10]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.4} />
        </mesh>
        {/* I2C 4핀 헤더 (GND VCC SDA SCL) — 왼쪽 가장자리 */}
        <group position={[-0.02, -0.09, 0.02]}>
          <Box args={[0.14, 0.04, 0.035]} color="#1e293b" roughness={0.55} />
          {([-0.045, -0.015, 0.015, 0.045] as number[]).map((px, i) => (
            <Box
              key={i}
              args={[0.014, 0.014, 0.05]}
              position={[px, 0, 0.02]}
              color="#fbbf24"
              metalness={0.5}
              roughness={0.35}
            />
          ))}
        </group>
        {/* 점퍼/칩 커패시터 */}
        <Box args={[0.03, 0.02, 0.012]} position={[-0.1, -0.04, 0.014]} color="#0f172a" roughness={0.6} />
        <Box args={[0.02, 0.015, 0.01]} position={[0.12, -0.05, 0.012]} color="#f59e0b" metalness={0.3} roughness={0.5} />
      </group>

      {/* 백라이트 은은한 발광 */}
      <pointLight
        position={[0, 0.01, 0.08]}
        color="#38bdf8"
        intensity={0.35}
        distance={1.2}
        decay={2}
      />
    </group>
  );
}

function SensorBank({
  t,
  soil,
  cds,
}: {
  t: number | null;
  soil: number | null;
  cds: number | null;
}) {
  const dhtRef = useRef<Mesh>(null);
  const soilRef = useRef<Mesh>(null);
  const cdsRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const u = clock.elapsedTime;
    if (dhtRef.current) {
      const hot = t !== null && t >= 28;
      (dhtRef.current.material as MeshStandardMaterial).emissiveIntensity =
        hot ? 0.55 + Math.sin(u * 5) * 0.35 : 0.12 + Math.sin(u * 1.5) * 0.05;
    }
    if (soilRef.current) {
      const dry = soil !== null && soil <= 27;
      (soilRef.current.material as MeshStandardMaterial).emissiveIntensity =
        dry ? 0.5 + Math.sin(u * 4) * 0.3 : 0.08;
      (soilRef.current.material as MeshStandardMaterial).color.set(
        dry ? "#a16207" : "#8b6b4a",
      );
    }
    if (cdsRef.current) {
      const dark = cds !== null && cds <= 500;
      const bright = cds !== null ? Math.min(1, cds / 2000) : 0.3;
      (cdsRef.current.material as MeshStandardMaterial).emissiveIntensity = dark
        ? 0.15 + Math.sin(u * 3) * 0.1
        : 0.25 + bright * 0.7;
    }
  });

  return (
    <group position={[-0.72, 0.9, 0.15]}>
      <mesh ref={dhtRef} position={[0, 0, 0.22]}>
        <boxGeometry args={[0.08, 0.16, 0.14]} />
        <meshStandardMaterial color="#3b82c4" emissive="#3b82c4" emissiveIntensity={0.15} />
      </mesh>
      <mesh ref={soilRef}>
        <boxGeometry args={[0.08, 0.2, 0.12]} />
        <meshStandardMaterial color="#8b6b4a" emissive="#a16207" emissiveIntensity={0.08} />
      </mesh>
      <mesh ref={cdsRef} position={[0, 0, -0.22]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#e0a100" emissive="#e0a100" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

/** 후면 아크릴 — 상부 팬용 원형 구멍(실제 관통) */
function BackAcrylicPanel() {
  const geo = useMemo(() => {
    const shape = new Shape();
    const hw = BACK_W / 2;
    const hh = BACK_H / 2;
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();

    const hole = new Path();
    hole.absarc(FAN_HOLE_X, FAN_HOLE_Y, FAN_HOLE_R, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const g = new ExtrudeGeometry(shape, {
      depth: BACK_T,
      bevelEnabled: false,
      curveSegments: 56,
    });
    // Shape(XY) → Extrude(+Z) → 후면 두께 중앙이 BACK_Z
    g.translate(0, 0, -BACK_T / 2);
    return g;
  }, []);

  return (
    <mesh position={[0, 0, BACK_Z]} geometry={geo}>
      <meshStandardMaterial
        color="#dceadf"
        transparent
        opacity={0.3}
        roughness={0.15}
        metalness={0}
        side={DoubleSide}
      />
    </mesh>
  );
}

const SHELF_W = 1.28;
const SHELF_D = 1.05;
const SHELF_H = 0.05;
/** 중앙 원형 구멍 지름 = 아크릴 짧은 변의 절반 */
const SHELF_HOLE_DIAM = Math.min(SHELF_W, SHELF_D) * 0.5;
const SHELF_HOLE_R = SHELF_HOLE_DIAM / 2;

/** 중간 검정 아크릴 — 중앙 원형 구멍 + 좌측 배선 구멍은 별도 */
function MidShelfAcrylic({ y = 0.05 }: { y?: number }) {
  const geo = useMemo(() => {
    const shape = new Shape();
    const hw = SHELF_W / 2;
    const hd = SHELF_D / 2;
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();

    const hole = new Path();
    hole.absarc(0, 0, SHELF_HOLE_R, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const g = new ExtrudeGeometry(shape, {
      depth: SHELF_H,
      bevelEnabled: false,
      curveSegments: 56,
    });
    // Shape(XY) → Extrude(Z) → 회전해 XZ 선반(두께 Y)
    g.rotateX(-Math.PI / 2);
    g.translate(0, -SHELF_H / 2, 0);
    return g;
  }, []);

  return (
    <mesh position={[0, y, 0]} geometry={geo}>
      <meshStandardMaterial color="#0f172a" roughness={0.9} metalness={0.05} side={DoubleSide} />
    </mesh>
  );
}

function PeaPlant({
  wilt,
  soilLevel,
  fan,
}: {
  wilt: boolean;
  soilLevel: number;
  fan: boolean;
}) {
  const group = useRef<Group>(null);
  const leaf = wilt ? "#c9851a" : "#3cb371";
  const potTopR = SHELF_HOLE_R * 1.12;
  const potBotR = SHELF_HOLE_R * 0.72;
  const potH = 0.3;
  const soilTopR = potTopR * 0.92;
  const soilBotR = potBotR * 0.95;
  const dirtH = Math.max(0.08, 0.1 + soilLevel * 0.12);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const wind = fan ? 3.6 : wilt ? 2.4 : 1.2;
    const amp = fan ? 0.09 : wilt ? 0.07 : 0.025;
    const sway = Math.sin(clock.elapsedTime * wind) * amp;
    group.current.rotation.z = (wilt ? 0.28 : 0) + sway;
    group.current.rotation.x = fan ? Math.sin(clock.elapsedTime * wind * 0.7) * 0.04 : 0;
  });

  const shelfY = 0.05;
  const rimY = shelfY + SHELF_H / 2;
  const potCenterY = rimY - potH * 0.35;

  return (
    <group position={[0, potCenterY, 0]}>
      <mesh>
        <cylinderGeometry args={[potTopR, potBotR, potH, 32]} />
        <meshStandardMaterial color="#6b7280" roughness={0.72} />
      </mesh>
      <mesh position={[0, potH * 0.48, 0]}>
        <cylinderGeometry args={[potTopR * 1.08, potTopR * 1.02, 0.025, 32]} />
        <meshStandardMaterial color="#4b5563" roughness={0.65} />
      </mesh>
      <mesh position={[0, potH * 0.12, 0]}>
        <cylinderGeometry args={[soilTopR, soilBotR * 1.05, dirtH, 24]} />
        <meshStandardMaterial color={wilt ? "#a07850" : "#8b6b4a"} roughness={0.95} />
      </mesh>
      <group ref={group} position={[0, potH * 0.2, 0]}>
        <mesh position={[0, 0.28, 0]}>
          <cylinderGeometry args={[0.015, 0.022, 0.55, 8]} />
          <meshStandardMaterial color="#2a5c3b" roughness={0.85} />
        </mesh>
        {[
          [-0.12, 0.35, 0.4],
          [0.13, 0.42, -0.35],
          [-0.05, 0.55, 0.15],
        ].map(([x, y, rz], i) => (
          <mesh key={i} position={[x, y, 0]} rotation={[0.3, 0, rz]} scale={[1, 1, 0.4]}>
            <sphereGeometry args={[0.11, 12, 10]} />
            <meshStandardMaterial color={leaf} roughness={0.55} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * SmartFarm-Mini-V04 제어보드
 * - PCB 뒷면 = 후면 아크릴 바깥면 밀착 (챔버 밖)
 * - rotation Y=π: 부품면이 외부 / Z=π: 흰 JST가 보드 하단(아래)을 향함
 */
function ControlBoardMiniV04({ online }: { online?: boolean }) {
  const ledRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ledRef.current) return;
    const mat = ledRef.current.material as MeshStandardMaterial;
    mat.emissiveIntensity = online === false ? 0.15 : 0.55 + Math.sin(clock.elapsedTime * 3) * 0.25;
  });

  const jst = [-0.26, -0.13, 0, 0.13, 0.26];
  const jstLabels = ["PLANT", "SOIL", "LCD", "Temp", "CDS"];
  const boardT = 0.028;
  // 후면 아크릴 바깥면 z=-0.64 → 보드 전체가 벽 밖, 뒷면 밀착
  const outerFaceZ = -0.64;
  const flushZ = outerFaceZ - boardT / 2;

  return (
    <group position={[0, -0.95, flushZ]} rotation={[0, Math.PI, Math.PI]}>
      {/* PCB body — green FR4, wide back flush on acrylic exterior */}
      <Box args={[0.92, 0.62, boardT]} color="#15803d" roughness={0.55} metalness={0.08} />
      {/* silk / edge darken on component face */}
      <Box
        args={[0.9, 0.6, 0.002]}
        position={[0, 0, boardT / 2 + 0.001]}
        color="#166534"
        roughness={0.65}
      />

      {/* ESP32-WROOM */}
      <group position={[0.02, -0.08, 0.03]}>
        <Box args={[0.28, 0.2, 0.04]} color="#64748b" metalness={0.65} roughness={0.3} />
        <Box args={[0.22, 0.14, 0.006]} position={[0, 0, 0.024]} color="#94a3b8" metalness={0.5} roughness={0.35} />
        <Box args={[0.06, 0.02, 0.035]} position={[0.14, 0, 0.01]} color="#0f172a" roughness={0.8} />
      </group>

      {/* USB Type-B (left edge) */}
      <group position={[-0.42, 0.02, 0.02]}>
        <Box args={[0.08, 0.12, 0.05]} color="#e2e8f0" metalness={0.4} roughness={0.4} />
        <Box args={[0.04, 0.08, 0.028]} position={[-0.03, 0, 0]} color="#0f172a" roughness={0.9} />
      </group>

      {/* DC jack */}
      <group position={[0.38, 0.18, 0.025]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 0.06, 16]} />
          <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.35} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.01]}>
          <cylinderGeometry args={[0.014, 0.014, 0.02, 12]} />
          <meshStandardMaterial color="#0b1220" roughness={1} />
        </mesh>
      </group>

      {/* Power rocker switch (red) */}
      <group position={[0.38, 0.02, 0.04]}>
        <Box args={[0.07, 0.1, 0.05]} color="#7f1d1d" roughness={0.45} />
        <Box args={[0.055, 0.08, 0.02]} position={[0, 0.008, 0.028]} color="#ef4444" roughness={0.35} />
      </group>

      {/* KEY button */}
      <group position={[-0.12, 0.12, 0.035]}>
        <Box args={[0.06, 0.06, 0.02]} color="#334155" roughness={0.5} />
        <mesh position={[0, 0, 0.018]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.016, 16]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
        </mesh>
      </group>

      {/* Reset */}
      <group position={[0.22, -0.2, 0.03]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.02, 12]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.45} />
        </mesh>
      </group>

      {/* Buzzer */}
      <group position={[0.08, 0.14, 0.035]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.032, 0.032, 0.022, 24]} />
          <meshStandardMaterial color="#0f172a" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.004, 16]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>
      </group>

      {/* Status LEDs */}
      <mesh position={[-0.28, -0.18, 0.03]}>
        <boxGeometry args={[0.02, 0.02, 0.012]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[-0.22, -0.18, 0.03]}>
        <boxGeometry args={[0.02, 0.02, 0.012]} />
        <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={0.35} />
      </mesh>
      <mesh ref={ledRef} position={[0.3, -0.12, 0.03]}>
        <boxGeometry args={[0.022, 0.022, 0.014]} />
        <meshStandardMaterial color="#4ade80" emissive="#22c55e" emissiveIntensity={0.5} />
      </mesh>

      {/* FAN header */}
      <group position={[0.32, -0.22, 0.03]}>
        <Box args={[0.05, 0.04, 0.035]} color="#f8fafc" roughness={0.45} />
        <Box args={[0.012, 0.012, 0.02]} position={[-0.012, 0, 0.02]} color="#fbbf24" metalness={0.4} />
        <Box args={[0.012, 0.012, 0.02]} position={[0.012, 0, 0.02]} color="#fbbf24" metalness={0.4} />
      </group>

      {/* JST 행 — 로컬 +Y 가장자리(= Z=π 후 월드 아래). 개구가 +Y(아래) */}
      {jst.map((x, i) => (
        <group key={jstLabels[i]} position={[x, 0.3, 0.025]}>
          <Box args={[0.072, 0.07, 0.045]} color="#f1f5f9" roughness={0.4} />
          <Box args={[0.055, 0.022, 0.032]} position={[0, 0.04, 0.004]} color="#0f172a" roughness={0.85} />
          <Box args={[0.012, 0.02, 0.012]} position={[-0.018, 0.012, 0.028]} color="#fbbf24" metalness={0.45} />
          <Box args={[0.012, 0.02, 0.012]} position={[0, 0.012, 0.028]} color="#fbbf24" metalness={0.45} />
          <Box args={[0.012, 0.02, 0.012]} position={[0.018, 0.012, 0.028]} color="#fbbf24" metalness={0.45} />
        </group>
      ))}

      {/* regulator / cap */}
      <mesh position={[0.22, 0.18, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.045, 14]} />
        <meshStandardMaterial color="#111827" roughness={0.45} />
      </mesh>
      <Box args={[0.05, 0.04, 0.035]} position={[0.12, 0.2, 0.03]} color="#1e293b" metalness={0.3} roughness={0.5} />
    </group>
  );
}

/** 제어보드 JST 월드 좌표 — ControlBoardMiniV04 배치와 동기 */
const BOARD_ORIGIN: [number, number, number] = [0, -0.95, -0.64 - 0.014];
/** rotation [0,π,π] 적용: local (x,y,z) → (x, -y, -z) */
function jstWorld(localX: number): [number, number, number] {
  const ly = 0.34; // 커넥터 개구 쪽
  const lz = 0.05;
  return [BOARD_ORIGIN[0] + localX, BOARD_ORIGIN[1] - ly, BOARD_ORIGIN[2] - lz];
}

function BoardSensorWires() {
  // PLANT / SOIL / LCD / Temp / CDS
  const plant = jstWorld(-0.26);
  const soil = jstWorld(-0.13);
  const lcd = jstWorld(0);
  const temp = jstWorld(0.13);
  const cds = jstWorld(0.26);
  const pass: [number, number, number] = [-0.48, -1.12, -0.62];

  return (
    <group>
      {/* PLANT → RGB 생장등 */}
      <WirePath
        color="#db2777"
        radius={0.01}
        points={[
          plant,
          [plant[0], -1.28, plant[2]],
          [-0.4, -1.2, -0.68],
          pass,
          [-0.45, -0.4, -0.35],
          [-0.35, 0.4, -0.1],
          [-0.2, 1.0, 0.05],
          [0, 1.35, 0.12],
        ]}
      />
      {/* SOIL → 토양 모듈 */}
      <WirePath
        color="#a16207"
        radius={0.01}
        points={[
          soil,
          [soil[0], -1.28, soil[2]],
          [-0.42, -1.18, -0.66],
          pass,
          [-0.5, -0.5, -0.3],
          [-0.55, 0.1, 0.05],
          [-0.65, 0.55, 0.12],
          [-0.72, 0.8, 0.15],
        ]}
      />
      {/* LCD → 전면 1602 왼쪽 I2C 4핀 */}
      <WirePath
        color="#64748b"
        radius={0.01}
        points={[
          lcd,
          [lcd[0], -1.28, lcd[2]],
          [-0.35, -1.18, -0.65],
          pass,
          [-0.4, -0.95, -0.15],
          [-0.35, -0.75, 0.25],
          [-0.3, -0.65, 0.5],
          [-0.24, -0.61, 0.62],
        ]}
      />
      {/* Temp → DHT */}
      <WirePath
        color="#2563eb"
        radius={0.01}
        points={[
          temp,
          [temp[0], -1.28, temp[2]],
          [-0.3, -1.18, -0.65],
          pass,
          [-0.52, -0.4, -0.2],
          [-0.58, 0.2, 0.1],
          [-0.68, 0.65, 0.28],
          [-0.72, 0.9, 0.37],
        ]}
      />
      {/* CDS → 조도 */}
      <WirePath
        color="#ca8a04"
        radius={0.01}
        points={[
          cds,
          [cds[0], -1.28, cds[2]],
          [-0.25, -1.18, -0.64],
          pass,
          [-0.48, -0.35, -0.25],
          [-0.55, 0.25, 0.0],
          [-0.65, 0.7, -0.05],
          [-0.72, 0.9, -0.07],
        ]}
      />
    </group>
  );
}

function KitTower({ t, h, soil, cds, fan, rgb, lcd }: Props) {
  const wilt = soil !== null && soil < 27;
  const hot = t !== null && t >= 28;
  const soilLevel = soil === null ? 0.4 : Math.max(0, Math.min(1, soil / 100));
  const heatRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = heatRef.current;
    if (!mesh) return;
    if (!hot) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    (mesh.material as MeshBasicMaterial).opacity =
      0.1 + Math.sin(clock.elapsedTime * 3.2) * 0.06;
  });

  return (
    <group position={[0, -0.15, 0]}>
      <Box args={[1.55, 0.12, 1.35]} position={[0, -1.42, 0]} color="#111827" roughness={0.85} />

      <Box args={[1.45, 2.7, 0.04]} position={[0, 0, 0.62]} color="#dceadf" opacity={0.28} roughness={0.15} />
      <BackAcrylicPanel />
      <Box args={[0.04, 2.7, 1.2]} position={[-0.72, 0, 0]} color="#dceadf" opacity={0.3} roughness={0.15} />
      <Box args={[0.04, 2.7, 1.2]} position={[0.72, 0, 0]} color="#dceadf" opacity={0.3} roughness={0.15} />
      <Box args={[1.45, 0.04, 1.28]} position={[0, 1.36, 0]} color="#dceadf" opacity={0.35} roughness={0.15} />

      <RgbStrip rgb={rgb} />

      <MidShelfAcrylic y={0.05} />
      <SquarePass position={[-0.52, 0.05, 0.12]} size={0.075} depth={0.055} />

      <PeaPlant wilt={wilt} soilLevel={soilLevel} fan={fan} />
      <HumidityMist level={h} />
      <AirflowParticles active={fan} boost={hot} />

      <LcdScreen3D text={lcd} />

      <SensorBank t={t} soil={soil} cds={cds} />

      <FanRotor11 spinning={fan} hot={hot} />
      <FanPowerWire />

      <SquarePass
        position={[-0.48, -1.12, -0.62]}
        size={0.08}
        depth={0.05}
        rotation={[Math.PI / 2, 0, 0]}
      />

      <ControlBoardMiniV04 online />
      <BoardSensorWires />

      <mesh ref={heatRef} position={[0, 0.7, 0]} visible={false}>
        <boxGeometry args={[1.2, 1.6, 1.0]} />
        <meshBasicMaterial color="#c9851a" transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}

function HabitatWorld(props: Props) {
  const amb = useRef<import("three").AmbientLight>(null);
  const sun = useRef<import("three").DirectionalLight>(null);

  useFrame(() => {
    const cds = props.cds;
    const bright = cds === null ? 0.55 : Math.max(0.2, Math.min(1, cds / 1800));
    if (amb.current) amb.current.intensity = 0.45 + bright * 0.55;
    if (sun.current) sun.current.intensity = 0.55 + bright * 0.85;
  });

  return (
    <>
      <color attach="background" args={["#eef4ee"]} />
      <ambientLight ref={amb} intensity={0.8} />
      <directionalLight ref={sun} position={[3.2, 5, 2.5]} intensity={1.05} />
      <directionalLight position={[-2.5, 2, -1.2]} intensity={0.35} color="#93c5c9" />
      <KitTower {...props} />
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        zoomSpeed={0.85}
        rotateSpeed={0.7}
        panSpeed={0.55}
        minDistance={1.6}
        maxDistance={9}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0.05, 0]}
      />
    </>
  );
}

export function HabitatScene3D(props: Props) {
  const soilLabel = props.soil === null ? "—" : `${Math.round(props.soil)}%`;
  const tLabel = props.t === null ? "—" : `${props.t.toFixed(1)}°C`;
  const hLabel = props.h === null ? "—" : `${Math.round(props.h)}%`;
  const cdsLabel = props.cds === null ? "—" : `${Math.round(props.cds)}`;
  const rgbLabel = `RGB(${props.rgb.r},${props.rgb.g},${props.rgb.b})`;
  const lcdLabel = props.lcd.trim() ? props.lcd.slice(0, 16) : "LCD —";

  return (
    <div className={styles.habitat3d}>
      <SceneErrorBoundary
        fallback={
          <div className={styles.habitat3dFallback}>
            3D 로드 실패 · 센서 데이터는 옆 카드에서 확인
          </div>
        }
      >
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [3.1, 1.55, 3.8], fov: 38, near: 0.1, far: 50 }}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => gl.setClearColor("#eef4ee")}
          style={{ touchAction: "none" }}
        >
          <HabitatWorld {...props} />
        </Canvas>
      </SceneErrorBoundary>
      <div className={styles.habitatChips} aria-hidden>
        <span>토양 {soilLabel}</span>
        <span>온도 {tLabel}</span>
        <span>습도 {hLabel}</span>
        <span>조도 {cdsLabel}</span>
        <span>팬 {props.fan ? "ON" : "off"}</span>
        <span>{rgbLabel}</span>
        <span>{lcdLabel}</span>
        <span className={styles.habitatHint}>스크롤 줌 · 드래그 회전</span>
      </div>
    </div>
  );
}
