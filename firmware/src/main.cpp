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

bool lcdCustom = false;
String lcdLine0 = "";
String lcdLine1 = "";

DemoMode demoMode = DEMO_OFF;
uint8_t demoLedStep = 0;
uint8_t demoLcdStep = 0;
bool demoFanOn = false;
uint32_t demoLedAt = 0;
uint32_t demoFanAt = 0;
uint32_t demoLcdAt = 0;
bool demoNeedsKick = false;
uint32_t lastCmdAt = 0;
uint32_t lastTelAt = 0;

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

void forceFanOff() {
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

void applyFan(int on) {
  if (!actuatorsReady) {
    forceFanOff();
    return;
  }
  fanState = on ? 1 : 0;
  digitalWrite(PIN_FAN, fanState ? HIGH : LOW);
}

void applyRgb(int r, int g, int b) {
  rgbR = constrain(r, 0, 255);
  rgbG = constrain(g, 0, 255);
  rgbB = constrain(b, 0, 255);
  digitalWrite(PIN_RGB_R, rgbR > 0 ? LOW : HIGH);
  digitalWrite(PIN_RGB_G, rgbG > 0 ? LOW : HIGH);
  digitalWrite(PIN_RGB_B, rgbB > 0 ? LOW : HIGH);
}

void applyBuzzer(int on) {
  if (on) {
    buzzerState = 1;
    tone(PIN_BUZZER, 1000);
  } else {
    buzzerOff();
  }
}

void renderLcd() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(lcdLine0.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(lcdLine1.substring(0, 16));
}

void setCustomLcd(const String& msg) {
  lcdCustom = true;
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
  while (lcdLine0.length() < 16) lcdLine0 += ' ';
  while (lcdLine1.length() < 16) lcdLine1 += ' ';
  renderLcd();
}

void clearCustomLcd() {
  lcdCustom = false;
  lcdLine0 = "";
  lcdLine1 = "";
}

void stopDemoOutputs() {
  applyFan(0);
  applyRgb(0, 0, 0);
  demoLedStep = 0;
  demoLcdStep = 0;
  demoFanOn = false;
  if (lcdCustom) clearCustomLcd();
}

void setDemoMode(DemoMode next) {
  if (next == demoMode) return;
  DemoMode prev = demoMode;
  demoMode = next;
  demoLedStep = 0;
  demoLcdStep = 0;
  demoFanOn = false;
  demoNeedsKick = (next != DEMO_OFF);

  if (prev != DEMO_OFF && next == DEMO_OFF) {
    stopDemoOutputs();
    setCustomLcd("DEMO OFF\nManual OK");
  } else if (next != DEMO_OFF) {
    applyFan(0);
    applyRgb(0, 0, 0);
    String title = String("DEMO ") + demoName(next);
    title.toUpperCase();
    setCustomLcd(title + "\nRunning...");
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

void applyLcdStep(uint8_t step) {
  TempAndHumidity th = dht.getTempAndHumidity();
  float t = th.temperature;
  float h = th.humidity;
  char l0[17], l1[17];
  switch (step % 4) {
    case 0:
      snprintf(l0, sizeof(l0), "DEMO LCD       ");
      snprintf(l1, sizeof(l1), "Camtic AI-IoT  ");
      break;
    case 1:
      if (!isnan(t) && !isnan(h))
        snprintf(l0, sizeof(l0), "T%.0fC H%.0f%%     ", t, h);
      else
        snprintf(l0, sizeof(l0), "DHT --          ");
      snprintf(l1, sizeof(l1), "Sensor live    ");
      break;
    case 2:
      snprintf(l0, sizeof(l0), "WiFi IP        ");
      snprintf(l1, sizeof(l1), "%-16s", WiFi.localIP().toString().c_str());
      break;
    default:
      snprintf(l0, sizeof(l0), "FAN %s         ", fanState ? "ON " : "OFF");
      snprintf(l1, sizeof(l1), "Mode %-9s", demoName(demoMode));
      break;
  }
  lcdCustom = true;
  lcdLine0 = l0;
  lcdLine1 = l1;
  renderLcd();
}

void runDemo(uint32_t now) {
  if (demoMode == DEMO_OFF || !actuatorsReady) return;

  const bool doLed = (demoMode == DEMO_LED || demoMode == DEMO_ALL);
  const bool doFan = (demoMode == DEMO_FAN || demoMode == DEMO_ALL);
  const bool doLcd = (demoMode == DEMO_LCD || demoMode == DEMO_ALL);

  if (demoNeedsKick) {
    demoNeedsKick = false;
    demoLedAt = now;
    demoFanAt = now;
    demoLcdAt = now;
    if (doLed) applyLedStep(demoLedStep);
    if (doFan) {
      demoFanOn = true;
      applyFan(1);
    }
    if (doLcd) applyLcdStep(demoLcdStep);
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

  if (doLcd && now - demoLcdAt >= 2000) {
    demoLcdAt = now;
    demoLcdStep = (demoLcdStep + 1) % 4;
    applyLcdStep(demoLcdStep);
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
  int soil = analogRead(PIN_SOIL);
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
           lcdCustom ? "true" : "false",
           WiFi.localIP().toString().c_str(),
           WiFi.RSSI(),
           (unsigned long)(millis() / 1000));

  firebasePut("/telemetry", String(buf));
  firebasePut("/status",
              String("{\"online\":true,\"ts\":") + String(millis() / 1000) + "}");

  if (!lcdCustom && demoMode == DEMO_OFF) {
    char l0[17], l1[17];
    if (t > -900) snprintf(l0, sizeof(l0), "T%.0fC H%.0f%%     ", t, h);
    else snprintf(l0, sizeof(l0), "DHT --          ");
    snprintf(l1, sizeof(l1), "S%-4d C%-4d F%d ", soil, cds, fanState);
    lcdLine0 = l0;
    lcdLine1 = l1;
    renderLcd();
  }
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
      if (lcdCustom && lcdLine0.startsWith("WiFi OK")) {
        clearCustomLcd();
      }
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

  if (now - lastTelAt >= 4000) {
    lastTelAt = now;
    publishTelemetry();
  }

  delay(40);
}
