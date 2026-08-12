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

export default function HomePage() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [lcd, setLcd] = useState("Camtic AI-IoT");
  const [lcdPreview, setLcdPreview] = useState("Waiting...");

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
          return next.slice(-30);
        });
      }
    } catch (e) {
      setOnline(false);
      setError(e instanceof Error ? e.message : "fetch failed");
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
        setLcdPreview(partial.lcd.trim() || "(clear)");
      }
      await putCommand({ ...baseCommand, ...partial });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "command failed");
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
      setError(e instanceof Error ? e.message : "buzzer failed");
    } finally {
      setBusy(false);
    }
  }

  const fanOn = Boolean(data?.fan);
  const rgb = data?.rgb ?? { r: 0, g: 0, b: 0 };
  const keyPressed = data?.key === 0;

  const lcdLines = useMemo(() => {
    const raw = lcdPreview || "";
    return [raw.slice(0, 16).padEnd(16, " "), raw.slice(16, 32).padEnd(16, " ")];
  }, [lcdPreview]);

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.brand}>AI-IoT</h1>
          <p className={styles.tagline}>White console · live graphs · edge actuators</p>
        </div>
        <span className={styles.livePill}>
          <i className={`${styles.liveDot} ${online ? "" : styles.bad}`} />
          {online ? "LIVE" : "OFFLINE"}
        </span>
        <p className={styles.meta}>
          {data?.ip ? `ESP ${data.ip}` : "ESP —"} · RSSI {fmt(data?.rssi)} dBm · key{" "}
          {keyPressed ? "PRESSED" : "IDLE"}
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
      </header>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <h2>Telemetry</h2>
          <p className={styles.panelHint}>온습도 · 토양 · 조도 실시간 추이</p>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gHum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
                <XAxis dataKey="t" hide />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,0.08)",
                    boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
                  }}
                  labelFormatter={() => "sample"}
                />
                <Area
                  type="monotone"
                  dataKey="temp"
                  name="Temp °C"
                  stroke="#0f766e"
                  fill="url(#gTemp)"
                  strokeWidth={2.2}
                  isAnimationActive
                />
                <Area
                  type="monotone"
                  dataKey="hum"
                  name="Humidity %"
                  stroke="#2563eb"
                  fill="url(#gHum)"
                  strokeWidth={2}
                  isAnimationActive
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.gaugeGrid}>
            <div className={styles.gaugeCard}>
              <span className={styles.gaugeLabel}>Temperature</span>
              <div className={styles.gaugeValue}>{fmt(data?.t, 1)}°C</div>
            </div>
            <div className={styles.gaugeCard}>
              <span className={styles.gaugeLabel}>Humidity</span>
              <div className={styles.gaugeValue}>{fmt(data?.h, 0)}%</div>
            </div>
            <div className={styles.gaugeCard}>
              <span className={styles.gaugeLabel}>Soil raw</span>
              <div className={styles.gaugeValue}>{fmt(data?.soil)}</div>
            </div>
            <div className={styles.gaugeCard}>
              <span className={styles.gaugeLabel}>CDS raw</span>
              <div className={styles.gaugeValue}>{fmt(data?.cds)}</div>
            </div>
          </div>

          <div className={styles.stage}>
            <div className={styles.lcdScreen} aria-label="LCD preview">
              <p>{lcdLines[0]}</p>
              <p>{lcdLines[1]}</p>
            </div>
            <div className={styles.deviceViz}>
              <div className={styles.ledRow}>
                <span
                  className={`${styles.led} ${(rgb.r ?? 0) > 0 ? styles.ledOn : ""}`}
                  style={{
                    color: "#e11d48",
                    background: (rgb.r ?? 0) > 0 ? "#e11d48" : undefined,
                  }}
                />
                <span
                  className={`${styles.led} ${(rgb.g ?? 0) > 0 ? styles.ledOn : ""}`}
                  style={{
                    color: "#059669",
                    background: (rgb.g ?? 0) > 0 ? "#059669" : undefined,
                  }}
                />
                <span
                  className={`${styles.led} ${(rgb.b ?? 0) > 0 ? styles.ledOn : ""}`}
                  style={{
                    color: "#2563eb",
                    background: (rgb.b ?? 0) > 0 ? "#2563eb" : undefined,
                  }}
                />
              </div>
              <span className={styles.fanBadge}>
                <i className={`${styles.fanSpin} ${fanOn ? styles.on : ""}`} />
                FAN {fanOn ? "ON" : "OFF"}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>Controls</h2>
          <p className={styles.panelHint}>MCU 전체 인터페이스 상호작용</p>

          <div className={styles.btnGrid}>
            <button
              className={`${styles.btn} ${fanOn ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ fan: 1 })}
            >
              <span className={styles.btnLabel}>Vent</span>
              <span className={styles.btnTitle}>FAN ON</span>
            </button>
            <button className={styles.btn} disabled={busy} onClick={() => send({ fan: 0 })}>
              <span className={styles.btnLabel}>Vent</span>
              <span className={styles.btnTitle}>FAN OFF</span>
            </button>

            <button
              className={`${styles.btn} ${styles.rgbRed} ${(rgb.r ?? 0) > 0 && (rgb.g ?? 0) === 0 && (rgb.b ?? 0) === 0 ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ rgb: { r: 255, g: 0, b: 0 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>RED</span>
            </button>
            <button
              className={`${styles.btn} ${styles.rgbGreen} ${(rgb.g ?? 0) > 0 && (rgb.r ?? 0) === 0 && (rgb.b ?? 0) === 0 ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ rgb: { r: 0, g: 255, b: 0 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>GREEN</span>
            </button>
            <button
              className={`${styles.btn} ${styles.rgbBlue} ${(rgb.b ?? 0) > 0 && (rgb.r ?? 0) === 0 && (rgb.g ?? 0) === 0 ? styles.btnActive : ""}`}
              disabled={busy}
              onClick={() => send({ rgb: { r: 0, g: 0, b: 255 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>BLUE</span>
            </button>
            <button
              className={styles.btn}
              disabled={busy}
              onClick={() => send({ rgb: { r: 0, g: 0, b: 0 } })}
            >
              <span className={styles.btnLabel}>RGB</span>
              <span className={styles.btnTitle}>OFF</span>
            </button>

            <button className={styles.btn} disabled={busy} onClick={beepOnce}>
              <span className={styles.btnLabel}>Tone</span>
              <span className={styles.btnTitle}>BEEP</span>
            </button>
            <button
              className={styles.btn}
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
              <span className={styles.btnLabel}>Safety</span>
              <span className={styles.btnTitle}>ALL OFF</span>
            </button>
          </div>

          <div className={`${styles.lcdRow} ${styles.sectionGap}`}>
            <input
              className={styles.lcdInput}
              value={lcd}
              maxLength={32}
              onChange={(e) => setLcd(e.target.value)}
              placeholder="LCD에 표시할 텍스트"
            />
            <button
              className={styles.btn}
              style={{ minWidth: 120 }}
              disabled={busy || !lcd.trim()}
              onClick={() => send({ lcd: lcd.trim() })}
            >
              <span className={styles.btnLabel}>LCD</span>
              <span className={styles.btnTitle}>SEND</span>
            </button>
            <button
              className={styles.btn}
              style={{ minWidth: 120 }}
              disabled={busy}
              onClick={() => {
                setLcd("");
                send({ lcd: "" });
              }}
            >
              <span className={styles.btnLabel}>LCD</span>
              <span className={styles.btnTitle}>CLEAR</span>
            </button>
          </div>
          <p className={styles.warn}>LCD SEND 후 입력 문구가 유지됩니다. CLEAR 시 센서 화면으로 복귀.</p>
        </section>
      </div>
    </main>
  );
}
