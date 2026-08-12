# firmware (PlatformIO)

Cursor에서 PlatformIO로 MCU 펌웨어를 빌드·업로드합니다.

## 사전 준비

1. Cursor 확장: `platformio.platformio-ide` (저장소 열면 추천됨)
2. USB로 보드 연결 (Arduino Uno 또는 ESP32)

## 사용

- 기본 환경: `uno` (`platformio.ini`의 `default_envs`)
- ESP32: 상태바/Project Environment에서 `esp32dev` 선택
- 명령 팔레트: `PlatformIO: Build`, `PlatformIO: Upload`, `PlatformIO: Serial Monitor`

CLI:

```powershell
cd firmware
pio run -e uno
pio run -e uno -t upload
pio device monitor -b 9600
```

## 주의

- 보드·포트는 PC마다 다릅니다. Upload 전 포트를 확인하세요.
- `.pio/` 빌드 캐시는 Git에 올리지 않습니다.
