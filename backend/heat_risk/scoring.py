"""방안 C의 기상위험 H, 지역 취약성 V, 내부 우선순위를 조합한다."""

# 현용 점수체계 수정 26-08-06 13-00

from statistics import fmean

from .shelter_access import calculate_shelter_access_vulnerability
from .thermal_environment import calculate_thermal_environment
from .weather_risk import calculate_weather_hazard


def classify_score(score: float) -> str:
    """0~1 점수를 설명용 4단계로 분류한다."""
    if score >= 0.75:
        return "critical"
    if score >= 0.50:
        return "high"
    if score >= 0.25:
        return "moderate"
    return "low"


def calculate_realtime_heat_risk(
    *,
    region_inputs: dict,
    apparent_temperature_c: float,
    wind_speed_mps: float | None,
    building_density_range: tuple[float, float],
) -> dict:
    """방안 C 점수 전체를 계산한다.

    사용자에게는 H와 V를 분리해 보여준다. H×V는 절대적인 피해확률이 아니라
    같은 시점의 행정동 대응 순서를 정하기 위한 보조값이다.
    """
    weather = calculate_weather_hazard(apparent_temperature_c, wind_speed_mps)
    environment = calculate_thermal_environment(
        region_inputs["impervious_risk"],
        region_inputs["green_deficit"],
        region_inputs["building_density_pct"],
        *building_density_range,
    )
    shelter = calculate_shelter_access_vulnerability(
        region_inputs["operating_shelters"],
        region_inputs["publicly_accessible_shelters"],
        currently_open_public_shelters=region_inputs.get(
            "currently_open_public_shelters"
        ),
        population=region_inputs.get("population"),
        supply_range_per_10000=region_inputs.get(
            "shelter_supply_range_per_10000"
        ),
    )

    # 항목 수가 많은 영역이 자동으로 우세해지지 않도록 두 영역을 먼저 묶는다.
    regional_vulnerability = fmean((environment["score"], shelter["score"]))
    response_priority = weather["score"] * regional_vulnerability

    return {
        "method": "option-c-separated-hazard-and-vulnerability-v2-a1-a2",
        "weather_hazard": {
            **weather,
            "level": classify_score(weather["score"]),
        },
        "regional_vulnerability": {
            "score": round(regional_vulnerability, 4),
            "level": classify_score(regional_vulnerability),
            "thermal_environment": environment,
            "shelter_access": shelter,
        },
        "response_priority": {
            "score": round(response_priority, 4),
            "level": classify_score(response_priority),
            "usage": "행정동 정렬·지도 색상용 보조지표이며 피해 확률이 아님",
        },
        # 태경 commit merge 26-08-06 15-47
        # 첨부본 분석 UI가 원자료를 표시할 수 있게 계산식과 분리된 설명값을 제공한다.
        "regional_context": {
            "population": region_inputs.get("population"),
            # 태경 commit merge 26-08-06 16-26
            "general_population": region_inputs.get("general_population"),
            "elderly_population": region_inputs.get("elderly_population"),
            "elderly_ratio_pct": region_inputs.get("elderly_ratio_pct"),
            "green_ratio_pct": region_inputs.get("green_ratio_pct"),
            "impervious_ratio_pct": region_inputs.get("impervious_ratio_pct"),
            "building_density_pct": region_inputs.get("building_density_pct"),
            "operating_shelters": region_inputs.get("operating_shelters"),
            "currently_open_public_shelters": region_inputs.get(
                "currently_open_public_shelters"
            ),
        },
    }
