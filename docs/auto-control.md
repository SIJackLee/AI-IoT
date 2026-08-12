# 자동제어 (AUTO)

펌웨어 `runAuto()`가 센서 값으로 FAN·RGB를 제어합니다. **부저는 사용하지 않습니다.**

## 우선순위

1. **P0** DEMO / 대시보드 수동 / 전체 끄기
2. **P1** R5 (고온+건조) — RGB 빨강, FAN ON
3. **P2** R1·R2 팬 OR, R3 건조(주황), R4 저조도(보조광)

AUTO와 DEMO는 상호 배타입니다. AUTO ON 시 수동 fan/RGB/LCD는 잠깁니다.

## 임계값 (히스테리시스)

| 규칙 | ON | OFF |
|------|----|-----|
| R1 온도 | T ≥ 28°C | T ≤ 26°C (습도도 OFF 조건) |
| R2 습도 | H ≥ 70% | H ≤ 60% |
| R3 토양 | soil ≤ 800 | soil ≥ 1200 → 주황 RGB |
| R4 조도 | cds ≤ 500 | cds ≥ 900 → 약백 RGB |
| R5 위험 | T ≥ 30 그리고 soil ≤ 600 | 정상 복귀 |

팬은 최소 ON 시간 5초를 둡니다.

## Firebase

### command

```json
{ "auto": 1, "demo": "off", "fan": 0, "rgb": { "r": 0, "g": 0, "b": 0 }, "buzzer": 0 }
```

### telemetry 추가 필드

- `auto`: `0|1`
- `mode`: `MANUAL` | `AUTO` | `ALERT` | `DEMO`

LCD 1행 끝 문자: `A`(AUTO) / `!`(ALERT) / `D`(DEMO)

## 키(GPIO19)

짧게 누르면 AUTO ↔ MANUAL 토글. DEMO 중이면 DEMO 해제 후 AUTO ON.
