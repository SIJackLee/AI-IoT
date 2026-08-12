# 핀맵 (인터페이스 규격 + 실측 보정)

보드: ESP32-WROOM-32E (MGN4) / COM3 CH340

| 구성 | 인터페이스 | 핀 |
|------|------------|-----|
| 온습도 DHT11 | Digital | 4 |
| 토양수분 | Analog | 36 |
| 조도 CDS | Analog | 39 |
| LCD | I2C | SDA 21, SCL 22 / 0x27 |
| 환기팬 | Digital | 2 |
| RGB LED | Digital | **R14, G15, B13** (실측 보정) |
| 기능키 | Digital | 19 |
| 부저 | Tone | 12 |

## 메모
- RGB 규격 문서(15/13/14)와 실물 점등 색이 달라 펌웨어에서 보정함
- LCD 사용자 텍스트는 telemetry 루프에 덮어쓰지 않음 (CLEAR 시 센서 화면)
- 팬(GPIO2)은 Wi-Fi 접속 후 약 2.5초 뒤에 제어 허용
