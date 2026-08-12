"use client";

import { Fan } from "lucide-react";
import styles from "./devices.module.css";

type Props = {
  on: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
};

export function FanControl({ on, disabled, onToggle }: Props) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockLabel}>환기팬</span>
        <em className={on ? styles.stateOn : styles.stateOff}>{on ? "가동" : "정지"}</em>
      </div>
      <button
        type="button"
        className={`${styles.fanBtn} ${on ? styles.fanBtnOn : ""}`}
        disabled={disabled}
        aria-pressed={on}
        aria-label={on ? "환기팬 끄기" : "환기팬 켜기"}
        onClick={() => onToggle(!on)}
      >
        <span className={styles.fanHalo} />
        <Fan className={`${styles.fanIcon} ${on ? styles.spin : ""}`} strokeWidth={1.75} />
      </button>
    </div>
  );
}
