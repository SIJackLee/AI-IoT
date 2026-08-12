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
  "soil": 0,
  "cds": 485,
  "fan": 0,
  "rgb": { "r": 0, "g": 0, "b": 0 },
  "buzzer": 0,
  "key": 1,
  "ts": 1710000000
}
```

### command 예

```json
{ "fan": 1, "rgb": { "r": 255, "g": 0, "b": 0 }, "buzzer": 0, "lcd": "Hello" }
```

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
