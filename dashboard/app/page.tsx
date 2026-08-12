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
import { ChevronLeft, ChevronRight, Bot, Power, SlidersHorizontal } from "lucide-react";
import { fetchTelemetry, putCommand, type Command, type Telemetry } from "@/lib/firebase";
import { FanControl } from "@/components/FanControl";
import { RgbPad } from "@/components/RgbPad";
import { BuzzerPad } from "@/components/BuzzerPad";
import { LcdPanel } from "@/components/LcdPanel";
import { DemoPad, type DemoMode } from "@/components/DemoPad";
import { AUTO_RULES, AutoPad, evalAutoRules, type ControlMode } from "@/components/AutoPad";
import { HabitatScene, classifyRgb } from "@/components/motion/HabitatScene";
import { ActuatorPhysics } from "@/components/motion/ActuatorPhysics";
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

function normalizeDemo(v: string | undefined): DemoMode {
  if (v === "led" || v === "fan" || v === "lcd" || v === "all" || v === "off") return v;
  return "off";
}

function normalizeMode(v: string | undefined, autoOn: boolean, demo: DemoMode, alertHint: boolean): ControlMode {
  if (demo !== "off") return "DEMO";
  if (v === "ALERT" || v === "AUTO" || v === "MANUAL" || v === "DEMO") {
    if (v === "DEMO" && demo === "off") return autoOn ? (alertHint ? "ALERT" : "AUTO") : "MANUAL";
    return v;
  }
  if (autoOn) return alertHint ? "ALERT" : "AUTO";
  return "MANUAL";
}

