# 펌웨어 복구 Phase A + B + C

`main.cpp` 적용.

## Phase A — 연속 실패 → 강제 리부팅

1. **soft**: Wi-Fi 끊김 시 FAN/모드 정리 후 `wifiConnect()` 재시도
2. **카운터**: `wifiFailN`, `httpFailN`
3. **escalate**: 임계 초과 시 `safeShutdown()` → `ESP.restart()`

| 조건 | 임계 |
|------|------|
| Wi-Fi 재연결 실패 | 연속 **5회** |
| Wi-Fi 다운 지속 | **120초** |
| Firebase GET/PUT 실패 | 연속 **10회** |

`safeShutdown`: FAN/RGB/부저 OFF, DEMO·AUTO 해제, LCD `REBOOT` + 사유

## Phase B — Task Watchdog

- `esp_task_wdt_init(12s, panic=true)` + loop 태스크 등록
- `wdtFeed()` = `esp_task_wdt_reset()`
- feed: `loop`, `wifiConnect`, `applyFan` 램프, Firebase 전후

HTTPS가 **12초 이상 hang**이면 WDT가 리셋합니다.

## Phase C — 부트 원인 · 리부트 카운트

- `esp_reset_reason()` → `resetReason` 문자열
- `RTC_DATA_ATTR rebootN` (전원 OFF 시 magic 초기화 후 1부터)
- 부팅 LCD: `REASON` / `N{count}`
- telemetry · status에 `resetReason`, `rebootN` 포함

| resetReason | 의미 |
|-------------|------|
| `POWERON` | 전원 인가 |
| `SW` | `ESP.restart()` (Phase A escalate 등) |
| `TASK_WDT` | Task Watchdog 만료 |
| `PANIC` | 패닉 |
| `BROWNOUT` | 전압 강하 |
| 기타 | `INT_WDT`, `WDT`, `EXT`, … |
