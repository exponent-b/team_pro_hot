"""기상청 단기예보에서 선택 격자의 향후 12시간 기온을 조회한다."""

# 태경 commit merge 26-08-06 15-33

from __future__ import annotations

import json
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen


KOREA_TIMEZONE = timezone(timedelta(hours=9))
KMA_VILLAGE_FORECAST_API_URL = (
    "https://apis.data.go.kr/1360000/"
    "VilageFcstInfoService_2.0/getVilageFcst"
)


def current_forecast_base_datetime(now: datetime | None = None) -> datetime:
    """현재 조회 가능한 가장 최신 단기예보 발표시각을 계산한다."""
    current_time = now or datetime.now(KOREA_TIMEZONE)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=KOREA_TIMEZONE)
    available_time = current_time - timedelta(minutes=10)
    for hour in reversed((2, 5, 8, 11, 14, 17, 20, 23)):
        candidate = available_time.replace(
            hour=hour, minute=0, second=0, microsecond=0
        )
        if candidate <= available_time:
            return candidate
    return (available_time - timedelta(days=1)).replace(
        hour=23, minute=0, second=0, microsecond=0
    )


def fetch_12hour_temperature_forecast(
    nx: int, ny: int, now: datetime | None = None
) -> list[dict[str, Any]]:
    """현재 이후 첫 정시부터 최대 12개의 TMP 예보를 반환한다."""
    service_key = os.getenv("KMA_SERVICE_KEY", "").strip()
    if not service_key:
        raise RuntimeError("KMA_SERVICE_KEY가 설정되지 않았습니다.")

    current_time = now or datetime.now(KOREA_TIMEZONE)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=KOREA_TIMEZONE)
    base_datetime = current_forecast_base_datetime(current_time)
    query = urlencode(
        {
            "ServiceKey": service_key,
            "pageNo": 1,
            "numOfRows": 1000,
            "dataType": "JSON",
            "base_date": base_datetime.strftime("%Y%m%d"),
            "base_time": base_datetime.strftime("%H00"),
            "nx": nx,
            "ny": ny,
        }
    )
    with urlopen(f"{KMA_VILLAGE_FORECAST_API_URL}?{query}", timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))

    response_payload = payload.get("response", {})
    header = response_payload.get("header", {})
    if str(header.get("resultCode", "")) not in {"00", "0"}:
        raise ValueError(header.get("resultMsg", "기상청 단기예보 API 오류"))
    items = response_payload.get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]

    first_time = current_time.replace(
        minute=0, second=0, microsecond=0
    ) + timedelta(hours=1)
    end_time = first_time + timedelta(hours=12)
    temperatures: dict[datetime, float] = {}
    for item in items:
        if str(item.get("category", "")) != "TMP":
            continue
        try:
            forecast_time = datetime.strptime(
                f"{item.get('fcstDate', '')}{str(item.get('fcstTime', '')).zfill(4)}",
                "%Y%m%d%H%M",
            ).replace(tzinfo=KOREA_TIMEZONE)
            temperature = float(item.get("fcstValue"))
        except (TypeError, ValueError):
            continue
        if first_time <= forecast_time < end_time and math.isfinite(temperature):
            temperatures[forecast_time] = temperature

    return [
        {
            "observedAt": forecast_time.isoformat(timespec="minutes"),
            "temperature": temperature,
        }
        for forecast_time, temperature in sorted(temperatures.items())[:12]
    ]
