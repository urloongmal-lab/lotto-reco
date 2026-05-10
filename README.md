# 로또 번호 회피 규칙 추천기

브라우저에서 동작하는 정적 웹 서비스입니다.

## 배포

- GitHub 연동 후 Vercel에 배포
- 기본 도메인으로 접속 가능

## 로컬 실행

```bash
python3 -m http.server 8000 --directory /Users/kafka/.openclaw/workspace/lotto-reco
```

브라우저에서:

```text
http://127.0.0.1:8000/
```

## 기능

- 로또 전수 데이터(`latest.json`) 로드
- 홀짝 / 구간 / 연속수 / 직전회차 중복 회피 가중치 조절
- 5개 단위 추천 재생성
- 최신화 버튼으로 원격 최신 데이터 확인

## 최신화 동작

- 현재 시각(KST) 기준 최신 회차를 계산한 뒤 원격 최신 데이터를 다시 읽어옵니다.
- GitHub raw JSON은 캐시를 피하도록 매번 캐시버스트해서 가져옵니다.
- 원본 데이터가 아직 갱신되지 않았으면, 현재 시각 기준 기대 회차와 함께 그 사실을 알려줍니다.
- 브라우저는 파일 시스템에 직접 저장하지 못하므로, 데이터 갱신은 배포본의 `latest.json` 또는 외부 데이터 소스 교체로 처리합니다.

## 토큰 없이 10% 단위 사용량 알림

`openclaw status --usage`는 로컬 상태 조회라서 LLM 토큰을 쓰지 않습니다.

- 스크립트: `scripts/notify_usage_bucket.sh`
- launchd 예시: `scripts/com.kafka.openclaw-usage-bucket.plist.example`

설정한 뒤에는 macOS `launchd`로 돌리면 됩니다.
