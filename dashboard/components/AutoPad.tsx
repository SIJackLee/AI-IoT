"use client";

import type { CSSProperties } from "react";
import { Bot, Fan, Flame, Lightbulb, ShieldAlert, Sprout } from "lucide-react";
import styles from "./devices.module.css";

export type ControlMode = "MANUAL" | "AUTO" | "ALERT" | "DEMO";

export const AUTO_THRESH = {
  tOn: 28,
  tOff: 26,
  hOn: 70,
  hOff: 60,
  tHot: 30,
  soilDry: 27,
  soilOk: 40,
  soilCrit: 20,
  cdsDark: 500,
  cdsOk: 900,
} as const;

export type AutoEval = {
  r1: boolean;
  r2: boolean;
  r3: boolean;
  r4: boolean;
  r5: boolean;
  fan: boolean;
  rgb: "off" | "amber" | "red" | "white";
  alert: boolean;
};

export function evalAutoRules(input: {
  t: number | null;
  h: number | null;
  soil: number | null;
  cds: number | null;
}): AutoEval {
  const { t, h, soil, cds } = input;
  const r1 = t !== null && t >= AUTO_THRESH.tOn;
  const r2 = h !== null && h >= AUTO_THRESH.hOn;
  const r3 = soil !== null && soil <= AUTO_THRESH.soilDry;
  const r4 = cds !== null && cds <= AUTO_THRESH.cdsDark;
  const r5 =
    t !== null &&
    soil !== null &&
    t >= AUTO_THRESH.tHot &&
    soil <= AUTO_THRESH.soilCrit;

  let rgb: AutoEval["rgb"] = "off";
  if (r5) rgb = "red";
  else if (r3) rgb = "amber";
  else if (r4) rgb = "white";

  return {
    r1,
    r2,
    r3,
    r4,
    r5,
    fan: r1 || r2 || r5,
    rgb,
    alert: r3 || r5,
  };
}

type Props = {
  on: boolean;
  mode: ControlMode;
  eval: AutoEval;
  sensors: {
    t: number | null;
    h: number | null;
    soil: number | null;
    cds: number | null;
  };
  disabled?: boolean;
  onToggle: (next: boolean) => void;
};

function Meter({
  label,
  value,
  max,
  markers,
  color,
}: {
  label: string;
  value: number | null;
  max: number;
  markers: { at: number; tone: "warn" | "ok" | "hot" }[];
  color: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={styles.autoMeter}>
      <div className={styles.autoMeterHead}>
        <span>{label}</span>
        <b>{value === null ? "—" : Math.round(value * 10) / 10}</b>
      </div>
      <div className={styles.autoMeterTrack}>
        <i style={{ width: `${pct}%`, background: color }} />
        {markers.map((m) => (
          <em
            key={`${m.at}-${m.tone}`}
            className={styles[`autoMark_${m.tone}`]}
            style={{ left: `${Math.max(0, Math.min(100, (m.at / max) * 100))}%` }}
          />
        ))}
      </div>
    </div>
  );
}

const RULES: {
  id: keyof Pick<AutoEval, "r1" | "r2" | "r3" | "r4" | "r5">;
  title: string;
  hint: string;
  Icon: typeof Fan;
}[] = [
  { id: "r1", title: "R1 고온", hint: `T≥${AUTO_THRESH.tOn}°C → FAN`, Icon: Flame },
  { id: "r2", title: "R2 고습", hint: `H≥${AUTO_THRESH.hOn}% → FAN`, Icon: Fan },
  { id: "r3", title: "R3 건조", hint: `soil≤${AUTO_THRESH.soilDry} → 주황`, Icon: Sprout },
  { id: "r4", title: "R4 저조도", hint: `cds≤${AUTO_THRESH.cdsDark} → 보조광`, Icon: Lightbulb },
  { id: "r5", title: "R5 위험", hint: `T≥${AUTO_THRESH.tHot} + soil≤${AUTO_THRESH.soilCrit}`, Icon: ShieldAlert },
];

