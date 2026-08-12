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
