# 대구광역시 폭염 취약지역 분석

대구광역시 150개 행정동을 대상으로 실시간 기상위험(H)과 지역
취약성(V)을 곱한 대응 우선순위(P = H × V)를 계산해 네이버 지도 위에
시각화하는 프로젝트입니다. 지역 취약성은 토지피복(불투수면·녹지),
건물밀도, 무더위쉼터 접근성을 결합해 산출하고, 기상위험은 기상청
실시간 관측(체감온도·풍속)으로 매시간 갱신합니다.

## 기술 구성

- FastAPI: 웹 서버와 `/api/realtime-heat-risk` 분석 결과 API
- Jinja2: 지도 화면 렌더링
- Naver Maps JavaScript API: 지도, 행정동 폴리곤, 검색·필터·선택
- GeoJSON: 대구 행정동 150개, 대구 외곽선, 외부 마스크
- 기상청 초단기실황 API: 체감온도·풍속 실시간 수집(SQLite 캐시)

## 실행

프로젝트 루트의 `.env`에 네이버 지도 Client ID를 설정합니다.

```env
NAVER_MAP_CLIENT_ID=발급받은_클라이언트_ID
```

```powershell
uv run python -m uvicorn main:app --reload
```

브라우저에서 `http://127.0.0.1:8000`을 엽니다.

## 데이터 폴더

- `data/processed/heat_indicators.csv`: 행정동 150개 토지피복 지표(불투수면·녹지)
- `data/processed/building_density_by_dong.csv`: 행정동 150개 건물밀도
- `data/processed/shelter_access_by_dong.csv`: 행정동별 인구·쉼터 요약
- `data/processed/shelter_access_detail.json`: 쉼터별 운영시간 상세
- `data/processed/cooling_shelters.json`: 지도에 표시하는 쉼터 좌표·정보
- `data/runtime/weather_observations.sqlite3`: 기상청 실황 캐시(서버 실행 중 자동 생성)

용량과 원본 보존을 위해 `data/raw`는 Git에서 제외하며, 실행에 필요한
`data/processed` 결과만 버전 관리 대상으로 예외 처리했습니다.

## 점수체계

실시간 기상위험(H) × 지역취약성(V) 계산식, 등급 기준, 코드 구조는
[`docs/realtime_heat_risk_scoring.md`](docs/realtime_heat_risk_scoring.md)에
정리했습니다.

## 가공 재실행

쉼터 원본과 인구 자료가 준비된 상태에서 다음을 실행합니다.

```powershell
uv run python scripts/preprocess_shelter_access.py
```

## 현재 지도 기능

- 군위군을 포함한 대구광역시 행정동 150개 표시
- 대구 외부 마스크와 전체 외곽선
- 행정동 검색, 자동 확대, 클릭 선택, 호버 정보창
- 구·군 및 대응 우선순위 단계 필터
- 선택 행정동의 실시간 기상위험·열환경·쉼터 접근성 상세
- 구·군 선택 시 오른쪽 패널의 구·군 평균·상하위 동·시설 정보
- 취약지역 상위 5곳과 하위 5곳 순위 및 지도 바로가기
- 첫 화면을 행정동을 구분할 수 있는 도심 확대 수준으로 표시
- 행정동 경계 표시 전환, 지도 초기화, 반응형 레이아웃

## 분석 한계

- 5km 기상 격자값은 행정동 내부의 미세기후와 다를 수 있습니다.
- 건물밀도는 높이·층수·바람길을 포함하지 않는 수평 건물 피복률입니다.
- 쉼터 밀도의 분모는 행정동 총인구이며 실제 주간 체류인구는 반영하지
  않습니다.
- 현재 점수는 정책 확정 지수가 아닌 상대 비교용 탐색 모형입니다. 정책
  활용 전 표면온도·독거노인·기초생활수급 자료 보강과 현장 검증이
  필요합니다.

## 주요 코드

- `main.py`: FastAPI 앱과 실시간 폭염위험 API
- `templates/map.html`: 지도 화면
- `static/js/map.js`: 네이버 지도와 GeoJSON·분석 데이터 결합
- `heat_risk/`: 실시간 점수 계산(기상위험, 열환경, 쉼터 접근성)
- `scripts/preprocess_shelter_access.py`: 쉼터·인구 원자료 결합