export function AutoPad({ on, mode, eval: ev, sensors, disabled, onToggle }: Props) {
  const alert = on && (mode === "ALERT" || ev.alert);

  return (
    <div className={`${styles.autoRoot} ${on ? styles.autoRootOn : ""} ${alert ? styles.autoRootAlert : ""}`}>
      <div className={styles.blockHead}>
        <span className={styles.blockLabel}>자동제어</span>
        <em className={on ? styles.stateOn : styles.stateOff}>{mode}</em>
      </div>

      <button
        type="button"
        className={`${styles.autoToggle} ${on ? styles.autoToggleOn : ""}`}
        disabled={disabled}
        aria-pressed={on}
        onClick={() => onToggle(!on)}
      >
        <span className={styles.autoOrb} aria-hidden>
          <Bot size={28} strokeWidth={1.7} />
        </span>
        <div className={styles.autoCopy}>
          <strong>{on ? "AUTO ON" : "AUTO OFF"}</strong>
          <span>
            {on
              ? alert
                ? "경보 규칙 활성 · RGB 표시"
                : "센서 규칙으로 FAN·RGB 제어"
              : "탭하여 자동모드 시작"}
          </span>
          <small>부저 제외 · DEMO와 상호 배타</small>
        </div>
        <span className={`${styles.autoSwitch} ${on ? styles.autoSwitchOn : ""}`} aria-hidden>
          <i />
        </span>
      </button>

      <div className={styles.autoViz}>
        <div className={styles.autoOutcome}>
          <div className={`${styles.autoChip} ${ev.fan && on ? styles.autoChipHot : ""}`}>
            <Fan size={14} />
            FAN {ev.fan && on ? "ON" : "—"}
          </div>
          <div
            className={`${styles.autoChip} ${on && ev.rgb !== "off" ? styles.autoChipLit : ""}`}
            style={
              on && ev.rgb === "red"
                ? ({ "--chip": "#ef4444" } as CSSProperties)
                : on && ev.rgb === "amber"
                  ? ({ "--chip": "#f59e0b" } as CSSProperties)
                  : on && ev.rgb === "white"
                    ? ({ "--chip": "#94a3b8" } as CSSProperties)
                    : undefined
            }
          >
            <Lightbulb size={14} />
            RGB {on ? ev.rgb.toUpperCase() : "—"}
          </div>
        </div>

        <div className={styles.autoMeters}>
          <Meter
            label="온도 °C"
            value={sensors.t}
            max={50}
            color="#1f7a4d"
            markers={[
              { at: AUTO_THRESH.tOff, tone: "ok" },
              { at: AUTO_THRESH.tOn, tone: "warn" },
              { at: AUTO_THRESH.tHot, tone: "hot" },
            ]}
          />
          <Meter
            label="습도 %"
            value={sensors.h}
            max={100}
            color="#3b82c4"
            markers={[
              { at: AUTO_THRESH.hOff, tone: "ok" },
              { at: AUTO_THRESH.hOn, tone: "warn" },
            ]}
          />
          <Meter
            label="토양 %"
            value={sensors.soil}
            max={100}
            color="#8b6b4a"
            markers={[
              { at: AUTO_THRESH.soilCrit, tone: "hot" },
              { at: AUTO_THRESH.soilDry, tone: "warn" },
              { at: AUTO_THRESH.soilOk, tone: "ok" },
            ]}
          />
          <Meter
            label="조도"
            value={sensors.cds}
            max={4095}
            color="#e0a100"
            markers={[
              { at: AUTO_THRESH.cdsDark, tone: "warn" },
              { at: AUTO_THRESH.cdsOk, tone: "ok" },
            ]}
          />
        </div>

        <div className={styles.autoRules} role="list">
          {RULES.map((r) => {
            const active = on && ev[r.id];
            const Icon = r.Icon;
            return (
              <div
                key={r.id}
                role="listitem"
                className={`${styles.autoRule} ${active ? styles.autoRuleOn : ""} ${
                  r.id === "r5" && active ? styles.autoRuleDanger : ""
                }`}
              >
                <Icon size={15} strokeWidth={2} />
                <div>
                  <strong>{r.title}</strong>
                  <span>{r.hint}</span>
                </div>
                <em>{active ? "ON" : "off"}</em>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
