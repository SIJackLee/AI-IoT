"use client";

import { Component, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { DoubleSide, ExtrudeGeometry, Path, Quaternion, Shape, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import type { RgbKind } from "./rgb";
import styles from "./motion.module.css";

type Props = {
  t: number | null;
  soil: number | null;
  fan: boolean;
  rgb: RgbKind;
};

const RGB_COLOR: Record<RgbKind, string> = {
  off: "#94a3b8",
  amber: "#c9851a",
  red: "#d1435b",
  white: "#dbe4ee",
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

function FanRotor11({ spinning, hot }: { spinning: boolean; hot: boolean }) {
  const ref = useRef<Group>(null);
  // 얇은 검정 블레이드 → 날개 사이 빈 공간
  const bladeGeo = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0.08, -0.008);
    shape.quadraticCurveTo(0.16, -0.022, 0.26, -0.018);
    shape.quadraticCurveTo(0.34, -0.01, 0.36, 0.0);
    shape.quadraticCurveTo(0.34, 0.01, 0.26, 0.016);
    shape.quadraticCurveTo(0.16, 0.018, 0.08, 0.008);
    shape.closePath();
    const geo = new ExtrudeGeometry(shape, {
      depth: 0.01,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelSegments: 1,
      curveSegments: 12,
    });
    geo.translate(0, 0, -0.005);
    return geo;
  }, []);

  useFrame((_, dt) => {
    if (!ref.current || !spinning) return;
    ref.current.rotation.z += dt * (hot ? 14 : 7);
  });

  return (
    <group position={[0, 1.05, -0.575]}>
      {/* 외곽 프레임만 — 중앙 개방(공기 통로) */}
      <mesh>
        <torusGeometry args={[0.355, 0.022, 10, 48]} />
        <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.08} />
      </mesh>
      <mesh>
        <ringGeometry args={[0.34, 0.39, 48]} />
        <meshStandardMaterial color="#334155" roughness={0.5} side={DoubleSide} />
      </mesh>

      <group ref={ref}>
        {Array.from({ length: 11 }, (_, i) => {
          const a = (i / 11) * Math.PI * 2;
          return (
            <mesh key={i} geometry={bladeGeo} rotation={[0, 0, a]}>
              <meshStandardMaterial
                color={spinning ? "#0a0a0a" : "#111827"}
                roughness={0.55}
                metalness={0.12}
              />
            </mesh>
          );
        })}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.062, 0.04, 20]} />
          <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.018]}>
          <cylinderGeometry args={[0.02, 0.02, 0.014, 14]} />
          <meshStandardMaterial color="#64748b" roughness={0.35} metalness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/** 후면 아크릴 — 팬 위치 원형 통기구 */
function BackAcrylicWithFanVent() {
  const geo = useMemo(() => {
    const w = 1.45;
    const h = 2.7;
    const depth = 0.04;
    const shape = new Shape();
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.closePath();

    const vent = new Path();
    vent.absarc(0, 1.05, 0.36, 0, Math.PI * 2, true);
    shape.holes.push(vent);

    const g = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 48,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }, []);

  return (
    <group position={[0, 0, -0.62]}>
      <mesh geometry={geo}>
        <meshStandardMaterial
          color="#dceadf"
          transparent
          opacity={0.3}
          roughness={0.15}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.05, 0.005]}>
        <ringGeometry args={[0.36, 0.4, 48]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.4} side={DoubleSide} />
      </mesh>
    </group>
  );
}