export default function HomePage() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [lcd, setLcd] = useState("캠틱 AI-IoT");
  const [lcdPreview, setLcdPreview] = useState("대기 중...");
  const [controlsOpen, setControlsOpen] = useState(true);

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

  const autoOn = Boolean(data?.auto);
  const demoMode = normalizeDemo(data?.demo);
  const temp = valid(data?.t);
  const hum = valid(data?.h);
  const sensors = useMemo(
    () => ({
      t: temp,
      h: hum,
      soil: data?.soil ?? null,
      cds: data?.cds ?? null,
    }),
    [temp, hum, data?.soil, data?.cds],
  );
  const autoEval = useMemo(() => evalAutoRules(sensors), [sensors]);
  const controlMode = normalizeMode(data?.mode, autoOn, demoMode, autoEval.alert);

  const baseCommand = useMemo<Command>(
    () => ({
      fan: data?.fan ?? 0,
      buzzer: 0,
      rgb: {
        r: data?.rgb?.r ?? 0,
        g: data?.rgb?.g ?? 0,
        b: data?.rgb?.b ?? 0,
      },
      demo: demoMode,
      auto: autoOn ? 1 : 0,
    }),
    [data, demoMode, autoOn],
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
  const rgbKind = classifyRgb(rgb.r, rgb.g, rgb.b);
  const demoLock = demoMode !== "off";
  const autoLock = autoOn;
  const manualLock = demoLock || autoLock;
  const keyPressed = data?.key === 0;

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.brandBlock}>
          <p className={styles.eyebrow}>Camtic · Agri Motion</p>
          <h1 className={styles.brand}>AI-IoT 스마트팜</h1>
          <p className={styles.tagline}>생육 환경 모니터링 · 자동·원격 제어</p>
        </div>

        <div className={styles.heroAside}>
          <div className={styles.heroAutoRow}>
            <button
              type="button"
              className={`${styles.heroAutoToggle} ${autoOn ? styles.heroAutoToggleOn : ""} ${
                autoOn && (controlMode === "ALERT" || autoEval.alert) ? styles.heroAutoToggleAlert : ""
              }`}
              disabled={busy}
              aria-pressed={autoOn}
              onClick={() =>
                send(
                  autoOn
                    ? { auto: 0 }
                    : { auto: 1, demo: "off" },
                )
              }
            >
              <span className={styles.heroAutoOrb} aria-hidden>
                <Bot size={20} strokeWidth={1.8} />
              </span>
              <span className={styles.heroAutoCopy}>
                <strong>{autoOn ? "AUTO ON" : "AUTO OFF"}</strong>
                <em>
                  {autoOn
                    ? controlMode === "ALERT" || autoEval.alert
                      ? "경보 규칙 활성"
                      : "규칙 제어 중"
                    : "탭하여 자동모드"}
                </em>
              </span>
              <span className={`${styles.heroAutoSwitch} ${autoOn ? styles.heroAutoSwitchOn : ""}`} aria-hidden>
                <i />
              </span>
            </button>

            <span
              className={`${styles.livePill} ${
                controlMode === "ALERT" ? styles.modeAlert : controlMode === "AUTO" ? styles.modeAuto : ""
              }`}
            >
              <i className={`${styles.liveDot} ${online ? "" : styles.bad}`} />
              {online ? controlMode : "오프라인"}
            </span>
          </div>

          <p className={styles.meta}>
            {data?.ip ? `ESP ${data.ip}` : "ESP —"} · RSSI {fmt(data?.rssi)} dBm · 키{" "}
            {keyPressed ? "눌림" : "대기"}
            {demoLock ? ` · DEMO ${demoMode.toUpperCase()}` : ""}
          </p>

          {autoOn ? (
            <div className={styles.heroRuleBadges} aria-label="활성 자동 규칙">
              {AUTO_RULES.filter((r) => autoEval[r.id]).map((r) => {
                const Icon = r.Icon;
                const danger = r.id === "r5";
                return (
                  <div
                    key={r.id}
                    className={`${styles.ruleBadge} ${danger ? styles.ruleBadgeDanger : ""}`}
                    title={`${r.title} · ${r.hint}`}
                  >
                    <Icon size={16} strokeWidth={2.2} />
                    <strong>{r.id.toUpperCase()}</strong>
                    <span>{r.short}</span>
                  </div>
                );
              })}
              {AUTO_RULES.every((r) => !autoEval[r.id]) ? (
                <span className={styles.ruleBadgeEmpty}>활성 규칙 없음</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </header>

      <div className={styles.layout}>
        <div className={styles.stageRow}>
          <section className={`${styles.panel} ${styles.stage} ${styles.panelMain}`}>
            <div className={styles.stageHead}>
              <div>
                <h2>키트 타워 · 3D</h2>
                <p className={styles.panelHint}>드래그 회전 · 스크롤 줌 · 우클릭 팬</p>
              </div>
              <span className={styles.liveTag}>Live</span>
            </div>
            <HabitatScene
              t={temp}
              h={hum}
              soil={data?.soil ?? null}
              cds={data?.cds ?? null}
              fan={fanOn}
              rgb={rgbKind}
            />
          </section>

          <aside
            className={`${styles.sideDock} ${controlsOpen ? styles.sideDockOpen : styles.sideDockClosed}`}
            aria-label="장치 제어 사이드 패널"
          >
            <button
              type="button"
              className={styles.sideHandle}
              aria-expanded={controlsOpen}
              aria-controls="device-controls-panel"
              onClick={() => setControlsOpen((v) => !v)}
            >
              <span className={styles.sideHandleIcon} aria-hidden>
                <SlidersHorizontal size={16} strokeWidth={2.2} />
              </span>
              <span className={styles.sideHandleLabel}>장치 제어</span>
              <span className={styles.sideHandleChevron} aria-hidden>
                {controlsOpen ? (
                  <ChevronRight size={18} strokeWidth={2.4} />
                ) : (
                  <ChevronLeft size={18} strokeWidth={2.4} />
                )}
              </span>
            </button>

            <section id="device-controls-panel" className={styles.sidePanel}>
              <div className={styles.sidePanelHead}>
                <div>
                  <h2>장치 제어</h2>
                  <p className={styles.panelHint}>자동규칙 · DEMO · 수동 액추에이터</p>
                </div>
              </div>

              <div className={styles.controlStack}>
                <div className={styles.deviceCard}>
                  <ActuatorPhysics
                    mode={controlMode}
                    fan={fanOn}
                    rgb={rgbKind}
                    t={temp}
                  />
                </div>
                <div className={styles.deviceCard}>
                  <AutoPad
                    on={autoOn}
                    mode={controlMode}
                    eval={autoEval}
                    sensors={sensors}
                    disabled={busy}
                    showToggle={false}
                    showRules={false}
                    onToggle={(next) =>
                      send(
                        next
                          ? { auto: 1, demo: "off" }
                          : { auto: 0 },
                      )
                    }
                  />
                </div>
                <div className={styles.deviceCard}>
                  <DemoPad
                    mode={demoMode}
                    disabled={busy}
                    onChange={(next) =>
                      send(
                        next === "off"
                          ? { demo: "off" }
                          : { demo: next, auto: 0 },
                      )
                    }
                  />
                </div>
                <div className={styles.deviceCard}>
                  <FanControl
                    on={fanOn}
                    disabled={busy || manualLock}
                    onToggle={(next) => send({ fan: next ? 1 : 0 })}
                  />
                </div>
                <div className={styles.deviceCard}>
                  <RgbPad
                    value={rgb}
                    disabled={busy || manualLock}
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
                    disabled={busy || manualLock}
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
                        auto: 0,
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
          </aside>
        </div>

        <section className={`${styles.panel} ${styles.panelSensors}`}>
          <div className={styles.panelHead}>
            <div>
              <h2>센서 · 트렌드</h2>
              <p className={styles.panelHint}>온·습도 최근 이력</p>
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
      </div>
    </main>
  );
}
