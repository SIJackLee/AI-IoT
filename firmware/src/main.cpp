#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHTesp.h>
#include "secrets.h"

// Pins (RGB: 실측 보정 — 버튼 색과 LED 색 일치)
static const int PIN_DHT = 4;
static const int PIN_SOIL = 36;
static const int PIN_CDS = 39;
static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_FAN = 2;
static const int PIN_RGB_R = 14;  // was 15 (실측: B핀이 Red)
static const int PIN_RGB_G = 15;  // was 13 (실측: R핀이 Green)
static const int PIN_RGB_B = 13;  // was 14 (실측: G핀이 Blue)
static const int PIN_KEY = 19;
static const int PIN_BUZZER = 12;

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

String basePath() {
  return String("https://") + FIREBASE_HOST + "/smartfarm/" + DEVICE_ID;
}

String authQuery() {
  if (FIREBASE_AUTH[0] == '\0') return "";
  return String("?auth=") + FIREBASE_AUTH;
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
  digitalWrite(PIN_RGB_R, rgbR > 0 ? HIGH : LOW);
  digitalWrite(PIN_RGB_G, rgbG > 0 ? HIGH : LOW);
  digitalWrite(PIN_RGB_B, rgbB > 0 ? HIGH : LOW);
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
  // pad/clear remainder
  while (lcdLine0.length() < 16) lcdLine0 += ' ';
  while (lcdLine1.length() < 16) lcdLine1 += ' ';
  renderLcd();
}

void clearCustomLcd() {
  lcdCustom = false;
  lcdLine0 = "";
  lcdLine1 = "";
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

void handleCommand(const String& body) {
  if (body.length() == 0 || body == "null") return;

  if (body.indexOf("\"fan\"") >= 0) {
    applyFan(extractInt(body, "fan", fanState));
  }
  if (body.indexOf("\"buzzer\"") >= 0) {
    applyBuzzer(extractInt(body, "buzzer", 0));
  }
  if (body.indexOf("\"rgb\"") >= 0) {
    int r = extractInt(body, "r", rgbR);
    int g = extractInt(body, "g", rgbG);
    int b = extractInt(body, "b", rgbB);
    applyRgb(r, g, b);
  }

  // explicit clear
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
      // unescape minimal
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

  char buf[360];
  snprintf(buf, sizeof(buf),
           "{\"t\":%.1f,\"h\":%.1f,\"soil\":%d,\"cds\":%d,"
           "\"fan\":%d,\"rgb\":{\"r\":%d,\"g\":%d,\"b\":%d},"
           "\"buzzer\":%d,\"key\":%d,\"lcdCustom\":%s,\"ip\":\"%s\",\"rssi\":%d,\"ts\":%lu}",
           t, h, soil, cds,
           fanState, rgbR, rgbG, rgbB,
           buzzerState, key,
           lcdCustom ? "true" : "false",
           WiFi.localIP().toString().c_str(),
           WiFi.RSSI(),
           (unsigned long)(millis() / 1000));

  firebasePut("/telemetry", String(buf));
  firebasePut("/status",
              String("{\"online\":true,\"ts\":") + String(millis() / 1000) + "}");

  // 사용자 LCD 텍스트가 있으면 덮어쓰지 않음
  if (!lcdCustom) {
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

  // GPIO2(팬): 부팅/Wi-Fi 중 글리치 방지 — 최우선 OFF
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

  // Wi-Fi 안정화 후 액추에이터 허용
  actuatorsReadyAt = millis() + 2500;
}

void loop() {
  if (!actuatorsReady) {
    forceFanOff();
    if (millis() >= actuatorsReadyAt) {
      actuatorsReady = true;
      Serial.println("Actuators armed");
      if (lcdCustom && lcdLine0.startsWith("WiFi OK")) {
        clearCustomLcd();
      }
    } else {
      delay(200);
      return;
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    forceFanOff();
    actuatorsReady = false;
    actuatorsReadyAt = millis() + 2500;
    wifiConnect();
    delay(2000);
    return;
  }

  String cmd = firebaseGet("/command");
  handleCommand(cmd);
  publishTelemetry();
  delay(4000);
}
