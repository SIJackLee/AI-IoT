"use client";

import styles from "./motion.module.css";

export type RgbKind = "off" | "amber" | "red" | "white";

export function classifyRgb(r: number, g: number, b: number): RgbKind {
  if (r <= 0 && g <= 0 && b <= 0) return "off";
  if (r >= 200 && g <= 40 && b <= 40) return "red";
  if (r >= 200 && g >= 80 && g <= 180 && b <= 40) return "amber";
  if (r >= 60 && g >= 60 && b >= 60 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
    return "white";
  }
  if (r > g && r > b) return r > 180 ? "red" : "amber";
  return "white";
}

type HabitatProps = {
  t: number | null;
  soil: number | null;
  fan: boolean;
  rgb: RgbKind;
};

export function HabitatScene({ t, soil, fan, rgb }: HabitatProps) {
  const soilPct = soil === null ? 40 : Math.max(0, Math.min(100, soil));
  const waterY = 118 - (soilPct / 100) * 70;
  const wilt = soil !== null && soil < 27;
  const hot = t !== null && t >= 28;
  const leafBend = wilt ? 18 : hot ? 6 : 0;

  return (
    <div className={styles.habitat} aria-label="생육 서식지 모션">
      <svg className={styles.habitatSvg} viewBox="0 0 360 180" role="img">
        <defs>
          <clipPath id="potClip">
            <path d="M108 95 L252 95 L238 162 L122 162 Z" />
          </clipPath>
        </defs>

        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            className={hot ? styles.shimmerHot : styles.shimmerIdle}
            d={`M${36 + i * 26} 26 q 8 10 0 20 q -8 10 0 20`}
            fill="none"
            strokeWidth={hot ? 1.7 : 1}
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}

        <path d="M108 95 L252 95 L238 162 L122 162 Z" className={styles.pot} />
        <g clipPath="url(#potClip)">
          <rect
            x="108"
            y={waterY}
            width="144"
            height={162 - waterY}
            className={styles.water}
          />
          <ellipse
            cx="180"
            cy={waterY + 2}
            rx="58"
            ry="5"
            className={styles.waterRipple}
          />
        </g>

        <g transform={`translate(180 ${waterY})`}>
          <line x1="0" y1="0" x2="0" y2="-56" className={styles.stem} />
          <ellipse
            cx={-24}
            cy={-38}
            rx="20"
            ry="9"
            className={wilt ? styles.leafWilt : styles.leafOk}
            transform={`rotate(${-35 - leafBend} -24 -38)`}
          >
            {wilt ? (
              <animateTransform
                attributeName="transform"
                type="rotate"
                values={`${-35 - leafBend} -24 -38;${-42 - leafBend} -24 -38;${-35 - leafBend} -24 -38`}
                dur="1.8s"
                repeatCount="indefinite"
              />
            ) : null}
          </ellipse>
          <ellipse
            cx={24}
            cy={-32}
            rx="20"
            ry="9"
            className={wilt ? styles.leafWilt : styles.leafOk}
            transform={`rotate(${35 + leafBend} 24 -32)`}
          >
            {wilt ? (
              <animateTransform
                attributeName="transform"
                type="rotate"
                values={`${35 + leafBend} 24 -32;${42 + leafBend} 24 -32;${35 + leafBend} 24 -32`}
                dur="1.8s"
                repeatCount="indefinite"
              />
            ) : null}
          </ellipse>
        </g>

        <circle
          cx="300"
          cy="40"
          r="15"
          className={`${styles.rgbOrb} ${styles[`rgb_${rgb}`]} ${rgb !== "off" ? styles.rgbPulse : ""}`}
        />

        <g transform="translate(300 118)">
          <circle r="20" className={styles.fanHub} />
          <g className={fan ? styles.fanSpin : undefined}>
            <path d="M0 -14 L5 0 L0 14 L-5 0 Z" className={styles.fanBlade} />
            <path d="M-14 0 L0 5 L14 0 L0 -5 Z" className={styles.fanBladeAlt} />
          </g>
        </g>

        <text x="18" y="172" className={styles.caption}>
          {`soil ${soil === null ? "—" : `${Math.round(soil)}%`} · T ${
            t === null ? "—" : `${t.toFixed(1)}°C`
          } · fan ${fan ? "ON" : "off"}`}
        </text>
      </svg>
    </div>
  );
}
