from pathlib import Path

import geopandas as gpd
from shapely.geometry import box


BASE_DIR = Path(__file__).resolve().parent.parent

INPUT_FILE = (
    BASE_DIR
    / "data"
    / "raw"
    / "daegu_administrative_dong"
    / "bnd_dong_22_2025_2Q.shp"
)

OUTPUT_DIR = BASE_DIR / "static" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def get_union(geo_series):
    """GeoPandas 버전 차이를 고려한 공간 병합 함수."""
    if hasattr(geo_series, "union_all"):
        return geo_series.union_all()

    return geo_series.unary_union


def main():
    dong_gdf = gpd.read_file(INPUT_FILE)

    print(f"원본 행정동 수: {len(dong_gdf)}")
    print(f"원본 좌표계: {dong_gdf.crs}")
    print(f"원본 컬럼: {dong_gdf.columns.tolist()}")

    # 네이버 지도에서 사용하는 경위도 좌표계로 변환
    dong_gdf = dong_gdf.to_crs(epsg=4326)

    # 지도에서 사용할 컬럼만 유지
    dong_gdf = dong_gdf[
        ["BASE_DATE", "ADM_CD", "ADM_NM", "geometry"]
    ].copy()

    dong_gdf["layer_type"] = "administrative_dong"

    # 잘못된 도형이 있으면 보정
    dong_gdf["geometry"] = dong_gdf.geometry.make_valid()

    daegu_geometry = get_union(dong_gdf.geometry)

    # 대구 전체 경계
    boundary_gdf = gpd.GeoDataFrame(
        {
            "name": ["대구광역시"],
            "layer_type": ["daegu_boundary"],
        },
        geometry=[daegu_geometry.boundary],
        crs="EPSG:4326",
    )

    # 대구 외부 마스크 범위
    # 군위군을 포함한 대구 주변보다 충분히 넓게 설정
    outer_area = box(
        127.5,  # 서쪽
        35.2,   # 남쪽
        129.5,  # 동쪽
        36.8,   # 북쪽
    )

    outside_geometry = outer_area.difference(daegu_geometry)

    mask_gdf = gpd.GeoDataFrame(
        {
            "name": ["대구광역시 외부"],
            "layer_type": ["outside_mask"],
        },
        geometry=[outside_geometry],
        crs="EPSG:4326",
    )

    dong_file = OUTPUT_DIR / "daegu_administrative_dong.geojson"
    boundary_file = OUTPUT_DIR / "daegu_boundary.geojson"
    mask_file = OUTPUT_DIR / "daegu_outside_mask.geojson"

    dong_gdf.to_file(dong_file, driver="GeoJSON")
    boundary_gdf.to_file(boundary_file, driver="GeoJSON")
    mask_gdf.to_file(mask_file, driver="GeoJSON")

    print(f"행정동 GeoJSON 생성: {dong_file}")
    print(f"대구 경계 GeoJSON 생성: {boundary_file}")
    print(f"외부 마스크 GeoJSON 생성: {mask_file}")


if __name__ == "__main__":
    main()