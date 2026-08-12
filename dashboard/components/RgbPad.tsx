"use client";

import type { CSSProperties } from "react";
import { Lightbulb, LightbulbOff, Power } from "lucide-react";
import styles from "./devices.module.css";

export type RgbValue = { r: number; g: number; b: number };

type Props = {
  value: RgbValue;
  disabled?: boolean;
  onChange: (next: RgbValue) => void;
};

const swatches: { key: string; label: string; rgb: RgbValue; color: string }[] = [
  { key: "r", label: "빨강", rgb: { r: 255, g: 0, b: 0 }, color: "#e11d48" },
  { key: "g", label: "초록", rgb: { r: 0, g: 255, b: 0 }, color: "#059669" },
  { key: "b", label: "파랑", rgb: { r: 0, g: 0, b: 255 }, color: "#2563eb" },
  { key: "w", label: "흰색", rgb: { r: 255, g: 255, b: 255 }, color: "#f8fafc" },
];

function same(a: RgbValue, b: RgbValue) {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function RgbPad({ value, disabled, onChange }: Props) {
  const off = value.r === 0 && value.g === 0 && value.b === 0;
  const glow = off ? "#94a3b8" : `rgb(${value.r}, ${value.g}, ${value.b})`;

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockLabel}>RGB LED</span>
        <em className={off ? styles.stateOff : styles.stateOn}>{off ? "꺼짐" : "점등"}</em>
      </div>

      <div className={styles.rgbStage}>
        <div
          className={`${styles.rgbOrb} ${off ? "" : styles.rgbOrbOn}`}
          style={{ color: glow }}
          aria-hidden
        >
          {off ? <LightbulbOff size={28} /> : <Lightbulb size={28} />}
        </div>

        <div className={styles.rgbGrid} role="group" aria-label="RGB 색상">
          {swatches.map((s) => {
            const active = same(value, s.rgb);
            return (
              <button
                key={s.key}
                type="button"
                className={`${styles.swatch} ${active ? styles.swatchActive : ""}`}
                style={{ "--swatch": s.color } as CSSProperties}
                disabled={disabled}
                aria-label={s.label}
                aria-pressed={active}
                onClick={() => onChange(s.rgb)}
              >
                <i />
                <span>{s.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`${styles.swatch} ${styles.swatchOff} ${off ? styles.swatchActive : ""}`}
            disabled={disabled}
            aria-label="끄기"
            aria-pressed={off}
            onClick={() => onChange({ r: 0, g: 0, b: 0 })}
          >
            <Power size={18} strokeWidth={1.75} />
            <span>끄기</span>
          </button>
        </div>
      </div>
    </div>
  );
}
