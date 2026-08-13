# 핀맵 (인터페이스 규격 + 실측 보정)

보드: ESP32-WROOM-32E (MGN4) / COM3 CH340

| 구성 | 인터페이스 | 핀 |
|------|------------|-----|
| 온습도 DHT11 | Digital | 4 |
| 토양수분 | Analog | 36 |
| 조도 CDS | Analog | 39 |
| LCD | I2C | SDA 21, SCL 22 / 0x27 |
| 환기팬 | Digital | 2 |
| RGB LED | Digital | **R13, G14, B15** (실측 최종) |
| 기능키 | Digital | 19 |
| 부저 | Tone | 12 |

## 메모
- RGB 규격 문서(15/13/14)와 실물 배선이 달라 펌웨어에서 **R13/G14/B15**로 보정
- RGB는 **공통양극(active-low)**: `0,0,0`=끄기, `255,255,255`=흰색
- LCD 사용자 텍스트는 telemetry 루프에 덮어쓰지 않음 (CLEAR 시 센서 화면)
- 팬(GPIO2)은 **Digital ON/OFF** (`HIGH`/`LOW`). Wi-Fi 접속 후 약 2.5초 뒤에 제어 허용
