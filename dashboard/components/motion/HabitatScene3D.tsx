"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, RoundedBox } from "@react-three/drei";
import type { Group, Mesh } from "three";
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

function Water({ level }: { level: number }) {
  const mesh = useRef<Mesh>(null);
  const h = 0.08 + level * 0.72;
  const y = -0.42 + h / 2;

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 1.6) * 0.012;
    mesh.current.scale.set(s, 1, s);
  });

  return (
    <mesh ref={mesh} position={[0, y, 0]}>
      <cylinderGeometry args={[0.72, 0.78, h, 48]} />
      <meshPhysicalMaterial
        color="#3b82c4"
        transparent
        opacity={0.55}
        roughness={0.15}
        metalness={0.05}
        transmission={0.35}
        thickness={0.4}
      />
    </mesh>
  );
}

function Plant({ wilt, hot }: { wilt: boolean; hot: boolean }) {
  const group = useRef<Group>(null);
  const lean = wilt ? 0.35 : hot ? 0.08 : 0;
  const leafColor = wilt ? "#c9851a" : "#3cb371";

  useFrame(({ clock }) => {
    if (!group.current) return;
    const sway = Math.sin(clock.elapsedTime * (wilt ? 2.2 : 1.1)) * (wilt ? 0.08 : 0.03);
    group.current.rotation.z = lean + sway;
  });

  return (
    <group ref={group} position={[0, -0.05, 0]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 1.1, 12]} />
        <meshStandardMaterial color="#2a5c3b" roughness={0.85} />
      </mesh>
      {[
        { x: -0.28, y: 0.85, z: 0.05, ry: 0.6, rz: 0.55 },
        { x: 0.3, y: 0.95, z: -0.04, ry: -0.55, rz: -0.5 },
        { x: -0.08, y: 1.2, z: 0.12, ry: 0.2, rz: 0.15 },
      ].map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} rotation={[0.2, p.ry, p.rz]} scale={[1, 1, 0.45]}>
          <sphereGeometry args={[0.28, 24, 16]} />
          <meshStandardMaterial color={leafColor} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function FanBlade({ spinning, hot }: { spinning: boolean; hot: boolean }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (!ref.current || !spinning) return;
    ref.current.rotation.z += dt * (hot ? 14 : 7);
  });

  return (
    <group position={[1.55, 0.15, 0.9]}>
      <mesh>
        <cylinderGeometry args={[0.22, 0.22, 0.06, 24]} />
        <meshStandardMaterial color="#e8eee8" roughness={0.4} metalness={0.2} />
      </mesh>
      <group ref={ref}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (Math.PI / 2) * i]} position={[0, 0, 0.02]}>
            <boxGeometry args={[0.08, 0.42, 0.02]} />
            <meshStandardMaterial
              color={spinning ? "#1f7a4d" : "#8aa090"}
              roughness={0.35}
              metalness={0.15}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function HabitatWorld({ t, soil, fan, rgb }: Props) {
  const level = useMemo(() => {
    const s = soil === null ? 0.4 : Math.max(0, Math.min(1, soil / 100));
    return s;
  }, [soil]);
  const wilt = soil !== null && soil < 27;
  const hot = t !== null && t >= 28;
  const rgbOn = rgb !== "off";
  const rgbHex = RGB_COLOR[rgb];

  return (
    <>
      <color attach="background" args={["#f3f7f2"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[3.2, 5, 2]} intensity={1.15} castShadow />
      <directionalLight position={[-2.5, 2, -1]} intensity={0.25} color="#3b82c4" />
      {hot ? <pointLight position={[-1.2, 1.6, 1.2]} intensity={1.2} color="#c9851a" distance={5} /> : null}
      {rgbOn ? (
        <pointLight position={[1.5, 1.4, 1.1]} intensity={1.6} color={rgbHex} distance={4.5} />
      ) : null}

      <group position={[0, -0.15, 0]}>
        {/* planter */}
        <RoundedBox args={[2.0, 1.05, 1.55]} radius={0.12} smoothness={4} position={[0, -0.55, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#d5e2d6" roughness={0.65} metalness={0.05} />
        </RoundedBox>
        {/* inner rim */}
        <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.82, 0.95, 48]} />
          <meshStandardMaterial color="#b7c9b8" roughness={0.7} />
        </mesh>
        {/* soil bed */}
        <mesh position={[0, -0.38, 0]} receiveShadow>
          <cylinderGeometry args={[0.88, 0.9, 0.35, 48]} />
          <meshStandardMaterial color="#8b6b4a" roughness={0.95} />
        </mesh>

        <Water level={level} />
        <Plant wilt={wilt} hot={hot} />
        <FanBlade spinning={fan} hot={hot} />

        {/* RGB orb */}
        <mesh position={[1.55, 1.05, 0.85]}>
          <sphereGeometry args={[0.14, 24, 24]} />
          <meshStandardMaterial
            color={rgbHex}
            emissive={rgbOn ? rgbHex : "#000000"}
            emissiveIntensity={rgbOn ? 1.4 : 0}
            roughness={0.25}
            metalness={0.2}
          />
        </mesh>
      </group>

      <ContactShadows position={[0, -1.15, 0]} opacity={0.35} scale={8} blur={2.4} far={3} />
      <Environment preset="park" environmentIntensity={0.45} />
    </>
  );
}

export function HabitatScene3D(props: Props) {
  const soilLabel = props.soil === null ? "—" : `${Math.round(props.soil)}%`;
  const tLabel = props.t === null ? "—" : `${props.t.toFixed(1)}°C`;

  return (
    <div className={styles.habitat3d}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [2.6, 1.9, 3.4], fov: 38, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: false }}
      >
        <HabitatWorld {...props} />
      </Canvas>
      <div className={styles.habitatChips} aria-hidden>
        <span>토양 {soilLabel}</span>
        <span>온도 {tLabel}</span>
        <span>팬 {props.fan ? "ON" : "off"}</span>
        <span>RGB {props.rgb.toUpperCase()}</span>
      </div>
    </div>
  );
}