function CrossVents() {
  const holes: [number, number, number][] = [
    [0.722, 0.85, 0],
    [0.722, 1.05, 0],
    [0.722, 0.65, 0],
    [0.722, 0.85, 0.2],
    [0.722, 0.85, -0.2],
  ];
  return (
    <group>
      {holes.map((p, i) => (
        <group key={i} position={p} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <circleGeometry args={[0.075, 28]} />
            <meshStandardMaterial color="#0b1220" roughness={1} />
          </mesh>
          <mesh position={[0, 0, 0.001]}>
            <ringGeometry args={[0.075, 0.092, 28]} />
            <meshStandardMaterial color="#a8b5ae" roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
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

function PeaPlant({ wilt, soilLevel }: { wilt: boolean; soilLevel: number }) {
  const group = useRef<Group>(null);
  const leaf = wilt ? "#c9851a" : "#3cb371";
  // 절두원뿔(원뿔 꼭지 절단)을 뒤집은 화분: 위 넓고 아래 좁음
  const potTopR = SHELF_HOLE_R * 1.12;
  const potBotR = SHELF_HOLE_R * 0.72;
  const potH = 0.3;
  const soilTopR = potTopR * 0.92;
  const soilBotR = potBotR * 0.95;
  const dirtH = Math.max(0.08, 0.1 + soilLevel * 0.12);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const sway = Math.sin(clock.elapsedTime * (wilt ? 2.4 : 1.2)) * (wilt ? 0.07 : 0.025);
    group.current.rotation.z = (wilt ? 0.28 : 0) + sway;
  });

  // 선반 y=0.05: 테두리가 구멍에 걸쳐 앉고 몸통은 아래로 통과
  const shelfY = 0.05;
  const rimY = shelfY + SHELF_H / 2;
  const potCenterY = rimY - potH * 0.35;

  return (
    <group position={[0, potCenterY, 0]}>
      {/* 화분: 절두원뿔 뒤집음 — 위 넓고 아래 좁음 */}
      <mesh>
        <cylinderGeometry args={[potTopR, potBotR, potH, 32]} />
        <meshStandardMaterial color="#6b7280" roughness={0.72} />
      </mesh>
      {/* 겉테두리(선반에 걸치는 립) */}
      <mesh position={[0, potH * 0.48, 0]}>
        <cylinderGeometry args={[potTopR * 1.08, potTopR * 1.02, 0.025, 32]} />
        <meshStandardMaterial color="#4b5563" roughness={0.65} />
      </mesh>
      {/* 흙 */}
      <mesh position={[0, potH * 0.12, 0]}>
        <cylinderGeometry args={[soilTopR, soilBotR * 1.05, dirtH, 24]} />
        <meshStandardMaterial color="#8b6b4a" roughness={0.95} />
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

function KitTower({ t, soil, fan, rgb }: Props) {
  const wilt = soil !== null && soil < 27;
  const hot = t !== null && t >= 28;
  const rgbOn = rgb !== "off";
  const rgbHex = RGB_COLOR[rgb];
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
    (mesh.material as MeshBasicMaterial).opacity = 0.1 + Math.sin(clock.elapsedTime * 3) * 0.05;
  });

  return (
    <group position={[0, -0.15, 0]}>
      <Box args={[1.55, 0.12, 1.35]} position={[0, -1.42, 0]} color="#111827" roughness={0.85} />

      <Box args={[1.45, 2.7, 0.04]} position={[0, 0, 0.62]} color="#dceadf" opacity={0.28} roughness={0.15} />
      <BackAcrylicWithFanVent />
      <Box args={[0.04, 2.7, 1.2]} position={[-0.72, 0, 0]} color="#dceadf" opacity={0.3} roughness={0.15} />
      <Box args={[0.04, 2.7, 1.2]} position={[0.72, 0, 0]} color="#dceadf" opacity={0.3} roughness={0.15} />
      <Box args={[1.45, 0.04, 1.28]} position={[0, 1.36, 0]} color="#dceadf" opacity={0.35} roughness={0.15} />

      <Box
        args={[0.9, 0.05, 0.12]}
        position={[0, 1.4, 0.15]}
        color={rgbHex}
        emissive={rgbOn ? rgbHex : undefined}
        emissiveIntensity={rgbOn ? 1.6 : 0}
      />
      {rgbOn ? <pointLight position={[0, 1.5, 0.3]} intensity={1.2} color={rgbHex} distance={4} /> : null}

      {/* 중간 검정 아크릴 선반(중앙 원형 구멍) + 좌측 배선 구멍 */}
      <MidShelfAcrylic y={0.05} />
      <SquarePass position={[-0.52, 0.05, 0.12]} size={0.075} depth={0.055} />

      <PeaPlant wilt={wilt} soilLevel={soilLevel} />

      {/* LCD 중하단 */}
      <group position={[0, -0.55, 0.62]}>
        <Box args={[0.85, 0.42, 0.06]} color="#1e293b" />
        <mesh position={[0, 0.02, 0.035]}>
          <planeGeometry args={[0.72, 0.28]} />
          <meshStandardMaterial color="#86efac" emissive="#22c55e" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* 좌측 센서 가로 (DHT / Soil / CDS) */}
      <group position={[-0.72, 0.9, 0.15]}>
        <Box args={[0.08, 0.16, 0.14]} position={[0, 0, 0.22]} color="#3b82c4" />
        <Box args={[0.08, 0.2, 0.12]} color="#8b6b4a" />
        <mesh position={[0, 0, -0.22]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color="#e0a100" emissive="#e0a100" emissiveIntensity={0.15} />
        </mesh>
      </group>

      <CrossVents />
      <FanRotor11 spinning={fan} hot={hot} />

      {/* 후면 좌측하단 배선 구멍 */}
      <SquarePass
        position={[-0.48, -1.12, -0.62]}
        size={0.08}
        depth={0.05}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {/* MCU + 하단 핀 헤더 (배선이 차례로 연결) */}
      <group position={[0, -0.95, -0.55]}>
        <Box args={[0.7, 0.45, 0.08]} color="#166534" />
        <Box args={[0.35, 0.12, 0.05]} position={[0, 0.05, 0.05]} color="#94a3b8" />
        {/* 보드 하단 핀 열 */}
        {[-0.22, -0.11, 0, 0.11, 0.22].map((x, i) => (
          <Box
            key={i}
            args={[0.04, 0.06, 0.035]}
            position={[x, -0.24, 0.04]}
            color="#cbd5e1"
            metalness={0.55}
            roughness={0.35}
          />
        ))}
      </group>

      {/*
        센서 → 선반 좌측 구멍 → 후면 좌하단 구멍 → MCU 하단 핀 순 배선
        (3색: DHT / Soil / CDS)
      */}
      <WirePath
        color="#2563eb"
        radius={0.011}
        points={[
          [-0.72, 0.82, 0.37],
          [-0.62, 0.55, 0.28],
          [-0.55, 0.28, 0.18],
          [-0.52, 0.08, 0.12],
          [-0.52, -0.15, 0.05],
          [-0.52, -0.55, -0.25],
          [-0.5, -0.95, -0.55],
          [-0.48, -1.12, -0.62],
          [-0.35, -1.12, -0.58],
          [-0.22, -1.15, -0.52],
        ]}
      />
      <WirePath
        color="#a16207"
        radius={0.011}
        points={[
          [-0.72, 0.8, 0.15],
          [-0.6, 0.5, 0.12],
          [-0.54, 0.25, 0.1],
          [-0.5, 0.08, 0.1],
          [-0.5, -0.2, 0.02],
          [-0.5, -0.6, -0.28],
          [-0.48, -0.98, -0.56],
          [-0.46, -1.12, -0.62],
          [-0.28, -1.14, -0.57],
          [-0.11, -1.16, -0.52],
        ]}
      />
      <WirePath
        color="#ca8a04"
        radius={0.011}
        points={[
          [-0.72, 0.82, -0.07],
          [-0.58, 0.48, 0.02],
          [-0.52, 0.22, 0.06],
          [-0.48, 0.08, 0.08],
          [-0.48, -0.25, -0.02],
          [-0.48, -0.65, -0.32],
          [-0.46, -1.0, -0.57],
          [-0.44, -1.12, -0.62],
          [-0.2, -1.15, -0.56],
          [0.0, -1.17, -0.52],
        ]}
      />

      <mesh ref={heatRef} position={[0, 0.7, 0]} visible={false}>
        <boxGeometry args={[1.2, 1.6, 1.0]} />
        <meshBasicMaterial color="#c9851a" transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}

function HabitatWorld(props: Props) {
  return (
    <>
      <color attach="background" args={["#eef4ee"]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[3.2, 5, 2.5]} intensity={1.05} />
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
        <span>팬 {props.fan ? "ON" : "off"}</span>
        <span>RGB {props.rgb.toUpperCase()}</span>
        <span className={styles.habitatHint}>스크롤 줌 · 드래그 회전</span>
      </div>
    </div>
  );
}
