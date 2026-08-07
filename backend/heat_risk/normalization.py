"""점수 계산에서 공통으로 사용하는 0~1 변환 함수."""

# 현용 점수체계 수정


def clamp01(value: float) -> float:
    """숫자를 0~1 범위로 제한한다."""
    return min(max(float(value), 0.0), 1.0)


def min_max(value: float, minimum: float, maximum: float) -> float:
    """고정된 최솟값·최댓값으로 값을 0~1 범위로 변환한다."""
    if maximum <= minimum:
        raise ValueError("정규화 최댓값은 최솟값보다 커야 합니다.")
    return clamp01((float(value) - minimum) / (maximum - minimum))


def inverse_min_max(value: float, minimum: float, maximum: float) -> float:
    """값이 작을수록 위험한 지표를 0~1 취약도 방향으로 변환한다."""
    return 1.0 - min_max(value, minimum, maximum)


def interpolate_score(value: float, anchors: tuple[tuple[float, float], ...]) -> float:
    """고정 기준점 사이를 선형 보간해 시간 간 비교 가능한 점수를 만든다."""
    if len(anchors) < 2 or any(
        anchors[index][0] >= anchors[index + 1][0]
        for index in range(len(anchors) - 1)
    ):
        raise ValueError("기준점은 값이 증가하는 순서로 2개 이상 필요합니다.")

    number = float(value)
    if number <= anchors[0][0]:
        return clamp01(anchors[0][1])
    if number >= anchors[-1][0]:
        return clamp01(anchors[-1][1])

    for (left_x, left_y), (right_x, right_y) in zip(anchors, anchors[1:]):
        if number <= right_x:
            ratio = (number - left_x) / (right_x - left_x)
            return clamp01(left_y + (right_y - left_y) * ratio)
    return clamp01(anchors[-1][1])
