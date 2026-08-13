#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHTesp.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
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
uint32_t lastAutoAt = 0;
uint32_t lcdQuietUntil = 0;
uint32_t lastLcdRecoverAt = 0;
uint32_t lastActuatorAt = 0;

// 액추에이터 스태거 큐 (FAN/RGB 동시 급변 완화)
bool pendingFan = false;
int pendingFanVal = 0;
bool pendingRgb = false;
int pendingRgbR = 0, pendingRgbG = 0, pendingRgbB = 0;

// 자동제어 (부저 제외)
bool autoMode = false;
bool autoFanLatched = false;
bool autoSoilDry = false;
bool autoCdsDim = false;
bool autoAlert = false;
uint32_t autoFanMinOnUntil = 0;
bool keyWasDown = false;

// Phase A: 연속 실패 → 안전 종료 후 강제 리부팅
uint8_t wifiFailN = 0;
uint8_t httpFailN = 0;
uint32_t wifiDownSince = 0;
static const int WIFI_FAIL_REBOOT = 5;
static const int HTTP_FAIL_REBOOT = 10;
static const uint32_t WIFI_DOWN_REBOOT_MS = 120000;
static const int WDT_TIMEOUT_S = 12;
bool wdtReady = false;

static const uint32_t HTTP_TIMEOUT_MS = 5000;
static const uint32_t ACTUATOR_STAGGER_MS = 120;
static const uint32_t LCD_QUIET_FAN_MS = 900;
static const uint32_t LCD_QUIET_RGB_MS = 450;
static const uint32_t LCD_QUIET_BOTH_MS = 1100;
static const uint32_t LCD_QUIET_RECOVER_MS = 400;
static const uint32_t LCD_RECOVER_COOLDOWN_MS = 8000;

// Phase C: 부트 원인·리부팅 누적 (RTC — 전원 OFF면 초기화)
static const uint32_t REBOOT_MAGIC = 0xA10C00B1u;
RTC_DATA_ATTR uint32_t rebootMagic = 0;
RTC_DATA_ATTR uint32_t rebootN = 0;
esp_reset_reason_t lastResetReason = ESP_RST_UNKNOWN;

static const uint32_t AUTO_PERIOD_MS = 3000;
static const uint32_t AUTO_FAN_MIN_ON_MS = 5000;

// 임계값 (히스테리시스)
static const float AUTO_T_ON = 28.0f;
static const float AUTO_T_OFF = 26.0f;
static const float AUTO_H_ON = 70.0f;
static const float AUTO_H_OFF = 60.0f;
static const float AUTO_T_HOT = 30.0f;
static const int AUTO_SOIL_DRY = 27;   // ≈ ((4095-x)*100)/3000 기준
static const int AUTO_SOIL_OK = 40;
static const int AUTO_SOIL_CRIT = 20;
static const int AUTO_CDS_DARK = 500;
static const int AUTO_CDS_OK = 900;

void noteLcdQuiet(uint32_t ms);
bool lcdIsQuiet();
void renderLcd(bool force = false);
void recoverLcdI2c(const char* why);
void wdtFeed();
void serviceActuators();

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

const char* controlModeName() {
  if (demoMode != DEMO_OFF) return "DEMO";
  if (autoMode && autoAlert) return "ALERT";
  if (autoMode) return "AUTO";
  return "MANUAL";
}

const char* resetReasonName(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXT";
    case ESP_RST_SW: return "SW";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT: return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO: return "SDIO";
    default: return "OTHER";
  }
}

