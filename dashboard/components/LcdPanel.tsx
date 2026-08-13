"use client";

import { useMemo } from "react";
import { Eraser, SendHorizontal } from "lucide-react";
import styles from "./devices.module.css";

type Props = {
  value: string;
  preview: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onSend: () => void;
  onClear: () => void;
  /** false면 미리보기 화면 숨김 (헤더 등으로 분리 시) */
  showPreview?: boolean;
};

export function lcdLines(preview: string) {
  const raw = preview || "";
  return [raw.slice(0, 16).padEnd(16, " "), raw.slice(16, 32).padEnd(16, " ")];
}

export function LcdPreview({
  preview,
  className,
  compact,
}: {
  preview: string;
  className?: string;
  compact?: boolean;
}) {
  const lines = useMemo(() => lcdLines(preview), [preview]);
  return (
    <div
      className={`${styles.lcdScreen} ${compact ? styles.lcdScreenCompact : ""} ${className ?? ""}`}
      aria-label="LCD 미리보기"
    >
      <p>
        {lines[0]}
        <i className={styles.cursor} />
      </p>
      <p>{lines[1]}</p>
    </div>
  );
}

export function LcdPanel({
  value,
  preview,
  disabled,
  onChange,
  onSend,
  onClear,
  showPreview = true,
}: Props) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockLabel}>LCD 16×2</span>
        <em className={styles.stateOff}>{showPreview ? "미리보기" : "전송"}</em>
      </div>

      {showPreview ? <LcdPreview preview={preview} /> : null}

      <div className={styles.lcdControls}>
        <input
          className={styles.lcdInput}
          value={value}
          maxLength={32}
          onChange={(e) => onChange(e.target.value)}
          placeholder="표시할 문구"
          aria-label="LCD 텍스트"
        />
        <button
          type="button"
          className={styles.iconBtn}
          disabled={disabled || !value.trim()}
          aria-label="LCD 전송"
          onClick={onSend}
        >
          <SendHorizontal size={18} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          disabled={disabled}
          aria-label="LCD 지우기"
          onClick={onClear}
        >
          <Eraser size={18} strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}
