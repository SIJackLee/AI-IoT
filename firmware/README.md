# firmware (PlatformIO)

컨트롤보드: **ESP32-WROOM-32E (MGN4)**

## 사전 준비

1. Cursor 확장: PlatformIO IDE
2. USB로 ESP32 연결 (필요 시 CP210x / CH340 드라이버)
3. venv 활성화 후 `pio` 사용 가능해야 함

## 기본 환경

`platformio.ini`의 `default_envs = esp32_wroom_32e`

- board: `esp32dev` (WROOM-32E 호환)
- Serial Monitor: **115200**
- Upload speed: 921600 (실패 시 `upload_speed = 115200`으로 낮추기)

## 사용

명령 팔레트: `PlatformIO: Build` / `Upload` / `Serial Monitor`

CLI:

```powershell
cd firmware
pio run                         # 기본 = esp32_wroom_32e
pio run -t upload
pio device monitor -b 115200
```

보조(Uno):

```powershell
pio run -e uno
```

## 주의

- ESP32는 **3.3V** 로직입니다. 5V 센서는 레벨시프터/전원 분리 확인
- Upload 전 COM 포트 확인 (`pio device list`)
- 업로드가 안 되면 BOOT 버튼을 짧게 누르거나 `upload_speed`를 낮추세요
- `.pio/` 는 Git에 올리지 않습니다
