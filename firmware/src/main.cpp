#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHTesp.h>
#include "secrets.h"

static const int PIN_DHT = 4;
static const int PIN_SOIL = 36;
static const int PIN_CDS = 39;
static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_FAN = 2;
// 실측 최종: R13 / G14 / B15 (공통양극 active-low)
static const int PIN_RGB_R = 13;
static const int PIN_RGB_G = 14;
static const int PIN_RGB_B = 15;
static const int PIN_KEY = 19;
static const int PIN_BUZZER = 12;

enum DemoMode : uint8_t {
  DEMO_OFF = 0,
  DEMO_LED,
  DEMO_FAN,
  DEMO_LCD,
  DEMO_ALL
};

DHTesp dht;
LiquidCrystal_I2C lcd(0x27, 16, 2);

int fanState = 0;
int rgbR = 0, rgbG = 0, rgbB = 0;
int buzzerState = 0;
bool actuatorsReady = false;
uint32_t actuatorsReadyAt = 0;

bool lcdUserLock = false;
String lcdLine0 = "";
String lcdLine1 = "";
String lcdShown0 = "                ";
String lcdShown1 = "                ";

DemoMode demoMode = DEMO_OFF;
uint8_t demoLedStep = 0;
bool demoFanOn = false;
uint32_t demoLedAt = 0;
uint32_t demoFanAt = 0;
bool demoNeedsKick = false;
uint32_t lastCmdAt = 0;
uint32_t lastTelAt = 0;
uint32_t lastSensorLcdAt = 0;
uint32_t lcdQuietUntil = 0;
bool fanPwmReady = false;

static const int FAN_PWM_CH = 0;
static const uint32_t LCD_QUIET_FAN_MS = 450;
static const uint32_t LCD_QUIET_RGB_MS = 220;

String basePath() {
  return String("https://") + FIREBASE_HOST + "/smartfarm/" + DEVICE_ID;
}

String authQuery() {
  if (FIREBASE_AUTH[0] == '\0') return "";
  return String("?auth=") + FIREBASE_AUTH;
}

const char* demoName(DemoMode m) {
  switch (m) {
    case DEMO_LED: return "led";
    case DEMO_FAN: return "fan";
    case DEMO_LCD: return "lcd";
    case DEMO_ALL: return "all";
    default: return "off";
  }
}

DemoMode parseDemo(const String& body) {
  int i = body.indexOf("\"demo\":\"");
  if (i < 0) return demoMode;
  i += 8;
  int e = body.indexOf("\"", i);
  if (e < i) return demoMode;
  String v = body.substring(i, e);
  v.toLowerCase();
  if (v == "led") return DEMO_LED;
  if (v == "fan") return DEMO_FAN;
  if (v == "lcd") return DEMO_LCD;
  if (v == "all") return DEMO_ALL;
  if (v == "off" || v == "0" || v == "false") return DEMO_OFF;
  return demoMode;
}

void noteLcdQuiet(uint32_t ms) {
  uint32_t until = millis() + ms;
  if (until > lcdQuietUntil) lcdQuietUntil = until;
}

bool lcdIsQuiet() {
  return millis() < lcdQuietUntil;
}

void ensureFanPwm() {
  if (fanPwmReady) return;
  ledcSetup(FAN_PWM_CH, 20000, 8);
  ledcAttachPin(PIN_FAN, FAN_PWM_CH);
  ledcWrite(FAN_PWM_CH, 0);
  fanPwmReady = true;
}

void forceFanOff() {
  if (fanPwmReady) {
    ledcWrite(FAN_PWM_CH, 0);
  } else {
    pinMode(PIN_FAN, OUTPUT);
    digitalWrite(PIN_FAN, LOW);
  }
  fanState = 0;
}

void buzzerOff() {
  noTone(PIN_BUZZER);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  buzzerState = 0;
}

