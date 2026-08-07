"""현재 이용 가능한 일반인 쉼터의 비율·인구당 공급량을 취약성으로 변환한다."""

# 현용 점수체계 수정 26-08-06 13-00

from __future__ import annotations

from datetime import datetime
from statistics import fmean

from .normalization import clamp01, min_max


WEEKDAYS = ("월", "화", "수", "목", "금", "토", "일")


def _time_to_minutes(value: object) -> int | None:
    """HHMM 또는 HH:MM 운영시간을 자정 이후 분 단위로 변환한다."""
    text = str(value or "").strip().replace(":", "")
    if not text or not text.isdigit():
        return None
    text = text.zfill(4)
    hour, minute = int(text[:-2]), int(text[-2:])
    if hour == 24 and minute == 0:
        return 1440
    if hour > 23 or minute > 59:
        return None
    return hour * 60 + minute


def _schedule_is_open(schedule: dict, evaluated_at: datetime) -> bool:
    """한 운영일정이 평가 시각에 열려 있는지 확인한다."""
    if not schedule.get("enabled"):
        return False
    weekday = WEEKDAYS[evaluated_at.weekday()]
    days = {day.strip() for day in str(schedule.get("days") or "").split(",")}
    if weekday not in days:
        return False
    start = _time_to_minutes(schedule.get("start"))
    end = _time_to_minutes(schedule.get("end"))
    if start is None or end is None:
        return False
    current = evaluated_at.hour * 60 + evaluated_at.minute
    if start <= end:
        return start <= current <= end
    return current >= start or current <= end


def shelter_is_currently_open(shelter: dict, evaluated_at: datetime) -> bool:
    """운영 중인 쉼터의 기본·연장·추가 일정 중 하나라도 유효한지 판정한다."""
    return bool(shelter.get("operating")) and any(
        _schedule_is_open(schedule, evaluated_at)
        for schedule in shelter.get("schedules", [])
    )


def calculate_shelter_access_vulnerability(
    operating_shelters: int,
    publicly_accessible_shelters: int,
    *,
    currently_open_public_shelters: int | None = None,
    population: int | None = None,
    supply_range_per_10000: tuple[float, float] | None = None,
) -> dict:
    """A1과 A2만 동일 비중으로 결합한 쉼터대응 취약성 A를 반환한다.

    A1은 전체 운영 쉼터 중 현재 일반인이 이용할 수 있는 비율의 부족도다.
    A2는 인구 1만 명당 현재 이용 가능한 일반인 쉼터 공급량을, 전처리 시점의
    150개 행정동 공급범위로 고정 정규화한 부족도다. 새 입력이 없으면 기존
    정적 비율 계산을 유지해 이전 호출과 호환한다.
    """
    operating = max(int(operating_shelters), 0)
    public_operating = max(min(int(publicly_accessible_shelters), operating), 0)
    current_public = (
        public_operating
        if currently_open_public_shelters is None
        else max(min(int(currently_open_public_shelters), public_operating), 0)
    )
    accessible_ratio = current_public / operating if operating else 0.0
    a1 = clamp01(1.0 - accessible_ratio)

    supply_per_10000 = None
    a2 = None
    if population is not None and supply_range_per_10000 is not None:
        residents = max(int(population), 0)
        supply_per_10000 = current_public / residents * 10_000 if residents else 0.0
        normalized_supply = min_max(supply_per_10000, *supply_range_per_10000)
        a2 = clamp01(1.0 - normalized_supply)

    score = a1 if a2 is None else fmean((a1, a2))
    return {
        "score": round(score, 4),
        "a1_current_public_ratio_deficit": round(a1, 4),
        "a2_population_supply_deficit": round(a2, 4) if a2 is not None else None,
        "accessible_ratio": round(accessible_ratio, 4),
        "public_shelters_per_10000": (
            round(supply_per_10000, 4) if supply_per_10000 is not None else None
        ),
        "operating_shelters": operating,
        "publicly_accessible_shelters": public_operating,
        "currently_open_public_shelters": current_public,
        "population": population,
        "supply_range_per_10000": supply_range_per_10000,
    }
