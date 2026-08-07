"""실시간 점수 계산에 필요한 정적 행정동·쉼터 자료를 읽는 저장소."""

# 현용 점수체계 수정 26-08-06 13-00

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from .shelter_access import shelter_is_currently_open


class HeatRiskDataRepository:
    """파일 위치와 결합 책임을 점수 계산식에서 분리한다."""

    def __init__(self, processed_data_dir: Path):
        self.processed_data_dir = Path(processed_data_dir)

    @staticmethod
    def _read_csv(path: Path) -> list[dict[str, str]]:
        with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
            return list(csv.DictReader(csv_file))

    @lru_cache(maxsize=1)
    def _building_records(self) -> dict[str, dict[str, str]]:
        path = self.processed_data_dir / "building_density_by_dong.csv"
        return {row["adm_cd"]: row for row in self._read_csv(path)}

    @lru_cache(maxsize=1)
    def _indicator_records(self) -> dict[str, dict[str, str]]:
        path = self.processed_data_dir / "heat_indicators.csv"
        return {row["adm_cd"]: row for row in self._read_csv(path)}

    @lru_cache(maxsize=1)
    def _shelter_summary_records(self) -> dict[str, dict[str, str]]:
        """출장소·산성면 보정을 마친 행정동별 쉼터·인구 요약을 읽는다."""
        path = self.processed_data_dir / "shelter_access_by_dong.csv"
        return {row["adm_cd"]: row for row in self._read_csv(path)}

    @lru_cache(maxsize=1)
    def _shelters_by_region(self) -> dict[str, list[dict]]:
        """현재 운영시간 판정에 필요한 쉼터별 일정자료를 행정동별로 묶는다."""
        path = self.processed_data_dir / "shelter_access_detail.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        grouped: dict[str, list[dict]] = defaultdict(list)
        for shelter in payload["shelters"]:
            grouped[str(shelter["adm_cd"])].append(shelter)
        return dict(grouped)

    # 태경 commit merge 26-08-06 15-33
    @lru_cache(maxsize=1)
    def shelter_details_by_id(self) -> dict[str, dict]:
        """화면의 쉼터 차트가 일반인 이용 가능 여부를 사용할 수 있게 ID로 묶는다."""
        details: dict[str, dict] = {}
        for shelters in self._shelters_by_region().values():
            for shelter in shelters:
                details[str(shelter.get("shelter_id", ""))] = shelter
        return details

    @lru_cache(maxsize=1)
    def building_density_range(self) -> tuple[float, float]:
        values = [
            float(row["building_density_pct"])
            for row in self._building_records().values()
        ]
        return min(values), max(values)

    @lru_cache(maxsize=1)
    def shelter_supply_range_per_10000(self) -> tuple[float, float]:
        """A2의 시간 비교가 가능하도록 전처리 시점 공급범위를 고정해 반환한다."""
        values = [
            float(row["public_operating_per_10000"])
            for row in self._shelter_summary_records().values()
        ]
        return min(values), max(values)

    def get_region_inputs(
        self, region_code: str, evaluated_at: datetime | None = None
    ) -> dict:
        """행정동 코드에 해당하는 열환경·현재 쉼터 입력값을 반환한다."""
        code = str(region_code)
        indicators = self._indicator_records().get(code)
        building = self._building_records().get(code)
        shelter_summary = self._shelter_summary_records().get(code)
        if indicators is None or building is None or shelter_summary is None:
            raise KeyError(f"점수 입력자료가 없는 행정동입니다: {region_code}")

        evaluation_time = evaluated_at or datetime.now().astimezone()
        current_public = sum(
            1
            for shelter in self._shelters_by_region().get(code, [])
            if shelter.get("public_accessible")
            and shelter_is_currently_open(shelter, evaluation_time)
        )
        return {
            "region_code": code,
            "district": indicators["district"],
            "dong": indicators["dong"],
            "impervious_risk": float(indicators["component_impervious_risk"]),
            "green_deficit": float(indicators["component_green_deficit"]),
            # 태경 commit merge 26-08-06 15-47
            "green_ratio_pct": float(indicators["green_ratio_pct"]),
            "impervious_ratio_pct": float(indicators["impervious_ratio_pct"]),
            "building_density_pct": float(building["building_density_pct"]),
            "operating_shelters": int(shelter_summary["shelter_operating"]),
            "publicly_accessible_shelters": int(
                shelter_summary["shelter_public_operating"]
            ),
            "currently_open_public_shelters": current_public,
            "population": int(shelter_summary["population"]),
            # 태경 commit merge 26-08-06 16-26
            "general_population": int(shelter_summary["general_population"]),
            "elderly_population": int(shelter_summary["elderly_population"]),
            "elderly_ratio_pct": float(shelter_summary["elderly_ratio_pct"]),
            "shelter_supply_range_per_10000": self.shelter_supply_range_per_10000(),
            "shelter_evaluated_at": evaluation_time.isoformat(timespec="minutes"),
        }

    def all_region_inputs(self, evaluated_at: datetime | None = None) -> list[dict]:
        """150개 행정동 입력을 동일 평가 시각 기준으로 반환한다."""
        evaluation_time = evaluated_at or datetime.now().astimezone()
        return [
            self.get_region_inputs(region_code, evaluation_time)
            for region_code in sorted(self._indicator_records())
        ]