void applyFan(int on) {
  if (!actuatorsReady) {
    forceFanOff();
    return;
  }

  int next = on ? 1 : 0;
  if (next == fanState) return;

  noteLcdQuiet(LCD_QUIET_FAN_MS);
  ensureFanPwm();

  if (next) {
    // 소프트 기동: 전류 스파이크를 줄여 LCD 전압 딥 완화
    for (int d = 32; d < 255; d += 32) {
      ledcWrite(FAN_PWM_CH, d);
      delay(18);
    }
    ledcWrite(FAN_PWM_CH, 255);
  } else {
    for (int d = 224; d >= 0; d -= 32) {
      ledcWrite(FAN_PWM_CH, d < 0 ? 0 : d);
      delay(12);
    }
    ledcWrite(FAN_PWM_CH, 0);
  }
  fanState = next;
}

void applyRgb(int r, int g, int b) {
  int nr = constrain(r, 0, 255);
  int ng = constrain(g, 0, 255);
  int nb = constrain(b, 0, 255);
  if (nr == rgbR && ng == rgbG && nb == rgbB) return;

  noteLcdQuiet(LCD_QUIET_RGB_MS);
  // 채널을 살짝 시프트해 동시 전류 피크 완화
  if (nr != rgbR) {
    rgbR = nr;
    digitalWrite(PIN_RGB_R, rgbR > 0 ? LOW : HIGH);
    delay(2);
  }
  if (ng != rgbG) {
    rgbG = ng;
    digitalWrite(PIN_RGB_G, rgbG > 0 ? LOW : HIGH);
    delay(2);
  }
  if (nb != rgbB) {
    rgbB = nb;
    digitalWrite(PIN_RGB_B, rgbB > 0 ? LOW : HIGH);
  }
}

void applyBuzzer(int on) {
  if (on) {
    buzzerState = 1;
    tone(PIN_BUZZER, 1000);
  } else {
    buzzerOff();
  }
}

String pad16(String s) {
  if (s.length() > 16) s = s.substring(0, 16);
  while (s.length() < 16) s += ' ';
  return s;
}

// clear() 없이 덮어쓰기 — 백라이트 깜빡임·I2C 부하 감소
void renderLcd(bool force = false) {
  String a = pad16(lcdLine0);
  String b = pad16(lcdLine1);
  if (!force && a == lcdShown0 && b == lcdShown1) return;

  if (force || a != lcdShown0) {
    lcd.setCursor(0, 0);
    lcd.print(a);
    lcdShown0 = a;
  }
  if (force || b != lcdShown1) {
    lcd.setCursor(0, 1);
    lcd.print(b);
    lcdShown1 = b;
  }
}

void setCustomLcd(const String& msg) {
  lcdUserLock = true;
  String m = msg;
  m.replace("\\n", "\n");
  int nl = m.indexOf('\n');
  if (nl >= 0) {
    lcdLine0 = m.substring(0, nl);
    lcdLine1 = m.substring(nl + 1);
  } else {
    lcdLine0 = m.substring(0, 16);
    lcdLine1 = m.length() > 16 ? m.substring(16, 32) : "";
  }
  renderLcd(true);
}

void clearCustomLcd() {
  lcdUserLock = false;
  lcdLine0 = "";
  lcdLine1 = "";
}

bool demoOwnsLcd() {
  return false;
}

int readSoilScaled() {
  // 공중/건조 ≈ 4095 → 0, 습할수록 커지도록 반전
  int raw = analogRead(PIN_SOIL);
  raw = constrain(raw, 0, 4095);
  return 4095 - raw;
}

void showSensorLcd() {
  if (lcdUserLock || !actuatorsReady) return;
  if (lcdIsQuiet()) return;

  TempAndHumidity th = dht.getTempAndHumidity();
  float t = th.temperature;
  float h = th.humidity;
  int soil = readSoilScaled();
  int cds = analogRead(PIN_CDS);

  char l0[17], l1[17];
  if (!isnan(t) && !isnan(h) && t > -900) {
    snprintf(l0, sizeof(l0), "T%4.1fC H%4.0f%% ", t, h);
  } else {
    snprintf(l0, sizeof(l0), "T----C H----%% ");
  }
  snprintf(l1, sizeof(l1), "S%-4d C%-4d F%d", soil, cds, fanState);

  lcdLine0 = l0;
  lcdLine1 = l1;
  renderLcd(false);
}

void stopDemoOutputs() {
  applyFan(0);
  applyRgb(0, 0, 0);
  demoLedStep = 0;
  demoFanOn = false;
}

