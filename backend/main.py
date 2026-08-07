# app구현

import csv
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
# jisu_03_추가 / 팝업 / HTTPException 추가
# jisu_08_추가 / 무더위 쉼터 / Query 추가
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# jisu_03_추가 / 팝업
import math
import sqlite3
import threading
import time
from contextlib import closing
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request as URLRequest, urlopen

# 현용 점수체계 수정 26-08-06 13-00
from heat_risk import HeatRiskDataRepository, calculate_realtime_heat_risk

# 태경 commit merge 26-08-06 15-33
from weather_forecast import fetch_12hour_temperature_forecast


BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")

app = FastAPI(
    title="대구광역시 폭염 취약지역 분석"
)

app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static"),
    name="static",
)

templates = Jinja2Templates(
    directory=BASE_DIR / "templates"
)

NAVER_LOCAL_SEARCH_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local"
HEAT_INDICATORS_FILE = BASE_DIR / "data" / "processed" / "heat_indicators.csv"

# jisu_03_추가 -> 행정동 경계 및 실시간 기상 데이터 설정-------------#
REGION_DATA_FILE = (
    BASE_DIR / "static" / "data" / "daegu_administrative_dong.geojson"
)
WEATHER_DB_FILE = BASE_DIR / "data" / "runtime" / "weather_observations.sqlite3"

# jisu_08_추가 / 무더위쉼터 좌표 데이터-------------#
SHELTER_DATA_FILE = (
    BASE_DIR / "data" / "processed" / "cooling_shelters.json"
)
HEAT_RISK_REPOSITORY = HeatRiskDataRepository(BASE_DIR / "data" / "processed")
# 08--------------------------------------------#
KMA_WARNING_API_URL = (
    "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus"
)
KMA_CURRENT_WEATHER_API_URL = (
    "https://apis.data.go.kr/1360000/"
    # 초단기실황 getUltraSrtNcst / 초단기예보 getUltraSrtFcst
    "VilageFcstInfoService_2.0/getUltraSrtNcst"
)

KMA_ALERT_CACHE: dict[str, Any] = {"expires_at": 0.0, "items": []}
KOREA_TIMEZONE = timezone(timedelta(hours=9))
WEATHER_SCHEDULER_STOP = threading.Event()
WEATHER_SCHEDULER_THREAD: threading.Thread | None = None
#-------------------------------------------------------------------#

# jisu_01_추가 -> 수정한 코드가 최신 상태로 보이게만 하는 기능-------------#
@app.middleware("http")
async def disable_static_cache(request: Request, call_next):
    """개발 중 이전 지도 스크립트가 브라우저 캐시에 남지 않게 한다."""
    response = await call_next(request)

    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response
#----------------------------------------------------------------#

# jisu_03_추가 / 팝업 / 날씨 데이터 처리 함수----------------------------------#
@lru_cache(maxsize=1)
def load_region_names() -> dict[str, dict[str, str]]:
    """행정동 코드별 구·군·동 이름을 메모리에 캐시한다."""
    try:
        with HEAT_INDICATORS_FILE.open(
            "r", encoding="utf-8-sig", newline=""
        ) as csv_file:
            rows = list(csv.DictReader(csv_file))
    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail="행정동 이름 데이터를 읽을 수 없습니다.",
        ) from error

    return {str(row.get("adm_cd", "")): row for row in rows}


@lru_cache(maxsize=1)
def load_region_payload() -> dict[str, Any]:
    """행정동 경계 GeoJSON을 메모리에 캐시한다."""
    try:
        payload = json.loads(REGION_DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=500,
            detail="행정동 경계 데이터를 읽을 수 없습니다.",
        ) from error

    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        raise HTTPException(
            status_code=500,
            detail="행정동 경계 데이터 형식이 올바르지 않습니다.",
        )

    return payload


def find_region_feature(region_code: str) -> dict[str, Any]:
    """행정동 코드와 일치하는 GeoJSON Feature를 찾아 반환한다."""
    for feature in load_region_payload()["features"]:
        properties = feature.get("properties", {})
        if str(properties.get("ADM_CD", "")) == region_code:
            return feature

    raise HTTPException(status_code=404, detail="행정동을 찾을 수 없습니다.")


def find_vulnerability_record(region_code: str) -> dict[str, Any]:
    """행정동 코드와 일치하는 구·군·동 이름 레코드를 반환한다."""
    record = load_region_names().get(str(region_code))
    if record is not None:
        return record

    raise HTTPException(
        status_code=404,
        detail="해당 행정동의 취약도 분석 결과가 없습니다.",
    )


