"use client";

import { Fan, Lightbulb, Monitor, Orbit, Power } from "lucide-react";
import styles from "./devices.module.css";

export type DemoMode = "off" | "led" | "fan" | "lcd" | "all";

const ORDER: DemoMode[] = ["off", "led", "fan", "lcd", "all"];

const META: Record<
  DemoMode,
  { label: string; hint: string; Icon: typeof Orbit }
> = {
  off: { label: "OFF", hint: "수동 제어", Icon: Power },
  led: { label: "LED", hint: "색 순환 1.5초", Icon: Lightbulb },
  fan: { label: "FAN", hint: "5초 ON/OFF", Icon: Fan },
  lcd: { label: "LCD", hint: "문구 순환 2초", Icon: Monitor },
  all: { label: "ALL", hint: "전체 루프", Icon: Orbit },
};

type Props = {
  mode: DemoMode;
  disabled?: boolean;
  onChange: (next: DemoMode) => void;
};

export function nextDemoMode(current: DemoMode): DemoMode {
  const i = ORDER.indexOf(current);
  return ORDER[(i < 0 ? 0 : i + 1) % ORDER.length];
}

export function DemoPad({ mode, disabled, onChange }: Props) {
  const meta = META[mode] ?? META.off;
  const Icon = meta.Icon;
  const active = mode !== "off";

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockLabel}>데모 루프</span>
        <em className={active ? styles.stateOn : styles.stateOff}>{meta.label}</em>
      </div>

      <button
        type="button"
        className={`${styles.demoBtn} ${active ? styles.demoBtnOn : ""}`}
        disabled={disabled}
        aria-label={`데모 모드 ${meta.label}. 다음 모드로 전환`}
        onClick={() => onChange(nextDemoMode(mode))}
      >
        <Icon className={`${styles.demoIcon} ${active ? styles.demoSpin : ""}`} strokeWidth={1.7} />
        <div className={styles.demoCopy}>
          <strong>{meta.label}</strong>
          <span>{meta.hint}</span>
          <small>탭 → 다음 모드</small>
        </div>
      </button>

      <div className={styles.demoSteps} role="list">
        {ORDER.map((m) => {
          const M = META[m];
          return (
            <button
              key={m}
              type="button"
              role="listitem"
              className={`${styles.demoChip} ${mode === m ? styles.demoChipOn : ""}`}
              disabled={disabled}
              aria-pressed={mode === m}
              onClick={() => onChange(m)}
            >
              {M.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
