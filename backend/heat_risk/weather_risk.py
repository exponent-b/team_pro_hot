"""기상청 초단기실황을 실시간 기상위험 H로 변환한다.

체감온도는 기온과 습도를 이미 포함하므로 두 값을 다시 별도 점수로 더하지
않는다. 풍속은 낮을수록 냉각이 불리하다는 단순화된 보조지표로 사용한다.
기준점은 한 시점의 행정동 최솟값·최댓값이 아니라 고정값이므로 서로 다른
날짜의 점수를 비교할 수 있다.
"""

# 현용 점수체계 수정

from .normalization import interpolate_score, inverse_min_max

# 프로젝트 1차 운영 기준이다. 공식 피해 확률이나 의학적 진단 기준이 아니며,
# 향후 대구 행정동별 피해자료로 검증한 뒤 이 상수만 교체할 수 있게 분리했다.
APPARENT_TEMPERATURE_ANCHORS = (
    (26.0, 0.00),
    (29.0, 0.20),
    (31.0, 0.40),
    (33.0, 0.60),
    (35.0, 0.80),
    (37.0, 1.00),
)
CALM_WIND_MPS = 0.0
VENTILATING_WIND_MPS = 4.0


def apparent_temperature_risk(apparent_temperature_c: float) -> float:
    """체감온도를 고정 기준 기반 0~1 위험값으로 변환한다."""
    return interpolate_score(apparent_temperature_c, APPARENT_TEMPERATURE_ANCHORS)


def low_wind_risk(wind_speed_mps: float) -> float:
    """0m/s는 1, 4m/s 이상은 0인 저풍속 취약 보조값을 반환한다."""
    return inverse_min_max(wind_speed_mps, CALM_WIND_MPS, VENTILATING_WIND_MPS)


def calculate_weather_hazard(
    apparent_temperature_c: float,
    wind_speed_mps: float | None,
) -> dict:
    """실시간 기상위험 H와 설명용 세부 구성값을 계산한다.

    온도·습도가 결합된 체감온도를 핵심 위험으로 사용한다. 저풍속 값은 현재
    자료만으로 실제 골목 풍속을 알 수 없으므로 핵심값을 최대 20% 범위에서만
    보정한다. 보정 폭은 상수로 명시해 숨은 가중치가 되지 않도록 한다.
    """
    heat = apparent_temperature_risk(apparent_temperature_c)
    wind = low_wind_risk(wind_speed_mps) if wind_speed_mps is not None else None

    # 바람 자료가 없으면 체감온도만으로 계산한다. 저풍속은 기상위험을 최대
    # 20% 높일 수 있지만 체감온도 위험 자체를 낮추지는 않는다.
    wind_adjustment_limit = 0.20
    weather_hazard = (
        heat + (1.0 - heat) * wind * wind_adjustment_limit
        if wind is not None
        else heat
    )
    return {
        "score": round(weather_hazard, 4),
        "apparent_temperature_risk": round(heat, 4),
        "low_wind_risk": round(wind, 4) if wind is not None else None,
        "wind_adjustment_limit": wind_adjustment_limit,
        "apparent_temperature_c": round(float(apparent_temperature_c), 1),
        "wind_speed_mps": (
            round(float(wind_speed_mps), 1) if wind_speed_mps is not None else None
        ),
    }
