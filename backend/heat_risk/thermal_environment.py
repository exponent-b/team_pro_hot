"""토지피복과 건물 피복률을 하나의 지역 열환경 E로 묶는다."""

# 현용 점수체계 수정

from statistics import fmean

from .normalization import min_max


def calculate_thermal_environment(
    impervious_risk: float,
    green_deficit: float,
    building_density_pct: float,
    building_density_min: float,
    building_density_max: float,
) -> dict:
    """상관성이 높은 세 지표를 별도 가중치 없이 영역 내부 평균으로 계산한다."""
    building_risk = min_max(
        building_density_pct,
        building_density_min,
        building_density_max,
    )
    components = {
        "impervious_risk": float(impervious_risk),
        "green_deficit": float(green_deficit),
        "building_density_risk": building_risk,
    }
    return {
        "score": round(fmean(components.values()), 4),
        "components": {name: round(value, 4) for name, value in components.items()},
        "building_density_pct": round(float(building_density_pct), 4),
    }
