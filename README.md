# AI-IoT

캠틱(전주) **스마트농업 AI-IoT 제어 기초** 연수 과정 보존용 저장소입니다.  
수업·집·회사에서 같은 자료를 Git으로 동기화합니다.

## 과정 개요

센서 측정 → IoT 통신 → 제어(Setpoint/PID) → 시뮬레이션 → AI 기초를  
스마트팜 맥락에서 연결하는 융합 기초 과정입니다.

## 폴더 구조

| 경로 | 용도 |
|------|------|
| `notes/` | 수업 필기, 사전평가·복습 정리 |
| `python/` | Python·AI·데이터 실습 |
| `firmware/` | PlatformIO 펌웨어 (Cursor) |
| `arduino/` | Arduino 스케치 (보조) |
| `mqtt/` | MQTT 예제·토픽 정리 |
| `docs/` | 환경 세팅·과정 문서 |

## 빠른 시작 (새 PC)

1. Git, Python 3.11 설치 ([환경세팅](docs/환경세팅.md) 참고)
2. 이 저장소 clone
3. 가상환경 생성 및 패키지 설치

```bash
git clone https://github.com/SIJackLee/AI-IoT.git
cd AI-IoT
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
pip install -r requirements-ml.txt
pip install -r requirements-dl.txt
pip install platformio
```

4. 환경변수 파일 준비

```bash
copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux
```

`.env`에는 실제 키·비밀번호만 넣고, **커밋하지 마세요.**

5. Cursor에서 PlatformIO IDE 확장을 설치합니다 (Extensions 검색).  
   상세는 [docs/환경세팅.md](docs/환경세팅.md) 참고.

## 검증

```bash
python -c "import numpy, pandas, sklearn, paho.mqtt; print('base ok')"
python -c "import tensorflow as tf, torch; print(tf.__version__, torch.__version__)"
pio --version
cd firmware && pio run -e uno
```

## 동기화

```bash
git pull
git add .
git commit -m "docs: 수업 내용 정리"
git push
```

## 라이선스·주의

- 수업 배포 자료의 저작권은 원 기관·강사 정책을 따릅니다.
- API Key, 토큰, 개인정보는 저장소에 올리지 않습니다.
