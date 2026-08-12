"use client";

import dynamic from "next/dynamic";
import styles from "./motion.module.css";

export type { RgbKind } from "./rgb";
export { classifyRgb } from "./rgb";

type HabitatProps = {
  t: number | null;
  soil: number | null;
  fan: boolean;
  rgb: import("./rgb").RgbKind;
};

const HabitatScene3D = dynamic(
  () => import("./HabitatScene3D").then((m) => m.HabitatScene3D),
  {
    ssr: false,
    loading: () => <div className={styles.habitat3dSkeleton} aria-label="3D 서식지 로딩" />,
  },
);

export function HabitatScene(props: HabitatProps) {
  return <HabitatScene3D {...props} />;
}
