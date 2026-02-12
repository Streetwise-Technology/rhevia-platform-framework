// deck-map.js — Reusable deck.gl map component for movement visualisation
//
// Usage in .md pages:
//   import { createDeckMap, createMapContainer } from "../components/deck-map.js";

import deck from "npm:deck.gl";
import mapboxgl from "npm:mapbox-gl";

const { DeckGL, ScatterplotLayer, HexagonLayer } = deck;

// Rhevia amber-to-red colour ramp
const COLOR_RANGE = [
  [255, 255, 178],
  [254, 204, 92],
  [253, 141, 60],
  [240, 59, 32],
  [189, 0, 38],
];

// Portsmouth International Port
const DEFAULT_VIEW_STATE = {
  longitude: -1.093,
  latitude: 50.803,
  zoom: 15.5,
  pitch: 45,
  bearing: -20,
};

/**
 * Creates a styled container div for the map.
 */
export function createMapContainer(width = 800, height = 500) {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "relative",
    width: `${width}px`,
    height: `${height}px`,
    background: "#0a0a0a",
    borderRadius: "8px",
    overflow: "hidden",
  });
  return container;
}

/**
 * Creates a DeckGL instance inside the given container.
 *
 * @param {HTMLElement} container - Mount point (use createMapContainer)
 * @param {Object} params
 * @param {Array} params.heatmapData - Heatmap cells [{lon, lat, point_count, ...}]
 * @param {Array} params.tracksData - Track points [{longitude, latitude, object_type, ...}]
 * @param {Object} params.options
 * @param {string} params.options.mapboxToken - Mapbox access token
 * @param {Object} [params.options.viewState] - Override default view state
 * @returns {DeckGL} The deck instance
 */
export function createDeckMap(
  container,
  { heatmapData = [], tracksData = [], options = {} },
) {
  const viewState = { ...DEFAULT_VIEW_STATE, ...options.viewState };

  const deckInstance = new DeckGL({
    container,
    mapLib: mapboxgl,
    mapboxAccessToken: options.mapboxToken,
    mapStyle: "mapbox://styles/mapbox/satellite",
    initialViewState: viewState,
    controller: true,
    layers: [
      new HexagonLayer({
        id: "heatmap-hexagons",
        data: heatmapData,
        getPosition: (d) => [d.lon, d.lat],
        getElevationWeight: (d) => d.point_count,
        elevationScale: 50,
        radius: 15,
        colorRange: COLOR_RANGE,
        extruded: true,
        pickable: false,
        opacity: 0.8,
      }),
      new ScatterplotLayer({
        id: "track-points",
        data: tracksData,
        getPosition: (d) => [d.longitude, d.latitude],
        getRadius: 3,
        getFillColor: (d) =>
          d.object_type === "pedestrian"
            ? [255, 165, 0, 200] // orange = pedestrian
            : [180, 100, 255, 200], // purple = vehicle
        pickable: true,
        radiusMinPixels: 2,
        radiusMaxPixels: 6,
      }),
    ],
  });

  return deckInstance;
}
