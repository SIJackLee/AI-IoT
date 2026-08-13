# Firebase Realtime Database 연동 (엣지 ESP32)

PC(유선)와 ESP(Wi-Fi `COM_01`) 대역이 달라 **클라우드 중계**로 사용합니다.

### 현재 프로젝트
- 프로젝트: `AI-IoT-camtic`
- Host: `ai-iot-camtic-default-rtdb.asia-southeast1.firebasedatabase.app`
- URL: https://ai-iot-camtic-default-rtdb.asia-southeast1.firebasedatabase.app/

## 아키텍처

```text
ESP32  --HTTPS-->  Firebase RTDB  <--HTTPS--  PC 브라우저/Vercel
         PUT telemetry              GET telemetry / PUT command
         GET command
```

## 경로 규약

| 경로 | 방향 | 내용 |
|------|------|------|
| `/smartfarm/aiot01/telemetry` | ESP → FB | 센서·상태 JSON |
| `/smartfarm/aiot01/command` | FB ← 대시보드 | 제어 JSON |
| `/smartfarm/aiot01/status` | ESP → FB | online / ts |

### telemetry 예

```json
{
  "t": 26.6,
  "h": 45,
  "soil": 120,
  "cds": 485,
  "fan": 0,
  "rgb": { "r": 0, "g": 0, "b": 0 },
  "buzzer": 0,
  "key": 1,
  "demo": "off",
  "auto": 0,
  "mode": "MANUAL",
  "lcdCustom": false,
  "lcd": "T26.6C H  45% S 12% C1485 F0",
  "wifiFail": 0,
  "httpFail": 0,
  "resetReason": "POWERON",
  "rebootN": 1,
  "ts": 1710000000
}
```

- `soil`은 ADC raw가 아니라 **`((4095 - raw) * 100) / 3000`** (% , 0–100, 건조≈0)
- `auto` / `mode` 설명은 [`docs/auto-control.md`](./auto-control.md) 참고
- `resetReason` / `rebootN` / 복구 정책은 [`docs/firmware-recovery.md`](./firmware-recovery.md) 참고
- `lcd`: 실물 LCD 16×2 **미러** (32자 = 1행16 + 2행16). Wi-Fi/센서/커스텀 문구 모두 포함
- `lcdCustom`: 대시보드 커스텀 LCD 고정 여부 (`true`면 센서 화면 대신 사용자 문구)

### LCD 동기화

실물 패널 ↔ 대시보드(3D·사이드독)는 telemetry `lcd`로 완전 동기화합니다.

1. 부팅·Wi-Fi 메시지 (`setCustomLcd`) → Wi-Fi 연결 직후 `/telemetry/lcd` PUT  
2. 센서 화면 → telemetry 주기(~4s)에 `lcd` 포함  
3. 대시보드 LCD 명령/지우기 → 적용 직후 `/telemetry/lcd` PUT  

대시보드는 `lcdPreview`를 telemetry `lcd`로 갱신합니다 (명령 전송 시 낙관적 갱신 후 실물 반영으로 덮어씀).

### command 예

```json
{ "fan": 1, "rgb": { "r": 255, "g": 0, "b": 0 }, "buzzer": 0, "lcd": "Hello", "demo": "off", "auto": 0 }
```

### demo 모드

| 값 | 동작 |
|----|------|
| `off` | 수동 또는 AUTO |
| `led` | RGB 빨→초→파→흰→끄기 (1.5초) |
| `fan` | 팬 5초 ON / 5초 OFF |
| `lcd` | (호환) LCD는 항상 센서값만 표시 |
| `all` | LED+팬 동시 루프 |

DEMO와 AUTO는 동시에 켤 수 없습니다. AUTO 중 수동 fan/RGB/LCD는 무시됩니다.

LCD 기본 화면은 센서값입니다. (`Txx.xC Hxx%A` / `Sxx% Cxxxx Fx`)  
끝 문자: `A`=AUTO, `!`=ALERT, `D`=DEMO.  
대시보드 LCD 문구는 임시 고정되며, 지우기 시 센서 화면으로 복귀합니다. 표시 내용은 항상 telemetry `lcd`로 웹에 미러됩니다.
## Firebase 콘솔에서 할 일 (사용자)

1. https://console.firebase.google.com/ 에서 프로젝트 생성  
   - 권장 이름: `ai-iot-smartfarm` (또는 자유)
2. **Build → Realtime Database → Create Database**
   - 위치: `asia-southeast1` 등
   - 시작: **테스트 모드** (연수실습용, 만료·규칙 강화 필요)
3. DB URL 복사  
   - 예: `https://xxxx-default-rtdb.asia-southeast1.firebasedatabase.app`
4. (선택) 프로젝트 설정 → 일반 → 웹 앱 추가 → **apiKey** 확인  
   - ESP REST는 테스트 모드면 URL만으로도 PUT/GET 가능
5. 로컬 `firmware/include/secrets.h`에 채우기:

```cpp
#define FIREBASE_HOST "xxxx-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH ""  // 테스트모드면 비워도 됨. 나중에 데이터베이스 시크릿/토큰
#define DEVICE_ID "aiot01"
```

`secrets.h`는 Git에 올리지 않습니다. (`secrets.h.example`만 커밋)

## 보안 주의

테스트 모드 규칙은 **누구나 읽고 쓸 수 있음**.  
연수·개인 실습용으로만 쓰고, 끝나면 규칙을 잠그거나 프로젝트를 삭제하세요.

## 다음 단계

1. 위 콘솔 작업 후 `FIREBASE_HOST` 알려주기 (또는 secrets.h 직접 수정)
2. 펌웨어 업로드 → Console에서 `telemetry` 갱신 확인
3. Console/`command`에 JSON 넣어 팬·RGB 제어 확인
4. 이후 Vercel 대시보드
