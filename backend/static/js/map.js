(() => {
  "use strict";

  /*
   * 대구광역시 지도 핵심 구현
   *
   * 1. 군위군을 포함한 대구 지도 표시
   * 2. 지도 이동 및 확대·축소 범위 제한
   * 3. 대구 외부 회색 마스크
   * 4. 대구광역시 외곽선 굵게 표시
   * 5. 행정동 경계선 표시
   * 6. 행정동 마우스 오버 음영 처리
   * 7. GeoJSON 오류 처리
   * 8. 확대·축소 시 외부 마스크 깜빡임 최소화
   */

  if (
    typeof window.naver === "undefined" ||
    typeof window.naver.maps === "undefined"
  ) {
    console.error(
      "NAVER Maps API를 불러오지 못했습니다. Client ID와 Web Service URL을 확인하세요.",
    );
    return;
  }

  const mapElement = document.getElementById("map");
  const searchInput = document.getElementById("dong-search");
  const searchResults = document.getElementById("dong-search-results");
  const searchButton = document.getElementById("search-button");
  const resetButton = document.getElementById("reset-button");
  const districtFilter = document.getElementById("district-filter");
  const riskFilter = document.getElementById("risk-filter");
  const boundaryToggle = document.getElementById("boundary-toggle");
  const openSearchButton = document.getElementById("open-search-btn");
  const closeSearchButton = document.getElementById("close-search-btn");
  const searchPopupPanel = document.getElementById("search-popup-panel");
  // jisu_02_추가 / 취약도 색상 토글
  const vulnerabilityToggle = document.getElementById("vulnerability-toggle");
  //
  const mapStatus = document.getElementById("map-status");
  const panelEyebrow = document.getElementById("panel-eyebrow");
  const dongNameElement = document.getElementById("dong-name");
  const dongDetails = document.getElementById("dong-details");
  const districtDetails = document.getElementById("district-details");
  const dongDistrictElement = document.getElementById("dong-district");
  const dongCodeElement = document.getElementById("dong-code");
  const dongBaseDateElement = document.getElementById("dong-base-date");
  const dongRiskLevelElement = document.getElementById("dong-risk-level");
  const dongRiskScoreElement = document.getElementById("dong-risk-score");
  const riskRankingList = document.getElementById("risk-ranking-list");
  const lowRiskRankingList = document.getElementById("low-risk-ranking-list");
  // 0807 / jisu_15 / 메인 지도 / 오른쪽 쉼터 정보 패널 요소-------------------
  const rankingSidebar = document.getElementById("ranking-sidebar");
  const shelterSidebar = document.getElementById("shelter-sidebar");
  const shelterSidebarTitle = document.getElementById("shelter-sidebar-title");
  const shelterSidebarCount = document.getElementById("shelter-sidebar-count");
  const shelterSidebarList = document.getElementById("shelter-sidebar-list");
  // 15-----------------------------------------------------------------

  // 행정동 클릭 시 상세정보표시·쉼터보기를 고르는 선택창 요소
  const regionChoiceBackdrop = document.getElementById(
    "region-choice-backdrop",
  );
  const regionChoicePanel = document.getElementById("region-choice-panel");
  const regionChoiceTitle = document.getElementById("region-choice-title");
  const regionChoiceClose = document.getElementById("region-choice-close");
  const regionChoiceDetailButton = document.getElementById(
    "region-choice-detail-button",
  );
  const regionChoiceSheltersButton = document.getElementById(
    "region-choice-shelters-button",
  );

  //jisu_03_추가 / 팝업 / HTML 요소 참조 추가
  const dongPanel = document.getElementById("dong-panel");

  const selectedHeatAlert = document.getElementById("selected-heat-alert");
  const selectedHeatAlertTitle = document.getElementById(
    "selected-heat-alert-title",
  );
  const selectedHeatAlertMessage = document.getElementById(
    "selected-heat-alert-message",
  );

  const weatherSource = document.getElementById("weather-source");
  const weatherMessage = document.getElementById("weather-message");
  const weatherCondition = document.getElementById("weather-condition");
  const weatherTemperature = document.getElementById("weather-temperature");
  const weatherHumidity = document.getElementById("weather-humidity");
  const weatherFeelsLike = document.getElementById("weather-feels-like");
  const weatherWind = document.getElementById("weather-wind");
  const weatherRainfall = document.getElementById("weather-rainfall");

  const regionPopup = document.getElementById("region-popup");
  const regionPopupClose = document.getElementById("region-popup-close");
  const regionPopupLocation = document.getElementById("region-popup-location");
  const regionPopupTitle = document.getElementById("region-popup-title");
  const regionPopupRisk = document.getElementById("region-popup-risk");
  const regionPopupScore = document.getElementById("region-popup-score");
  // tg 추가 / 순위·비교·요약 표시 요소
  const regionPopupRank = document.getElementById("region-popup-rank");
  // tg 수정 / 팝업 내부 지도는 제거하고 메인 지도를 쉼터 찾기에 사용한다.

  const regionPopupWeatherSource = document.getElementById(
    "region-popup-weather-source",
  );
  //jisu_07_추가수정 / 현재 시간 및 기준
  const regionPopupWeatherTitle = document.getElementById(
    "region-popup-weather-title",
  );
  //
  const regionPopupWeatherCondition = document.getElementById(
    "region-popup-weather-condition",
  );
  const regionPopupWeatherTemperature = document.getElementById(
    "region-popup-weather-temperature",
  );
  const regionPopupWeatherHumidity = document.getElementById(
    "region-popup-weather-humidity",
  );
  const regionPopupWeatherFeelsLike = document.getElementById(
    "region-popup-weather-feels-like",
  );
  // tg 추가 / 새 분석 카드의 풍속·녹지율·건물밀집도 요소 참조
  const regionPopupWeatherWind = document.getElementById(
    "region-popup-weather-wind",
  );
  const regionPopupGreenRatio = document.getElementById(
    "region-popup-green-ratio",
  );
  const regionPopupBuildingDensity = document.getElementById(
    "region-popup-building-density",
  );
  const regionPopupGreenComparison = document.getElementById(
    "region-popup-green-comparison",
  );
  // tg 추가 / 녹지율 평균 비교 막대 요소
  const regionPopupGreenBar = document.getElementById("region-popup-green-bar");
  const regionPopupGreenBarFill = document.getElementById(
    "region-popup-green-bar-fill",
  );
  const regionPopupGreenAverageMarker = document.getElementById(
    "region-popup-green-average-marker",
  );
  const regionPopupGreenCurrentLabel = document.getElementById(
    "region-popup-green-current-label",
  );
  const regionPopupGreenAverageLabel = document.getElementById(
    "region-popup-green-average-label",
  );

  // tg 추가 / 건물밀집도 평균 비교 막대 자리
  const regionPopupBuildingBar = document.getElementById(
    "region-popup-building-bar",
  );
  const regionPopupBuildingBarFill = document.getElementById(
    "region-popup-building-bar-fill",
  );
  const regionPopupBuildingAverageMarker = document.getElementById(
    "region-popup-building-average-marker",
  );
  const regionPopupBuildingCurrentLabel = document.getElementById(
    "region-popup-building-current-label",
  );
  const regionPopupBuildingAverageLabel = document.getElementById(
    "region-popup-building-average-label",
  );
  const regionPopupBuildingComparison = document.getElementById(
    "region-popup-building-comparison",
  );

  // tg 추가 / 불투수면율 값과 대구 평균 비교 요소 참조
  const regionPopupImperviousRatio = document.getElementById(
    "region-popup-impervious-ratio",
  );
  const regionPopupImperviousBar = document.getElementById(
    "region-popup-impervious-bar",
  );
  const regionPopupImperviousBarFill = document.getElementById(
    "region-popup-impervious-bar-fill",
  );
  const regionPopupImperviousAverageMarker = document.getElementById(
    "region-popup-impervious-average-marker",
  );
  const regionPopupImperviousCurrentLabel = document.getElementById(
    "region-popup-impervious-current-label",
  );
  const regionPopupImperviousAverageLabel = document.getElementById(
    "region-popup-impervious-average-label",
  );
  const regionPopupImperviousComparison = document.getElementById(
    "region-popup-impervious-comparison",
  );

  // tg 추가 / 행정동 인구수와 연령대별 인구 표시 요소 참조
  const regionPopupPopulationTotal = document.getElementById(
    "region-popup-population-total",
  );
  const regionPopupPopulationUnder65 = document.getElementById(
    "region-popup-population-under-65",
  );
  const regionPopupPopulationElderly = document.getElementById(
    "region-popup-population-elderly",
  );
  const regionPopupKeyFactors = document.getElementById(
    "region-popup-key-factors",
  );
  const regionPopupForecastSummary = document.getElementById(
    "region-popup-forecast-summary",
  );
  const regionPopupShelterTotal = document.getElementById(
    "region-popup-shelter-total",
  );
  const regionPopupShelterPublic = document.getElementById(
    "region-popup-shelter-public",
  );
  const regionPopupShelterRestricted = document.getElementById(
    "region-popup-shelter-restricted",
  );
  const regionPopupShelterPublicRatio = document.getElementById(
    "region-popup-shelter-public-ratio",
  );
  const regionPopupShelterComparison = document.getElementById(
    "region-popup-shelter-comparison",
  );

  // tg 추가 / 팝업 시간별 온도 변화 그래프 HTML 요소 참조
  const regionPopupTemperatureChartMessage = document.getElementById(
    "region-popup-temperature-chart-message",
  );
  const regionPopupTemperatureChartSvg = document.getElementById(
    "region-popup-temperature-chart-svg",
  );
  const regionPopupTemperatureChartGrid = document.getElementById(
    "region-popup-temperature-chart-grid",
  );
  const regionPopupTemperatureChartLine = document.getElementById(
    "region-popup-temperature-chart-line",
  );
  const regionPopupTemperatureChartPoints = document.getElementById(
    "region-popup-temperature-chart-points",
  );
  const regionPopupTemperatureChartLabels = document.getElementById(
    "region-popup-temperature-chart-labels",
  );

  const regionPopupShelterCount = document.getElementById(
    "region-popup-shelter-count",
  );
  const regionPopupShelterMessage = document.getElementById(
    "region-popup-shelter-message",
  );
  const regionPopupShelterList = document.getElementById(
    "region-popup-shelter-list",
  );

  // tg 추가 / 무더위쉼터 이용 대상 파이차트 HTML 요소 참조
  const regionPopupShelterChartMessage = document.getElementById(
    "region-popup-shelter-chart-message",
  );
  const regionPopupShelterChart = document.getElementById(
    "region-popup-shelter-chart",
  );
  const regionPopupShelterChartSlices = document.getElementById(
    "region-popup-shelter-chart-slices",
  );
  const regionPopupShelterChartCenter = document.getElementById(
    "region-popup-shelter-chart-center",
  );
  const regionPopupShelterChartTooltip = document.getElementById(
    "region-popup-shelter-chart-tooltip",
  );
  const regionPopupShelterChartLegend = document.getElementById(
    "region-popup-shelter-chart-legend",
  );
  //
  const districtDetailElements = {
    dongCount: document.getElementById("district-dong-count"),
    averageScore: document.getElementById("district-average-score"),
    highCount: document.getElementById("district-high-count"),
    topDong: document.getElementById("district-top-dong"),
    bottomDong: document.getElementById("district-bottom-dong"),
    weatherHazard: document.getElementById("district-weather-hazard"),
    regionalVulnerability: document.getElementById(
      "district-regional-vulnerability",
    ),
    dataStatus: document.getElementById("district-data-status"),
  };
  const indicatorElements = {
    weather_hazard: {
      progress: document.getElementById("indicator-weather-hazard"),
      value: document.getElementById("indicator-weather-hazard-value"),
    },
    thermal_environment: {
      progress: document.getElementById("indicator-thermal-environment"),
      value: document.getElementById("indicator-thermal-environment-value"),
    },
    shelter_access: {
      progress: document.getElementById("indicator-shelter-access"),
      value: document.getElementById("indicator-shelter-access-value"),
    },
    impervious_risk: {
      progress: document.getElementById("indicator-impervious"),
      value: document.getElementById("indicator-impervious-value"),
    },
    green_deficit: {
      progress: document.getElementById("indicator-green"),
      value: document.getElementById("indicator-green-value"),
    },
    building_density_risk: {
      progress: document.getElementById("indicator-building-density"),
      value: document.getElementById("indicator-building-density-value"),
    },
  };

  if (!mapElement) {
    console.error("id가 map인 HTML 요소를 찾을 수 없습니다.");
    return;
  }

  const GEOJSON_BASE_URL = "/static/data";

  const GEOJSON_FILES = {
    administrativeDong: `${GEOJSON_BASE_URL}/daegu_administrative_dong.geojson`,
    boundary: `${GEOJSON_BASE_URL}/daegu_boundary.geojson`,
    outsideMask: `${GEOJSON_BASE_URL}/daegu_outside_mask.geojson`,
  };
  // 태경 commit merge 26-08-06 17-35 / 기존 실시간 점수 API를 유지한다.
  const HEAT_DATA_URL = "/api/realtime-heat-risk";

  const RISK_STYLES = {
    low: { label: "낮음", color: "#ffedc7" },
    moderate: { label: "보통", color: "#ffa6a6" },
    high: { label: "높음", color: "#ff7070" },
    critical: { label: "매우 높음", color: "#e73f3f" },
    none: { label: "데이터 없음", color: "#e2e8f0" },
  };

  const DISTRICT_BY_CODE_PREFIX = {
    22010: "중구",
    22020: "동구",
    22030: "서구",
    22040: "남구",
    22050: "북구",
    22060: "수성구",
    22070: "달서구",
    22510: "달성군",
    22520: "군위군",
  };

  /*
   * 지도 기본 설정
   */

  const DAEGU_CENTER = new naver.maps.LatLng(35.8714, 128.6014);
  const INITIAL_ZOOM = 12;
  const MIN_SELECTION_ZOOM = 13;

  // 군위군을 포함하는 대구광역시 주변 이동 제한 범위
  const DAEGU_LIMIT_BOUNDS = new naver.maps.LatLngBounds(
    new naver.maps.LatLng(35.45, 128.25),
    new naver.maps.LatLng(36.35, 129.05),
  );

  const map = new naver.maps.Map(mapElement, {
    center: DAEGU_CENTER,
    zoom: INITIAL_ZOOM,

    minZoom: 9,
    maxZoom: 18,
    maxBounds: DAEGU_LIMIT_BOUNDS,

    scrollWheel: false,
    draggable: true,
    disableKineticPan: true,
    pinchZoom: true,
    keyboardShortcuts: false,

    // 확대·축소 시 기본지도 타일 전환 효과 제거
    tileTransition: false,
    overlayZoomEffect: "all",
    tileSpare: 1,

    zoomControl: false,

    mapDataControl: false,
    scaleControl: true,
  });

  const hoverInfoWindow = new naver.maps.InfoWindow({
    maxWidth: 240,
    pixelOffset: new naver.maps.Point(0, -8),
    disableAutoPan: true,
    zIndex: 100,
  });

  const instantZoomControl = document.createElement("div");
  const zoomInButton = document.createElement("button");
  const zoomOutButton = document.createElement("button");
  instantZoomControl.className = "instant-zoom-control";
  instantZoomControl.setAttribute("aria-label", "지도 확대 및 축소");
  zoomInButton.type = "button";
  zoomInButton.className = "instant-zoom-button";
  zoomInButton.setAttribute("aria-label", "지도 확대");
  zoomInButton.title = "지도 확대";
  zoomInButton.textContent = "+";
  zoomOutButton.type = "button";
  zoomOutButton.className = "instant-zoom-button";
  zoomOutButton.setAttribute("aria-label", "지도 축소");
  zoomOutButton.title = "지도 축소";
  zoomOutButton.textContent = "−";
  instantZoomControl.append(zoomInButton, zoomOutButton);
  mapElement.append(instantZoomControl);

  /*
   * 생성된 오버레이 보관
   */

  const maskPolygons = [];
  const boundaryPolygons = [];
  const selectionMaskPolygons = [];
  const selectionHaloPolygons = [];
  const dongFeatures = [];
  const dongFeatureByCode = new Map();
  const dongPolygonsByCode = new Map();
  const heatDataByDongCode = new Map();
  const heatDataByDistrict = new Map();
  const districtBoundsByName = new Map();
  const dongBoundsByCode = new Map();
  const dongGeometryByCode = new Map();
  let selectedFeature = null;
  let administrativeBoundaryVisible = true;
  // jisu_02_추가 / 취약도 단계별 채움색을 지도에 표시할지 저장
  let vulnerabilityLayerVisible = true;
  //

  let selectedDistrict = "all";
  let selectedRiskLevel = "all";
  let heatDataBaseDate = null;
  let hoveredDongFeature = null;
  let dongHoverLeaveTimer = null;
  let selectionAnimationFrame = null;
  let lastHandledDongClickCode = null;
  let lastHandledDongClickAt = 0;
  let searchRenderTimer = null;
  let latestSearchRequestToken = 0;

  // jisu_03_추가 / 팝업 / 상태값 추가
  // 팝업에서 현재 선택한 행정동과 비동기 요청 순서를 관리한다.
  let regionPopupDongCode = null;
  let selectedRegionRequestId = 0;

  // tg 수정 / 무더위쉼터 마커는 팝업 지도가 아니라 메인 지도에 표시한다.
  let shelterFinderOpen = false;
  //

  // 행정동 클릭 선택창에서 아직 상세정보표시·쉼터보기를 고르지 않은 대상 행정동
  let pendingChoiceFeature = null;

  // 0807 / jisu_15 / 메인 지도 / 쉼터 마커 상태-------------------
  const mainMapShelterMarkers = [];
  // 15-----------------------------------------------------------------

  // jisu_08_추가 / 팝업 쉼터 데이터와 지도 마커
  let regionPopupShelterRecords = [];
  const regionPopupShelterMarkers = [];

  // tg 추가 / 목록에서 선택한 마커의 흔들림 애니메이션 타이머를 관리한다.
  let regionPopupShelterMarkerAnimationTimer = null;

  /*
   * GeoJSON 요청
   */
  async function loadGeoJson(url) {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-cache",
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }

    const geoJson = await response.json();

    if (!geoJson || !geoJson.type) {
      throw new Error(`올바르지 않은 GeoJSON 파일입니다: ${url}`);
    }

    return geoJson;
  }

  async function loadHeatData() {
    const response = await fetch(HEAT_DATA_URL, {
      method: "GET",
      cache: "no-cache",
    });

    if (!response.ok) {
      throw new Error(
        `${response.status} ${response.statusText}: ${HEAT_DATA_URL}`,
      );
    }

    const payload = await response.json();
    const records = Array.isArray(payload.records) ? payload.records : [];
    const districts = Array.isArray(payload.districts) ? payload.districts : [];
    heatDataByDongCode.clear();
    heatDataByDistrict.clear();
    heatDataBaseDate =
      payload.target_observed_at === undefined ||
      payload.target_observed_at === null
        ? null
        : String(payload.target_observed_at);

    records.forEach((record) => {
      const dongCode = String(record.adm_cd ?? "").trim();
      const score = Number(record.score);

      if (!dongCode) {
        return;
      }

      if (record.status !== "ready" || !Number.isFinite(score)) {
        heatDataByDongCode.set(dongCode, {
          score: null,
          riskLevel: "none",
          indicators: {},
          scores: null,
          observedAt: record.observed_at ?? null,
          isStale: Boolean(record.is_stale),
        });
        return;
      }

      // 태경 commit merge 26-08-06 17-35 / 현재 점수 체계의 세부 결과를 첨부 UI용 데이터로 연결한다.
      const scores = record.scores ?? {};
      const weatherHazard = Number(scores.weather_hazard?.score);
      const regionalVulnerability = scores.regional_vulnerability ?? {};
      const thermalEnvironment =
        regionalVulnerability.thermal_environment ?? {};
      const shelterAccess = regionalVulnerability.shelter_access ?? {};
      const regionalContext = scores.regional_context ?? {};

      heatDataByDongCode.set(dongCode, {
        score: Math.max(0, Math.min(100, score)),
        riskLevel: normalizeRiskLevel(record.risk_level, score),
        scores,
        observedAt: record.observed_at ?? null,
        isStale: Boolean(record.is_stale),
        indicators: normalizeIndicators({
          weather_hazard: weatherHazard,
          thermal_environment: Number(thermalEnvironment.score),
          shelter_access: Number(shelterAccess.score),
          impervious_risk: Number(
            thermalEnvironment.components?.impervious_risk,
          ),
          green_deficit: Number(thermalEnvironment.components?.green_deficit),
          building_density_risk: Number(
            thermalEnvironment.components?.building_density_risk,
          ),
        }),
        greenRatioPct: Number(regionalContext.green_ratio_pct),
        buildingDensityPct: Number(regionalContext.building_density_pct),
        imperviousRatioPct: Number(regionalContext.impervious_ratio_pct),
        populationTotal: Number(regionalContext.population),
        populationUnder65: Number(regionalContext.general_population),
        population65Plus: Number(regionalContext.elderly_population),
        elderlyRatioPct: Number(regionalContext.elderly_ratio_pct),
      });
    });
    districts.forEach((district) => {
      const districtName = String(district.district ?? "").trim();

      if (districtName) {
        heatDataByDistrict.set(districtName, {
          ...district,
        });
      }
    });

    return payload;
  }

  function normalizeRiskLevel(riskLevel, score) {
    if (Object.hasOwn(RISK_STYLES, riskLevel) && riskLevel !== "none") {
      return riskLevel;
    }

    if (score >= 75) {
      return "critical";
    }

    if (score >= 50) {
      return "high";
    }

    if (score >= 25) {
      return "moderate";
    }

    return "low";
  }

  function normalizeIndicators(indicators) {
    if (!indicators || typeof indicators !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.keys(indicatorElements).flatMap((indicatorName) => {
        const value = Number(indicators[indicatorName]);

        return Number.isFinite(value)
          ? [[indicatorName, Math.max(0, Math.min(1, value))]]
          : [];
      }),
    );
  }

  function updateIndicatorBreakdown(indicators = {}) {
    Object.entries(indicatorElements).forEach(([indicatorName, elements]) => {
      const score = indicators[indicatorName];
      const hasScore = Number.isFinite(score);

      if (elements.progress) {
        elements.progress.value = hasScore ? score : 0;
      }

      if (elements.value) {
        elements.value.textContent = hasScore ? score.toFixed(3) : "-";
      }
    });
  }

  function createHoverTooltip(feature) {
    const dongInfo = getDongInfo(feature);
    const heatData = heatDataByDongCode.get(dongInfo.code);
    const riskStyle = RISK_STYLES[heatData?.riskLevel ?? "none"];
    const container = document.createElement("div");
    const location = document.createElement("strong");
    const district = document.createElement("span");
    const risk = document.createElement("span");

    container.className = "map-tooltip";
    location.className = "map-tooltip-name";
    district.className = "map-tooltip-district";
    risk.className = "map-tooltip-risk";

    location.textContent = dongInfo.name;
    district.textContent = getDistrictName(feature);
    risk.textContent = Number.isFinite(heatData?.score)
      ? `${riskStyle.label} · ${heatData.score.toFixed(1)}점`
      : riskStyle.label;
    risk.style.borderColor = riskStyle.color;

    container.append(location, district, risk);
    return container;
  }

  function clearDongHover() {
    if (hoveredDongFeature && hoveredDongFeature !== selectedFeature) {
      applyDongPolygonStyle(hoveredDongFeature);
    }

    hoveredDongFeature = null;
    hoverInfoWindow.close();
    mapElement.style.cursor = "";
  }

  function highlightDong(feature) {
    if (hoveredDongFeature === feature) {
      return;
    }

    clearDongHover();
    hoveredDongFeature = feature;
    const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);
    const heatData = heatDataByDongCode.get(dongCode);
    const riskStyle = RISK_STYLES[heatData?.riskLevel ?? "none"];

    setDongPolygonOptions(dongCode, {
      visible: true,
      // jisu_02_추가수정 / fillColor, fillOpacity 수정
      // 색상을 꺼도 마우스를 올린 행정동은 흰색 반투명 효과와 파란 테두리로 구분
      fillColor: vulnerabilityLayerVisible ? riskStyle.color : "#ffffff",
      fillOpacity: vulnerabilityLayerVisible ? (heatData ? 0.94 : 0.5) : 0.16,
      //
      strokeColor: "#1e3a8a",
      strokeOpacity: 1,
      strokeWeight: 2.8,
      clickable: true,
      zIndex: 26,
    });
  }

  function showHoverTooltip(event) {
    if (!event.coord) {
      return;
    }

    hoverInfoWindow.setContent(createHoverTooltip(event.feature));
    hoverInfoWindow.open(map, event.coord);
  }

  function renderRanking(listElement, descending) {
    if (!listElement) {
      return;
    }

    const ranking = [...heatDataByDongCode.entries()]
      .filter(
        ([dongCode, heatData]) =>
          dongFeatureByCode.has(dongCode) && Number.isFinite(heatData.score),
      )
      .sort((left, right) =>
        descending
          ? right[1].score - left[1].score
          : left[1].score - right[1].score,
      )
      .slice(0, 5);

    listElement.replaceChildren();

    if (ranking.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "ranking-empty";
      emptyItem.textContent = "표시할 폭염 취약도 분석 데이터가 없습니다.";
      listElement.append(emptyItem);
      return;
    }

    ranking.forEach(([dongCode, heatData]) => {
      const feature = dongFeatureByCode.get(dongCode);
      const dongInfo = getDongInfo(feature);
      const riskStyle = RISK_STYLES[heatData.riskLevel];
      const item = document.createElement("li");
      const button = document.createElement("button");
      const name = document.createElement("span");
      const meta = document.createElement("span");
      const score = document.createElement("strong");

      item.className = "ranking-item";
      button.className = "ranking-button";
      button.type = "button";
      button.dataset.dongCode = dongCode;
      button.setAttribute(
        "aria-label",
        `${dongInfo.name}, 취약도 ${heatData.score.toFixed(1)}점`,
      );

      name.className = "ranking-name";
      name.textContent = dongInfo.name;
      meta.className = "ranking-meta";
      meta.textContent = `${getDistrictName(feature)} · ${riskStyle.label}`;
      score.className = "ranking-score";
      score.textContent = `${heatData.score.toFixed(1)}점`;

      button.append(name, meta, score);
      item.append(button);
      listElement.append(item);
    });
  }

  function renderRiskRankings() {
    renderRanking(riskRankingList, true);
    renderRanking(lowRiskRankingList, false);
  }

  function getDistrictName(feature) {
    const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);
    return DISTRICT_BY_CODE_PREFIX[dongCode.slice(0, 5)] ?? "기타";
  }

  function getRiskLevelForFeature(feature) {
    const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);
    return heatDataByDongCode.get(dongCode)?.riskLevel ?? "none";
  }

  function featureMatchesFilters(feature) {
    const districtMatches =
      selectedDistrict === "all" ||
      getDistrictName(feature) === selectedDistrict;
    const riskMatches =
      selectedRiskLevel === "all" ||
      getRiskLevelForFeature(feature) === selectedRiskLevel;

    return districtMatches && riskMatches;
  }

  function applyMapFilters() {
    applyAllDongPolygonStyles();

    if (selectedFeature && !featureMatchesFilters(selectedFeature)) {
      clearSelection();
    } else if (selectedFeature) {
      selectDong(selectedFeature, false);
    }

    const visibleCount = dongFeatures.filter(featureMatchesFilters).length;
    const districtLabel =
      selectedDistrict === "all" ? "대구 전체" : selectedDistrict;
    const riskLabel =
      selectedRiskLevel === "all"
        ? "전체 취약도"
        : RISK_STYLES[selectedRiskLevel].label;

    setStatus(`${districtLabel} · ${riskLabel}: ${visibleCount}개 행정동`);
  }

  /*
   * GeoJSON 좌표를 네이버 지도 좌표로 변환
   *
   * GeoJSON 좌표:
   * [경도, 위도]
   *
   * 네이버 지도 좌표:
   * LatLng(위도, 경도)
   */

  function pointInRing(longitude, latitude, ring) {
    let inside = false;

    for (
      let currentIndex = 0, previousIndex = ring.length - 1;
      currentIndex < ring.length;
      previousIndex = currentIndex, currentIndex += 1
    ) {
      const currentLongitude = Number(ring[currentIndex]?.[0]);
      const currentLatitude = Number(ring[currentIndex]?.[1]);
      const previousLongitude = Number(ring[previousIndex]?.[0]);
      const previousLatitude = Number(ring[previousIndex]?.[1]);

      if (
        !Number.isFinite(currentLongitude) ||
        !Number.isFinite(currentLatitude) ||
        !Number.isFinite(previousLongitude) ||
        !Number.isFinite(previousLatitude)
      ) {
        continue;
      }

      const crossesLatitude =
        currentLatitude > latitude !== previousLatitude > latitude;
      const intersectionLongitude =
        ((previousLongitude - currentLongitude) *
          (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
        currentLongitude;

      if (crossesLatitude && longitude < intersectionLongitude) {
        inside = !inside;
      }
    }

    return inside;
  }

  function pointInPolygon(longitude, latitude, polygonCoordinates) {
    if (
      !Array.isArray(polygonCoordinates) ||
      polygonCoordinates.length === 0 ||
      !pointInRing(longitude, latitude, polygonCoordinates[0])
    ) {
      return false;
    }

    return !polygonCoordinates
      .slice(1)
      .some((hole) => pointInRing(longitude, latitude, hole));
  }

  function geometryContainsPoint(geometry, longitude, latitude) {
    if (geometry?.type === "Polygon") {
      return pointInPolygon(longitude, latitude, geometry.coordinates);
    }

    if (geometry?.type === "MultiPolygon") {
      return geometry.coordinates.some((polygonCoordinates) =>
        pointInPolygon(longitude, latitude, polygonCoordinates),
      );
    }

    return false;
  }

  function findDongFeatureAtCoordinate(coordinate) {
    if (!coordinate) {
      return null;
    }

    const longitude = Number(coordinate.lng());
    const latitude = Number(coordinate.lat());

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return null;
    }

    for (const [dongCode, geometry] of dongGeometryByCode.entries()) {
      if (geometryContainsPoint(geometry, longitude, latitude)) {
        const feature = dongFeatureByCode.get(dongCode);
        return feature && featureMatchesFilters(feature) ? feature : null;
      }
    }

    return null;
  }

  function coordinateToLatLng(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      throw new Error("올바르지 않은 GeoJSON 좌표입니다.");
    }

    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new Error("GeoJSON 좌표가 숫자가 아닙니다.");
    }

    return new naver.maps.LatLng(latitude, longitude);
  }

  function ringToPath(ring) {
    return ring.map(coordinateToLatLng);
  }

  /*
   * Polygon의 좌표 구조를 네이버 Polygon paths로 변환
   *
   * 첫 번째 path: 외곽선
   * 두 번째 이후 path: 내부 구멍
   */

  function polygonCoordinatesToPaths(coordinates) {
    return coordinates.map(ringToPath);
  }

  /*
   * FeatureCollection, Feature, GeometryCollection을 모두 처리해
   * Polygon 또는 MultiPolygon geometry만 반환
   */

  function collectPolygonGeometries(geoJson) {
    const geometries = [];

    function visit(item) {
      if (!item) {
        return;
      }

      if (item.type === "FeatureCollection") {
        item.features.forEach(visit);
        return;
      }

      if (item.type === "Feature") {
        visit(item.geometry);
        return;
      }

      if (item.type === "GeometryCollection") {
        item.geometries.forEach(visit);
        return;
      }

      if (item.type === "Polygon" || item.type === "MultiPolygon") {
        geometries.push(item);
      }
    }

    visit(geoJson);

    return geometries;
  }

  /*
   * Polygon과 MultiPolygon의 각 Polygon 좌표를 반환
   */

  function getPolygonCoordinateGroups(geometry) {
    if (geometry.type === "Polygon") {
      return [geometry.coordinates];
    }

    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates;
    }

    return [];
  }

  /*
   * 대구 외부 마스크
   *
   * map.data가 아니라 별도 Polygon으로 생성합니다.
   * 확대·축소 시 Data Layer가 다시 그려지면서 마스크가 사라지는
   * 현상을 줄이기 위한 구현입니다.
   */

  function createOutsideMask(maskGeoJson) {
    const geometries = collectPolygonGeometries(maskGeoJson);

    if (geometries.length === 0) {
      throw new Error("외부 마스크 GeoJSON에 Polygon이 없습니다.");
    }

    geometries.forEach((geometry) => {
      const polygonGroups = getPolygonCoordinateGroups(geometry);

      polygonGroups.forEach((polygonCoordinates) => {
        const polygon = new naver.maps.Polygon({
          map,
          paths: polygonCoordinatesToPaths(polygonCoordinates),

          fillColor: "#e2e8f0",
          fillOpacity: 0.92,

          strokeColor: "#e2e8f0",
          strokeOpacity: 0,
          strokeWeight: 0,

          clickable: false,
          zIndex: 10,
        });

        maskPolygons.push(polygon);
      });
    });
  }

  /*
   * 대구광역시 전체 외곽선
   */

  function createDaeguBoundary(boundaryGeoJson) {
    const geometries = collectPolygonGeometries(boundaryGeoJson);

    if (geometries.length === 0) {
      throw new Error("대구시 경계 GeoJSON에 Polygon이 없습니다.");
    }

    geometries.forEach((geometry) => {
      const polygonGroups = getPolygonCoordinateGroups(geometry);

      polygonGroups.forEach((polygonCoordinates) => {
        const polygon = new naver.maps.Polygon({
          map,
          paths: polygonCoordinatesToPaths(polygonCoordinates),

          fillColor: "#000000",
          fillOpacity: 0,

          strokeColor: "#0f172a",
          strokeOpacity: 1,
          strokeWeight: 5,

          clickable: false,
          zIndex: 30,
        });

        boundaryPolygons.push(polygon);
      });
    });
  }

  /*
   * 행정동 기본 스타일
   */

  function getAdministrativeDongStyle(feature) {
    return {
      visible: false,
      clickable: false,
    };
  }

  function getDongPolygonStyle(feature) {
    if (!featureMatchesFilters(feature)) {
      return {
        visible: false,
        clickable: false,
      };
    }

    const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);
    const heatData = heatDataByDongCode.get(dongCode);
    const riskStyle = RISK_STYLES[heatData?.riskLevel ?? "none"];

    return {
      visible: true,

      fillColor: riskStyle.color,
      // jisu_02_추가수정 / 수정 fillOpacity:
      fillOpacity: vulnerabilityLayerVisible ? (heatData ? 0.72 : 0.28) : 0,
      //
      strokeColor: "#64748b",
      strokeOpacity: administrativeBoundaryVisible ? 0.8 : 0,
      strokeWeight: 1.3,

      clickable: true,
      zIndex: 20,
    };
  }

  function setDongPolygonOptions(dongCode, options) {
    (dongPolygonsByCode.get(dongCode) ?? []).forEach((polygon) => {
      if (polygon.getMap() !== map) {
        polygon.setMap(map);
      }
      polygon.setOptions(options);
    });
  }

  function applyDongPolygonStyle(feature) {
    const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);
    setDongPolygonOptions(dongCode, getDongPolygonStyle(feature));
  }

  function applyAllDongPolygonStyles() {
    dongFeatures.forEach(applyDongPolygonStyle);
  }

  map.data.setStyle(getAdministrativeDongStyle);

  /*
   * 행정동 GeoJSON 추가
   */

  function createAdministrativeDongLayer(dongGeoJson) {
    const addedFeatures = map.data.addGeoJson(dongGeoJson);

    if (!Array.isArray(addedFeatures) || addedFeatures.length === 0) {
      throw new Error("행정동 GeoJSON에서 추가된 도형이 없습니다.");
    }

    dongFeatures.push(...addedFeatures);
    addedFeatures.forEach((feature) => {
      const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);

      if (dongCode) {
        dongFeatureByCode.set(dongCode, feature);
      }
    });
    (dongGeoJson.features ?? []).forEach((rawFeature) => {
      const dongCode = String(rawFeature?.properties?.ADM_CD ?? "");
      const districtName = DISTRICT_BY_CODE_PREFIX[dongCode.slice(0, 5)];

      if (!districtName) {
        return;
      }

      if (rawFeature?.geometry) {
        dongGeometryByCode.set(dongCode, rawFeature.geometry);
      }

      const feature = dongFeatureByCode.get(dongCode);
      if (feature && rawFeature?.geometry) {
        const polygons = getPolygonCoordinateGroups(rawFeature.geometry).map(
          (polygonCoordinates) => {
            const polygon = new naver.maps.Polygon({
              map,
              paths: polygonCoordinatesToPaths(polygonCoordinates),
              ...getDongPolygonStyle(feature),
            });

            naver.maps.Event.addListener(polygon, "mouseover", (event) => {
              handleDongHover(feature, event.coord);
            });
            naver.maps.Event.addListener(polygon, "mouseout", () => {
              scheduleDongHoverClear();
            });
            naver.maps.Event.addListener(polygon, "click", () => {
              handleDongClick(feature);
            });

            return polygon;
          },
        );
        dongPolygonsByCode.set(dongCode, polygons);
      }

      let districtBounds = districtBoundsByName.get(districtName) ?? null;
      let dongBounds = null;
      const visitCoordinates = (coordinates) => {
        if (
          Array.isArray(coordinates) &&
          coordinates.length >= 2 &&
          Number.isFinite(Number(coordinates[0])) &&
          Number.isFinite(Number(coordinates[1]))
        ) {
          const latLng = new naver.maps.LatLng(
            Number(coordinates[1]),
            Number(coordinates[0]),
          );
          if (districtBounds === null) {
            districtBounds = new naver.maps.LatLngBounds(latLng, latLng);
          } else {
            districtBounds.extend(latLng);
          }
          if (dongBounds === null) {
            dongBounds = new naver.maps.LatLngBounds(latLng, latLng);
          } else {
            dongBounds.extend(latLng);
          }
          return;
        }

        if (Array.isArray(coordinates)) {
          coordinates.forEach(visitCoordinates);
        }
      };

      visitCoordinates(rawFeature?.geometry?.coordinates);
      if (districtBounds !== null) {
        districtBoundsByName.set(districtName, districtBounds);
      }
      if (dongBounds !== null) {
        dongBoundsByCode.set(dongCode, dongBounds);
      }
    });
    setStatus(`행정동 ${addedFeatures.length}개를 지도에 표시했습니다.`);
    console.info(`행정동 ${addedFeatures.length}개를 지도에 표시했습니다.`);
  }

  function getFeatureValue(feature, propertyNames, fallback = "") {
    for (const propertyName of propertyNames) {
      const value = feature.getProperty(propertyName);

      if (value !== undefined && value !== null && value !== "") {
        return String(value);
      }
    }

    return fallback;
  }

  function getDongInfo(feature) {
    return {
      name: getFeatureValue(
        feature,
        ["ADM_NM", "adm_nm", "name"],
        "행정동 이름 없음",
      ),
      code: getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"], "-"),
      baseDate: getFeatureValue(feature, ["BASE_DATE", "base_date"], "-"),
    };
  }

  function formatBaseDate(value) {
    if (!/^\d{8}$/.test(value)) {
      return value;
    }

    return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
  }

  function setStatus(message) {
    if (mapStatus) {
      mapStatus.textContent = message;
    }
  }

  function showPanelMode(mode) {
    if (dongDetails) {
      dongDetails.hidden = mode === "district";
    }

    if (districtDetails) {
      districtDetails.hidden = mode !== "district";
    }

    if (panelEyebrow) {
      panelEyebrow.textContent =
        mode === "district" ? "선택 구·군 요약" : "선택 지역";
    }
  }

  function updateDistrictPanel(districtName) {
    const district = heatDataByDistrict.get(districtName);

    if (!district) {
      clearSelection();
      setStatus(`${districtName}의 분석 요약을 찾을 수 없습니다.`);
      return;
    }

    showPanelMode("district");
    dongNameElement.textContent = districtName;
    districtDetailElements.dongCount.textContent = `${district.dong_count}개`;
    const hasDistrictScore =
      district.score_average !== null &&
      Number.isFinite(Number(district.score_average));
    districtDetailElements.averageScore.textContent = hasDistrictScore
      ? `${Number(district.score_average).toFixed(1)}점`
      : "자료 없음";
    districtDetailElements.highCount.textContent = hasDistrictScore
      ? `${Number(district.critical_count) + Number(district.high_count)}개`
      : "-";
    districtDetailElements.topDong.textContent = hasDistrictScore
      ? `${district.top_vulnerable_dong} · ${Number(district.top_vulnerable_score).toFixed(1)}점`
      : "-";
    districtDetailElements.bottomDong.textContent = hasDistrictScore
      ? `${district.bottom_vulnerable_dong} · ${Number(district.bottom_vulnerable_score).toFixed(1)}점`
      : "-";
    districtDetailElements.weatherHazard.textContent = Number.isFinite(
      Number(district.weather_hazard_average),
    )
      ? `${Number(district.weather_hazard_average).toFixed(1)}점`
      : "자료 없음";
    districtDetailElements.regionalVulnerability.textContent = Number.isFinite(
      Number(district.regional_vulnerability_average),
    )
      ? `${Number(district.regional_vulnerability_average).toFixed(1)}점`
      : "자료 없음";
    districtDetailElements.dataStatus.textContent = `${Number(
      district.available_count ?? 0,
    )}/${Number(district.dong_count ?? 0)}개 동 계산`;
    updateIndicatorBreakdown();
  }
  /**/
  // API 숫자값만 단위와 함께 표시하고 누락·비정상 값은 하이픈으로 통일한다.
  function formatMetric(value, suffix = "") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? `${numericValue}${suffix}` : "-";
  }

  // tg 추가 / SVG 네임스페이스로 온도 그래프 요소를 생성한다.
  function createTemperatureChartSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(
      "http://www.w3.org/2000/svg",
      tagName,
    );

    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, String(value));
    });

    return element;
  }

  // tg 수정 / 날짜가 바뀌어도 '내일' 문구 없이 시간만 간단히 표시한다.
  function formatTemperatureChartHour(value) {
    const forecastDate = new Date(value);

    if (Number.isNaN(forecastDate.getTime())) {
      return "-";
    }

    const hourPart = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(forecastDate)
      .find((part) => part.type === "hour");

    return hourPart ? `${hourPart.value}시` : "-";
  }

  // tg 추가 / 지역 변경 또는 조회 실패 시 이전 온도 그래프를 초기화한다.
  function resetTemperatureChart(
    message = "시간별 온도 자료를 불러오는 중입니다.",
  ) {
    if (regionPopupForecastSummary) {
      regionPopupForecastSummary.textContent = "예보 자료 없음";
    }

    if (regionPopupTemperatureChartMessage) {
      regionPopupTemperatureChartMessage.textContent = message;
      regionPopupTemperatureChartMessage.hidden = false;
      // tg 수정 / hidden 속성과 CSS 충돌 여부와 관계없이 안내문을 확실히 표시한다.
      regionPopupTemperatureChartMessage.style.display = "grid";
    }

    if (regionPopupTemperatureChartSvg) {
      regionPopupTemperatureChartSvg.hidden = true;
      // tg 수정 / 초기화 상태에서는 이전 그래프를 확실히 숨긴다.
      regionPopupTemperatureChartSvg.style.display = "none";
    }

    if (regionPopupTemperatureChartLine) {
      regionPopupTemperatureChartLine.setAttribute("points", "");
    }

    // tg 수정 / 다른 행정동 조회 전 이전 12시간 그래프의 확장 너비를 초기화한다.
    if (regionPopupTemperatureChartSvg) {
      regionPopupTemperatureChartSvg.removeAttribute("width");
      regionPopupTemperatureChartSvg.removeAttribute("height");
      regionPopupTemperatureChartSvg.style.width = "";
      regionPopupTemperatureChartSvg.style.minWidth = "";
      regionPopupTemperatureChartSvg.setAttribute("viewBox", "0 0 520 190");
    }

    regionPopupTemperatureChartGrid?.replaceChildren();
    regionPopupTemperatureChartPoints?.replaceChildren();
    regionPopupTemperatureChartLabels?.replaceChildren();
  }

  // tg 수정 / main.py가 반환한 향후 12시간 기온예보를 가로형 SVG 그래프로 표시한다.
  function renderTemperatureChart(hourlyTemperatures) {
    const records = Array.isArray(hourlyTemperatures)
      ? hourlyTemperatures
          .map((item) => ({
            observedAt: item?.observedAt,
            temperature: Number(item?.temperature),
          }))
          .filter(
            (item) => item.observedAt && Number.isFinite(item.temperature),
          )
      : [];

    if (records.length < 2) {
      resetTemperatureChart(
        records.length === 1
          ? "표시할 미래 시간별 기온예보가 충분하지 않습니다."
          : "표시할 12시간 기온예보가 없습니다.",
      );
      return;
    }

    if (
      !regionPopupTemperatureChartSvg ||
      !regionPopupTemperatureChartLine ||
      !regionPopupTemperatureChartGrid ||
      !regionPopupTemperatureChartPoints ||
      !regionPopupTemperatureChartLabels
    ) {
      return;
    }

    const chartHeight = 190;

    // tg 수정 / 실제 화면에서 체감될 정도로 점과 시간 간격을 줄인다.
    const pointSpacing = 34;
    const padding = {
      top: 34,
      right: 32,
      bottom: 48,
      left: 32,
    };

    // tg 수정 / 12개 예보값이 과하게 벌어지지 않도록 시간 간격을 줄인다.
    const chartWidth = Math.max(
      // tg 수정 / 12시간 그래프의 전체 가로 폭을 줄여 늘어진 인상을 완화한다.
      440,
      padding.left + padding.right + pointSpacing * (records.length - 1),
    );
    const plotWidth = chartWidth - padding.left - padding.right;

    // tg 추가 / 데이터 개수에 맞춰 SVG 자체 너비와 좌표계를 함께 확장한다.
    regionPopupTemperatureChartSvg.setAttribute(
      "viewBox",
      `0 0 ${chartWidth} ${chartHeight}`,
    );
    // tg 수정 / 12시간 그래프 전체가 카드 안에 한 번에 보이도록 SVG를 100% 너비로 표시한다.
    // tg 수정 / CSS의 720px 고정 폭에 의해 다시 늘어나지 않도록 계산된 폭을 직접 사용한다.
    regionPopupTemperatureChartSvg.setAttribute("width", String(chartWidth));
    regionPopupTemperatureChartSvg.setAttribute("height", String(chartHeight));
    regionPopupTemperatureChartSvg.style.width = `${chartWidth}px`;
    regionPopupTemperatureChartSvg.style.minWidth = `${chartWidth}px`;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    const temperatures = records.map((item) => item.temperature);
    const minimumTemperature = Math.min(...temperatures);
    const maximumTemperature = Math.max(...temperatures);

    // tg 추가 / 향후 12시간 중 최고 예상 기온과 시각을 제목 옆에 표시한다.
    const hottestRecord = records.reduce((hottest, item) =>
      item.temperature > hottest.temperature ? item : hottest,
    );
    if (regionPopupForecastSummary) {
      regionPopupForecastSummary.textContent =
        `최고 ${hottestRecord.temperature.toFixed(1)}℃ · ` +
        `${formatTemperatureChartHour(hottestRecord.observedAt)}`;
    }
    const temperatureRange = Math.max(
      maximumTemperature - minimumTemperature,
      2,
    );
    const chartMinimum = minimumTemperature - 1;
    const chartMaximum = chartMinimum + temperatureRange + 2;
    const xStep = plotWidth / (records.length - 1);

    const points = records.map((item, index) => {
      const x = padding.left + xStep * index;
      const ratio =
        (item.temperature - chartMinimum) / (chartMaximum - chartMinimum);
      const y = padding.top + plotHeight - ratio * plotHeight;

      return {
        ...item,
        x,
        y,
      };
    });

    regionPopupTemperatureChartGrid.replaceChildren();
    [0, 0.5, 1].forEach((ratio) => {
      const y = padding.top + plotHeight * ratio;
      regionPopupTemperatureChartGrid.append(
        createTemperatureChartSvgElement("line", {
          x1: padding.left,
          y1: y,
          x2: chartWidth - padding.right,
          y2: y,
          class: "temperature-chart-grid-line",
        }),
      );
    });

    regionPopupTemperatureChartLine.setAttribute(
      "points",
      points.map((point) => `${point.x},${point.y}`).join(" "),
    );

    regionPopupTemperatureChartPoints.replaceChildren();
    regionPopupTemperatureChartLabels.replaceChildren();

    // tg 추가 / 각 점에 단위를 반복하지 않고 그래프 오른쪽 위에 °C를 한 번만 표시한다.
    const unitLabel = createTemperatureChartSvgElement("text", {
      x: chartWidth - 14,
      y: 18,
      "text-anchor": "end",
      class: "temperature-chart-unit",
    });
    unitLabel.textContent = "°C";
    regionPopupTemperatureChartLabels.append(unitLabel);

    points.forEach((point) => {
      const circle = createTemperatureChartSvgElement("circle", {
        cx: point.x,
        cy: point.y,
        // tg 수정 / 조밀해진 그래프에 맞춰 점을 조금 줄인다.
        r: 4,
        class: "temperature-chart-point",
      });
      const temperatureLabel = createTemperatureChartSvgElement("text", {
        x: point.x,
        y: point.y - 12,
        "text-anchor": "middle",
        class: "temperature-chart-value",
      });
      const timeLabel = createTemperatureChartSvgElement("text", {
        x: point.x,
        // tg 수정 / 시간 라벨이 하단 스크롤바에 가려지지 않도록 위쪽으로 이동한다.
        y: chartHeight - 34,
        "text-anchor": "middle",
        class: "temperature-chart-time",
      });

      // tg 수정 / 각 지점에는 단위를 반복하지 않고 숫자만 표시한다.
      // tg 수정 / 소수점 표기를 제거해 숫자의 가로 폭을 줄인다.
      temperatureLabel.textContent = Math.round(point.temperature);
      timeLabel.textContent = formatTemperatureChartHour(point.observedAt);

      regionPopupTemperatureChartPoints.append(circle, temperatureLabel);
      regionPopupTemperatureChartLabels.append(timeLabel);
    });

    if (regionPopupTemperatureChartMessage) {
      regionPopupTemperatureChartMessage.hidden = true;
      // tg 수정 / 그래프 표시 시 로딩 안내문이 공간을 차지하지 않도록 직접 숨긴다.
      regionPopupTemperatureChartMessage.style.display = "none";
    }

    regionPopupTemperatureChartSvg.hidden = false;
    // tg 수정 / hidden 속성과 CSS 상태를 모두 해제해 SVG 그래프를 확실히 표시한다.
    regionPopupTemperatureChartSvg.style.display = "block";
  }

  // tg 추가 / 전체 행정동 녹지율의 단순 평균을 계산한다.
  function getAverageGreenRatio() {
    const values = [...heatDataByDongCode.values()]
      .map((item) => Number(item.greenRatioPct))
      .filter(Number.isFinite);

    return values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  // tg 추가 / 전체 행정동 건물밀도의 단순 평균을 계산한다.
  function getAverageBuildingDensity() {
    const values = [...heatDataByDongCode.values()]
      .map((item) => Number(item.buildingDensityPct))
      .filter(Number.isFinite);

    return values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  // tg 추가 / 전체 행정동 불투수면율의 단순 평균을 계산한다.
  function getAverageImperviousRatio() {
    const values = [...heatDataByDongCode.values()]
      .map((item) => Number(item.imperviousRatioPct))
      .filter(Number.isFinite);

    return values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  // tg 추가 / 선택 행정동 점수의 대구 내 상대 순위를 표시한다.
  function updatePopupRank(dongCode) {
    if (!regionPopupRank) {
      return;
    }

    const ranking = [...heatDataByDongCode.entries()]
      .filter(([, item]) => item.score !== null && Number.isFinite(item.score))
      .sort((left, right) => right[1].score - left[1].score);
    const index = ranking.findIndex(
      ([code]) => code === String(dongCode ?? ""),
    );

    regionPopupRank.textContent =
      index >= 0
        ? `${ranking.length}개 행정동 중 ${index + 1}위`
        : "순위 자료 없음";
  }

  // tg 추가 / 정규화값이 큰 취약 요인 두 개를 한 문장으로 요약한다.
  function updatePopupKeyFactors(dongCode) {
    if (!regionPopupKeyFactors) {
      return;
    }

    const indicators =
      heatDataByDongCode.get(String(dongCode ?? ""))?.indicators ?? {};
    // tg 수정 / 주요 취약 요인은 짧은 명사형으로 표시한다.
    const labels = {
      weather_hazard: "실시간 기상 위험",
      thermal_environment: "열환경 취약성",
      shelter_access: "쉼터 접근 취약성",
      impervious_risk: "불투수면 위험",
      green_deficit: "녹지 부족",
      building_density_risk: "건물밀집도 위험",
    };

    const factors = Object.entries(indicators)
      .filter(([, value]) => Number.isFinite(Number(value)))
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 2)
      .map(([key]) => labels[key])
      .filter(Boolean);

    // tg 수정 / 제목 아래에는 요인 이름만 쉼표로 구분하여 간결하게 표시한다.
    regionPopupKeyFactors.textContent =
      factors.length > 0 ? factors.join(", ") : "세부 취약 요인 데이터 없음";
  }

  // tg 추가 / 0~100 범위의 해당 동 값과 평균을 한 막대에 표시한다.
  function updateAverageComparisonBar({
    container,
    fill,
    marker,
    currentLabel,
    averageLabel,
    currentValue,
    averageValue,
    unit = "%",
  }) {
    const hasCurrentValue = Number.isFinite(currentValue);
    const hasAverageValue = Number.isFinite(averageValue);

    container?.classList.toggle(
      "is-empty",
      !hasCurrentValue || !hasAverageValue,
    );

    if (fill) {
      fill.style.width = hasCurrentValue
        ? `${Math.max(0, Math.min(100, currentValue))}%`
        : "0%";
    }

    if (marker) {
      marker.style.left = hasAverageValue
        ? `${Math.max(0, Math.min(100, averageValue))}%`
        : "0%";
    }

    if (currentLabel) {
      currentLabel.textContent = hasCurrentValue
        ? `해당 동 ${currentValue.toFixed(1)}${unit}`
        : "해당 동 -";
    }

    if (averageLabel) {
      averageLabel.textContent = hasAverageValue
        ? `대구 평균 ${averageValue.toFixed(1)}${unit}`
        : "대구 평균 -";
    }
  }

  // tg 추가 / 선택 행정동의 녹지율을 분석 팝업에 표시한다.
  function updatePopupEnvironmentMetrics(dongCode) {
    const heatData = heatDataByDongCode.get(String(dongCode ?? ""));
    const greenRatioPct = Number(heatData?.greenRatioPct);

    if (regionPopupGreenRatio) {
      regionPopupGreenRatio.textContent = Number.isFinite(greenRatioPct)
        ? `${greenRatioPct.toFixed(1)}%`
        : "자료 없음";
    }

    const averageGreenRatio = getAverageGreenRatio();

    // tg 추가 / 녹지율은 채워진 막대로 해당 동 값을, 세로선으로 대구 평균을 표시한다.
    updateAverageComparisonBar({
      container: regionPopupGreenBar,
      fill: regionPopupGreenBarFill,
      marker: regionPopupGreenAverageMarker,
      currentLabel: regionPopupGreenCurrentLabel,
      averageLabel: regionPopupGreenAverageLabel,
      currentValue: greenRatioPct,
      averageValue: averageGreenRatio,
      unit: "%",
    });

    if (regionPopupGreenComparison) {
      if (
        Number.isFinite(greenRatioPct) &&
        Number.isFinite(averageGreenRatio)
      ) {
        const difference = greenRatioPct - averageGreenRatio;
        const direction = difference >= 0 ? "높음" : "낮음";
        regionPopupGreenComparison.textContent = `대구 평균보다 ${Math.abs(difference).toFixed(1)}%p ${direction}`;
        regionPopupGreenComparison.classList.toggle(
          "metric-positive",
          difference >= 0,
        );
        regionPopupGreenComparison.classList.toggle(
          "metric-negative",
          difference < 0,
        );
      } else {
        regionPopupGreenComparison.textContent = "대구 평균 비교 불가";
        regionPopupGreenComparison.classList.remove(
          "metric-positive",
          "metric-negative",
        );
      }
    }

    updatePopupKeyFactors(dongCode);

    // tg 수정 / 건물밀도 실제 값과 대구 평균을 팝업 및 비교 막대에 표시한다.
    const buildingDensityPct = Number(heatData?.buildingDensityPct);
    const averageBuildingDensity = getAverageBuildingDensity();

    if (regionPopupBuildingDensity) {
      regionPopupBuildingDensity.textContent = Number.isFinite(
        buildingDensityPct,
      )
        ? `${buildingDensityPct.toFixed(1)}%`
        : "자료 없음";
    }

    updateAverageComparisonBar({
      container: regionPopupBuildingBar,
      fill: regionPopupBuildingBarFill,
      marker: regionPopupBuildingAverageMarker,
      currentLabel: regionPopupBuildingCurrentLabel,
      averageLabel: regionPopupBuildingAverageLabel,
      currentValue: buildingDensityPct,
      averageValue: averageBuildingDensity,
      unit: "%",
    });

    if (regionPopupBuildingComparison) {
      if (
        Number.isFinite(buildingDensityPct) &&
        Number.isFinite(averageBuildingDensity)
      ) {
        const difference = buildingDensityPct - averageBuildingDensity;
        const direction = difference >= 0 ? "높음" : "낮음";

        regionPopupBuildingComparison.textContent = `대구 평균보다 ${Math.abs(difference).toFixed(1)}%p ${direction}`;
        regionPopupBuildingComparison.classList.toggle(
          "metric-positive",
          difference < 0,
        );
        regionPopupBuildingComparison.classList.toggle(
          "metric-negative",
          difference >= 0,
        );
      } else {
        regionPopupBuildingComparison.textContent = "대구 평균 비교 불가";
        regionPopupBuildingComparison.classList.remove(
          "metric-positive",
          "metric-negative",
        );
      }
    }

    // tg 추가 / 불투수면율 실제 값과 대구 평균을 팝업 및 비교 막대에 표시한다.
    const imperviousRatioPct = Number(heatData?.imperviousRatioPct);
    const averageImperviousRatio = getAverageImperviousRatio();

    if (regionPopupImperviousRatio) {
      regionPopupImperviousRatio.textContent = Number.isFinite(
        imperviousRatioPct,
      )
        ? `${imperviousRatioPct.toFixed(1)}%`
        : "자료 없음";
    }

    updateAverageComparisonBar({
      container: regionPopupImperviousBar,
      fill: regionPopupImperviousBarFill,
      marker: regionPopupImperviousAverageMarker,
      currentLabel: regionPopupImperviousCurrentLabel,
      averageLabel: regionPopupImperviousAverageLabel,
      currentValue: imperviousRatioPct,
      averageValue: averageImperviousRatio,
      unit: "%",
    });

    if (regionPopupImperviousComparison) {
      if (
        Number.isFinite(imperviousRatioPct) &&
        Number.isFinite(averageImperviousRatio)
      ) {
        const difference = imperviousRatioPct - averageImperviousRatio;
        const direction = difference >= 0 ? "높음" : "낮음";
        regionPopupImperviousComparison.textContent = `대구 평균보다 ${Math.abs(difference).toFixed(1)}%p ${direction}`;
        regionPopupImperviousComparison.classList.toggle(
          "metric-positive",
          difference < 0,
        );
        regionPopupImperviousComparison.classList.toggle(
          "metric-negative",
          difference >= 0,
        );
      } else {
        regionPopupImperviousComparison.textContent = "대구 평균 비교 불가";
        regionPopupImperviousComparison.classList.remove(
          "metric-positive",
          "metric-negative",
        );
      }
    }

    // tg 추가 / 인구밀도 대신 총인구와 65세 미만·65세 이상 인구를 표시한다.
    const populationTotal = Number(heatData?.populationTotal);
    const populationUnder65 = Number(heatData?.populationUnder65);
    const population65Plus = Number(heatData?.population65Plus);
    const elderlyRatioPct = Number(heatData?.elderlyRatioPct);

    if (regionPopupPopulationTotal) {
      regionPopupPopulationTotal.textContent = Number.isFinite(populationTotal)
        ? `${populationTotal.toLocaleString("ko-KR")}명`
        : "자료 없음";
    }

    if (regionPopupPopulationUnder65) {
      regionPopupPopulationUnder65.textContent = Number.isFinite(
        populationUnder65,
      )
        ? `일반인 ${populationUnder65.toLocaleString("ko-KR")}명`
        : "일반인 자료 없음";
    }

    if (regionPopupPopulationElderly) {
      const elderlyCountText = Number.isFinite(population65Plus)
        ? `${population65Plus.toLocaleString("ko-KR")}명`
        : "자료 없음";
      const elderlyRatioText = Number.isFinite(elderlyRatioPct)
        ? ` · ${elderlyRatioPct.toFixed(1)}%`
        : "";
      regionPopupPopulationElderly.textContent = `65세 이상 ${elderlyCountText}${elderlyRatioText}`;
    }
  }

  // 새 지역을 조회하기 전 패널과 팝업의 이전 날씨 값을 초기 상태로 되돌린다.
  function resetWeatherPanel(message = "행정동을 선택하면 조회합니다.") {
    weatherSource.textContent = "지역 선택 후 조회";
    weatherMessage.textContent = message;
    weatherCondition.textContent = "-";
    weatherTemperature.textContent = "-";
    weatherHumidity.textContent = "-";
    weatherFeelsLike.textContent = "-";
    weatherWind.textContent = "-";
    weatherRainfall.textContent = "-";

    // tg 추가 / 다른 행정동의 이전 그래프가 남지 않도록 함께 초기화한다.
    resetTemperatureChart();

    if (regionPopupWeatherSource) {
      regionPopupWeatherSource.textContent = "조회 중";
      // jisu_07_추가수정 / 현재 시간 및 기준
      regionPopupWeatherTitle.textContent = message;
      //
      regionPopupWeatherCondition.textContent = "-";
      regionPopupWeatherTemperature.textContent = "-";
      regionPopupWeatherHumidity.textContent = "-";
      regionPopupWeatherFeelsLike.textContent = "-";
      regionPopupWeatherWind.textContent = "-";

      // tg 수정 / 날씨 조회가 시작되어도 선택 행정동의 녹지율은 유지한다.
      updatePopupEnvironmentMetrics(regionPopupDongCode);
    }
  }

  // 서버에서 정규화한 날씨를 패널과 상세 팝업에 함께 채운다.
  async function updateWeatherPanel(dongCode, requestId) {
    resetWeatherPanel("실시간 날씨를 조회하고 있습니다.");
    try {
      const response = await fetch(
        `/api/weather/${encodeURIComponent(dongCode)}`,
      );
      if (!response.ok) {
        throw new Error(`날씨 API HTTP ${response.status}`);
      }
      const weather = await response.json();
      if (!weather || typeof weather !== "object" || Array.isArray(weather)) {
        throw new Error("날씨 API 응답 형식이 올바르지 않습니다.");
      }

      if (requestId !== selectedRegionRequestId) {
        return;
      }

      weatherSource.textContent = weather.source ?? "날씨 정보";

      // jisu_07_추가수정 / 현재 시간 및 기준
      //
      // DB의 최신 정시 자료가 없어서 이전 자료를 반환한 경우 관측시각과
      // 지연 안내를 함께 표시해 사용자가 현재값으로 오해하지 않게 한다.
      // 관측시각을 오늘(화) 15:00 형식으로 표시한다.
      function formatWeatherObservedAt(value) {
        if (!value) {
          return "현재";
        }

        const observedDate = new Date(value);

        if (Number.isNaN(observedDate.getTime())) {
          return "현재";
        }

        const getDateParts = (date) => {
          const parts = new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).formatToParts(date);

          return Object.fromEntries(
            parts
              .filter((part) => part.type !== "literal")
              .map((part) => [part.type, part.value]),
          );
        };

        const observed = getDateParts(observedDate);
        const today = getDateParts(new Date());

        const isToday =
          observed.year === today.year &&
          observed.month === today.month &&
          observed.day === today.day;

        const dateText = isToday
          ? `오늘(${observed.weekday})`
          : `${observed.month}/${observed.day}(${observed.weekday})`;

        return `${dateText} ${observed.hour}:${observed.minute}`;
      }

      const observedAtText = formatWeatherObservedAt(weather.observedAt);

      const weatherTimeMessage =
        weather.status === "ready"
          ? `${observedAtText} 기준${
              weather.isStale && weather.message ? ` · ${weather.message}` : ""
            }`
          : weather.message;
      weatherMessage.textContent = weatherTimeMessage;
      weatherCondition.textContent = weather.condition ?? "-";
      weatherTemperature.textContent = formatMetric(weather.temperature, "℃");
      weatherHumidity.textContent = formatMetric(weather.humidity, "%");
      weatherFeelsLike.textContent = formatMetric(weather.feelsLike, "℃");
      weatherWind.textContent = formatMetric(weather.windSpeed, "m/s");
      weatherRainfall.textContent = formatMetric(weather.precipitation1h, "mm");
      if (regionPopupWeatherSource) {
        regionPopupWeatherSource.textContent = weather.source ?? "날씨 정보";
        // jisu_07_추가수정 / 현재 시간 및 기준
        regionPopupWeatherTitle.textContent =
          weather.status === "ready"
            ? `${observedAtText} 기준`
            : (weather.message ?? "날씨 정보 없음");
        //
        regionPopupWeatherCondition.textContent = weather.condition ?? "-";
        regionPopupWeatherTemperature.textContent = formatMetric(
          weather.temperature,
          "℃",
        );
        regionPopupWeatherHumidity.textContent = formatMetric(
          weather.humidity,
          "%",
        );
        regionPopupWeatherFeelsLike.textContent = formatMetric(
          weather.feelsLike,
          "℃",
        );
        // tg 추가 / 새 분석 팝업의 풍속 카드에 현재 풍속을 표시한다.
        regionPopupWeatherWind.textContent = formatMetric(
          weather.windSpeed,
          "m/s",
        );

        // tg 추가 / main.py의 hourlyTemperatures 배열로 온도 변화 그래프를 그린다.
        renderTemperatureChart(weather.hourlyTemperatures);
      }
    } catch (error) {
      console.error("날씨 조회 실패:", error);
      if (requestId === selectedRegionRequestId) {
        resetWeatherPanel("날씨 정보를 불러오지 못했습니다.");
      }
    }
  }

  // tg 수정 / 팝업 내부 지도 기능은 제거하고 아래부터 메인 지도용 쉼터 기능을 처리한다.
  // 03 -> jisu_08_추가수정 / 무더위 쉼터-----------------------------------------//
  // 외부 쉼터 문자열이 HTML 태그로 실행되지 않도록 변환한다.
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // 0807 / jisu_15 / 메인 지도 / 순위창·쉼터창 전환-------------------
  function showRankingSidebar() {
    if (rankingSidebar) {
      rankingSidebar.hidden = false;
    }

    if (shelterSidebar) {
      shelterSidebar.hidden = true;
    }
  }

  function showShelterSidebar(feature, shelters) {
    const dongInfo = getDongInfo(feature);

    if (rankingSidebar) {
      rankingSidebar.hidden = true;
    }

    if (shelterSidebar) {
      shelterSidebar.hidden = false;
    }

    if (shelterSidebarTitle) {
      shelterSidebarTitle.textContent = `${dongInfo.name} 무더위쉼터`;
    }

    if (shelterSidebarCount) {
      shelterSidebarCount.textContent = `${shelters.length}곳`;
    }

    if (!shelterSidebarList) {
      return;
    }

    // 다른 행정동의 쉼터를 열 때 목록 스크롤을 맨 위로 초기화한다.
    shelterSidebarList.scrollTop = 0;

    if (shelters.length === 0) {
      shelterSidebarList.innerHTML = `
      <li class="ranking-empty">선택한 행정동 안에 표시할 쉼터가 없습니다.</li>
    `;
      return;
    }

    shelterSidebarList.innerHTML = shelters
      .map(
        (shelter, shelterIndex) => `
        <li
          class="shelter-sidebar-item"
          data-shelter-index="${shelterIndex}"
          role="button"
          tabindex="0"
        >
          <strong>${escapeHtml(shelter.name ?? "무더위쉼터")}</strong>
          <span>${escapeHtml(shelter.address ?? "주소 정보 없음")}</span>
          <span class="region-popup-shelter-schedule">
            ${escapeHtml(formatShelterOperationDays(shelter.operationDays))}
            · ${escapeHtml(shelter.openTime ?? "시간 정보 없음")}
          </span>
        </li>
      `,
      )
      .join("");

    const shelterItems = shelterSidebarList.querySelectorAll(
      ".shelter-sidebar-item",
    );

    shelterItems.forEach((item) => {
      const selectShelter = () => {
        highlightMainMapShelter(Number(item.dataset.shelterIndex), {
          focusMap: true,
        });
      };

      item.addEventListener("click", selectShelter);

      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectShelter();
        }
      });
    });
  }
  // 15-----------------------------------------------------------------

  // 0807 / jisu_15 / 메인 지도 / 쉼터 마커 표시·선택-------------------
  function createMainMapShelterIcon(isSelected = false) {
    const selectedClass = isSelected ? " main-map-shelter-marker-selected" : "";

    return {
      content: `
      <div class="region-popup-shelter-marker${selectedClass}"></div>
    `,
      anchor: new naver.maps.Point(9, 9),
    };
  }

  function clearMainMapShelterMarkers() {
    mainMapShelterMarkers.splice(0).forEach((entry) => {
      entry.marker.setMap(null);
    });
  }

  function highlightMainMapShelter(
    shelterIndex,
    { focusMap = false, scrollList = false } = {},
  ) {
    let selectedEntry = null;

    mainMapShelterMarkers.forEach((entry) => {
      const isSelected = entry.shelterIndex === shelterIndex;

      entry.marker.setIcon(createMainMapShelterIcon(isSelected));
      entry.marker.setZIndex(isSelected ? 200 : 100);

      if (isSelected) {
        selectedEntry = entry;
      }
    });

    const shelterItems =
      shelterSidebarList?.querySelectorAll(".shelter-sidebar-item") ?? [];

    shelterItems.forEach((item) => {
      item.classList.toggle(
        "shelter-sidebar-item-selected",
        Number(item.dataset.shelterIndex) === shelterIndex,
      );
    });

    const selectedItem = shelterSidebarList?.querySelector(
      `.shelter-sidebar-item[data-shelter-index="${shelterIndex}"]`,
    );

    // 지도 마커 클릭 시 오른쪽 목록의 같은 쉼터로 스크롤한다.
    if (scrollList && selectedItem) {
      selectedItem.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }

    // 쉼터 목록 클릭 시 확대하지 않고 해당 위치로만 이동한다.
    if (focusMap && selectedEntry) {
      map.stop();
      map.setCenter(selectedEntry.marker.getPosition());
    }
  }

  function renderMainMapShelterMarkers(shelters) {
    clearMainMapShelterMarkers();

    shelters.forEach((shelter, shelterIndex) => {
      const latitude = Number(shelter.latitude);
      const longitude = Number(shelter.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
      }

      const marker = new naver.maps.Marker({
        map,
        position: new naver.maps.LatLng(latitude, longitude),
        title: shelter.name ?? "무더위쉼터",
        icon: createMainMapShelterIcon(false),
        zIndex: 100,
      });

      naver.maps.Event.addListener(marker, "click", () => {
        highlightMainMapShelter(shelterIndex, {
          scrollList: true,
        });
      });

      mainMapShelterMarkers.push({
        marker,
        shelterIndex,
      });
    });
  }

  async function showSheltersOnMainMap(feature) {
    const dongInfo = getDongInfo(feature);

    clearMainMapShelterMarkers();
    setStatus(`${dongInfo.name}의 무더위쉼터를 조회하고 있습니다.`);

    try {
      const response = await fetch(
        `/api/shelters?regionCode=${encodeURIComponent(dongInfo.code)}`,
      );

      if (!response.ok) {
        throw new Error(`쉼터 API HTTP ${response.status}`);
      }

      const payload = await response.json();
      const shelters = Array.isArray(payload.shelters) ? payload.shelters : [];

      renderMainMapShelterMarkers(shelters);
      showShelterSidebar(feature, shelters);

      setStatus(
        shelters.length
          ? `${dongInfo.name}의 무더위쉼터 ${shelters.length}곳을 표시했습니다.`
          : `${dongInfo.name} 안에서 표시할 무더위쉼터가 없습니다.`,
      );
    } catch (error) {
      console.error("메인 지도 쉼터 조회 실패:", error);
      clearMainMapShelterMarkers();
      showShelterSidebar(feature, []);
      setStatus("쉼터 정보를 불러오지 못했습니다.");
    }
  }
  // 15-----------------------------------------------------------------

  // 이전에 표시한 팝업 쉼터 마커를 제거한다.
  function clearRegionPopupShelterMarkers() {
    if (regionPopupShelterMarkerAnimationTimer !== null) {
      window.clearTimeout(regionPopupShelterMarkerAnimationTimer);
      regionPopupShelterMarkerAnimationTimer = null;
    }

    regionPopupShelterMarkers
      .splice(0)
      .forEach((marker) => marker.setMap(null));
  }

  // tg 추가 / 마커를 클릭했을 때 같은 순번의 무더위쉼터 목록 항목으로 이동하고 강조한다.
  function focusPopupShelterListItem(shelterIndex) {
    if (!regionPopupShelterList) {
      return;
    }

    const shelterItems = regionPopupShelterList.querySelectorAll(
      ".region-popup-shelter-item",
    );
    const targetItem = shelterItems[shelterIndex];

    if (!targetItem) {
      return;
    }

    shelterItems.forEach((item) =>
      item.classList.remove("region-popup-shelter-item-selected"),
    );
    targetItem.classList.add("region-popup-shelter-item-selected");
    targetItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // tg 추가 / 무더위쉼터 목록을 클릭하면 연결된 마커 위치로 지도를 이동한다.
  function focusPopupShelterMarker(shelterIndex) {
    if (!shelterFinderOpen) {
      return;
    }

    const marker = regionPopupShelterMarkers[shelterIndex];

    if (!marker) {
      return;
    }

    const markerPosition = marker.getPosition();

    if (!markerPosition) {
      return;
    }

    // 목록과 마커가 같은 항목임을 화면에서도 확인할 수 있게 목록을 함께 강조한다.
    focusPopupShelterListItem(shelterIndex);

    // 선택한 쉼터 마커가 잘 보이도록 확대 후 중심 이동한다.
    // zoom과 panTo를 동시에 애니메이션하면 간혹 확대만 되고 이동하지 않는
    // 현상이 있어, focusFeature와 동일하게 zoom을 먼저 즉시 반영한 뒤
    // panTo를 애니메이션으로 실행한다.
    const targetZoom = Math.max(map.getZoom(), 16);
    map.stop();
    map.setZoom(targetZoom, false);
    map.panTo(markerPosition, {
      duration: 400,
      easing: "easeOutCubic",
    });

    // 선택한 마커를 다른 마커보다 위에 표시한다.
    regionPopupShelterMarkers.forEach((shelterMarker, index) => {
      shelterMarker.setZIndex(index === shelterIndex ? 60 : 30);

      const markerElement = shelterMarker.getElement?.();
      const markerDot = markerElement?.querySelector(
        ".region-popup-shelter-marker",
      );

      markerDot?.classList.toggle(
        "region-popup-shelter-marker-active",
        index === shelterIndex,
      );
    });

    // tg 추가 / 연속으로 다른 목록을 눌러도 이전 타이머가 남지 않게 정리한다.
    if (regionPopupShelterMarkerAnimationTimer !== null) {
      window.clearTimeout(regionPopupShelterMarkerAnimationTimer);
    }

    // 선택 마커만 약 1.8초 동안 위아래로 흔들리게 표시한다.
    regionPopupShelterMarkerAnimationTimer = window.setTimeout(() => {
      regionPopupShelterMarkers.forEach((shelterMarker) => {
        const markerElement = shelterMarker.getElement?.();
        markerElement
          ?.querySelector(".region-popup-shelter-marker")
          ?.classList.remove("region-popup-shelter-marker-active");
      });

      regionPopupShelterMarkerAnimationTimer = null;
    }, 1800);
  }

  // 선택 행정동의 쉼터를 팝업 네이버 지도에 표시한다.
  function renderRegionPopupShelterMarkers(shelters) {
    clearRegionPopupShelterMarkers();

    if (!shelterFinderOpen) {
      return;
    }

    // tg 수정 / 마커와 목록 항목을 같은 배열 순번으로 연결하기 위해 index를 함께 사용한다.
    shelters.forEach((shelter, shelterIndex) => {
      const latitude = Number(shelter.latitude);
      const longitude = Number(shelter.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
      }

      const marker = new naver.maps.Marker({
        map,
        position: new naver.maps.LatLng(latitude, longitude),
        title: shelter.name ?? "무더위쉼터",
        icon: {
          content: '<div class="region-popup-shelter-marker"></div>',
          anchor: new naver.maps.Point(9, 9),
        },
        zIndex: 30,
      });

      // tg 추가 / 파란 마커 클릭 시 해당 무더위쉼터 목록 항목을 표시한다.
      naver.maps.Event.addListener(marker, "click", () => {
        focusPopupShelterListItem(shelterIndex);
      });

      regionPopupShelterMarkers.push(marker);
    });
  }

  // tg 추가 / 파이차트용 SVG 요소를 생성한다.
  function createShelterChartSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(
      "http://www.w3.org/2000/svg",
      tagName,
    );

    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, String(value));
    });

    return element;
  }

  // tg 추가 / 기존 데이터에 이용 대상 필드가 없을 때 시설 유형으로 보완 분류한다.
  function normalizeShelterAccessType(shelter) {
    if (
      shelter?.accessType === "public" ||
      shelter?.accessType === "restricted"
    ) {
      return shelter.accessType;
    }

    const facilityType = String(shelter?.facilityType ?? "");
    const name = String(shelter?.name ?? "");

    const restricted =
      facilityType === "경로당" ||
      facilityType === "특정계층이용시설" ||
      ["경로당", "노인", "시니어", "장애인", "어린이집", "아동"].some(
        (keyword) => name.includes(keyword),
      );

    return restricted ? "restricted" : "public";
  }

  // tg 추가 / 모두 이용 가능·특정 대상 중심별 개수와 시설 세부 유형을 집계한다.
  function summarizeShelterAccess(shelters) {
    const summary = {
      public: {
        key: "public",
        label: "모두 이용 가능",
        count: 0,
        color: "#10b981",
        facilityTypes: new Map(),
      },
      restricted: {
        key: "restricted",
        label: "특정 대상 중심",
        count: 0,
        color: "#f97316",
        facilityTypes: new Map(),
      },
    };

    shelters.forEach((shelter) => {
      const accessType = normalizeShelterAccessType(shelter);
      const group = summary[accessType];
      const facilityType =
        String(shelter?.facilityType ?? "기타").trim() || "기타";

      group.count += 1;
      group.facilityTypes.set(
        facilityType,
        (group.facilityTypes.get(facilityType) ?? 0) + 1,
      );
    });

    return summary;
  }

  // tg 수정 / 마우스를 올리면 "모두 이용 가능 5 (금융기관 3 + 공공시설 1 + 행정복지센터 1)" 형식으로 표시한다.
  function showShelterChartTooltip(event, group, totalCount) {
    if (!regionPopupShelterChartTooltip) {
      return;
    }

    const percentage =
      totalCount > 0 ? ((group.count / totalCount) * 100).toFixed(1) : "0.0";
    const facilitySummary = [...group.facilityTypes.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([facilityType, count]) => `${facilityType} ${count}`)
      .join(" + ");

    // tg 수정 / 전체 개수에는 '곳' 단위를 붙이고 세부 유형 개수는 숫자만 표시한다.
    regionPopupShelterChartTooltip.textContent = `${group.label} ${group.count}곳 (${facilitySummary}) · ${percentage}%`;
    regionPopupShelterChartTooltip.hidden = false;

    const wrapper = regionPopupShelterChartTooltip.parentElement;
    const wrapperRect = wrapper?.getBoundingClientRect();
    const pointerX = Number(event.clientX);
    const pointerY = Number(event.clientY);

    if (wrapperRect && Number.isFinite(pointerX) && Number.isFinite(pointerY)) {
      regionPopupShelterChartTooltip.style.left = `${pointerX - wrapperRect.left + 12}px`;
      regionPopupShelterChartTooltip.style.top = `${pointerY - wrapperRect.top + 12}px`;
    }
  }

  function hideShelterChartTooltip() {
    if (regionPopupShelterChartTooltip) {
      regionPopupShelterChartTooltip.hidden = true;
    }
  }

  // tg 추가 / 지역 변경 또는 조회 실패 시 이전 파이차트를 초기화한다.
  function resetShelterAccessChart(
    message = "무더위쉼터 이용 대상을 분석하는 중입니다.",
  ) {
    if (regionPopupShelterChartMessage) {
      regionPopupShelterChartMessage.textContent = message;
      regionPopupShelterChartMessage.hidden = false;
      regionPopupShelterChartMessage.style.display = "grid";
    }

    if (regionPopupShelterChart) {
      regionPopupShelterChart.hidden = true;
      regionPopupShelterChart.style.display = "none";
    }

    regionPopupShelterChartSlices?.replaceChildren();
    regionPopupShelterChartCenter?.replaceChildren();
    regionPopupShelterChartLegend?.replaceChildren();
    hideShelterChartTooltip();
  }

  // tg 추가 / 해당 동의 쉼터를 모두 이용 가능과 특정 대상 중심으로 나눈 도넛형 파이차트를 그린다.
  function renderShelterAccessChart(shelters) {
    if (
      !regionPopupShelterChart ||
      !regionPopupShelterChartSlices ||
      !regionPopupShelterChartCenter ||
      !regionPopupShelterChartLegend
    ) {
      return;
    }

    const records = Array.isArray(shelters) ? shelters : [];
    const summary = summarizeShelterAccess(records);
    const groups = [summary.public, summary.restricted].filter(
      (group) => group.count > 0,
    );
    const totalCount = groups.reduce((sum, group) => sum + group.count, 0);

    if (totalCount === 0) {
      resetShelterAccessChart("표시할 무더위쉼터가 없습니다.");
      return;
    }

    const centerX = 108;
    const centerY = 108;
    const radius = 72;
    const circumference = 2 * Math.PI * radius;
    let accumulatedRatio = 0;

    regionPopupShelterChartSlices.replaceChildren();
    regionPopupShelterChartCenter.replaceChildren();
    regionPopupShelterChartLegend.replaceChildren();

    const backgroundCircle = createShelterChartSvgElement("circle", {
      cx: centerX,
      cy: centerY,
      r: radius,
      fill: "none",
      stroke: "#e2e8f0",
      "stroke-width": 30,
    });
    regionPopupShelterChartSlices.append(backgroundCircle);

    groups.forEach((group) => {
      const ratio = group.count / totalCount;
      const segmentLength = Math.max(0, circumference * ratio - 2);
      const circle = createShelterChartSvgElement("circle", {
        cx: centerX,
        cy: centerY,
        r: radius,
        fill: "none",
        stroke: group.color,
        "stroke-width": 30,
        "stroke-linecap": "butt",
        "stroke-dasharray": `${segmentLength} ${circumference}`,
        "stroke-dashoffset": String(-circumference * accumulatedRatio),
        transform: `rotate(-90 ${centerX} ${centerY})`,
        tabindex: "0",
        role: "img",
        "aria-label": `${group.label} ${group.count}곳`,
        class: "region-popup-shelter-chart-slice",
      });

      circle.addEventListener("mouseenter", (event) => {
        showShelterChartTooltip(event, group, totalCount);
      });
      circle.addEventListener("mousemove", (event) => {
        showShelterChartTooltip(event, group, totalCount);
      });
      circle.addEventListener("mouseleave", hideShelterChartTooltip);
      circle.addEventListener("focus", (event) => {
        const syntheticEvent = {
          clientX: event.target.getBoundingClientRect().left,
          clientY: event.target.getBoundingClientRect().top,
        };
        showShelterChartTooltip(syntheticEvent, group, totalCount);
      });
      circle.addEventListener("blur", hideShelterChartTooltip);

      regionPopupShelterChartSlices.append(circle);
      accumulatedRatio += ratio;

      const legendItem = document.createElement("span");
      const legendColor = document.createElement("i");
      const legendText = document.createElement("span");

      legendItem.className = "region-popup-shelter-chart-legend-item";
      legendColor.className = "region-popup-shelter-chart-legend-color";
      legendColor.style.backgroundColor = group.color;
      legendText.textContent = `${group.label} ${group.count}곳 · ${(ratio * 100).toFixed(1)}%`;

      legendItem.append(legendColor, legendText);
      regionPopupShelterChartLegend.append(legendItem);
    });

    const publicRatio = (summary.public.count / totalCount) * 100;

    // tg 추가 / 파이차트 옆에 쉼터 핵심 수치를 글로 함께 표시한다.
    if (regionPopupShelterTotal)
      regionPopupShelterTotal.textContent = `${totalCount}곳`;
    if (regionPopupShelterPublic) {
      regionPopupShelterPublic.textContent = `${summary.public.count}곳`;
    }
    if (regionPopupShelterRestricted) {
      regionPopupShelterRestricted.textContent = `${summary.restricted.count}곳`;
    }
    if (regionPopupShelterPublicRatio) {
      regionPopupShelterPublicRatio.textContent = `${publicRatio.toFixed(1)}%`;
    }
    if (regionPopupShelterComparison) {
      regionPopupShelterComparison.textContent =
        publicRatio >= 50
          ? "일반 시민이 이용 가능한 쉼터가 절반 이상입니다."
          : "일반 시민이 이용 가능한 쉼터가 절반 미만입니다.";
    }

    const centerLabel = createShelterChartSvgElement("text", {
      x: centerX,
      y: centerY - 10,
      "text-anchor": "middle",
      fill: "#64748b",
      "font-size": 11,
      "font-weight": 700,
    });
    centerLabel.textContent = "일반 이용 가능";

    const centerValue = createShelterChartSvgElement("text", {
      x: centerX,
      y: centerY + 14,
      "text-anchor": "middle",
      fill: "#0f172a",
      "font-size": 22,
      "font-weight": 800,
    });
    centerValue.textContent = `${publicRatio.toFixed(1)}%`;

    const centerCount = createShelterChartSvgElement("text", {
      x: centerX,
      y: centerY + 32,
      "text-anchor": "middle",
      fill: "#64748b",
      "font-size": 10,
      "font-weight": 700,
    });
    // tg 수정 / 차트 중앙의 개수 표기에서 '곳' 단위를 제거한다.
    centerCount.textContent = `${summary.public.count} / ${totalCount}`;

    regionPopupShelterChartCenter.append(centerLabel, centerValue, centerCount);

    if (regionPopupShelterChartMessage) {
      regionPopupShelterChartMessage.hidden = true;
      regionPopupShelterChartMessage.style.display = "none";
    }

    regionPopupShelterChart.hidden = false;
    regionPopupShelterChart.style.display = "block";
  }

  // 팝업의 쉼터 개수와 목록을 초기 상태로 되돌린다.
  function resetPopupShelters() {
    regionPopupShelterRecords = [];
    clearRegionPopupShelterMarkers();

    if (regionPopupShelterCount) {
      regionPopupShelterCount.textContent = "조회 중";
    }

    if (regionPopupShelterMessage) {
      regionPopupShelterMessage.textContent =
        "선택 경계 내부 쉼터를 조회하고 있습니다.";
    }

    if (regionPopupShelterList) {
      regionPopupShelterList.innerHTML = "";
    }

    // tg 추가 / 행정동이 바뀔 때 이전 쉼터 파이차트와 핵심 수치를 초기화한다.
    if (regionPopupShelterTotal) regionPopupShelterTotal.textContent = "-";
    if (regionPopupShelterPublic) regionPopupShelterPublic.textContent = "-";
    if (regionPopupShelterRestricted)
      regionPopupShelterRestricted.textContent = "-";
    if (regionPopupShelterPublicRatio)
      regionPopupShelterPublicRatio.textContent = "-";
    if (regionPopupShelterComparison) {
      regionPopupShelterComparison.textContent =
        "해당 동 쉼터 구성을 분석하는 중입니다.";
    }
    resetShelterAccessChart();
  }

  // jisu_09_추가 / 쉼터 운영요일을 짧게 표시한다.----------------//
  function formatShelterOperationDays(value) {
    const days = String(value ?? "").replaceAll(" ", "");

    if (days === "월,화,수,목,금,토,일") {
      return "매일";
    }

    if (days === "월,화,수,목,금") {
      return "평일";
    }

    return days ? days.replaceAll(",", "·") : "요일 정보 없음";
  }
  //----------------------------------------------------------//

  // 선택 행정동의 쉼터 이름과 주소를 팝업에 표시한다.
  function renderPopupShelterList(shelters) {
    if (!regionPopupShelterList) {
      return;
    }

    if (shelters.length === 0) {
      regionPopupShelterList.innerHTML =
        '<li class="region-popup-shelter-empty">표시할 무더위쉼터가 없습니다.</li>';
      return;
    }

    /*jisu_09_추가 / 쉼터 / 목록에 운영요일·시간 추가 */
    // tg 수정 / 기존 8개 제한(.slice(0, 8))을 제거해 조회된 쉼터를 모두 표시한다.
    // tg 추가 / 마커와 연결할 수 있도록 각 목록 항목에 동일한 순번과 전용 클래스를 부여한다.
    regionPopupShelterList.innerHTML = shelters
      .map(
        (shelter, shelterIndex) => `
        <li
          class="region-popup-shelter-item"
          data-shelter-index="${shelterIndex}"
          role="button"
          tabindex="0"
          aria-label="${escapeHtml(shelter.name ?? "무더위쉼터")} 위치로 이동"
        >
          <strong>${escapeHtml(shelter.name ?? "무더위쉼터")}</strong>
          <span>${escapeHtml(shelter.address ?? "주소 정보 없음")}</span>
          <span class="region-popup-shelter-schedule">
            ${escapeHtml(formatShelterOperationDays(shelter.operationDays))}
            · ${escapeHtml(shelter.openTime ?? "시간 정보 없음")}
          </span>
        </li>
      `,
      )
      .join("");
  }

  // tg 추가 / 쉼터 목록 클릭 또는 Enter·Space 입력 시 해당 마커로 이동한다.
  regionPopupShelterList?.addEventListener("click", (event) => {
    const shelterItem = event.target.closest(".region-popup-shelter-item");

    if (!shelterItem || !regionPopupShelterList.contains(shelterItem)) {
      return;
    }

    const shelterIndex = Number(shelterItem.dataset.shelterIndex);

    if (Number.isInteger(shelterIndex)) {
      focusPopupShelterMarker(shelterIndex);
    }
  });

  regionPopupShelterList?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const shelterItem = event.target.closest(".region-popup-shelter-item");

    if (!shelterItem || !regionPopupShelterList.contains(shelterItem)) {
      return;
    }

    event.preventDefault();

    const shelterIndex = Number(shelterItem.dataset.shelterIndex);

    if (Number.isInteger(shelterIndex)) {
      focusPopupShelterMarker(shelterIndex);
    }
  });

  // 선택 행정동 경계 안의 무더위쉼터를 서버에서 조회한다.
  async function updateShelters(dongCode, requestId) {
    // tg 수정 / 쉼터 데이터는 분석 팝업의 파이차트와 별도 찾기 메뉴에서 함께 사용한다.
    if (regionPopupDongCode !== dongCode) {
      return;
    }

    resetPopupShelters();

    try {
      const response = await fetch(
        `/api/shelters?regionCode=${encodeURIComponent(dongCode)}`,
      );

      if (!response.ok) {
        throw new Error(`쉼터 API HTTP ${response.status}`);
      }

      const payload = await response.json();

      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("쉼터 API 응답 형식이 올바르지 않습니다.");
      }

      if (
        requestId !== selectedRegionRequestId ||
        regionPopupDongCode !== dongCode
      ) {
        return;
      }

      const shelters = Array.isArray(payload.shelters) ? payload.shelters : [];

      regionPopupShelterRecords = shelters;

      regionPopupShelterCount.textContent = `${shelters.length}곳`;
      regionPopupShelterMessage.textContent =
        payload.message ?? "선택 행정동 안의 무더위쉼터 정보입니다.";

      renderPopupShelterList(shelters);

      // tg 추가 / 조회된 쉼터의 일반 이용 가능 여부와 시설 세부 유형을 파이차트로 표시한다.
      renderShelterAccessChart(shelters);

      // tg 수정 / 무더위쉼터 찾기 패널이 열려 있을 때만 메인 지도에 마커를 표시한다.
      if (shelterFinderOpen) {
        renderRegionPopupShelterMarkers(shelters);
      }
    } catch (error) {
      console.error("쉼터 조회 실패:", error);

      if (requestId === selectedRegionRequestId) {
        regionPopupShelterCount.textContent = "조회 실패";
        regionPopupShelterMessage.textContent =
          "쉼터 정보를 불러오지 못했습니다.";
        renderPopupShelterList([]);
        resetShelterAccessChart("쉼터 이용 대상 분석을 불러오지 못했습니다.");
        clearRegionPopupShelterMarkers();
      }
    }
  }
  //--------------------------------------------------------------------------------//

  // jisu_03_추가 / 팝업 / 폭염특보 함수
  // 지역 변경·특보 없음·팝업 종료 시 이전 특보를 숨긴다.
  function hideSelectedHeatAlert() {
    if (selectedHeatAlert) {
      selectedHeatAlert.hidden = true;
      selectedHeatAlert.dataset.level = "normal";
    }
  }

  // 선택 행정동의 기상청 폭염·열대야 특보를 조회한다.
  async function updateHeatAlert(dongCode, requestId) {
    hideSelectedHeatAlert();

    try {
      const response = await fetch(
        `/api/heat-alerts?regionCode=${encodeURIComponent(dongCode)}`,
      );

      if (!response.ok) {
        throw new Error(`특보 API HTTP ${response.status}`);
      }

      const payload = await response.json();

      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("특보 API 응답 형식이 올바르지 않습니다.");
      }

      // 이전에 선택한 행정동의 늦은 응답은 화면에 표시하지 않는다.
      if (requestId !== selectedRegionRequestId) {
        return;
      }

      const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

      const isActiveOfficialAlert =
        payload.status === "active" &&
        payload.source === "기상청 기상특보 조회서비스" &&
        alerts.length > 0;

      if (!isActiveOfficialAlert) {
        hideSelectedHeatAlert();
        return;
      }

      const isTestMode = payload.testMode === true;
      // jisu_12_추가수정 / 폭염, 열대야 경보
      /*
      긴급 폭염주의보 · 열대야주의보 둘 다면
      -> 선택 지역에 폭염주의보와 열대야주의보가 동시에 발표 중입니다.

      긴급 폭염주의보
      -> 대구 ○○동 지역에 폭염주의보가 발표 중입니다.

      긴급 열대야경보
      -> 대구 ○○동 지역에 열대야경보가 발표 중입니다.
      */
      const alertTitles = [
        ...new Set(alerts.map((alert) => alert.title).filter(Boolean)),
      ];
      const alertMessages = alerts
        .map((alert) => alert.message)
        .filter(Boolean);

      // 배너 제목은 여러 특보가 있으면 가운데 점으로 구분한다.
      const alertTitle = alertTitles.join(" · ") || "기상특보";

      // jisu_12_추가수정 / 폭염, 열대야 주의보
      // 여러 특보가 동시에 있으면 하나의 자연스러운 문장으로 합친다.
      const combinedAlertNames =
        alertTitles.length <= 1
          ? alertTitles[0]
          : `${alertTitles.slice(0, -1).join(", ")}와 ${
              alertTitles[alertTitles.length - 1]
            }`;

      // 서버가 전달한 실제 구·군과 행정동 이름을 사용한다.
      const selectedRegionName =
        typeof payload.regionName === "string" && payload.regionName.trim()
          ? payload.regionName.trim()
          : "선택 지역";

      // 특보가 여러 개면 실제 지역명과 특보명을 하나의 문장으로 합친다.
      const alertMessage =
        alertTitles.length > 1
          ? `${selectedRegionName} 지역에 ${combinedAlertNames}가 동시에 발표 중입니다.`
          : (alertMessages[0] ??
            `${selectedRegionName} 지역에 기상특보가 발표 중입니다.`);

      const alertLevel = alerts.some((alert) => alert.level === "critical")
        ? "critical"
        : "warning";

      const hasHeatwaveAlert = alerts.some(
        (alert) => alert.category === "heatwave",
      );
      const hasTropicalNightAlert = alerts.some(
        (alert) => alert.category === "tropical-night",
      );

      const safetyMessage =
        hasHeatwaveAlert && hasTropicalNightAlert
          ? "낮에는 야외활동을 줄이고, 밤사이 실내 온도를 낮추며 충분한 수분을 섭취하세요."
          : hasTropicalNightAlert
            ? "밤사이 실내 온도를 낮추고 충분한 수분을 섭취하세요."
            : "충분한 수분 섭취와 한낮 야외활동 자제가 필요합니다.";

      if (selectedHeatAlertTitle) {
        selectedHeatAlertTitle.textContent = isTestMode
          ? `테스트 ${alertTitle}`
          : `긴급 ${alertTitle}`;
      }

      if (selectedHeatAlertMessage) {
        selectedHeatAlertMessage.textContent =
          // `${isTestMode ? "화면 테스트" : "기상청 발표"} · ` +
          `${alertMessage} · ${safetyMessage}`;
      }

      if (selectedHeatAlert) {
        selectedHeatAlert.dataset.level = alertLevel;
        selectedHeatAlert.hidden = false;
      }
    } catch (error) {
      console.error("폭염 안전 안내 조회 실패:", error);
      hideSelectedHeatAlert();
    }
  }
  /* 03*/

  function updateDongPanel(feature) {
    const dongInfo = getDongInfo(feature);
    const heatData = heatDataByDongCode.get(dongInfo.code);
    const riskStyle = RISK_STYLES[heatData?.riskLevel ?? "none"];

    showPanelMode("dong");

    if (dongNameElement) {
      dongNameElement.textContent = dongInfo.name;
    }

    if (dongDistrictElement) {
      dongDistrictElement.textContent = getDistrictName(feature);
    }

    if (dongCodeElement) {
      dongCodeElement.textContent = dongInfo.code;
    }

    if (dongBaseDateElement) {
      dongBaseDateElement.textContent = formatBaseDate(
        heatData?.observedAt ?? heatDataBaseDate ?? dongInfo.baseDate,
      );
    }

    if (dongRiskLevelElement) {
      dongRiskLevelElement.textContent = riskStyle.label;
      dongRiskLevelElement.style.color = Number.isFinite(heatData?.score)
        ? riskStyle.color
        : "";
    }

    if (dongRiskScoreElement) {
      dongRiskScoreElement.textContent = Number.isFinite(heatData?.score)
        ? `${heatData.score.toFixed(1)}점`
        : "-";
    }

    updateIndicatorBreakdown(heatData?.indicators);
  }

  // jisu_03_추가 / 팝업 / 팝업 열기·닫기 함수
  // 클릭한 행정동의 기본 정보로 상세 팝업을 연다.
  // showPopup=false면 쉼터보기 선택 시처럼 데이터만 불러오고 화면에는 띄우지 않는다.
  function openRegionPopup(feature, { showPopup = true } = {}) {
    if (!regionPopup) {
      return;
    }

    const dongInfo = getDongInfo(feature);
    const heatData = heatDataByDongCode.get(dongInfo.code);
    const riskStyle = RISK_STYLES[heatData?.riskLevel ?? "none"];

    regionPopupLocation.textContent = `${getDistrictName(feature)} · 선택 행정구역`;
    regionPopupTitle.textContent = dongInfo.name;
    regionPopupRisk.textContent = riskStyle.label;
    regionPopupScore.textContent = Number.isFinite(heatData?.score)
      ? `${Number(heatData.score).toFixed(1)}점`
      : "-";
    updatePopupRank(dongInfo.code);

    regionPopupDongCode = dongInfo.code;

    // tg 추가 / 팝업을 열자마자 해당 행정동의 녹지율을 표시한다.
    updatePopupEnvironmentMetrics(dongInfo.code);

    resetPopupShelters();
    hideSelectedHeatAlert();

    if (!showPopup) {
      return;
    }

    revealRegionPopup();
  }

  // 이미 불러온 팝업 데이터를 다시 초기화하지 않고 화면에만 보여준다.
  function revealRegionPopup() {
    if (!regionPopup) {
      return;
    }

    regionPopup.hidden = false;
    document.body.classList.add("has-region-popup");

    // tg 수정 / 팝업 내부 지도는 제거했으므로 닫기 버튼에만 포커스를 이동한다.
    window.setTimeout(() => {
      regionPopupClose?.focus();
    }, 0);
  }

  // 상세 팝업과 팝업 전용 상태를 초기화한다.
  function closeRegionPopup() {
    if (!regionPopup || regionPopup.hidden) {
      return;
    }

    regionPopup.hidden = true;
    regionPopupDongCode = null;
    // tg 수정 / 분석 팝업을 닫아도 별도 쉼터 찾기 메뉴가 열려 있으면 마커와 목록은 유지한다.
    if (!shelterFinderOpen) {
      regionPopupShelterRecords = [];
      clearRegionPopupShelterMarkers();
    }
    document.body.classList.remove("has-region-popup");
    hideSelectedHeatAlert();
  }
  //

  // 행정동 클릭 시 상세정보표시·쉼터보기 중 하나를 고르는 선택창을 연다.
  function openRegionChoicePanel(feature) {
    if (!regionChoicePanel || !regionChoiceBackdrop) {
      openRegionPopup(feature);
      return;
    }
    clearMainMapShelterMarkers();
    showRankingSidebar();
    pendingChoiceFeature = feature;

    if (regionChoiceTitle) {
      regionChoiceTitle.textContent = getDongInfo(feature).name;
    }

    regionChoicePanel.hidden = false;
    regionChoiceBackdrop.hidden = false;
    regionChoicePanel.setAttribute("aria-hidden", "false");

    window.requestAnimationFrame(() => regionChoiceDetailButton?.focus());
  }

  function closeRegionChoicePanel() {
    if (!regionChoicePanel || regionChoicePanel.hidden) {
      return;
    }

    regionChoicePanel.hidden = true;
    if (regionChoiceBackdrop) {
      regionChoiceBackdrop.hidden = true;
    }
    regionChoicePanel.setAttribute("aria-hidden", "true");
    pendingChoiceFeature = null;
  }

  function clearSelectionEffects() {
    if (selectionAnimationFrame !== null) {
      window.cancelAnimationFrame(selectionAnimationFrame);
      selectionAnimationFrame = null;
    }

    [...selectionMaskPolygons, ...selectionHaloPolygons].forEach((polygon) => {
      polygon.setMap(null);
    });
    selectionMaskPolygons.length = 0;
    selectionHaloPolygons.length = 0;
  }

  function applySelectedFeatureStyle(feature, liftProgress = 0) {
    const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);
    setDongPolygonOptions(dongCode, {
      visible: true,
      fillColor: "#f97316",
      fillOpacity: 0.5 + liftProgress * 0.18,
      strokeColor: "#7c2d12",
      strokeOpacity: 1,
      strokeWeight: 3.6 + liftProgress * 2.2,
      clickable: true,
      zIndex: 28,
    });
  }

  function animateSelectedFeature(feature) {
    if (selectionAnimationFrame !== null) {
      window.cancelAnimationFrame(selectionAnimationFrame);
    }

    const startedAt = window.performance.now();
    const duration = 520;
    const animate = (currentTime) => {
      const progress = Math.min((currentTime - startedAt) / duration, 1);
      const liftProgress = Math.sin(progress * Math.PI);
      applySelectedFeatureStyle(feature, liftProgress);

      if (progress < 1) {
        selectionAnimationFrame = window.requestAnimationFrame(animate);
      } else {
        selectionAnimationFrame = null;
        applySelectedFeatureStyle(feature);
      }
    };

    selectionAnimationFrame = window.requestAnimationFrame(animate);
  }

  function showSelectionEffects(feature) {
    clearSelectionEffects();
    const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);
    const geometry = dongGeometryByCode.get(dongCode);

    if (!geometry) {
      return;
    }

    const polygonGroups = getPolygonCoordinateGroups(geometry);
    const outerPath = [
      new naver.maps.LatLng(35.35, 128.1),
      new naver.maps.LatLng(36.45, 128.1),
      new naver.maps.LatLng(36.45, 129.2),
      new naver.maps.LatLng(35.35, 129.2),
      new naver.maps.LatLng(35.35, 128.1),
    ];
    const selectedOuterPaths = polygonGroups.map(
      (polygonCoordinates) => polygonCoordinatesToPaths(polygonCoordinates)[0],
    );

    const focusMask = new naver.maps.Polygon({
      map,
      paths: [outerPath, ...selectedOuterPaths],
      fillColor: "#e2e8f0",
      fillOpacity: 0.34,
      strokeOpacity: 0,
      strokeWeight: 0,
      clickable: false,
      zIndex: 25,
    });
    selectionMaskPolygons.push(focusMask);

    polygonGroups.forEach((polygonCoordinates) => {
      const halo = new naver.maps.Polygon({
        map,
        paths: polygonCoordinatesToPaths(polygonCoordinates),
        fillColor: "#ffffff",
        fillOpacity: 0.06,
        strokeColor: "#ffffff",
        strokeOpacity: 0.7,
        strokeWeight: 8,
        clickable: false,
        zIndex: 29,
      });
      selectionHaloPolygons.push(halo);
    });
  }

  // jisu_03_추가수정 / 팝업 / selectDong() 교체
  function selectDong(feature, shouldFocus = true) {
    if (selectedFeature && selectedFeature !== feature) {
      applyDongPolygonStyle(selectedFeature);
    }

    selectedFeature = feature;
    hideSelectedHeatAlert();

    // master에 원래 있던 지도 선택 효과는 유지한다.
    showSelectionEffects(feature);
    animateSelectedFeature(feature);

    const dongInfo = getDongInfo(feature);
    const requestId = ++selectedRegionRequestId;

    updateDongPanel(feature);

    // 날씨와 특보를 서로 기다리지 않고 동시에 조회한다.
    Promise.allSettled([
      updateWeatherPanel(dongInfo.code, requestId),
      updateShelters(dongInfo.code, requestId), //jisu_08_추가 / 무더위 쉼터
      updateHeatAlert(dongInfo.code, requestId),
    ]);

    if (shouldFocus) {
      focusFeature(feature);
    }

    setStatus(`${dongInfo.name}을 선택했습니다.`);
  }
  // 03

  function focusFeature(feature) {
    const dongCode = getFeatureValue(feature, ["ADM_CD", "adm_cd", "code"]);
    const bounds = dongBoundsByCode.get(dongCode);

    if (bounds) {
      const southWest = bounds.getSW();
      const northEast = bounds.getNE();
      const latitudePadding = Math.max(
        (northEast.lat() - southWest.lat()) * 0.45,
        0.004,
      );
      const longitudePadding = Math.max(
        (northEast.lng() - southWest.lng()) * 0.45,
        0.004,
      );
      const paddedBounds = new naver.maps.LatLngBounds(
        new naver.maps.LatLng(
          southWest.lat() - latitudePadding,
          southWest.lng() - longitudePadding,
        ),
        new naver.maps.LatLng(
          northEast.lat() + latitudePadding,
          northEast.lng() + longitudePadding,
        ),
      );
      const projection = map.getProjection();
      const mapSize = map.getSize();
      const southWestOffset = projection.fromCoordToOffset(
        paddedBounds.getSW(),
      );
      const northEastOffset = projection.fromCoordToOffset(
        paddedBounds.getNE(),
      );
      const boundsWidth = Math.max(
        Math.abs(northEastOffset.x - southWestOffset.x),
        1,
      );
      const boundsHeight = Math.max(
        Math.abs(northEastOffset.y - southWestOffset.y),
        1,
      );
      const availableWidth = Math.max(Number(mapSize.width) - 180, 1);
      const availableHeight = Math.max(Number(mapSize.height) - 180, 1);
      const fitRatio = Math.min(
        availableWidth / boundsWidth,
        availableHeight / boundsHeight,
      );
      const fittedZoom =
        map.getZoom() + Math.floor(Math.log2(Math.max(fitRatio, 0.001)));
      const targetZoom = Math.min(
        Number(map.getOptions("maxZoom")),
        Math.max(MIN_SELECTION_ZOOM, fittedZoom),
      );

      map.stop();
      map.setZoom(targetZoom, false);
      map.panTo(paddedBounds.getCenter(), {
        duration: 520,
        easing: "easeOutCubic",
      });
    }
  }

  function focusDistrict(districtName) {
    const bounds = districtBoundsByName.get(districtName);

    if (bounds) {
      map.fitBounds(bounds, 60);
    }
  }

  function selectDistrict(districtName) {
    clearDongHover();
    clearSelection();
    selectedDistrict = districtName;

    if (districtFilter) {
      districtFilter.value = districtName;
    }

    applyMapFilters();

    if (districtName === "all") {
      return;
    }

    updateDistrictPanel(districtName);
    focusDistrict(districtName);
    setStatus(`선택 구·군: ${districtName}`);
  }

  // jisu_03_추가 / 팝업 / 초기화 시 팝업·날씨 정리
  function clearSelection() {
    // 이전 날씨·특보 요청이 늦게 도착해도 반영되지 않게 한다.
    selectedRegionRequestId += 1;

    closeRegionPopup();
    hideSelectedHeatAlert();
    clearSelectionEffects();
    // 0807 / jisu_15 / 지도 초기화 시 메인 쉼터 표시도 함께 초기화-------------------
    closeRegionChoicePanel();
    clearMainMapShelterMarkers();
    showRankingSidebar();
    // 15-----------------------------------------------------------------

    if (selectedFeature) {
      applyDongPolygonStyle(selectedFeature);
      selectedFeature = null;
    }

    showPanelMode("dong");

    if (dongNameElement) {
      dongNameElement.textContent = "행정동을 선택하세요";
    }

    if (dongDistrictElement) {
      dongDistrictElement.textContent = "-";
    }

    if (dongCodeElement) {
      dongCodeElement.textContent = "-";
    }

    if (dongBaseDateElement) {
      dongBaseDateElement.textContent = "-";
    }

    if (dongRiskLevelElement) {
      dongRiskLevelElement.textContent = "데이터 없음";
      dongRiskLevelElement.style.color = "";
    }

    if (dongRiskScoreElement) {
      dongRiskScoreElement.textContent = "-";
    }

    updateIndicatorBreakdown();
    resetWeatherPanel(); // jisu_03_추가 / 팝업 / 초기화 시 팝업·날씨 정리
  }

  function normalizePlaceCoordinate(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return Math.abs(numericValue) > 1000
      ? numericValue / 10000000
      : numericValue;
  }

  function findDongFeatureByCoordinates(longitude, latitude) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return null;
    }

    return findDongFeatureAtCoordinate(
      new naver.maps.LatLng(latitude, longitude),
    );
  }

  function getDongSearchCandidates(query) {
    const normalizedQuery = query.replaceAll(" ", "");

    return dongFeatures
      .filter((feature) => {
        const dongName = getDongInfo(feature)
          .name.toLocaleLowerCase("ko-KR")
          .replaceAll(" ", "");

        return (
          featureMatchesFilters(feature) && dongName.includes(normalizedQuery)
        );
      })
      .sort((left, right) =>
        getDongInfo(left).name.localeCompare(getDongInfo(right).name, "ko-KR"),
      )
      .slice(0, 10)
      .map((feature) => {
        const dongInfo = getDongInfo(feature);
        return {
          type: "dong",
          feature,
          title: dongInfo.name,
          subtitle: `행정동 · ${getDistrictName(feature)}`,
          keyword: dongInfo.name,
        };
      });
  }

  async function getPlaceSearchCandidates(rawQuery) {
    const response = await fetch(
      `/api/place-search?query=${encodeURIComponent(rawQuery)}`,
      { method: "GET", cache: "no-cache" },
    );

    if (!response.ok) {
      throw new Error(
        `장소 검색 실패: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];

    return items
      .map((item) => {
        const longitude = normalizePlaceCoordinate(item.mapx);
        const latitude = normalizePlaceCoordinate(item.mapy);
        const feature = findDongFeatureByCoordinates(longitude, latitude);

        if (!feature || !featureMatchesFilters(feature)) {
          return null;
        }

        const dongInfo = getDongInfo(feature);
        const districtName = getDistrictName(feature);
        return {
          type: "place",
          feature,
          placeTitle: item.title,
          title: item.title,
          subtitle: `${districtName} ${dongInfo.name}`,
          keyword: item.title,
        };
      })
      .filter(Boolean);
  }

  async function getSearchCandidates(rawQuery) {
    const query = rawQuery.trim().toLocaleLowerCase("ko-KR");

    if (!query) {
      return [];
    }

    const dongCandidates = getDongSearchCandidates(query);
    let placeCandidates = [];

    if (query.length >= 2) {
      try {
        placeCandidates = await getPlaceSearchCandidates(rawQuery);
      } catch (error) {
        console.warn("장소 검색 결과를 불러오지 못했습니다.", error);
      }
    }

    return [...dongCandidates, ...placeCandidates].slice(0, 12);
  }

  function closeSearchResults() {
    if (searchRenderTimer !== null) {
      window.clearTimeout(searchRenderTimer);
      searchRenderTimer = null;
    }

    latestSearchRequestToken += 1;
    searchResults?.replaceChildren();

    if (searchResults) {
      searchResults.hidden = true;
    }

    searchInput?.setAttribute("aria-expanded", "false");
  }

  function createSearchResultButton(candidate) {
    const listItem = document.createElement("li");
    const resultButton = document.createElement("button");
    const iconElement = document.createElement("span");
    const textGroup = document.createElement("span");
    const titleElement = document.createElement("strong");
    const subtitleElement = document.createElement("span");
    const typeBadge = document.createElement("span");

    listItem.className = "search-result-item";
    listItem.setAttribute("role", "none");
    resultButton.type = "button";
    resultButton.className = "dong-search-result-button";
    resultButton.setAttribute("role", "option");
    iconElement.className = `search-result-icon search-result-icon-${candidate.type}`;
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.textContent = candidate.type === "place" ? "⌖" : "동";
    textGroup.className = "search-result-text";
    titleElement.className = "search-result-title";
    titleElement.textContent = candidate.title;
    subtitleElement.className = "search-result-subtitle";
    subtitleElement.textContent = candidate.subtitle;
    typeBadge.className = `search-result-badge search-result-badge-${candidate.type}`;
    typeBadge.textContent = candidate.type === "place" ? "장소" : "행정동";

    textGroup.append(titleElement, subtitleElement);
    resultButton.append(iconElement, textGroup, typeBadge);
    resultButton.addEventListener("click", () => {
      searchInput.value = candidate.keyword;
      closeSearchResults();
      setSearchPopupOpen(false);
      selectDong(candidate.feature);

      if (candidate.type === "place") {
        setStatus(
          `${candidate.placeTitle}은(는) ${candidate.subtitle}에 있습니다.`,
        );
      }
    });
    listItem.append(resultButton);
    return listItem;
  }

  async function renderSearchResults() {
    if (!searchInput || !searchResults) {
      return;
    }

    const rawQuery = searchInput.value.trim();
    const requestToken = ++latestSearchRequestToken;
    searchResults.replaceChildren();

    if (!rawQuery) {
      closeSearchResults();
      return;
    }

    const candidates = await getSearchCandidates(rawQuery);
    if (requestToken !== latestSearchRequestToken) {
      return;
    }

    searchResults.replaceChildren();
    if (candidates.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "dong-search-empty";
      emptyItem.textContent = `"${rawQuery}" 검색 결과가 없습니다.`;
      searchResults.append(emptyItem);
    } else {
      candidates.forEach((candidate) => {
        searchResults.append(createSearchResultButton(candidate));
      });
    }

    searchResults.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
  }

  async function searchDong() {
    const rawQuery = searchInput?.value.trim() ?? "";

    if (!rawQuery) {
      closeSearchResults();
      setStatus("검색할 행정동 또는 장소 이름을 입력해주세요.");
      searchInput?.focus();
      return;
    }

    const candidates = await getSearchCandidates(rawQuery);
    if (candidates.length === 0) {
      await renderSearchResults();
      setStatus(`"${rawQuery}"에 해당하는 검색 결과가 없습니다.`);
      return;
    }

    if (candidates.length === 1) {
      const candidate = candidates[0];
      searchInput.value = candidate.keyword;
      closeSearchResults();
      setSearchPopupOpen(false);
      selectDong(candidate.feature);

      if (candidate.type === "place") {
        setStatus(
          `${candidate.placeTitle}은(는) ${candidate.subtitle}에 있습니다.`,
        );
      }
      return;
    }

    await renderSearchResults();
    setStatus(`${candidates.length}개의 검색 결과를 찾았습니다.`);
  }

  /*
   * 행정동 마우스 오버
   */

  function handleDongHover(feature, coordinate) {
    if (
      !feature ||
      feature.getProperty("layer_type") !== "administrative_dong"
    ) {
      return;
    }

    if (dongHoverLeaveTimer !== null) {
      window.clearTimeout(dongHoverLeaveTimer);
      dongHoverLeaveTimer = null;
    }

    highlightDong(feature);
    if (coordinate) {
      hoverInfoWindow.setContent(createHoverTooltip(feature));
      hoverInfoWindow.open(map, coordinate);
    }
    mapElement.style.cursor = "pointer";
  }

  function scheduleDongHoverClear() {
    if (dongHoverLeaveTimer !== null) {
      window.clearTimeout(dongHoverLeaveTimer);
    }

    dongHoverLeaveTimer = window.setTimeout(() => {
      dongHoverLeaveTimer = null;
      clearDongHover();
    }, 90);
  }

  function handleDongClick(feature) {
    if (
      !feature ||
      feature.getProperty("layer_type") !== "administrative_dong"
    ) {
      return;
    }

    const dongInfo = getDongInfo(feature);
    const handledAt = Date.now();
    if (
      dongInfo.code === lastHandledDongClickCode &&
      handledAt - lastHandledDongClickAt < 150
    ) {
      return;
    }
    lastHandledDongClickCode = dongInfo.code;
    lastHandledDongClickAt = handledAt;
    hoverInfoWindow.close();
    clearDongHover();
    closeRegionPopup();
    // 지도 클릭 시 곧바로 팝업을 열지 않고, 데이터만 미리 불러온 뒤
    // 상세정보표시·쉼터보기 선택창을 연다.
    openRegionPopup(feature, { showPopup: false });
    selectDong(feature);
    openRegionChoicePanel(feature);
    console.info("선택한 행정동:", {
      name: dongInfo.name,
      code: dongInfo.code,
    });
  }

  map.data.addListener("mouseover", (event) => {
    handleDongHover(event.feature, event.coord);
  });

  /*
   * 행정동 마우스 아웃
   */

  map.data.addListener("mouseout", (event) => {
    const feature = event.feature;
    const layerType = feature.getProperty("layer_type");

    if (layerType !== "administrative_dong") {
      return;
    }

    scheduleDongHoverClear();
  });

  /*
   * 행정동 클릭
   *
   * 현재는 콘솔에 정보를 출력합니다.
   * 이후 폭염·침수 취약도 API와 연결할 때 사용할 수 있습니다.
   */

  map.data.addListener("click", (event) => {
    const feature = event.feature;
    const layerType = feature.getProperty("layer_type");

    if (layerType !== "administrative_dong") {
      return;
    }

    handleDongClick(feature);
  });

  /*
   * 상위 Polygon 오버레이가 Data Layer 이벤트를 가리는 환경을 위한
   * 지도 좌표 기반 hover·click 보조 처리
   */

  naver.maps.Event.addListener(map, "mousemove", (event) => {
    const feature = findDongFeatureAtCoordinate(event.coord);

    if (feature) {
      handleDongHover(feature, event.coord);
    } else {
      scheduleDongHoverClear();
    }
  });

  naver.maps.Event.addListener(map, "click", (event) => {
    if (Date.now() - lastHandledDongClickAt < 150) {
      return;
    }

    const feature =
      hoveredDongFeature ?? findDongFeatureAtCoordinate(event.coord);

    if (feature) {
      handleDongClick(feature);
    }
  });

  mapElement.addEventListener("mouseleave", scheduleDongHoverClear);

  // jisu_03_추가 / 팝업 / 팝업 닫기 이벤트
  // 닫기 버튼
  regionPopupClose?.addEventListener("click", closeRegionPopup);

  // 팝업 카드 바깥 영역 클릭
  regionPopup?.addEventListener("click", (event) => {
    if (event.target === regionPopup) {
      closeRegionPopup();
    }
  });

  // Esc 키
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeRegionChoicePanel();
      closeRegionPopup();
      closeSearchResults();
      if (searchPopupPanel && !searchPopupPanel.hidden) {
        setSearchPopupOpen(false);
      }
    }
  });
  //

  function setSearchPopupOpen(isOpen) {
    if (!searchPopupPanel) {
      return;
    }

    searchPopupPanel.hidden = !isOpen;
    openSearchButton?.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      searchInput?.focus();
    } else {
      closeSearchResults();
      openSearchButton?.focus();
    }
  }

  openSearchButton?.addEventListener("click", () => {
    setSearchPopupOpen(true);
  });

  closeSearchButton?.addEventListener("click", () => {
    setSearchPopupOpen(false);
  });

  // 0807 / jisu_15 / 취약정보 상세보기 클릭 시 쉼터 마커 제거 ----------------
  regionChoiceDetailButton?.addEventListener("click", () => {
    closeRegionChoicePanel();
    clearMainMapShelterMarkers();
    showRankingSidebar();
    revealRegionPopup();
  });

  // 0807 / jisu_15 / 선택창 / 쉼터 보기를 메인 지도에 표시-------------------
  regionChoiceSheltersButton?.addEventListener("click", () => {
    // closeRegionChoicePanel()이 pendingChoiceFeature를 비우므로 먼저 저장한다.
    const feature = pendingChoiceFeature;

    closeRegionChoicePanel();

    if (!feature) {
      return;
    }

    showSheltersOnMainMap(feature);
  });
  // 15-----------------------------------------------------------------

  regionChoiceClose?.addEventListener("click", () => {
    closeRegionChoicePanel();
  });

  regionChoiceBackdrop?.addEventListener("click", () => {
    closeRegionChoicePanel();
  });

  searchInput?.addEventListener("input", () => {
    if (searchRenderTimer !== null) {
      window.clearTimeout(searchRenderTimer);
    }

    searchRenderTimer = window.setTimeout(() => {
      renderSearchResults();
      searchRenderTimer = null;
    }, 250);
  });

  searchButton?.addEventListener("click", searchDong);

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchDong();
    } else if (event.key === "ArrowDown" && !searchResults?.hidden) {
      event.preventDefault();
      searchResults.querySelector("button")?.focus();
    }
  });

  searchResults?.addEventListener("keydown", (event) => {
    const resultButtons = [...searchResults.querySelectorAll("button")];
    const currentIndex = resultButtons.indexOf(document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      resultButtons[(currentIndex + 1) % resultButtons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIndex <= 0) {
        searchInput?.focus();
      } else {
        resultButtons[currentIndex - 1]?.focus();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSearchResults();
      searchInput?.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-autocomplete-container")) {
      closeSearchResults();
    }
  });

  resetButton?.addEventListener("click", () => {
    clearDongHover();
    clearSelection();

    if (searchInput) {
      searchInput.value = "";
    }
    closeSearchResults();

    selectedDistrict = "all";
    selectedRiskLevel = "all";

    if (districtFilter) {
      districtFilter.value = "all";
    }

    if (riskFilter) {
      riskFilter.value = "all";
    }

    applyAllDongPolygonStyles();
    map.setCenter(DAEGU_CENTER);
    map.setZoom(INITIAL_ZOOM);
    setStatus("지도를 초기 상태로 되돌렸습니다.");
  });

  districtFilter?.addEventListener("change", () => {
    selectDistrict(districtFilter.value);
  });

  riskFilter?.addEventListener("change", () => {
    selectedRiskLevel = riskFilter.value;
    applyMapFilters();
  });

  function handleRankingClick(event) {
    const rankingButton = event.target.closest("button[data-dong-code]");
    const listElement = event.currentTarget;

    if (!rankingButton || !listElement.contains(rankingButton)) {
      return;
    }

    const feature = dongFeatureByCode.get(rankingButton.dataset.dongCode);

    if (!feature) {
      return;
    }

    selectedDistrict = "all";
    selectedRiskLevel = "all";

    if (districtFilter) {
      districtFilter.value = "all";
    }

    if (riskFilter) {
      riskFilter.value = "all";
    }

    applyAllDongPolygonStyles();
    selectDong(feature);
  }

  riskRankingList?.addEventListener("click", handleRankingClick);
  lowRiskRankingList?.addEventListener("click", handleRankingClick);

  boundaryToggle?.addEventListener("change", () => {
    administrativeBoundaryVisible = boundaryToggle.checked;
    applyAllDongPolygonStyles();

    if (selectedFeature) {
      showSelectionEffects(selectedFeature);
      applySelectedFeatureStyle(selectedFeature);
    }

    setStatus(
      administrativeBoundaryVisible
        ? "행정동 경계를 표시합니다."
        : "행정동 경계를 숨겼습니다.",
    );
  });

  // jisu_02_추가 / 체크박스 이벤트 추가
  vulnerabilityToggle?.addEventListener("change", () => {
    // 체크 상태를 저장하고 모든 행정동 채움색을 다시 계산한다.
    vulnerabilityLayerVisible = vulnerabilityToggle.checked;
    applyAllDongPolygonStyles();

    // 전체 스타일 갱신으로 선택 효과가 사라지지 않게 다시 적용한다.
    if (selectedFeature) {
      showSelectionEffects(selectedFeature);
      applySelectedFeatureStyle(selectedFeature);
    }

    setStatus(
      vulnerabilityLayerVisible
        ? "폭염 취약도 색상을 표시합니다."
        : "폭염 취약도 색상을 숨겼습니다.",
    );
  });

  /*
   * 확대·축소 후 오버레이 상태 보정
   */

  function restorePolygonOverlays() {
    applyAllDongPolygonStyles();

    if (selectedFeature) {
      applySelectedFeatureStyle(selectedFeature);
    }

    maskPolygons.forEach((polygon) => {
      if (polygon.getMap() !== map) {
        polygon.setMap(map);
      }

      polygon.setOptions({
        fillColor: "#e2e8f0",
        fillOpacity: 0.92,
        strokeOpacity: 0,
        zIndex: 10,
      });
    });

    boundaryPolygons.forEach((polygon) => {
      if (polygon.getMap() !== map) {
        polygon.setMap(map);
      }

      polygon.setOptions({
        fillOpacity: 0,
        strokeColor: "#0f172a",
        strokeOpacity: 1,
        strokeWeight: 5,
        zIndex: 30,
      });
    });

    selectionMaskPolygons.forEach((polygon) => {
      if (polygon.getMap() !== map) {
        polygon.setMap(map);
      }
      polygon.setOptions({
        fillColor: "#e2e8f0",
        fillOpacity: 0.34,
        strokeOpacity: 0,
        zIndex: 25,
      });
    });

    selectionHaloPolygons.forEach((polygon) => {
      if (polygon.getMap() !== map) {
        polygon.setMap(map);
      }
      polygon.setOptions({
        fillColor: "#ffffff",
        fillOpacity: 0.06,
        strokeColor: "#ffffff",
        strokeOpacity: 0.7,
        strokeWeight: 8,
        zIndex: 29,
      });
    });
  }

  let redrawFrame = null;

  function scheduleOverlayRestore() {
    if (redrawFrame !== null) {
      cancelAnimationFrame(redrawFrame);
    }

    redrawFrame = requestAnimationFrame(() => {
      redrawFrame = requestAnimationFrame(() => {
        restorePolygonOverlays();
        redrawFrame = null;
      });
    });
  }

  naver.maps.Event.addListener(map, "zoom_changed", () => {
    clearDongHover();
  });

  naver.maps.Event.addListener(map, "idle", () => {
    scheduleOverlayRestore();
  });

  naver.maps.Event.addListener(map, "dragstart", () => {
    hoverInfoWindow.close();
  });

  function setZoomWithoutTransition(nextZoom) {
    const boundedZoom = Math.min(
      Number(map.getOptions("maxZoom")),
      Math.max(Number(map.getOptions("minZoom")), nextZoom),
    );

    if (boundedZoom !== map.getZoom()) {
      map.setZoom(boundedZoom, false);
    }
  }

  zoomInButton.addEventListener("click", () => {
    setZoomWithoutTransition(map.getZoom() + 1);
  });

  zoomOutButton.addEventListener("click", () => {
    setZoomWithoutTransition(map.getZoom() - 1);
  });

  let wheelZoomLocked = false;
  mapElement.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();

      if (wheelZoomLocked || Math.abs(event.deltaY) < 2) {
        return;
      }

      wheelZoomLocked = true;
      setZoomWithoutTransition(map.getZoom() + (event.deltaY < 0 ? 1 : -1));
      window.setTimeout(() => {
        wheelZoomLocked = false;
      }, 90);
    },
    { passive: false },
  );

  /*
   * 브라우저 크기가 바뀌었을 때 지도 크기 재계산
   */

  let resizeTimer = null;

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);

    resizeTimer = window.setTimeout(() => {
      if (window.naver?.maps?.Event) {
        window.naver.maps.Event.trigger(map, "resize");
      }
      scheduleOverlayRestore();
    }, 150);
  });

  /*
   * 전체 지도 레이어 초기화
   */

  async function initializeDaeguMap() {
    try {
      const [dongGeoJson, boundaryGeoJson, outsideMaskGeoJson, heatPayload] =
        await Promise.all([
          loadGeoJson(GEOJSON_FILES.administrativeDong),
          loadGeoJson(GEOJSON_FILES.boundary),
          loadGeoJson(GEOJSON_FILES.outsideMask),
          loadHeatData().catch((error) => {
            console.error("폭염 취약도 데이터 로딩 실패:", error);

            return {
              status: "error",
              records: [],
              message: "폭염 취약도 데이터를 불러오지 못했습니다.",
            };
          }),
        ]);

      // 외부 마스크를 가장 먼저 생성
      createOutsideMask(outsideMaskGeoJson);

      // 행정동 경계 생성
      createAdministrativeDongLayer(dongGeoJson);
      applyAllDongPolygonStyles();

      // 대구 전체 외곽선을 마지막에 생성해 가장 위에 표시
      createDaeguBoundary(boundaryGeoJson);

      restorePolygonOverlays();
      renderRiskRankings();

      console.info("대구광역시 지도 레이어 초기화가 완료됐습니다.");
    } catch (error) {
      console.error("대구광역시 지도 초기화 실패:", error);

      mapElement.insertAdjacentHTML(
        "beforeend",
        `
          <div
            style="
              position:absolute;
              top:16px;
              left:50%;
              z-index:1000;
              max-width:90%;
              padding:12px 16px;
              color:#991b1b;
              background:#fee2e2;
              border:1px solid #fecaca;
              border-radius:8px;
              transform:translateX(-50%);
              box-shadow:0 4px 12px rgb(15 23 42 / 15%);
            "
          >
            지도 경계 데이터를 불러오지 못했습니다.
            브라우저 개발자 도구의 Console과 Network를 확인해주세요.
          </div>
        `,
      );
    }
  }

  initializeDaeguMap();
})();