void captureBootReason() {
  lastResetReason = esp_reset_reason();
  if (rebootMagic != REBOOT_MAGIC) {
    rebootMagic = REBOOT_MAGIC;
    rebootN = 0;
  }
  if (rebootN < 0xFFFFFFFFu) rebootN++;
  Serial.printf("Boot reason=%s rebootN=%lu\n",
                resetReasonName(lastResetReason),
                (unsigned long)rebootN);
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

void recoverLcdI2c(const char* why) {
  uint32_t now = millis();
  if (now - lastLcdRecoverAt < LCD_RECOVER_COOLDOWN_MS) return;
  lastLcdRecoverAt = now;
  Serial.printf("LCD I2C recover: %s\n", why ? why : "");
  wdtFeed();
  Wire.end();
  delay(8);
  wdtFeed();
  Wire.begin(PIN_SDA, PIN_SCL);
  lcd.init();
  lcd.backlight();
  lcdShown0 = "";
  lcdShown1 = "";
  renderLcd(true);
  noteLcdQuiet(LCD_QUIET_RECOVER_MS);
  wdtFeed();
}

void wdtFeed() {
  if (wdtReady) {
    esp_task_wdt_reset();
  }
}

void wdtBegin() {
  if (wdtReady) return;
  // timeout(s), panic on trigger → 리셋
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
  esp_task_wdt_add(NULL);
  wdtReady = true;
  esp_task_wdt_reset();
  Serial.printf("Task WDT armed (%ds)\n", WDT_TIMEOUT_S);
}

void forceFanOff() {
  pendingFan = false;
  pinMode(PIN_FAN, OUTPUT);
  digitalWrite(PIN_FAN, LOW);
  fanState = 0;
}

void buzzerOff() {
  noTone(PIN_BUZZER);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  buzzerState = 0;
}

// 즉시 팬 적용 (스태거 우회 — 안전 경로)
void applyFanImmediate(int on) {
  if (!actuatorsReady) {
    forceFanOff();
    return;
  }

  int next = on ? 1 : 0;
  if (next == fanState) return;

  noteLcdQuiet(LCD_QUIET_FAN_MS);
  if (pendingRgb) noteLcdQuiet(LCD_QUIET_BOTH_MS);
  pinMode(PIN_FAN, OUTPUT);
  digitalWrite(PIN_FAN, next ? HIGH : LOW);
  fanState = next;
}

void applyRgbImmediate(int r, int g, int b) {
  int nr = constrain(r, 0, 255);
  int ng = constrain(g, 0, 255);
  int nb = constrain(b, 0, 255);
  if (nr == rgbR && ng == rgbG && nb == rgbB) return;

  noteLcdQuiet(LCD_QUIET_RGB_MS);
  if (pendingFan) noteLcdQuiet(LCD_QUIET_BOTH_MS);
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

// 환기팬: 큐잉 후 serviceActuators에서 스태거 적용
void applyFan(int on) {
  if (!actuatorsReady) {
    forceFanOff();
    return;
  }
  pendingFanVal = on ? 1 : 0;
  pendingFan = true;
}

void applyRgb(int r, int g, int b) {
  int nr = constrain(r, 0, 255);
  int ng = constrain(g, 0, 255);
  int nb = constrain(b, 0, 255);
  if (!actuatorsReady) {
    applyRgbImmediate(nr, ng, nb);
    pendingRgb = false;
    return;
  }
  if (nr == rgbR && ng == rgbG && nb == rgbB && !pendingRgb) return;
  pendingRgbR = nr;
  pendingRgbG = ng;
  pendingRgbB = nb;
  pendingRgb = true;
}

void serviceActuators() {
  if (!actuatorsReady) return;
  uint32_t now = millis();
  if (now - lastActuatorAt < ACTUATOR_STAGGER_MS) return;

  // RGB 먼저 → FAN (전류 피크 분산)
  if (pendingRgb) {
    applyRgbImmediate(pendingRgbR, pendingRgbG, pendingRgbB);
    pendingRgb = false;
    lastActuatorAt = now;
    return;
  }
  if (pendingFan) {
    const bool turningOn = pendingFanVal != 0 && fanState == 0;
    applyFanImmediate(pendingFanVal);
    pendingFan = false;
    lastActuatorAt = now;
    if (turningOn) {
      delay(15);
      wdtFeed();
      recoverLcdI2c("fan_on");
    }
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
void renderLcd(bool force) {
  if (!force && lcdIsQuiet()) return;
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
  // 토양습도 %: ((4095 - raw) * 100) / 3000
  int raw = analogRead(PIN_SOIL);
  raw = constrain(raw, 0, 4095);
  int pct = ((4095 - raw) * 100) / 3000;
  return constrain(pct, 0, 100);
}

void showSensorLcd() {
  if (lcdUserLock || !actuatorsReady) return;
  if (lcdIsQuiet()) return;

  TempAndHumidity th = dht.getTempAndHumidity();
  float t = th.temperature;
  float h = th.humidity;
  int soil = readSoilScaled();
  int cds = analogRead(PIN_CDS);

  char modeMark = ' ';
  if (demoMode != DEMO_OFF) modeMark = 'D';
  else if (autoMode && autoAlert) modeMark = '!';
  else if (autoMode) modeMark = 'A';

  char l0[17], l1[17];
  if (!isnan(t) && !isnan(h) && t > -900) {
    snprintf(l0, sizeof(l0), "T%4.1fC H%4.0f%%%c", t, h, modeMark);
  } else {
    snprintf(l0, sizeof(l0), "T----C H----%%%c", modeMark);
  }
  snprintf(l1, sizeof(l1), "S%3d%% C%-4d F%d", soil, cds, fanState);

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

void stopAutoOutputs() {
  autoFanLatched = false;
  autoSoilDry = false;
  autoCdsDim = false;
  autoAlert = false;
  autoFanMinOnUntil = 0;
  applyFan(0);
  applyRgb(0, 0, 0);
}

void setAutoMode(bool on) {
  if (on == autoMode) return;
  autoMode = on;
  if (on) {
    // AUTO와 DEMO는 동시 불가
    if (demoMode != DEMO_OFF) {
      demoMode = DEMO_OFF;
      demoNeedsKick = false;
      stopDemoOutputs();
    }
    autoFanLatched = false;
    autoSoilDry = false;
    autoCdsDim = false;
    autoAlert = false;
    lastAutoAt = 0;
    if (!lcdUserLock) showSensorLcd();
  } else {
    stopAutoOutputs();
    if (!lcdUserLock) showSensorLcd();
  }
  Serial.printf("Auto => %s\n", autoMode ? "on" : "off");
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
    // DEMO 진입 시 자동제어 일시 정지(플래그는 유지하지 않고 끔)
    if (autoMode) {
      autoMode = false;
      autoFanLatched = false;
      autoSoilDry = false;
      autoCdsDim = false;
      autoAlert = false;
      autoFanMinOnUntil = 0;
    }
    applyFan(0);
    applyRgb(0, 0, 0);
  }
  Serial.printf("Demo => %s\n", demoName(demoMode));
}

void safeShutdown(const char* why) {
  forceFanOff();
  pendingRgb = false;
  applyRgbImmediate(0, 0, 0);
  buzzerOff();
  if (demoMode != DEMO_OFF) {
    demoMode = DEMO_OFF;
    demoNeedsKick = false;
    stopDemoOutputs();
  }
  if (autoMode) {
    autoMode = false;
    stopAutoOutputs();
  }
  String msg = String("REBOOT\n") + (why ? why : "FAIL");
  setCustomLcd(msg);
  Serial.printf("safeShutdown: %s\n", why ? why : "FAIL");
}

void escalateReboot(const char* why) {
  Serial.printf("ESCALATE REBOOT: %s (wifiFail=%u httpFail=%u)\n",
                why ? why : "FAIL", wifiFailN, httpFailN);
  safeShutdown(why);
  delay(400);
  ESP.restart();
}

void noteWifiOk() {
  wifiFailN = 0;
  wifiDownSince = 0;
}

void noteWifiFail() {
  if (wifiDownSince == 0) wifiDownSince = millis();
  if (wifiFailN < 255) wifiFailN++;
  Serial.printf("wifiFailN=%u\n", wifiFailN);
  uint32_t downMs = (wifiDownSince == 0) ? 0 : (millis() - wifiDownSince);
  if (wifiFailN >= WIFI_FAIL_REBOOT || downMs >= WIFI_DOWN_REBOOT_MS) {
    escalateReboot("WIFI");
  }
}

void noteHttpOk() {
  httpFailN = 0;
}

void noteHttpFail() {
  if (httpFailN < 255) httpFailN++;
  Serial.printf("httpFailN=%u\n", httpFailN);
  if (httpFailN >= HTTP_FAIL_REBOOT) {
    escalateReboot("HTTP");
  }
}

bool wifiConnect() {
  forceFanOff();
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 25000) {
    forceFanOff();
    wdtFeed();
    delay(400);
    wdtFeed();
  }
  return WiFi.status() == WL_CONNECTED;
}

bool firebasePut(const String& path, const String& json) {
  wdtFeed();
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = basePath() + path + ".json" + authQuery();
  if (!http.begin(client, url)) {
    noteHttpFail();
    wdtFeed();
    return false;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  wdtFeed();
  int code = http.PUT(json);
  wdtFeed();
  Serial.printf("PUT %s => %d\n", path.c_str(), code);
  http.end();
  wdtFeed();
  if (code >= 200 && code < 300) {
    noteHttpOk();
    return true;
  }
  noteHttpFail();
  return false;
}

String jsonEscape(const String& s) {
  String o;
  o.reserve(s.length() + 8);
  for (unsigned i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '\r') continue;
    if (c == '\n') {
      o += "\\n";
      continue;
    }
    if (c == '"' || c == '\\') o += '\\';
    o += c;
  }
  return o;
}

/** 대시보드 미리보기용 32자(16+16) — LcdPanel/3D slice와 동일 */
String lcdMirrorText() {
  return pad16(lcdLine0) + pad16(lcdLine1);
}

void publishLcdMirror() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (lcdIsQuiet()) return;
  static String lastMirror;
  String mirror = lcdMirrorText();
  if (mirror == lastMirror) return;
  lastMirror = mirror;
  firebasePut("/telemetry/lcd", String("\"") + jsonEscape(mirror) + "\"");
}

String firebaseGet(const String& path) {
  wdtFeed();
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = basePath() + path + ".json" + authQuery();
  if (!http.begin(client, url)) {
    noteHttpFail();
    wdtFeed();
    return "";
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  wdtFeed();
  int code = http.GET();
  wdtFeed();
  String body = (code >= 200 && code < 300) ? http.getString() : "";
  Serial.printf("GET %s => %d\n", path.c_str(), code);
  http.end();
  wdtFeed();
  if (code >= 200 && code < 300) {
    noteHttpOk();
    return body;
  }
  noteHttpFail();
  return "";
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

// 자동제어: FAN/RGB/LCD만 (부저 호출 없음)
void runAuto(uint32_t now) {
  if (!autoMode || demoMode != DEMO_OFF || !actuatorsReady) return;
  if (lastAutoAt != 0 && now - lastAutoAt < AUTO_PERIOD_MS) return;
  lastAutoAt = now;

  TempAndHumidity th = dht.getTempAndHumidity();
  float t = th.temperature;
  float h = th.humidity;
  int soil = readSoilScaled();
  int cds = analogRead(PIN_CDS);

  const bool tOk = !isnan(t) && t > -900;
  const bool hOk = !isnan(h) && h > -900;

  // R1/R2 팬 + 히스테리시스
  if (tOk && t >= AUTO_T_ON) autoFanLatched = true;
  if (hOk && h >= AUTO_H_ON) autoFanLatched = true;
  {
    bool cool = !tOk || t <= AUTO_T_OFF;
    bool dryAir = !hOk || h <= AUTO_H_OFF;
    if (cool && dryAir && now >= autoFanMinOnUntil) autoFanLatched = false;
  }

  // R3 soil / R4 cds 래치
  if (soil <= AUTO_SOIL_DRY) autoSoilDry = true;
  if (soil >= AUTO_SOIL_OK) autoSoilDry = false;
  if (cds <= AUTO_CDS_DARK) autoCdsDim = true;
  if (cds >= AUTO_CDS_OK) autoCdsDim = false;

  // RGB 우선순위: R5 > R3 > R4 (부저 없음)
  int wantR = 0, wantG = 0, wantB = 0;
  bool wantAlert = false;
  bool forceFan = false;

  if (tOk && t >= AUTO_T_HOT && soil <= AUTO_SOIL_CRIT) {
    wantR = 255;
    wantG = 0;
    wantB = 0;
    forceFan = true;
    wantAlert = true;
  } else if (autoSoilDry) {
    wantR = 255;
    wantG = 120;
    wantB = 0;
    wantAlert = true;
  } else if (autoCdsDim) {
    wantR = 80;
    wantG = 80;
    wantB = 80;
  }

  autoAlert = wantAlert;
  bool wantFan = autoFanLatched || forceFan;
  if (wantFan && !fanState) {
    autoFanMinOnUntil = now + AUTO_FAN_MIN_ON_MS;
  }

  applyFan(wantFan ? 1 : 0);
  applyRgb(wantR, wantG, wantB);
}

void handleKeyToggle() {
  // active-low: pressed == 0
  bool down = digitalRead(PIN_KEY) == 0;
  if (down && !keyWasDown) {
    // 짧게: AUTO ↔ MANUAL (DEMO 중이면 DEMO 해제 후 AUTO ON)
    if (demoMode != DEMO_OFF) {
      setDemoMode(DEMO_OFF);
      setAutoMode(true);
    } else {
      setAutoMode(!autoMode);
    }
  }
  keyWasDown = down;
}

void handleCommand(const String& body) {
  if (body.length() == 0 || body == "null") return;

  if (body.indexOf("\"auto\"") >= 0) {
    setAutoMode(extractInt(body, "auto", autoMode ? 1 : 0) != 0);
  }

  DemoMode next = parseDemo(body);
  if (body.indexOf("\"demo\"") >= 0) {
    setDemoMode(next);
  }

  // DEMO 또는 AUTO 활성 중에는 수동 fan/rgb/lcd 무시 (buzzer는 허용)
  const bool locked = (demoMode != DEMO_OFF) || autoMode;

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
    showSensorLcd();
    publishLcdMirror();
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
        showSensorLcd();
      } else {
        setCustomLcd(msg);
      }
      publishLcdMirror();
    }
  }
}

void publishTelemetry() {
  // LCD 라인을 먼저 갱신한 뒤 미러 필드에 포함
  showSensorLcd();

  TempAndHumidity th = dht.getTempAndHumidity();
  float t = th.temperature;
  float h = th.humidity;
  if (isnan(t)) t = -999;
  if (isnan(h)) h = -999;
  int soil = readSoilScaled();
  int cds = analogRead(PIN_CDS);
  int key = digitalRead(PIN_KEY);
  String lcdEsc = jsonEscape(lcdMirrorText());

  char buf[640];
  snprintf(buf, sizeof(buf),
           "{\"t\":%.1f,\"h\":%.1f,\"soil\":%d,\"cds\":%d,"
           "\"fan\":%d,\"rgb\":{\"r\":%d,\"g\":%d,\"b\":%d},"
           "\"buzzer\":%d,\"key\":%d,\"demo\":\"%s\",\"auto\":%d,"
           "\"mode\":\"%s\",\"lcdCustom\":%s,\"lcd\":\"%s\","
           "\"wifiFail\":%u,\"httpFail\":%u,"
           "\"resetReason\":\"%s\",\"rebootN\":%lu,"
           "\"ip\":\"%s\",\"rssi\":%d,\"ts\":%lu}",
           t, h, soil, cds,
           fanState, rgbR, rgbG, rgbB,
           buzzerState, key,
           demoName(demoMode),
           autoMode ? 1 : 0,
           controlModeName(),
           lcdUserLock ? "true" : "false",
           lcdEsc.c_str(),
           (unsigned)wifiFailN, (unsigned)httpFailN,
           resetReasonName(lastResetReason),
           (unsigned long)rebootN,
           WiFi.localIP().toString().c_str(),
           WiFi.RSSI(),
           (unsigned long)(millis() / 1000));

  firebasePut("/telemetry", String(buf));
  wdtFeed();
  delay(30);
  wdtFeed();
  char st[160];
  snprintf(st, sizeof(st),
           "{\"online\":true,\"ts\":%lu,\"resetReason\":\"%s\",\"rebootN\":%lu}",
           (unsigned long)(millis() / 1000),
           resetReasonName(lastResetReason),
           (unsigned long)rebootN);
  firebasePut("/status", String(st));
}

void setup() {
  Serial.begin(115200);
  delay(200);
  captureBootReason();

  forceFanOff();
  wdtBegin();

  pinMode(PIN_RGB_R, OUTPUT);
  pinMode(PIN_RGB_G, OUTPUT);
  pinMode(PIN_RGB_B, OUTPUT);
  pinMode(PIN_KEY, INPUT_PULLUP);
  applyRgb(0, 0, 0);
  buzzerOff();

  Wire.begin(PIN_SDA, PIN_SCL);
  lcd.init();
  lcd.backlight();
  {
    char bootLcd[33];
    snprintf(bootLcd, sizeof(bootLcd), "%s\nN%lu",
             resetReasonName(lastResetReason),
             (unsigned long)rebootN);
    setCustomLcd(String(bootLcd));
  }
  wdtFeed();

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
  wdtFeed();
  Serial.printf("WiFi OK %s\n", WiFi.localIP().toString().c_str());
  setCustomLcd(String("WiFi OK\n") + WiFi.localIP().toString());
  publishLcdMirror();

  firebasePut("/status", "{\"online\":true,\"boot\":true}");
  wdtFeed();
  actuatorsReadyAt = millis() + 2500;
  lastCmdAt = 0;
  lastTelAt = 0;
}

void loop() {
  wdtFeed();
  uint32_t now = millis();

  if (!actuatorsReady) {
    forceFanOff();
    if (now >= actuatorsReadyAt) {
      actuatorsReady = true;
      Serial.println("Actuators armed");
      clearCustomLcd();
      showSensorLcd();
      publishLcdMirror();
    } else {
      delay(50);
      wdtFeed();
      return;
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    forceFanOff();
    setDemoMode(DEMO_OFF);
    setAutoMode(false);
    actuatorsReady = false;
    actuatorsReadyAt = millis() + 2500;
    if (!wifiConnect()) {
      noteWifiFail();
    } else {
      noteWifiOk();
    }
    delay(500);
    wdtFeed();
    return;
  }

  noteWifiOk();

  handleKeyToggle();
  serviceActuators();

  // Firebase poll ~3s (non-blocking demo/auto continues between polls)
  if (now - lastCmdAt >= 3000) {
    lastCmdAt = now;
    wdtFeed();
    String cmd = firebaseGet("/command");
    wdtFeed();
    handleCommand(cmd);
    serviceActuators();
  }

  runDemo(millis());
  runAuto(millis());
  serviceActuators();

  if (now - lastSensorLcdAt >= 1500) {
    lastSensorLcdAt = now;
    showSensorLcd();
  }

  if (now - lastTelAt >= 4000) {
    lastTelAt = now;
    wdtFeed();
    publishTelemetry();
    wdtFeed();
  }

  delay(40);
  wdtFeed();
}
