"""방안 C 점수 모듈 핵심 계산의 회귀 테스트."""

# 현용 점수체계 수정 26-08-06 13-00

import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from heat_risk.normalization import interpolate_score, min_max
from heat_risk.repository import HeatRiskDataRepository
from heat_risk.scoring import calculate_realtime_heat_risk, classify_score
from heat_risk.shelter_access import (
    calculate_shelter_access_vulnerability,
    shelter_is_currently_open,
)
from heat_risk.weather_risk import apparent_temperature_risk, low_wind_risk


class HeatRiskTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data_dir = Path(__file__).resolve().parents[1] / "data" / "processed"
        cls.repository = HeatRiskDataRepository(data_dir)

    def test_normalization_and_interpolation(self):
        self.assertEqual(min_max(-1, 0, 10), 0)
        self.assertEqual(min_max(5, 0, 10), 0.5)
        self.assertEqual(min_max(11, 0, 10), 1)
        self.assertEqual(interpolate_score(5, ((0, 0), (10, 1))), 0.5)

    def test_weather_boundaries(self):
        self.assertEqual(apparent_temperature_risk(26), 0)
        self.assertEqual(apparent_temperature_risk(37), 1)
        self.assertEqual(low_wind_risk(0), 1)
        self.assertEqual(low_wind_risk(4), 0)

    def test_shelter_ratio_and_zero_case(self):
        result = calculate_shelter_access_vulnerability(10, 3)
        self.assertEqual(result["accessible_ratio"], 0.3)
        self.assertEqual(result["score"], 0.7)
        self.assertEqual(calculate_shelter_access_vulnerability(0, 0)["score"], 1)

    def test_a1_a2_only_shelter_score(self):
        result = calculate_shelter_access_vulnerability(
            10,
            6,
            currently_open_public_shelters=4,
            population=10_000,
            supply_range_per_10000=(0.0, 8.0),
        )
        self.assertEqual(result["a1_current_public_ratio_deficit"], 0.6)
        self.assertEqual(result["a2_population_supply_deficit"], 0.5)
        self.assertEqual(result["score"], 0.55)

    def test_current_open_schedule(self):
        shelter = {
            "operating": True,
            "schedules": [
                {
                    "enabled": True,
                    "days": "월,화,수,목,금",
                    "start": "0900",
                    "end": "1800",
                }
            ],
        }
        korea = timezone(timedelta(hours=9))
        self.assertTrue(
            shelter_is_currently_open(shelter, datetime(2026, 8, 6, 12, tzinfo=korea))
        )
        self.assertFalse(
            shelter_is_currently_open(shelter, datetime(2026, 8, 6, 20, tzinfo=korea))
        )

    def test_classification_boundaries(self):
        self.assertEqual(classify_score(0.2499), "low")
        self.assertEqual(classify_score(0.25), "moderate")
        self.assertEqual(classify_score(0.50), "high")
        self.assertEqual(classify_score(0.75), "critical")

    def test_all_static_records_join(self):
        indicators = self.repository._indicator_records()
        buildings = self.repository._building_records()
        shelters = self.repository._shelter_summary_records()
        self.assertEqual(len(indicators), 150)
        self.assertEqual(len(buildings), 150)
        self.assertEqual(len(shelters), 150)
        for region_code in indicators:
            self.repository.get_region_inputs(region_code)

    def test_full_score_stays_in_range(self):
        region_code = next(iter(self.repository._indicator_records()))
        result = calculate_realtime_heat_risk(
            region_inputs=self.repository.get_region_inputs(region_code),
            apparent_temperature_c=35.0,
            wind_speed_mps=1.0,
            building_density_range=self.repository.building_density_range(),
        )
        for key in ("weather_hazard", "regional_vulnerability", "response_priority"):
            self.assertGreaterEqual(result[key]["score"], 0)
            self.assertLessEqual(result[key]["score"], 1)


if __name__ == "__main__":
    unittest.main()
