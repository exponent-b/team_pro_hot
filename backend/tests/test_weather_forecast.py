"""향후 12시간 기온예보 기준시각 계산 테스트."""

# 태경 commit merge 26-08-06 15-33

import unittest
from datetime import datetime, timedelta, timezone

from weather_forecast import current_forecast_base_datetime


class WeatherForecastTests(unittest.TestCase):
    def test_latest_available_base_time(self):
        """15시 33분에는 반영 지연을 고려한 14시 발표분을 선택한다."""
        korea = timezone(timedelta(hours=9))
        result = current_forecast_base_datetime(
            datetime(2026, 8, 6, 15, 33, tzinfo=korea)
        )
        self.assertEqual(result.strftime("%Y%m%d%H%M"), "202608061400")

    def test_before_first_release_uses_previous_day(self):
        """당일 첫 발표 전에는 전날 23시 발표분을 선택한다."""
        korea = timezone(timedelta(hours=9))
        result = current_forecast_base_datetime(
            datetime(2026, 8, 6, 1, 30, tzinfo=korea)
        )
        self.assertEqual(result.strftime("%Y%m%d%H%M"), "202608052300")


if __name__ == "__main__":
    unittest.main()
