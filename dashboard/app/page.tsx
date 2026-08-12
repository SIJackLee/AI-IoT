"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Droplets, Power, Thermometer } from "lucide-react";
import { fetchTelemetry, putCommand, type Command, type Telemetry } from "@/lib/firebase";
import { FanControl } from "@/components/FanControl";
import { RgbPad } from "@/components/RgbPad";
import { BuzzerPad } from "@/components/BuzzerPad";
import { LcdPanel } from "@/components/LcdPanel";
import { DemoPad, type DemoMode } from "@/components/DemoPad";
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
  icon,
}: {
  value: number | null;
  unit: string;
  label: string;
  color: string;
  max?: number;
  icon: ReactNode;
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
            color,
            strokeDasharray: `${dash} ${c}`,
          }}
        />
      </svg>
      <div className={styles.ringCenter}>
        <span className={styles.ringIcon} style={{ color }}>
          {icon}
        </span>
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

function normalizeDemo(v: string | undefined): DemoMode {
  if (v === "led" || v === "fan" || v === "lcd" || v === "all" || v === "off") return v;
  return "off";
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
      demo: normalizeDemo(data?.demo),
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
  const rgb = {
    r: data?.rgb?.r ?? 0,
    g: data?.rgb?.g ?? 0,
    b: data?.rgb?.b ?? 0,
  };
  const demoMode = normalizeDemo(data?.demo);
  const demoLock = demoMode !== "off";
  const keyPressed = data?.key === 0;
  const temp = valid(data?.t);
  const hum = valid(data?.h);

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.brandBlock}>
          <p className={styles.eyebrow}>Camtic · Agri Motion</p>
          <h1 className={styles.brand}>AI-IoT 스마트팜</h1>
          <p className={styles.tagline}>생육 환경 모니터링 · 장치 원격 제어</p>
        </div>
        <div className={styles.heroAside}>
          <span className={styles.livePill}>
            <i className={`${styles.liveDot} ${online ? "" : styles.bad}`} />
            {online ? "실시간 연결" : "오프라인"}
          </span>
          <p className={styles.meta}>
            {data?.ip ? `ESP ${data.ip}` : "ESP —"} · RSSI {fmt(data?.rssi)} dBm · 키{" "}
            {keyPressed ? "눌림" : "대기"}
            {demoLock ? ` · DEMO ${demoMode.toUpperCase()}` : ""}
          </p>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </header>

      <div className={styles.layout}>
        <section className={`${styles.panel} ${styles.panelMain}`}>
          <div className={styles.panelHead}>
            <div>
              <h2>생육 모니터링</h2>
              <p className={styles.panelHint}>온·습도 추이와 토양·조도 센서</p>
            </div>
          </div>

          <div className={styles.gaugeRow}>
            <RingGauge
              value={temp}
              unit="°C"
              label="온도"
              color="#1f7a4d"
              max={50}
              icon={<Thermometer size={16} strokeWidth={2.2} />}
            />
            <RingGauge
              value={hum}
              unit="%"
              label="습도"
              color="#3b82c4"
              max={100}
              icon={<Droplets size={16} strokeWidth={2.2} />}
            />
            <div className={styles.sideMeters}>
              <BarMeter label="토양 수분 (raw)" value={data?.soil ?? null} color="#8b6b4a" />
              <BarMeter label="조도 CDS (raw)" value={data?.cds ?? null} color="#e0a100" />
            </div>
          </div>

          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1f7a4d" stopOpacity={0.38} />
                    <stop offset="100%" stopColor="#1f7a4d" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gHum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82c4" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82c4" stopOpacity={0} />
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
                  stroke="#1f7a4d"
                  fill="url(#gTemp)"
                  strokeWidth={2.6}
                  isAnimationActive
                  animationDuration={850}
                  animationEasing="ease-out"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="hum"
                  name="습도 %"
                  stroke="#3b82c4"
                  fill="url(#gHum)"
                  strokeWidth={2.2}
                  isAnimationActive
                  animationDuration={850}
                  animationEasing="ease-out"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>장치 제어</h2>
              <p className={styles.panelHint}>현장 액추에이터를 바로 조작</p>
            </div>
          </div>

          <div className={styles.controlStack}>
            <div className={styles.deviceCard}>
              <DemoPad
                mode={demoMode}
                disabled={busy}
                onChange={(next) => send({ demo: next })}
              />
            </div>
            <div className={styles.deviceCard}>
              <FanControl
                on={fanOn}
                disabled={busy || demoLock}
                onToggle={(next) => send({ fan: next ? 1 : 0 })}
              />
            </div>
            <div className={styles.deviceCard}>
              <RgbPad
                value={rgb}
                disabled={busy || demoLock}
                onChange={(next) => send({ rgb: next })}
              />
            </div>
            <div className={styles.deviceCard}>
              <BuzzerPad disabled={busy} onBeep={beepOnce} />
            </div>
            <div className={styles.deviceCard}>
              <LcdPanel
                value={lcd}
                preview={lcdPreview}
                disabled={busy || demoLock}
                onChange={setLcd}
                onSend={() => send({ lcd: lcd.trim() })}
                onClear={() => {
                  setLcd("");
                  send({ lcd: "" });
                }}
              />
            </div>
            <div className={styles.deviceCard}>
              <button
                type="button"
                className={styles.safetyBtn}
                disabled={busy}
                onClick={() =>
                  send({
                    demo: "off",
                    fan: 0,
                    buzzer: 0,
                    rgb: { r: 0, g: 0, b: 0 },
                    lcd: "",
                  })
                }
              >
                <Power size={18} strokeWidth={2} />
                전체 끄기
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
