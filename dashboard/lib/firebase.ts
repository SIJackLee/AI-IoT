export type Telemetry = {
  t?: number;
  h?: number;
  soil?: number;
  cds?: number;
  fan?: number;
  buzzer?: number;
  key?: number;
  rgb?: { r?: number; g?: number; b?: number };
  demo?: string;
  ip?: string;
  rssi?: number;
  ts?: number;
};

export type DemoMode = "off" | "led" | "fan" | "lcd" | "all";

export type Command = {
  fan?: number;
  buzzer?: number;
  rgb?: { r: number; g: number; b: number };
  lcd?: string;
  demo?: DemoMode;
};

function dbRoot() {
  const base = process.env.NEXT_PUBLIC_FIREBASE_DB_URL?.replace(/\/$/, "");
  const id = process.env.NEXT_PUBLIC_DEVICE_ID || "aiot01";
  if (!base) throw new Error("NEXT_PUBLIC_FIREBASE_DB_URL missing");
  return `${base}/smartfarm/${id}`;
}

export async function fetchTelemetry(): Promise<Telemetry | null> {
  const res = await fetch(`${dbRoot()}/telemetry.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`telemetry ${res.status}`);
  return res.json();
}

export async function putCommand(cmd: Command): Promise<void> {
  const res = await fetch(`${dbRoot()}/command.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`command ${res.status}`);
}