def iter_geometry_coordinates(value: Any):
    """Polygon·MultiPolygon의 중첩 좌표를 경도·위도 쌍으로 평탄화한다."""
    if (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        yield float(value[0]), float(value[1])
        return

    if isinstance(value, list):
        for child in value:
            yield from iter_geometry_coordinates(child)


def get_region_center(region_code: str) -> tuple[float, float]:
    """외부 날씨 API 조회에 사용할 행정동 대표 위경도를 계산한다."""
    # 외부 날씨 API에 전달할 대표 좌표다. 지도 경계 자체를 단순화하지 않고
    # 모든 꼭짓점의 평균만 계산하므로 이 값은 화면 표시용 중심점이 아니다.
    feature = find_region_feature(region_code)
    coordinates = list(
        iter_geometry_coordinates(feature.get("geometry", {}).get("coordinates"))
    )
    if not coordinates:
        raise HTTPException(status_code=500, detail="행정동 중심 좌표가 없습니다.")

    longitude = sum(point[0] for point in coordinates) / len(coordinates)
    latitude = sum(point[1] for point in coordinates) / len(coordinates)
    return latitude, longitude


def convert_to_kma_grid(latitude: float, longitude: float) -> tuple[int, int]:
    """위경도를 기상청 단기예보 5km 격자 좌표(nx, ny)로 변환한다."""
    earth_radius = 6371.00877
    grid_spacing = 5.0
    standard_latitude_1 = math.radians(30.0)
    standard_latitude_2 = math.radians(60.0)
    reference_longitude = math.radians(126.0)
    reference_latitude = math.radians(38.0)
    origin_x = 43.0
    origin_y = 136.0

    re = earth_radius / grid_spacing
    sn = math.tan(math.pi * 0.25 + standard_latitude_2 * 0.5) / math.tan(
        math.pi * 0.25 + standard_latitude_1 * 0.5
    )
    sn = math.log(math.cos(standard_latitude_1) / math.cos(standard_latitude_2)) / math.log(sn)
    sf = (
        math.tan(math.pi * 0.25 + standard_latitude_1 * 0.5) ** sn
        * math.cos(standard_latitude_1)
        / sn
    )
    ro = (
        re
        * sf
        / math.tan(math.pi * 0.25 + reference_latitude * 0.5) ** sn
    )
    ra = (
        re
        * sf
        / math.tan(math.pi * 0.25 + math.radians(latitude) * 0.5) ** sn
    )
    theta = math.radians(longitude) - reference_longitude
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    nx = int(ra * math.sin(theta) + origin_x + 0.5)
    ny = int(ro - ra * math.cos(theta) + origin_y + 0.5)
    return nx, ny


def calculate_apparent_temperature(temperature: float, humidity: float) -> float:
    """2022년 이후 기상청 여름철 산출식으로 체감온도를 계산한다."""
    # 기상청 산출식의 Tw는 직접 관측값이 아니므로 Stull 추정식으로 습구온도를
    # 먼저 구한다. 상대습도는 API의 정상 범위인 0~100% 안으로 제한한다.
    relative_humidity = min(max(humidity, 0.0), 100.0)
    wet_bulb_temperature = (
        temperature
        * math.atan(0.151977 * math.sqrt(relative_humidity + 8.313659))
        + math.atan(temperature + relative_humidity)
        - math.atan(relative_humidity - 1.676331)
        + 0.00391838
        * relative_humidity**1.5
        * math.atan(0.023101 * relative_humidity)
        - 4.686035
    )
    apparent_temperature = (
        -0.2442
        + 0.55399 * wet_bulb_temperature
        + 0.45535 * temperature
        - 0.0022 * wet_bulb_temperature**2
        + 0.00278 * wet_bulb_temperature * temperature
        + 3.0
    )
    return round(apparent_temperature, 1)


def initialize_weather_database() -> None:
    """시간별 기상 실황을 저장할 SQLite 테이블과 인덱스를 준비한다."""
    WEATHER_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    # sqlite3 연결의 context manager는 커밋만 하고 연결은 닫지 않으므로
    # Windows 파일 잠금을 방지하기 위해 closing으로 즉시 닫는다.
    with closing(sqlite3.connect(WEATHER_DB_FILE, timeout=10)) as connection:
        # WAL 모드는 자동 수집 스레드가 기록하는 동안 API 조회가 대기하는 일을
        # 줄여 주며, nx·ny·관측시각 조합은 한 번만 저장하도록 제한한다.
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS weather_observations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nx INTEGER NOT NULL,
                ny INTEGER NOT NULL,
                observed_at TEXT NOT NULL,
                base_date TEXT NOT NULL,
                base_time TEXT NOT NULL,
                temperature REAL,
                humidity REAL,
                apparent_temperature REAL,
                precipitation_type INTEGER,
                wind_speed REAL,
                precipitation_1h REAL,
                raw_observations TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                UNIQUE (nx, ny, observed_at)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_weather_grid_time
            ON weather_observations (nx, ny, observed_at DESC)
            """
        )
        connection.commit()

'''확인필요 데이터 끌고 오는 시간 기준'''
def current_kma_base_datetime(now: datetime | None = None) -> datetime:
    """초단기실황 제공 지연을 고려해 현재 조회 가능한 정시를 계산한다."""
    current_time = now or datetime.now(KOREA_TIMEZONE)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=KOREA_TIMEZONE)
    # 실황은 매시 10분 이후 제공하므로 11로 수정
    return (current_time - timedelta(minutes=11)).replace(
        minute=0,
        second=0,
        microsecond=0,
    )


def parse_observation_number(
    observations: dict[str, Any],
    category: str,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float | None:
    """기상청 실황값을 유한한 실수로 변환하고 허용 범위를 검사한다."""
    try:
        value = float(observations[category])
    except (KeyError, TypeError, ValueError):
        return None
    if not math.isfinite(value):
        return None
    if minimum is not None and value < minimum:
        return None
    if maximum is not None and value > maximum:
        return None
    return value


def fetch_kma_observation(
    nx: int,
    ny: int,
    base_datetime: datetime | None = None,
) -> dict[str, Any]:
    """기상청 getUltraSrtNcst에서 한 격자의 시간별 실황을 조회한다."""
    service_key = os.getenv("KMA_SERVICE_KEY", "").strip()
    if not service_key:
        raise RuntimeError("KMA_SERVICE_KEY가 설정되지 않았습니다.")

    requested_at = base_datetime or current_kma_base_datetime()
    query = urlencode(
        {
            "ServiceKey": service_key,
            "pageNo": 1,
            "numOfRows": 1000,
            "dataType": "JSON",
            "base_date": requested_at.strftime("%Y%m%d"),
            "base_time": requested_at.strftime("%H00"),
            "nx": nx,
            "ny": ny,
        }
    )
    with urlopen(f"{KMA_CURRENT_WEATHER_API_URL}?{query}", timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))

    response_payload = payload.get("response", {}) if isinstance(payload, dict) else {}
    if not isinstance(response_payload, dict):
        raise ValueError("기상청 응답 본문 형식이 올바르지 않습니다.")
    header = response_payload.get("header", {})
    if str(header.get("resultCode", "")) not in {"00", "0"}:
        raise ValueError(
            f"기상청 API 오류: {header.get('resultMsg', '응답을 확인할 수 없습니다.')}"
        )

    body = response_payload.get("body", {})
    items_container = body.get("items", {}) if isinstance(body, dict) else {}
    items = items_container.get("item", []) if isinstance(items_container, dict) else []
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list) or not items:
        raise ValueError("기상청 초단기실황 항목이 없습니다.")

    valid_items = [item for item in items if isinstance(item, dict)]
    if not valid_items:
        raise ValueError("기상청 초단기실황 항목 형식이 올바르지 않습니다.")
    observations = {
        str(item.get("category", "")): item.get("obsrValue")
        for item in valid_items
    }
    temperature = parse_observation_number(observations, "T1H", -80, 60)
    humidity = parse_observation_number(observations, "REH", 0, 100)
    if temperature is None and humidity is None:
        raise ValueError("기온과 습도 실황값이 없습니다.")

    # 응답의 baseDate/baseTime을 저장해 서버 요청시각이 아니라 실제 기상청
    # 발표시각을 기준으로 시간별 데이터가 구분되도록 한다.
    first_item = valid_items[0]
    base_date = str(first_item.get("baseDate") or requested_at.strftime("%Y%m%d"))
    base_time = str(first_item.get("baseTime") or requested_at.strftime("%H00")).zfill(4)
    observed_at = datetime.strptime(
        f"{base_date}{base_time}", "%Y%m%d%H%M"
    ).replace(tzinfo=KOREA_TIMEZONE)
    precipitation_value = parse_observation_number(observations, "PTY", 0)

    return {
        "nx": nx,
        "ny": ny,
        "observed_at": observed_at.isoformat(timespec="minutes"),
        "base_date": base_date,
        "base_time": base_time,
        "temperature": temperature,
        "humidity": humidity,
        "apparent_temperature": (
            calculate_apparent_temperature(temperature, humidity)
            if temperature is not None and humidity is not None
            else None
        ),
        "precipitation_type": (
            int(precipitation_value) if precipitation_value is not None else 0
        ),
        "wind_speed": parse_observation_number(observations, "WSD", 0),
        "precipitation_1h": parse_observation_number(observations, "RN1", 0),
        "raw_observations": observations,
        "fetched_at": datetime.now(KOREA_TIMEZONE).isoformat(timespec="seconds"),
    }


def save_weather_observation(observation: dict[str, Any]) -> None:
    """한 격자의 정시 실황을 중복 없이 SQLite에 저장하거나 갱신한다."""
    initialize_weather_database()
    with closing(sqlite3.connect(WEATHER_DB_FILE, timeout=10)) as connection:
        connection.execute(
            """
            INSERT INTO weather_observations (
                nx, ny, observed_at, base_date, base_time, temperature,
                humidity, apparent_temperature, precipitation_type,
                wind_speed, precipitation_1h, raw_observations, fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(nx, ny, observed_at) DO UPDATE SET
                temperature = excluded.temperature,
                humidity = excluded.humidity,
                apparent_temperature = excluded.apparent_temperature,
                precipitation_type = excluded.precipitation_type,
                wind_speed = excluded.wind_speed,
                precipitation_1h = excluded.precipitation_1h,
                raw_observations = excluded.raw_observations,
                fetched_at = excluded.fetched_at
            """,
            (
                observation["nx"],
                observation["ny"],
                observation["observed_at"],
                observation["base_date"],
                observation["base_time"],
                observation["temperature"],
                observation["humidity"],
                observation["apparent_temperature"],
                observation["precipitation_type"],
                observation["wind_speed"],
                observation["precipitation_1h"],
                json.dumps(observation["raw_observations"], ensure_ascii=False),
                observation["fetched_at"],
            ),
        )
        connection.commit()


def get_weather_observation(
    nx: int,
    ny: int,
    observed_at: datetime | None = None,
) -> dict[str, Any] | None:
    """격자와 선택 시각에 맞는 저장 실황 또는 가장 최신 실황을 조회한다."""
    initialize_weather_database()
    connection = sqlite3.connect(WEATHER_DB_FILE, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        if observed_at is not None:
            row = connection.execute(
                """
                SELECT * FROM weather_observations
                WHERE nx = ? AND ny = ? AND observed_at = ?
                LIMIT 1
                """,
                (nx, ny, observed_at.isoformat(timespec="minutes")),
            ).fetchone()
        else:
            row = connection.execute(
                """
                SELECT * FROM weather_observations
                WHERE nx = ? AND ny = ?
                ORDER BY observed_at DESC
                LIMIT 1
                """,
                (nx, ny),
            ).fetchone()
    finally:
        connection.close()
    return dict(row) if row is not None else None


@lru_cache(maxsize=1)
def get_all_kma_grids() -> tuple[tuple[int, int], ...]:
    """대구 행정동 150개를 중복 없는 기상청 격자 목록으로 변환한다."""
    grids: set[tuple[int, int]] = set()
    for feature in load_region_payload()["features"]:
        coordinates = list(
            iter_geometry_coordinates(feature.get("geometry", {}).get("coordinates"))
        )
        if not coordinates:
            continue
        longitude = sum(point[0] for point in coordinates) / len(coordinates)
        latitude = sum(point[1] for point in coordinates) / len(coordinates)
        grids.add(convert_to_kma_grid(latitude, longitude))
    return tuple(sorted(grids))


def collect_hourly_weather() -> dict[str, int]:
    """현재 조회 가능한 정시 실황을 대구의 모든 고유 격자에 저장한다."""
    base_datetime = current_kma_base_datetime()
    collected = 0
    failed = 0
    for nx, ny in get_all_kma_grids():
        # 같은 시간의 격자가 이미 있으면 재호출하지 않아 공공 API 한도를 아낀다.
        if get_weather_observation(nx, ny, base_datetime) is not None:
            continue
        try:
            save_weather_observation(fetch_kma_observation(nx, ny, base_datetime))
            collected += 1
        except (HTTPError, URLError, TimeoutError, UnicodeError, OSError, ValueError, RuntimeError):
            failed += 1
    return {"collected": collected, "failed": failed}


def seconds_until_next_weather_update(now: datetime | None = None) -> float:
    """다음 매시 11분 자동 수집까지 남은 초를 계산한다."""
    current_time = now or datetime.now(KOREA_TIMEZONE)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=KOREA_TIMEZONE)
    next_update = current_time.replace(minute=11, second=0, microsecond=0) # 11분에 수집
    if next_update <= current_time:
        next_update += timedelta(hours=1)
    return max((next_update - current_time).total_seconds(), 0.0)


def weather_scheduler_loop():
    """서버 실행 중 매시 11분에 기상 실황 수집 작업을 반복한다."""
    # 시작 직후에도 한 번 수집해 11분까지 기다리지 않고 최신 DB를 준비한다.
    collect_hourly_weather()
    while not WEATHER_SCHEDULER_STOP.wait(seconds_until_next_weather_update()):
        collect_hourly_weather()


def start_weather_scheduler() -> None:
    """FastAPI 시작 시 기상 수집용 백그라운드 스레드를 한 번만 실행한다."""
    global WEATHER_SCHEDULER_THREAD
    initialize_weather_database()
    if WEATHER_SCHEDULER_THREAD and WEATHER_SCHEDULER_THREAD.is_alive():
        return
    WEATHER_SCHEDULER_STOP.clear()
    WEATHER_SCHEDULER_THREAD = threading.Thread(
        target=weather_scheduler_loop,
        name="kma-weather-scheduler",
        daemon=True,
    )
    WEATHER_SCHEDULER_THREAD.start()


def stop_weather_scheduler() -> None:
    """FastAPI 종료 시 자동 수집 스레드의 대기를 안전하게 해제한다."""
    WEATHER_SCHEDULER_STOP.set()
    if WEATHER_SCHEDULER_THREAD and WEATHER_SCHEDULER_THREAD.is_alive():
        WEATHER_SCHEDULER_THREAD.join(timeout=2)

#------------------------------------------------------------------------#

# jisu_03_추가 / 서버 실행 중 날씨 수집을 시작하고 종료 시 정리한다.
@app.on_event("startup")
def handle_startup() -> None:
    """SQLite를 준비하고 시간별 기상 실황 자동 수집을 시작한다."""
    start_weather_scheduler()


@app.on_event("shutdown")
def handle_shutdown() -> None:
    """서버 종료 과정에서 기상 실황 자동 수집을 중단한다."""
    stop_weather_scheduler()

# jisu_08_추가 / 무더위쉼터 데이터 처리---------------------------------#
@lru_cache(maxsize=1)
def load_shelters() -> list[dict[str, Any]]:
    """무더위쉼터 JSON 파일을 읽어 메모리에 캐시한다."""
    if not SHELTER_DATA_FILE.exists():
        return []

    try:
        payload = json.loads(SHELTER_DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=500,
            detail="무더위쉼터 좌표 데이터를 읽을 수 없습니다.",
        ) from error

    shelters = (
        payload.get("shelters", payload)
        if isinstance(payload, dict)
        else payload
    )

    if not isinstance(shelters, list):
        raise HTTPException(
            status_code=500,
            detail="무더위쉼터 데이터 형식이 올바르지 않습니다.",
        )

    return shelters


def point_in_ring(
    longitude: float,
    latitude: float,
    ring: list[Any],
) -> bool:
    """위·경도 좌표가 하나의 다각형 고리 안에 있는지 확인한다."""
    if not isinstance(ring, list) or len(ring) < 3:
        return False

    inside = False
    previous = ring[-1]

    for current in ring:
        try:
            current_longitude = float(current[0])
            current_latitude = float(current[1])
            previous_longitude = float(previous[0])
            previous_latitude = float(previous[1])
        except (IndexError, TypeError, ValueError):
            previous = current
            continue

        crosses_latitude = (
            current_latitude > latitude
        ) != (
            previous_latitude > latitude
        )

        if crosses_latitude:
            intersection_longitude = (
                (previous_longitude - current_longitude)
                * (latitude - current_latitude)
                / (previous_latitude - current_latitude)
                + current_longitude
            )

            if longitude < intersection_longitude:
                inside = not inside

        previous = current

    return inside


def geometry_contains_point(
    geometry: dict[str, Any],
    longitude: float,
    latitude: float,
) -> bool:
    """좌표가 Polygon 또는 MultiPolygon 행정동 경계 안에 있는지 확인한다."""
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates", [])

    if geometry_type == "Polygon":
        polygons = [coordinates]
    elif geometry_type == "MultiPolygon":
        polygons = coordinates
    else:
        return False

    for polygon in polygons:
        if not polygon or not point_in_ring(longitude, latitude, polygon[0]):
            continue

        # 첫 번째 고리는 외곽선이며 이후 고리는 다각형 내부의 빈 영역이다.
        if not any(
            point_in_ring(longitude, latitude, hole)
            for hole in polygon[1:]
        ):
            return True

    return False


def haversine_distance(
    latitude: float,
    longitude: float,
    target_latitude: float,
    target_longitude: float,
) -> float:
    """두 위·경도 사이의 직선거리를 미터 단위로 계산한다."""
    from math import asin, cos, radians, sin, sqrt

    latitude_delta = radians(target_latitude - latitude)
    longitude_delta = radians(target_longitude - longitude)
    start_latitude = radians(latitude)
    end_latitude = radians(target_latitude)

    value = (
        sin(latitude_delta / 2) ** 2
        + cos(start_latitude)
        * cos(end_latitude)
        * sin(longitude_delta / 2) ** 2
    )

    return 6_371_000 * 2 * asin(sqrt(value))
# 08 -----------------------------------------------#


@app.get("/")
def root(request: Request):
    """지도 API 설정과 정적 파일 버전을 포함해 메인 화면을 렌더링"""
    client_id = os.getenv("NAVER_MAP_CLIENT_ID", "")

    # jisu_01_추가 / 캐시방지
    # CSS 또는 JavaScript가 수정되면 주소에 붙는 버전 번호도 변경된다.------#
    static_version = max(
        int((BASE_DIR / "static" / "js" / "map.js").stat().st_mtime),
        int((BASE_DIR / "static" / "css" / "map.css").stat().st_mtime),
    )
    # ---------------------------------------------------------------#

    return templates.TemplateResponse(
        request=request,
        name="map.html",
        context={
            "naver_map_client_id": client_id,
            "map_api_configured": bool(client_id),
            "static_version": static_version,
        },
    )


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "map_api_configured": bool(
            os.getenv("NAVER_MAP_CLIENT_ID")
        ),
    }


@app.get("/api/place-search")
def place_search(
    query: str = Query(..., min_length=1, max_length=100),
):
    """네이버 지역 검색 결과 중 대구에 있는 장소만 반환한다."""
    client_id = os.getenv("NAVER_SEARCH_CLIENT_ID", "").strip()
    client_secret = os.getenv("NAVER_SEARCH_CLIENT_SECRET", "").strip()

    # 검색 키가 없어도 브라우저의 행정동 자동완성은 계속 사용할 수 있다.
    if not client_id or not client_secret:
        return {
            "status": "unconfigured",
            "items": [],
            "message": "네이버 장소 검색 API가 설정되지 않았습니다.",
        }

    search_query = query.strip()
    if not search_query:
        raise HTTPException(status_code=400, detail="검색어를 입력해 주세요.")

    if "대구" not in search_query:
        search_query = f"대구 {search_query}"

    search_params = urlencode({
        'query': search_query,
        'display': 5,
        'start': 1,
        'sort': 'random',
    })
    request_url = f"{NAVER_LOCAL_SEARCH_URL}?{search_params}"
    search_request = URLRequest(
        request_url,
        headers={
            "X-NCP-APIGW-API-KEY-ID": client_id,
            "X-NCP-APIGW-API-KEY": client_secret,
        },
    )

    try:
        with urlopen(search_request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        return JSONResponse(
            status_code=502,
            content={
                "status": "error",
                "items": [],
                "message": f"네이버 장소 검색에 실패했습니다. 응답 상태: {error.code}",
            },
        )
    except URLError:
        return JSONResponse(
            status_code=504,
            content={
                "status": "error",
                "items": [],
                "message": "네이버 장소 검색 서버에 연결할 수 없습니다.",
            },
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return JSONResponse(
            status_code=502,
            content={
                "status": "error",
                "items": [],
                "message": "네이버 장소 검색 결과를 읽을 수 없습니다.",
            },
        )

    items = []
    for item in payload.get("items", []):
        title = re.sub(r"<[^>]+>", "", str(item.get("title", ""))).strip()
        address = str(item.get("address", "")).strip()
        road_address = str(item.get("roadAddress", "")).strip()

        if "대구" not in f"{address} {road_address}":
            continue

        items.append(
            {
                "title": title,
                "category": str(item.get("category", "")).strip(),
                "address": address,
                "road_address": road_address,
                "mapx": str(item.get("mapx", "")).strip(),
                "mapy": str(item.get("mapy", "")).strip(),
            }
        )

    return {"status": "ready", "items": items, "message": None}

# jisu_03_추가 / 팝업 / 날씨 API 추가---------------------------------------------------#

@app.get("/api/weather/{region_code}")
def region_weather(region_code: str):
    """선택 행정동의 최신 초단기실황을 시간별 DB에서 조회한다."""
    record = find_vulnerability_record(region_code)
    latitude, longitude = get_region_center(region_code)
    nx, ny = convert_to_kma_grid(latitude, longitude)
    target_datetime = current_kma_base_datetime()
    observation = get_weather_observation(nx, ny, target_datetime)
    collection_failed = False

    # 자동 수집 전 처음 선택된 격자는 한 번 즉시 저장한 뒤 DB 값으로 응답한다.
    if observation is None and os.getenv("KMA_SERVICE_KEY", "").strip():
        try:
            save_weather_observation(fetch_kma_observation(nx, ny, target_datetime))
            observation = get_weather_observation(nx, ny, target_datetime)
        except (
            HTTPError,
            URLError,
            TimeoutError,
            UnicodeError,
            json.JSONDecodeError,
            OSError,
            ValueError,
            RuntimeError,
        ):
            collection_failed = True

    # 최신 정시 수집이 실패한 경우에도 이전 DB 실황이 있으면 서비스가 끊기지
    # 않도록 가장 최근 저장값을 반환하되 stale 여부를 응답에 명시한다.
    if observation is None:
        observation = get_weather_observation(nx, ny)
    if observation is None:
        configured = bool(os.getenv("KMA_SERVICE_KEY", "").strip())
        return {
            "status": "unavailable" if configured else "unconfigured",
            "regionCode": region_code,
            "regionName": f"{record.get('district')} {record.get('dong')}",
            "source": "기상청 초단기실황 · 시간별 DB",
            "message": (
                "기상청 API 인증 또는 실황 응답을 확인할 수 없습니다."
                if configured or collection_failed
                else "KMA_SERVICE_KEY가 설정되지 않아 실시간 날씨를 수집할 수 없습니다."
            ),
        }

    # 태경 commit merge 26-08-06 15-33
    # 기존 실황 응답은 유지하고 첨부본의 향후 12시간 기온예보만 추가한다.
    forecast_failed = False
    try:
        hourly_temperatures = fetch_12hour_temperature_forecast(nx, ny)
    except (
        HTTPError,
        URLError,
        TimeoutError,
        UnicodeError,
        json.JSONDecodeError,
        OSError,
        ValueError,
        RuntimeError,
    ):
        forecast_failed = True
        hourly_temperatures = []

    precipitation_type = int(observation.get("precipitation_type") or 0)
    condition_by_precipitation = {
        0: "강수 없음",
        1: "비",
        2: "비 또는 눈",
        3: "눈",
        5: "빗방울",
        6: "빗방울 또는 눈날림",
        7: "눈날림",
    }
    is_stale = observation["observed_at"] != target_datetime.isoformat(timespec="minutes")

    return {
        "status": "ready",
        "regionCode": region_code,
        "regionName": f"{record.get('district')} {record.get('dong')}",
        "source": "기상청 초단기실황 · 단기예보",
        "observedAt": observation["observed_at"],
        "temperature": observation.get("temperature"),
        "humidity": observation.get("humidity"),
        "feelsLike": observation.get("apparent_temperature"),
        "condition": condition_by_precipitation.get(precipitation_type, "기상 정보"),
        "windSpeed": observation.get("wind_speed"),
        "precipitation1h": observation.get("precipitation_1h"),
        "hourlyTemperatures": hourly_temperatures,
        "grid": {"nx": nx, "ny": ny},
        "isStale": is_stale,
        "message": (
            "최신 수집에 실패해 이전 저장값을 표시합니다."
            if is_stale
            else (
                "현재 날씨는 정상이나 12시간 기온예보를 불러오지 못했습니다."
                if forecast_failed
                else None
            )
        ),
    }
#------------------------------------------------------------------------------------------#


@app.get("/api/realtime-heat-risk/{region_code}")
def realtime_heat_risk(region_code: str):
    """방안 C의 실시간 기상위험 H와 지역 취약성 V를 분리해 반환한다.

    기존 `/api/heat-vulnerability` 응답은 변경하지 않는다. 새 UI는 이 API를
    선택적으로 호출할 수 있으며, 기상자료가 없을 때는 정적 지역 취약성까지
    임의의 날씨값으로 계산하지 않고 명시적인 unavailable 상태를 반환한다.
    """
    shelter_evaluated_at = datetime.now(KOREA_TIMEZONE)
    try:
        region_inputs = HEAT_RISK_REPOSITORY.get_region_inputs(
            region_code, shelter_evaluated_at
        )
    except (KeyError, OSError, ValueError) as error:
        raise HTTPException(
            status_code=404,
            detail="실시간 폭염위험 계산에 필요한 행정동 자료가 없습니다.",
        ) from error

    weather = region_weather(region_code)
    if weather.get("status") != "ready" or weather.get("feelsLike") is None:
        return {
            "status": weather.get("status", "unavailable"),
            "regionCode": region_code,
            "regionName": f"{region_inputs['district']} {region_inputs['dong']}",
            "method": "option-c-separated-hazard-and-vulnerability-v2-a1-a2",
            "scores": None,
            "weather": weather,
            "message": "실시간 기상자료가 없어 방안 C 점수를 계산하지 못했습니다.",
        }

    scores = calculate_realtime_heat_risk(
        region_inputs=region_inputs,
        apparent_temperature_c=float(weather["feelsLike"]),
        wind_speed_mps=(
            float(weather["windSpeed"])
            if weather.get("windSpeed") is not None
            else None
        ),
        building_density_range=HEAT_RISK_REPOSITORY.building_density_range(),
    )
    return {
        "status": "ready",
        "regionCode": region_code,
        "regionName": f"{region_inputs['district']} {region_inputs['dong']}",
        "observedAt": weather.get("observedAt"),
        "isStale": weather.get("isStale", False),
        "scores": scores,
        "weather": {
            "temperature": weather.get("temperature"),
            "humidity": weather.get("humidity"),
            "feelsLike": weather.get("feelsLike"),
            "windSpeed": weather.get("windSpeed"),
            "condition": weather.get("condition"),
        },
        "message": weather.get("message"),
    }
#------------------------------------------------------------------------------------------#


@app.get("/api/realtime-heat-risk")
def realtime_heat_risk_map():
    """지도 전체용 방안 C 점수를 150개 행정동에 대해 한 번에 반환한다.

    기상청 API를 요청마다 150회 호출하지 않는다. 시작 스케줄러가 고유 격자별로
    저장한 SQLite 실황을 재사용하고, 같은 격자를 공유하는 행정동은 같은 실황을
    사용한다. 실황이 없는 행정동은 기존 점수로 대체하지 않는다.
    """
    target_datetime = current_kma_base_datetime()
    shelter_evaluated_at = datetime.now(KOREA_TIMEZONE)
    density_range = HEAT_RISK_REPOSITORY.building_density_range()
    grid_observations: dict[tuple[int, int], dict[str, Any] | None] = {}
    records = []

    for region_inputs in HEAT_RISK_REPOSITORY.all_region_inputs(
        shelter_evaluated_at
    ):
        region_code = region_inputs["region_code"]
        latitude, longitude = get_region_center(region_code)
        grid = convert_to_kma_grid(latitude, longitude)
        if grid not in grid_observations:
            observation = get_weather_observation(*grid, target_datetime)
            if observation is None:
                observation = get_weather_observation(*grid)
            grid_observations[grid] = observation
        observation = grid_observations[grid]

        base_record = {
            "adm_cd": region_code,
            "district": region_inputs["district"],
            "dong": region_inputs["dong"],
            "grid": {"nx": grid[0], "ny": grid[1]},
        }
        if observation is None or observation.get("apparent_temperature") is None:
            records.append({**base_record, "status": "unavailable", "score": None})
            continue

        scores = calculate_realtime_heat_risk(
            region_inputs=region_inputs,
            apparent_temperature_c=float(observation["apparent_temperature"]),
            wind_speed_mps=(
                float(observation["wind_speed"])
                if observation.get("wind_speed") is not None
                else None
            ),
            building_density_range=density_range,
        )
        priority = scores["response_priority"]
        records.append(
            {
                **base_record,
                "status": "ready",
                "observed_at": observation["observed_at"],
                "is_stale": observation["observed_at"]
                != target_datetime.isoformat(timespec="minutes"),
                "score": round(priority["score"] * 100, 2),
                "risk_level": priority["level"],
                "scores": scores,
            }
        )

    districts = []
    for district_name in sorted({record["district"] for record in records}):
        district_records = [
            record for record in records if record["district"] == district_name
        ]
        ready_records = [
            record for record in district_records if record["status"] == "ready"
        ]
        if not ready_records:
            districts.append(
                {
                    "district": district_name,
                    "dong_count": len(district_records),
                    "available_count": 0,
                    "score_average": None,
                }
            )
            continue
        ordered = sorted(ready_records, key=lambda record: record["score"])
        districts.append(
            {
                "district": district_name,
                "dong_count": len(district_records),
                "available_count": len(ready_records),
                "score_average": round(
                    sum(record["score"] for record in ready_records)
                    / len(ready_records),
                    2,
                ),
                "weather_hazard_average": round(
                    sum(
                        record["scores"]["weather_hazard"]["score"]
                        for record in ready_records
                    )
                    / len(ready_records)
                    * 100,
                    2,
                ),
                "regional_vulnerability_average": round(
                    sum(
                        record["scores"]["regional_vulnerability"]["score"]
                        for record in ready_records
                    )
                    / len(ready_records)
                    * 100,
                    2,
                ),
                "critical_count": sum(
                    record["risk_level"] == "critical" for record in ready_records
                ),
                "high_count": sum(
                    record["risk_level"] == "high" for record in ready_records
                ),
                "top_vulnerable_dong": ordered[-1]["dong"],
                "top_vulnerable_score": ordered[-1]["score"],
                "bottom_vulnerable_dong": ordered[0]["dong"],
                "bottom_vulnerable_score": ordered[0]["score"],
            }
        )

    ready_count = sum(record["status"] == "ready" for record in records)
    return {
        "status": "ready" if ready_count else "unavailable",
        "method": "option-c-separated-hazard-and-vulnerability-v1",
        "generated_at": datetime.now(KOREA_TIMEZONE).isoformat(timespec="seconds"),
        "target_observed_at": target_datetime.isoformat(timespec="minutes"),
        "record_count": len(records),
        "available_count": ready_count,
        "unique_weather_grid_count": len(grid_observations),
        "records": records,
        "districts": districts,
        "message": None if ready_count else "저장된 기상청 실황이 아직 없습니다.",
    }
#------------------------------------------------------------------------------------------#

# jisu_08_추가 / 선택 행정동의 무더위쉼터 API--------------------------------------------#
@app.get("/api/shelters")
def shelters(regionCode: str | None = None):
    """전체 또는 선택 행정동 경계 안의 무더위쉼터를 반환한다."""
    records = load_shelters()

    if regionCode:
        feature = find_region_feature(regionCode)
        geometry = feature.get("geometry", {})
        filtered_records = []

        for shelter in records:
            try:
                latitude = float(shelter["latitude"])
                longitude = float(shelter["longitude"])
            except (KeyError, TypeError, ValueError):
                continue

            if geometry_contains_point(geometry, longitude, latitude):
                filtered_records.append(shelter)

        records = filtered_records

    # 태경 commit merge 26-08-06 15-33
    # 기존 쉼터 응답 필드는 유지하고 차트용 일반인 이용 가능 여부만 추가한다.
    detail_by_id = HEAT_RISK_REPOSITORY.shelter_details_by_id()
    records = [
        {
            **record,
            "publicAccessible": bool(
                detail_by_id.get(str(record.get("id", "")).removeprefix("daegu-shelter-"), {}).get(
                    "public_accessible", False
                )
            ),
        }
        for record in records
    ]

    return {
        "status": "ready" if records else "unavailable",
        "regionCode": regionCode,
        "shelters": records,
        "source": "data/processed/cooling_shelters.json",
        "message": (
            None
            if records
            else "선택 행정동 안에서 표시할 무더위쉼터를 찾지 못했습니다."
        ),
    }


@app.get("/api/shelters/nearby")
def nearby_shelters(
    latitude: float,
    longitude: float,
    limit: int = Query(default=3, ge=1, le=20),
):
    """현재 위치에서 가까운 무더위쉼터를 거리순으로 반환한다."""
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(
            status_code=422,
            detail="올바르지 않은 좌표입니다.",
        )

    ranked = []

    for shelter in load_shelters():
        try:
            target_latitude = float(shelter["latitude"])
            target_longitude = float(shelter["longitude"])
        except (KeyError, TypeError, ValueError):
            continue

        distance = haversine_distance(
            latitude,
            longitude,
            target_latitude,
            target_longitude,
        )

        ranked.append(
            {
                **shelter,
                "distanceMeters": round(distance),
                "walkingMinutes": max(1, round(distance / 75)),
            }
        )

    ranked.sort(key=lambda shelter: shelter["distanceMeters"])
    nearby = ranked[:limit]

    return {
        "status": "ready" if nearby else "unavailable",
        "origin": {
            "latitude": latitude,
            "longitude": longitude,
        },
        "limit": limit,
        "shelters": nearby,
        "source": "data/processed/cooling_shelters.json",
        "message": (
            None
            if nearby
            else "표시할 무더위쉼터 좌표가 없습니다."
        ),
    }
# 08---------------------------------------------------------------------------------------#

# jisu_03_추가 / 팝업 / 폭염특보 API 추가-------------------------------------------------#
def get_kma_warning_items() -> list[dict[str, Any]]:
    """기상청 현재 특보 현황을 60초 동안 캐시한다."""
    # 행정동을 클릭할 때마다 공공 API를 다시 호출하지 않도록 짧게 캐시한다.
    # KMA_SERVICE_KEY가 없거나 API가 실패하면 빈 목록으로 처리해 지도 선택은
    # 그대로 사용할 수 있고, 공식 특보가 확인된 경우에만 속보 UI가 열린다.
    now = time.monotonic()
    if now < float(KMA_ALERT_CACHE["expires_at"]):
        return KMA_ALERT_CACHE["items"]

    service_key = os.getenv("KMA_SERVICE_KEY", "").strip()
    if not service_key:
        return []

    query = urlencode(
        {
            "ServiceKey": service_key,
            "pageNo": 1,
            "numOfRows": 100,
            "dataType": "JSON",
        }
    )
    try:
        with urlopen(f"{KMA_WARNING_API_URL}?{query}", timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (
        HTTPError,
        URLError,
        TimeoutError,
        UnicodeError,
        json.JSONDecodeError,
        OSError,
        ValueError,
    ):
        # 인증 실패나 일시 장애 때 행정동 클릭마다 재호출하지 않도록 짧게 캐시한다.
        KMA_ALERT_CACHE["items"] = []
        KMA_ALERT_CACHE["expires_at"] = now + 30
        return []

    if not isinstance(payload, dict):
        KMA_ALERT_CACHE["items"] = []
        KMA_ALERT_CACHE["expires_at"] = now + 30
        return []

    response_payload = payload.get("response")
    if not isinstance(response_payload, dict):
        response_payload = {}
    header = response_payload.get("header")
    if not isinstance(header, dict):
        header = {}
    if str(header.get("resultCode", "")) not in {"00", "0"}:
        KMA_ALERT_CACHE["items"] = []
        KMA_ALERT_CACHE["expires_at"] = now + 30
        return []

    body = response_payload.get("body")
    if not isinstance(body, dict):
        body = {}
    items_container = body.get("items")
    if not isinstance(items_container, dict):
        items_container = {}
    items = items_container.get("item", [])
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        items = []

    normalized_items = [item for item in items if isinstance(item, dict)]
    KMA_ALERT_CACHE["items"] = normalized_items
    KMA_ALERT_CACHE["expires_at"] = now + 60
    return normalized_items

# jisu_12_추가수정 / 폭염, 열대야
def iter_current_warning_entries(
    item: dict[str, Any],
) -> list[tuple[str, str]]:
    """특보현황의 t6에서 특보명과 해당 지역을 항목별로 분리한다."""
    status_text = item.get("t6")

    if not isinstance(status_text, str) or not status_text.strip():
        return []

    # 기상청 응답의 줄바꿈 형식을 통일한다.
    normalized_text = (
        status_text
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("<br />", "\n")
        .replace("<br/>", "\n")
        .replace("<br>", "\n")
    )

    entries: list[tuple[str, str]] = []

    # 예: "o 폭염주의보 : 대구광역시"
    for line in normalized_text.splitlines():
        normalized_line = " ".join(line.split()).lstrip("o○- ").strip()

        if ":" not in normalized_line:
            continue

        warning_name, affected_areas = normalized_line.split(":", 1)
        warning_name = warning_name.strip()
        affected_areas = affected_areas.strip()

        if warning_name and affected_areas:
            entries.append((warning_name, affected_areas))

    return entries


@app.get("/api/heat-alerts")
def heat_alerts(regionCode: str | None = None):
    """선택 지역의 폭염·열대야 특보 또는 명시적 테스트 특보를 반환한다."""
    record = find_vulnerability_record(regionCode) if regionCode else None
    district = str(record.get("district", "")) if record else ""
    dong = str(record.get("dong", "")) if record else ""

    # jisu_12_추가수정 / 폭염, 열대야 주의보 / 지역명 생성
    region_name = " ".join(
    name for name in (district, dong) if name
    )

    # 실제 특보 API 키가 준비되기 전에 팝업 배너 모양과 애니메이션만 확인한다.
    # 운영 시에는 반드시 KMA_ALERT_TEST_MODE=false로 두어 테스트 문구가 노출되지 않게 한다.
    test_mode = os.getenv("KMA_ALERT_TEST_MODE", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if test_mode:
        return {
            "status": "active",
            "regionCode": regionCode,
            "regionName": region_name, # 지역명 추가
            "alerts": [
                {
                    "level": "warning",
                    "category": "heatwave",
                    "title": "폭염주의보",
                    "message": f"[화면 테스트] {district} {dong} 지역에 폭염주의보가 발표 중입니다.",
                }
            ],
            "source": "기상청 기상특보 조회서비스",
            "message": "특보 배너 화면 테스트 응답입니다.",
            "testMode": True,
        }
    alerts: list[dict[str, str]] = []

    # jisu_12_추가수정 / 폭염, 열대야 경보
    #
    # 폭염주의보 / 폭염경보 / 폭염중대경보
    # 열대야주의보 / 열대야경보 / 열대야중대경보
    detected_alerts: set[tuple[str, str]] = set()

    for item in get_kma_warning_items():
        # t6의 현재 발효 특보를 종류와 적용 지역으로 나누어 확인한다.
        for warning_name, affected_areas in iter_current_warning_entries(item):
            # 해당 특보의 적용 지역에 대구가 포함된 경우만 사용한다.
            if "대구" not in affected_areas:
                continue

            # 특보 종류를 구분한다.
            if "폭염" in warning_name:
                category = "heatwave"
                alert_name = "폭염"
            elif "열대야" in warning_name:
                category = "tropical-night"
                alert_name = "열대야"
            else:
                continue

            # 기상청 특보강도 0·1·2에 대응한다.
            if "중대경보" in warning_name:
                severity_name = "중대경보"
                level = "critical"
            elif "경보" in warning_name:
                severity_name = "경보"
                level = "critical"
            elif "주의보" in warning_name:
                severity_name = "주의보"
                level = "warning"
            else:
                continue

            title = f"{alert_name}{severity_name}"
            alert_key = (category, title)

            # 같은 종류와 단계가 여러 줄에 있어도 한 번만 표시한다.
            if alert_key in detected_alerts:
                continue

            detected_alerts.add(alert_key)
            alerts.append(
                {
                    "level": level,
                    "category": category,
                    "title": title,
                    "message": (
                        f"{district} {dong} 지역에 "
                        f"{title}가 발표 중입니다."
                    ),
                }
            )

    if alerts:
        return {
            "status": "active",
            "regionCode": regionCode,
            "regionName": region_name,
            "alerts": alerts,
            "source": "기상청 기상특보 조회서비스",
            "message": "선택 지역의 기상청 실시간 특보·알림 현황입니다.",
        }

    return {
        "status": "unavailable",
        "regionCode": regionCode,
        "regionName": region_name,
        "alerts": [],
        "source": "기상청 기상특보 API",
        "message": (
            "현재 선택 지역에 발표 중인 폭염·열대야 알림이 없거나 "
            "기상청 특보 API가 설정되지 않았습니다."
        ),
    }
#-----------------------------------------------------------------------------------------#
