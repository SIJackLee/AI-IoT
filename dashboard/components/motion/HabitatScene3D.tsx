"use client";

import { Component, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ExtrudeGeometry, Shape, type Group, type Mesh, type MeshBasicMaterial } from "three";
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
  const bladeGeo = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0.09, -0.012);
    shape.quadraticCurveTo(0.18, -0.055, 0.3, -0.048);
    shape.quadraticCurveTo(0.36, -0.02, 0.37, 0.0);
    shape.quadraticCurveTo(0.36, 0.028, 0.29, 0.05);
    shape.quadraticCurveTo(0.17, 0.06, 0.09, 0.018);
    shape.closePath();
    const geo = new ExtrudeGeometry(shape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.002,
      bevelSegments: 2,
      curveSegments: 14,
    });
    geo.translate(0, 0, -0.008);
    return geo;
  }, []);
  const helix = (45 * Math.PI) / 180;

  useFrame((_, dt) => {
    if (!ref.current || !spinning) return;
    ref.current.rotation.z += dt * (hot ? 14 : 7);
  });

  return (
    <group position={[0, 1.05, -0.58]}>
      {/* 외곽 원형 슈라우드 */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.355, 0.03, 12, 48]} />
        <meshStandardMaterial color="#9aab9e" roughness={0.42} metalness={0.06} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.01]}>
        <ringGeometry args={[0.33, 0.39, 48]} />
        <meshStandardMaterial color="#c5d2c8" roughness={0.5} />
      </mesh>

      <group ref={ref}>
        {Array.from({ length: 11 }, (_, i) => {
          const a = (i / 11) * Math.PI * 2;
          return (
            <mesh
              key={i}
              geometry={bladeGeo}
              // Z축 원주 배치 + X축 현선각(피치) 45°
              rotation={[helix, 0, a]}
            >
              <meshStandardMaterial
                color={spinning ? "#8fa89a" : "#b7c8bc"}
                roughness={0.36}
                metalness={0.03}
              />
            </mesh>
          );
        })}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.085, 0.095, 0.065, 24]} />
          <meshStandardMaterial color="#eef3ef" roughness={0.3} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}>
          <cylinderGeometry args={[0.028, 0.028, 0.02, 16]} />
          <meshStandardMaterial color="#64748b" roughness={0.4} metalness={0.25} />
        </mesh>
      </group>
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

function PeaPlant({ wilt, soilLevel }: { wilt: boolean; soilLevel: number }) {
  const group = useRef<Group>(null);
  const leaf = wilt ? "#c9851a" : "#3cb371";
  const dirtH = Math.max(0.06, 0.06 + soilLevel * 0.1);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const sway = Math.sin(clock.elapsedTime * (wilt ? 2.4 : 1.2)) * (wilt ? 0.07 : 0.025);
    group.current.rotation.z = (wilt ? 0.28 : 0) + sway;
  });

  return (
    <group position={[0, 0.12, 0.05]}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.22, 0.26, 0.2, 20]} />
        <meshStandardMaterial color="#6b7280" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.2, 0.2, dirtH, 20]} />
        <meshStandardMaterial color="#8b6b4a" roughness={0.95} />
      </mesh>
      <group ref={group} position={[0, 0.2, 0]}>
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
      <Box args={[1.45, 2.7, 0.04]} position={[0, 0, -0.62]} color="#dceadf" opacity={0.3} roughness={0.15} />
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

      <Box args={[1.28, 0.05, 1.05]} position={[0, 0.05, 0]} color="#0f172a" roughness={0.9} />

      <PeaPlant wilt={wilt} soilLevel={soilLevel} />

      {/* LCD 중하단 */}
      <group position={[0, -0.55, 0.62]}>
        <Box args={[0.85, 0.42, 0.06]} color="#1e293b" />
        <mesh position={[0, 0.02, 0.035]}>
          <planeGeometry args={[0.72, 0.28]} />
          <meshStandardMaterial color="#86efac" emissive="#22c55e" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* 좌측 센서 가로 */}
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

      {/* MCU */}
      <group position={[0, -0.95, -0.55]}>
        <Box args={[0.7, 0.45, 0.08]} color="#166534" />
        <Box args={[0.35, 0.12, 0.05]} position={[0, 0.05, 0.05]} color="#94a3b8" />
      </group>

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