void setDemoMode(DemoMode next) {
  if (next == demoMode) return;
  demoMode = next;
  demoLedStep = 0;
  demoFanOn = false;
  demoNeedsKick = (next != DEMO_OFF);

  if (next == DEMO_OFF) {
    stopDemoOutputs();
    // 사용자 고정 문구가 없으면 즉시 센서 화면
    if (!lcdUserLock) showSensorLcd();
  } else {
    applyFan(0);
    applyRgb(0, 0, 0);
  }
  Serial.printf("Demo => %s\n", demoName(demoMode));
}

bool wifiConnect() {
  forceFanOff();
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 25000) {
    forceFanOff();
    delay(400);
  }
  return WiFi.status() == WL_CONNECTED;
}

bool firebasePut(const String& path, const String& json) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = basePath() + path + ".json" + authQuery();
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(json);
  Serial.printf("PUT %s => %d\n", path.c_str(), code);
  http.end();
  return code >= 200 && code < 300;
}

String firebaseGet(const String& path) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = basePath() + path + ".json" + authQuery();
  if (!http.begin(client, url)) return "";
  int code = http.GET();
  String body = (code >= 200 && code < 300) ? http.getString() : "";
  Serial.printf("GET %s => %d\n", path.c_str(), code);
  http.end();
  return body;
}

int extractInt(const String& body, const char* key, int fallback = 0) {
  String k = String("\"") + key + "\":";
  int i = body.indexOf(k);
  if (i < 0) return fallback;
  i += k.length();
  while (i < (int)body.length() && (body[i] == ' ')) i++;
  return body.substring(i).toInt();
}

void applyLedStep(uint8_t step) {
  switch (step % 5) {
    case 0: applyRgb(255, 0, 0); break;
    case 1: applyRgb(0, 255, 0); break;
    case 2: applyRgb(0, 0, 255); break;
    case 3: applyRgb(255, 255, 255); break;
    default: applyRgb(0, 0, 0); break;
  }
}

void runDemo(uint32_t now) {
  if (demoMode == DEMO_OFF || !actuatorsReady) return;

  // LCD DEMO는 별도 화면 순환 없이 센서 표시 유지 (showSensorLcd)
  const bool doLed = (demoMode == DEMO_LED || demoMode == DEMO_ALL);
  const bool doFan = (demoMode == DEMO_FAN || demoMode == DEMO_ALL);

  if (demoNeedsKick) {
    demoNeedsKick = false;
    demoLedAt = now;
    demoFanAt = now;
    if (doLed) applyLedStep(demoLedStep);
    if (doFan) {
      demoFanOn = true;
      applyFan(1);
    }
  }

  if (doLed && now - demoLedAt >= 1500) {
    demoLedAt = now;
    demoLedStep = (demoLedStep + 1) % 5;
    applyLedStep(demoLedStep);
  }

  if (doFan && now - demoFanAt >= 5000) {
    demoFanAt = now;
    demoFanOn = !demoFanOn;
    applyFan(demoFanOn ? 1 : 0);
  }
}

void handleCommand(const String& body) {
  if (body.length() == 0 || body == "null") return;

  DemoMode next = parseDemo(body);
  if (body.indexOf("\"demo\"") >= 0) {
    setDemoMode(next);
  }

  // DEMO 활성 중에는 수동 fan/rgb/lcd 무시 (buzzer는 허용)
  const bool locked = (demoMode != DEMO_OFF);

  if (!locked && body.indexOf("\"fan\"") >= 0) {
    applyFan(extractInt(body, "fan", fanState));
  }
  if (body.indexOf("\"buzzer\"") >= 0) {
    applyBuzzer(extractInt(body, "buzzer", 0));
  }
  if (!locked && body.indexOf("\"rgb\"") >= 0) {
    int r = extractInt(body, "r", rgbR);
    int g = extractInt(body, "g", rgbG);
    int b = extractInt(body, "b", rgbB);
    applyRgb(r, g, b);
  }

  if (locked) return;

  if (body.indexOf("\"lcd\":\"\"") >= 0 || body.indexOf("\"lcdClear\":true") >= 0) {
    clearCustomLcd();
    return;
  }

  int li = body.indexOf("\"lcd\":\"");
  if (li >= 0) {
    li += 7;
    int le = body.indexOf("\"", li);
    if (le >= li) {
      String msg = body.substring(li, le);
      msg.replace("\\\"", "\"");
      if (msg.length() == 0 || msg == "                ") {
        clearCustomLcd();
      } else {
        setCustomLcd(msg);
      }
    }
  }
}

