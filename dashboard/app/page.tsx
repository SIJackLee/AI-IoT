"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchTelemetry, putCommand, type Command, type Telemetry } from "@/lib/firebase";
import styles from "./page.module.css";

type Point = {
  t: number;
  temp: number | null;
  hum: number | null;
  soil: number | null;
  cds: number | null;
};

function fmt(n: number | undefined, digits = 0) {
  if (n === undefined || Number.isNaN(n) || n < -900) return "—";
  return n.toFixed(digits);
}

function valid(n: number | undefined) {
  return n !== undefined && !Number.isNaN(n) && n > -900 ? n : null;
}

function clampPct(n: number, min: number, max: number) {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100));
}

function RingGauge({
  value,
  unit,
  label,
  color,
  max = 100,
}: {
  value: number | null;
  unit: string;
  label: string;
  color: string;
  max?: number;
}) {
  const pct = value === null ? 0 : clampPct(value, 0, max);
  const r = 46;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className={styles.ringCard}>
      <svg className={styles.ringSvg} viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} className={styles.ringTrack} />
        <circle
          cx="60"
          cy="60"
          r={r}
          className={styles.ringValue}
          style={{
            stroke: color,
            strokeDasharray: `${dash} ${c}`,
          }}
        />
      </svg>
      <div className={styles.ringCenter}>
        <strong>
          {value === null ? "—" : value.toFixed(value < 40 ? 1 : 0)}
          <span>{unit}</span>
        </strong>
        <em>{label}</em>
      </div>
    </div>
  );
}

