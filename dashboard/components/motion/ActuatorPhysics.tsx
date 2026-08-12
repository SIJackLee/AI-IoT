"use client";

import type { ControlMode } from "@/components/AutoPad";
import type { RgbKind } from "./HabitatScene";
import styles from "./motion.module.css";

type Props = {
  mode: ControlMode;
  fan: boolean;
  rgb: RgbKind;
  t: number | null;
};

export function ActuatorPhysics({ mode, fan, rgb, t }: Props) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const progress =
    mode === "ALERT" ? 0.92 : mode === "AUTO" ? 0.62 : mode === "DEMO" ? 0.45 : 0.18;
  const ringClass =
    mode === "ALERT" ? styles.ringAlert : mode === "AUTO" ? styles.ringAuto : styles.ringIdle;
  const fanDur = fan ? (t !== null && t >= 30 ? "0.35s" : "0.7s") : undefined;

  return (
    <div className={styles.actuator} aria-label="액추에이터 물리 모션">
      <div className={styles.actuatorHead}>
        <span>장치 모션</span>
        <em>{mode}</em>
      </div>
      <svg className={styles.actuatorSvg} viewBox="0 0 320 150" role="img">
        <g transform="translate(78 74)">
          <circle r={r} className={styles.ringTrack} fill="none" strokeWidth="7" />
          <circle
            r={r}
            className={`${styles.ringValue} ${ringClass}`}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${progress * c} ${c}`}
            transform="rotate(-90)"
          />
          <text textAnchor="middle" y="5" className={styles.modeLabel}>
            {mode}
          </text>
          <text textAnchor="middle" y="22" className={styles.modeSub}>
            mode ring
          </text>
        </g>

        <g transform="translate(210 58)">
          <circle r="34" className={styles.fanDisk} />
          <g
            className={fan ? styles.fanSpin : undefined}
            style={fanDur ? { animationDuration: fanDur } : undefined}
          >
            {[0, 90, 180, 270].map((deg) => (
              <ellipse
                key={deg}
                cx="0"
                cy="-16"
                rx="6.5"
                ry="15"
                className={fan ? styles.fanBladeOn : styles.fanBladeOff}
                transform={`rotate(${deg})`}
              />
            ))}
            <circle r="5.5" className={styles.fanCore} />
          </g>
          <text y="50" textAnchor="middle" className={styles.caption}>
            FAN {fan ? "SPIN" : "STOP"}
          </text>
        </g>

        <g transform="translate(210 128)">
          <circle
            r="9"
            className={`${styles.rgbOrb} ${styles[`rgb_${rgb}`]} ${rgb !== "off" ? styles.rgbPulse : ""}`}
          />
          {rgb !== "off" ? (
            <circle r="16" className={`${styles.rgbBloom} ${styles[`rgbStroke_${rgb}`]}`} />
          ) : null}
          <text x="26" y="4" className={styles.caption}>
            RGB {rgb.toUpperCase()}
          </text>
        </g>
      </svg>
    </div>
  );
}