void publishTelemetry() {
  TempAndHumidity th = dht.getTempAndHumidity();
  float t = th.temperature;
  float h = th.humidity;
  if (isnan(t)) t = -999;
  if (isnan(h)) h = -999;
  int soil = readSoilScaled();
  int cds = analogRead(PIN_CDS);
  int key = digitalRead(PIN_KEY);

  char buf[420];
  snprintf(buf, sizeof(buf),
           "{\"t\":%.1f,\"h\":%.1f,\"soil\":%d,\"cds\":%d,"
           "\"fan\":%d,\"rgb\":{\"r\":%d,\"g\":%d,\"b\":%d},"
           "\"buzzer\":%d,\"key\":%d,\"demo\":\"%s\",\"lcdCustom\":%s,"
           "\"ip\":\"%s\",\"rssi\":%d,\"ts\":%lu}",
           t, h, soil, cds,
           fanState, rgbR, rgbG, rgbB,
           buzzerState, key,
           demoName(demoMode),
           lcdUserLock ? "true" : "false",
           WiFi.localIP().toString().c_str(),
           WiFi.RSSI(),
           (unsigned long)(millis() / 1000));

  firebasePut("/telemetry", String(buf));
  firebasePut("/status",
              String("{\"online\":true,\"ts\":") + String(millis() / 1000) + "}");

  showSensorLcd();
}

void setup() {
  Serial.begin(115200);
  delay(200);

  forceFanOff();

  pinMode(PIN_RGB_R, OUTPUT);
  pinMode(PIN_RGB_G, OUTPUT);
  pinMode(PIN_RGB_B, OUTPUT);
  pinMode(PIN_KEY, INPUT_PULLUP);
  applyRgb(0, 0, 0);
  buzzerOff();

  Wire.begin(PIN_SDA, PIN_SCL);
  lcd.init();
  lcd.backlight();
  setCustomLcd("Firebase RTDB\nBooting...");

  dht.setup(PIN_DHT, DHTesp::DHT11);
  analogReadResolution(12);

  if (FIREBASE_HOST[0] == '\0') {
    setCustomLcd("No FB host");
    return;
  }

  setCustomLcd("WiFi...\nCOM_01");
  forceFanOff();
  if (!wifiConnect()) {
    setCustomLcd("WiFi FAIL");
    return;
  }
  forceFanOff();
  Serial.printf("WiFi OK %s\n", WiFi.localIP().toString().c_str());
  setCustomLcd(String("WiFi OK\n") + WiFi.localIP().toString());

  firebasePut("/status", "{\"online\":true,\"boot\":true}");
  actuatorsReadyAt = millis() + 2500;
  lastCmdAt = 0;
  lastTelAt = 0;
}

void loop() {
  uint32_t now = millis();

  if (!actuatorsReady) {
    forceFanOff();
    if (now >= actuatorsReadyAt) {
      actuatorsReady = true;
      Serial.println("Actuators armed");
      clearCustomLcd();
      showSensorLcd();
    } else {
      delay(50);
      return;
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    forceFanOff();
    setDemoMode(DEMO_OFF);
    actuatorsReady = false;
    actuatorsReadyAt = millis() + 2500;
    wifiConnect();
    delay(500);
    return;
  }

  // Firebase poll ~3s (non-blocking demo continues between polls)
  if (now - lastCmdAt >= 3000) {
    lastCmdAt = now;
    String cmd = firebaseGet("/command");
    handleCommand(cmd);
  }

  runDemo(millis());

  if (now - lastSensorLcdAt >= 1500) {
    lastSensorLcdAt = now;
    showSensorLcd();
  }

  if (now - lastTelAt >= 4000) {
    lastTelAt = now;
    publishTelemetry();
  }

  delay(40);
}