function BarMeter({
  label,
  value,
  max = 4095,
  color,
}: {
  label: string;
  value: number | null;
  max?: number;
  color: string;
}) {
  const pct = value === null ? 0 : clampPct(value, 0, max);
  return (
    <div className={styles.barMeter}>
      <div className={styles.barHead}>
        <span>{label}</span>
        <b>{value === null ? "—" : Math.round(value)}</b>
      </div>
      <div className={styles.barTrack}>
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [lcd, setLcd] = useState("캠틱 AI-IoT");
  const [lcdPreview, setLcdPreview] = useState("대기 중...");

  const refresh = useCallback(async () => {
    try {
      const t = await fetchTelemetry();
      setData(t);
      setOnline(Boolean(t));
      setError(null);
      if (t) {
        setHistory((prev) => {
          const next = [
            ...prev,
            {
              t: Date.now(),
              temp: valid(t.t),
              hum: valid(t.h),
              soil: t.soil ?? null,
              cds: t.cds ?? null,
            },
          ];
          return next.slice(-36);
        });
      }
    } catch (e) {
      setOnline(false);
      setError(e instanceof Error ? e.message : "조회 실패");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const baseCommand = useMemo<Command>(
    () => ({
      fan: data?.fan ?? 0,
      buzzer: 0,
      rgb: {
        r: data?.rgb?.r ?? 0,
        g: data?.rgb?.g ?? 0,
        b: data?.rgb?.b ?? 0,
      },
    }),
    [data],
  );

  async function send(partial: Command) {
    setBusy(true);
    try {
      if (typeof partial.lcd === "string") {
        setLcdPreview(partial.lcd.trim() || "(지움)");
      }
      await putCommand({ ...baseCommand, ...partial });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "명령 실패");
    } finally {
      setBusy(false);
    }
  }

  async function beepOnce() {
    setBusy(true);
    try {
      await putCommand({ ...baseCommand, buzzer: 1 });
      await new Promise((r) => setTimeout(r, 350));
      await putCommand({ ...baseCommand, buzzer: 0 });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "부저 실패");
    } finally {
      setBusy(false);
    }
  }

  const fanOn = Boolean(data?.fan);
  const rgb = data?.rgb ?? { r: 0, g: 0, b: 0 };
  const keyPressed = data?.key === 0;
  const isWhite = (rgb.r ?? 0) > 0 && (rgb.g ?? 0) > 0 && (rgb.b ?? 0) > 0;
  const isOff = (rgb.r ?? 0) === 0 && (rgb.g ?? 0) === 0 && (rgb.b ?? 0) === 0;
  const rgbGlow = `rgb(${rgb.r ?? 0}, ${rgb.g ?? 0}, ${rgb.b ?? 0})`;

  const lcdLines = useMemo(() => {
    const raw = lcdPreview || "";
    return [raw.slice(0, 16).padEnd(16, " "), raw.slice(16, 32).padEnd(16, " ")];
  }, [lcdPreview]);

  const temp = valid(data?.t);
  const hum = valid(data?.h);

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.brandBlock}>
          <p className={styles.eyebrow}>Camtic · Smart Agriculture</p>
          <h1 className={styles.brand}>AI-IoT 스마트팜</h1>
          <p className={styles.tagline}>실시간 센서 · 환기 · RGB · LCD 원격 콘솔</p>
        </div>
        <div className={styles.heroAside}>
          <span className={styles.livePill}>
            <i className={`${styles.liveDot} ${online ? "" : styles.bad}`} />
            {online ? "실시간 연결" : "오프라인"}
          </span>
          <p className={styles.meta}>
            {data?.ip ? `ESP ${data.ip}` : "ESP —"} · RSSI {fmt(data?.rssi)} dBm · 키{" "}
            {keyPressed ? "눌림" : "대기"}
          </p>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </header>

      <div className={styles.layout}>
        <section className={`${styles.panel} ${styles.panelMain}`}>
          <div className={styles.panelHead}>
            <div>
              <h2>모니터링</h2>
              <p className={styles.panelHint}>온·습도 추이와 현장 장치 상태</p>
            </div>
          </div>

          <div className={styles.gaugeRow}>
            <RingGauge value={temp} unit="°C" label="온도" color="#0d9488" max={50} />
            <RingGauge value={hum} unit="%" label="습도" color="#2563eb" max={100} />
            <div className={styles.sideMeters}>
              <BarMeter label="토양 수분 (raw)" value={data?.soil ?? null} color="#16a34a" />
              <BarMeter label="조도 CDS (raw)" value={data?.cds ?? null} color="#d97706" />
            </div>
          </div>

          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gHum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
                <XAxis dataKey="t" hide />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 14,
                    border: "1px solid rgba(15,23,42,0.08)",
                    boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
                    fontFamily: "Pretendard Variable, Pretendard, sans-serif",
                  }}
                  labelFormatter={() => "샘플"}
                />
                <Area
                  type="monotone"
                  dataKey="temp"
                  name="온도 °C"
                  stroke="#0d9488"
                  fill="url(#gTemp)"
                  strokeWidth={2.4}
                  isAnimationActive
                />
                <Area
                  type="monotone"
                  dataKey="hum"
                  name="습도 %"
                  stroke="#2563eb"
                  fill="url(#gHum)"
                  strokeWidth={2}
                  isAnimationActive
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.stage}>
            <div className={styles.lcdScreen} aria-label="LCD 미리보기">
              <span className={styles.lcdBadge}>LCD 16×2</span>
              <p>{lcdLines[0]}</p>
              <p>{lcdLines[1]}</p>
            </div>

            <div className={styles.deviceViz}>
              <div
                className={`${styles.rgbOrb} ${isOff ? "" : styles.rgbOrbOn}`}
                style={{ color: isOff ? "#94a3b8" : rgbGlow }}
                aria-label="RGB 상태"
              >
                <span />
              </div>
              <div className={styles.ledRow}>
                <span
                  className={`${styles.led} ${(rgb.r ?? 0) > 0 ? styles.ledOn : ""}`}
                  style={{ color: "#e11d48", background: (rgb.r ?? 0) > 0 ? "#e11d48" : undefined }}
                />
                <span
                  className={`${styles.led} ${(rgb.g ?? 0) > 0 ? styles.ledOn : ""}`}
                  style={{ color: "#059669", background: (rgb.g ?? 0) > 0 ? "#059669" : undefined }}
                />
                <span
                  className={`${styles.led} ${(rgb.b ?? 0) > 0 ? styles.ledOn : ""}`}
                  style={{ color: "#2563eb", background: (rgb.b ?? 0) > 0 ? "#2563eb" : undefined }}
                />
              </div>
              <div className={`${styles.fanBadge} ${fanOn ? styles.fanBadgeOn : ""}`}>
                <svg className={`${styles.fanIcon} ${fanOn ? styles.on : ""}`} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                  <path
                    d="M12 4c2.8 2.2 3.4 4.6 2.2 6.4C12.8 9.2 11 9.6 9.6 11 8.4 8.6 9.2 6.2 12 4Zm8 8c-2.2 2.8-4.6 3.4-6.4 2.2 1.2-1.4.8-3.2-.6-4.6 2.4-1.2 4.8-.4 7 2.4ZM12 20c-2.8-2.2-3.4-4.6-2.2-6.4 1.4 1.2 3.2.8 4.6-.6 1.2 2.4.4 4.8-2.4 7Zm-8-8c2.2-2.8 4.6-3.4 6.4-2.2-1.2 1.4-.8 3.2.6 4.6C9 16.6 6.6 15.8 4 12Z"
                    fill="currentColor"
                  />
                </svg>
                환기팬 {fanOn ? "가동" : "정지"}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>제어</h2>
              <p className={styles.panelHint}>현장 액추에이터 원격 조작</p>
            </div>
          </div>

          <div className={styles.btnGrid}>
            <button
              className={`${styles.btn} ${fanOn ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ fan: 1 })}
            >
              <span className={styles.btnLabel}>환기</span>
              <span className={styles.btnTitle}>팬 켜기</span>
            </button>
            <button className={styles.btn} disabled={busy} onClick={() => send({ fan: 0 })}>
              <span className={styles.btnLabel}>환기</span>
              <span className={styles.btnTitle}>팬 끄기</span>
            </button>

            <button
              className={`${styles.btn} ${styles.rgbRed} ${(rgb.r ?? 0) > 0 && (rgb.g ?? 0) === 0 && (rgb.b ?? 0) === 0 ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ rgb: { r: 255, g: 0, b: 0 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>빨강</span>
            </button>
            <button
              className={`${styles.btn} ${styles.rgbGreen} ${(rgb.g ?? 0) > 0 && (rgb.r ?? 0) === 0 && (rgb.b ?? 0) === 0 ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ rgb: { r: 0, g: 255, b: 0 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>초록</span>
            </button>
            <button
              className={`${styles.btn} ${styles.rgbBlue} ${(rgb.b ?? 0) > 0 && (rgb.r ?? 0) === 0 && (rgb.g ?? 0) === 0 ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ rgb: { r: 0, g: 0, b: 255 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>파랑</span>
            </button>
            <button
              className={`${styles.btn} ${styles.rgbWhite} ${isWhite ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ rgb: { r: 255, g: 255, b: 255 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>흰색</span>
            </button>
            <button
              className={`${styles.btn} ${isOff ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ rgb: { r: 0, g: 0, b: 0 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>끄기</span>
            </button>

            <button className={styles.btn} disabled={busy} onClick={beepOnce}>
              <span className={styles.btnLabel}>알림</span>
              <span className={styles.btnTitle}>부저 삐</span>
            </button>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              disabled={busy}
              onClick={() =>
                send({
                  fan: 0,
                  buzzer: 0,
                  rgb: { r: 0, g: 0, b: 0 },
                  lcd: "",
                })
              }
            >
              <span className={styles.btnLabel}>안전</span>
              <span className={styles.btnTitle}>전체 끄기</span>
            </button>
          </div>

          <div className={`${styles.lcdRow} ${styles.sectionGap}`}>
            <input
              className={styles.lcdInput}
              value={lcd}
              maxLength={32}
              onChange={(e) => setLcd(e.target.value)}
              placeholder="LCD에 표시할 한글/영문"
            />
            <button
              className={styles.btn}
              style={{ minWidth: 108 }}
              disabled={busy || !lcd.trim()}
              onClick={() => send({ lcd: lcd.trim() })}
            >
              <span className={styles.btnLabel}>LCD</span>
              <span className={styles.btnTitle}>전송</span>
            </button>
            <button
              className={styles.btn}
              style={{ minWidth: 108 }}
              disabled={busy}
              onClick={() => {
                setLcd("");
                send({ lcd: "" });
              }}
            >
              <span className={styles.btnLabel}>LCD</span>
              <span className={styles.btnTitle}>지우기</span>
            </button>
          </div>
          <p className={styles.warn}>전송 문구는 유지됩니다. 지우기 시 센서 화면으로 복귀합니다.</p>
        </section>
      </div>
    </main>
  );
}
