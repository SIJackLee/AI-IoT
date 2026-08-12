"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";
import styles from "./devices.module.css";

type Props = {
  disabled?: boolean;
  onBeep: () => Promise<void> | void;
};

export function BuzzerPad({ disabled, onBeep }: Props) {
  const [ping, setPing] = useState(false);

  async function handleClick() {
    setPing(true);
    try {
      await onBeep();
    } finally {
      window.setTimeout(() => setPing(false), 420);
    }
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockLabel}>부저</span>
        <em className={ping ? styles.stateOn : styles.stateOff}>{ping ? "울림" : "대기"}</em>
      </div>
      <button
        type="button"
        className={`${styles.buzzerBtn} ${ping ? styles.buzzerPing : ""}`}
        disabled={disabled}
        aria-label="부저 한 번 울리기"
        onClick={handleClick}
      >
        <span className={styles.ripple} />
        <span className={styles.ripple} />
        <Volume2 className={styles.buzzerIcon} strokeWidth={1.75} />
      </button>
    </div>
  );
}
