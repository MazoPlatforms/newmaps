export const MAZO_PALETTE = Object.freeze({
  light: Object.freeze({
    land: '#d9f0df', water: '#82d5e2', waterLine: '#5b9fb5',
    vegetation: '#c5e8ce', vegetationDark: '#a9d5b4', grass: '#d2ecd2', wetland: '#bfe1cf',
    farmland: '#e4e7cf', sand: '#e8ddb9', built: '#e5e2d9', urban: '#deddd4',
    park: '#c4ddb9', parkOutline: '#9fbd91', building: '#e0d8c9', buildingOutline: '#b9ad99',
    roadCase: '#c9c7c0', roadMajor: '#d0a45e', roadSecondary: '#e0cba9', roadLocal: '#faf9f5',
    path: '#b1a98f', label: '#344751', roadLabel: '#56666b', waterLabel: '#32788e',
    halo: '#f7f5ef', boundary: '#8e9a98',
  }),
  dark: Object.freeze({
    land: '#202d32', water: '#102b3a', waterLine: '#36748a',
    vegetation: '#2b4938', vegetationDark: '#315a3d', grass: '#304b38', wetland: '#29484a',
    farmland: '#41483b', sand: '#655c43', built: '#29363b', urban: '#303e43',
    park: '#2b5138', parkOutline: '#477254', building: '#52636a', buildingOutline: '#70858a',
    roadCase: '#14232a', roadMajor: '#c9944c', roadSecondary: '#88999a', roadLocal: '#647980',
    path: '#77877f', label: '#e4ebeb', roadLabel: '#c5d1d2', waterLabel: '#82c6d5',
    halo: '#19272e', boundary: '#77898a',
  }),
});

const ROAD_MAJOR = /motorway|trunk|primary|highway_(major|motorway)/i;
const ROAD_SECONDARY = /secondary|tertiary|highway_(secondary|tertiary)/i;
const ROAD_LOCAL = /minor|service|track|link|street|path|pedestrian|residential/i;
// The self-hosted glyph endpoint serves exactly one font stack; any other name 404s and its labels vanish.
const GLYPH_FONT = Object.freeze(['Mazo Maps Sans Regular']);

function roadWidth(layerId) {
  const group = ROAD_MAJOR.test(layerId) ? 'major' : ROAD_SECONDARY.test(layerId) ? 'secondary' : 'local';
  const stops = group === 'major'
    ? [4, 0.1, 5, 0.38, 8, 0.9, 11, 1.5, 14, 2.7, 16, 4, 18, 5.7, 20, 7.5]
    : group === 'secondary'
      ? [6, 0.4, 9, 0.8, 12, 1.55, 14, 2.35, 16, 3.2, 18, 4.5, 20, 5.8]
      : [11, 0.6, 13, 1.05, 14, 1.5, 16, 2.25, 18, 3.3, 20, 4.5];
  const offset = /casing/i.test(layerId) ? 1.15 : 0;
  const widths = stops.map((value, index) => index % 2 ? value + offset : value);
  return ['interpolate', ['exponential', 1.2], ['zoom'], ...widths];
}

// Roads fade in as they appear (like Google/Apple) instead of a dense network popping in at country scale.
function roadOpacity(layerId) {
  const stops = ROAD_MAJOR.test(layerId) ? [4, 0.16, 6.5, 0.28, 8, 0.55, 10, 0.85, 12, 1]
    : ROAD_SECONDARY.test(layerId) ? [8.5, 0, 9.5, 0.55, 11, 1]
      : [10.5, 0, 12, 0.85, 14, 1];
  return ['interpolate', ['linear'], ['zoom'], ...stops];
}

function roadMinimumZoom(id) {
  if (/motorway/i.test(id)) return 4.5;
  if (/trunk|primary/i.test(id)) return 6.5;
  if (/secondary|tertiary/i.test(id)) return 8.5;
  if (/minor|service|track|street/i.test(id)) return 11.5;
  if (/path|pedestrian/i.test(id)) return 13.5;
  return null;
}

function containsMaritimeExclusion(value) {
  if (!Array.isArray(value)) return false;
  if (value[0] === '!=' && Array.isArray(value[1]) && value[1][0] === 'get'
    && value[1][1] === 'maritime' && value[2] === 1) return true;
  return value.some(containsMaritimeExclusion);
}

export function isBasemapPlacePoiLayer(layer) {
  return layer?.type === 'symbol' && ['poi', 'poi_label'].includes(layer['source-layer']);
}

export function applyMazoCartographicStyle(map, theme = 'light') {
  const palette = MAZO_PALETTE[theme] || MAZO_PALETTE.light;
  const layers = map.getStyle()?.layers || [];
  const applied = { land: 0, water: 0, vegetation: 0, buildings: 0, roads: 0, labels: 0, boundaries: 0 };

  for (const layer of layers) {
    const id = String(layer.id || '').toLowerCase();
    const sourceLayer = String(layer['source-layer'] || '').toLowerCase();
    const paint = (property, value) => map.setPaintProperty(layer.id, property, value);

    if (layer.type === 'background') {
      // Background remains the ocean; the whole-country polygon supplies land.
      paint('background-color', palette.water);
      applied.water++;
    }
    if (layer.type === 'fill' && sourceLayer === 'country_land') {
      paint('fill-color', palette.land);
      applied.land++;
    }
    if (layer.type === 'raster' && (id === 'natural_earth' || layer.source === 'ne2_shaded')) {
      paint('raster-opacity', ['interpolate', ['linear'], ['zoom'], 0, 0.42, 4, 0.5, 6, 0.52, 7, 0.44, 8, 0.22, 9, 0]);
      paint('raster-saturation', theme === 'dark' ? -0.72 : -0.12);
      paint('raster-contrast', theme === 'dark' ? 0.18 : 0.04);
      if (theme === 'dark') {
        paint('raster-brightness-min', 0.04);
        paint('raster-brightness-max', 0.58);
      } else {
        paint('raster-brightness-min', 0);
        paint('raster-brightness-max', 1);
      }
      if ((layer.maxzoom ?? 0) < 9) map.setLayerZoomRange(layer.id, layer.minzoom || 0, 9);
    }
    if (layer.type === 'fill' && (sourceLayer === 'water' || /water[_-]fill|ocean/i.test(id))) {
      paint('fill-color', palette.water);
      paint('fill-antialias', true);
      if (layer.paint?.['fill-opacity'] !== undefined) paint('fill-opacity', 1);
      applied.water++;
    }
    if (layer.type === 'line' && (sourceLayer === 'waterway' || sourceLayer === 'water')) {
      paint('line-color', palette.waterLine);
    }
    if (layer.type === 'fill' && (sourceLayer === 'land' || id === 'land' || /land[_-]?background/i.test(id))) {
      paint('fill-color', palette.land);
      if (layer.paint?.['fill-opacity'] !== undefined) paint('fill-opacity', 1);
      applied.land++;
    }
    if (layer.type === 'fill' && sourceLayer === 'landcover') {
      const featureClass = /ice|glacier|shelf/i.test(id) ? 'ice'
        : /wetland|marsh/i.test(id) ? 'wetland'
          : /sand|beach|dune/i.test(id) ? 'sand'
            : /grass|meadow/i.test(id) ? 'grass'
              : /farm|orchard|crop/i.test(id) ? 'farmland'
                : /wood|forest|tree|scrub/i.test(id) ? 'vegetationDark' : 'vegetation';
      paint('fill-color', featureClass === 'ice' ? palette.land : palette[featureClass]);
      if (layer.paint?.['fill-pattern'] !== undefined) paint('fill-pattern', null);
      if (layer.paint?.['fill-opacity'] !== undefined) paint('fill-opacity', featureClass === 'vegetationDark' ? 0.76 : 0.68);
      applied.vegetation++;
    }
    if (layer.type === 'fill' && sourceLayer === 'landuse') {
      const className = id.replace(/^landuse[_-]?/, '');
      const fill = /residential|commercial|industrial|retail|parking|garages/i.test(className) ? palette.built
        : /school|hospital|university|college/i.test(className) ? palette.urban
          : /cemetery|park|garden|grass|pitch|orchard|farmland|farm|wood|forest/i.test(className) ? palette.vegetation
            : /quarry|sand|beach/i.test(className) ? palette.sand
              : palette.urban;
      paint('fill-color', fill);
      if (layer.paint?.['fill-pattern'] !== undefined) paint('fill-pattern', null);
    }
    if (layer.type === 'fill' && sourceLayer === 'park') {
      paint('fill-color', palette.park);
      if (layer.paint?.['fill-pattern'] !== undefined) paint('fill-pattern', null);
      if (layer.paint?.['fill-opacity'] !== undefined) paint('fill-opacity', 0.88);
    }
    if (layer.type === 'line' && sourceLayer === 'park') {
      paint('line-color', palette.parkOutline);
      paint('line-width', ['interpolate', ['linear'], ['zoom'], 8, 0.25, 12, 0.7, 18, 1.2]);
    }
    if ((layer.type === 'fill' || layer.type === 'fill-extrusion') && sourceLayer === 'building') {
      if (layer.type === 'fill') {
        paint('fill-color', palette.building);
        if (layer.paint?.['fill-outline-color'] !== undefined) paint('fill-outline-color', palette.buildingOutline);
      } else {
        paint('fill-extrusion-color', palette.building);
        paint('fill-extrusion-opacity', 0.55);
      }
      applied.buildings++;
    }
    if (layer.type === 'line' && sourceLayer === 'transportation' && /road|highway|transportation/i.test(id)) {
      const color = /path|pedestrian/i.test(id) ? palette.path
        : /casing/i.test(id) ? palette.roadCase
          : ROAD_MAJOR.test(id) ? palette.roadMajor
            : ROAD_SECONDARY.test(id) ? palette.roadSecondary
              : palette.roadLocal;
      paint('line-color', color);
      paint('line-width', roadWidth(id));
      if (/casing/i.test(id)) {
        if (layer.paint?.['line-opacity'] !== undefined) paint('line-opacity', 1);
      } else {
        paint('line-opacity', roadOpacity(id));
      }
      const minimumZoom = roadMinimumZoom(id);
      if (minimumZoom !== null) map.setLayerZoomRange(layer.id, Math.max(layer.minzoom || 0, minimumZoom), layer.maxzoom ?? 24);
      applied.roads++;
    }
    if (layer.type === 'symbol' && sourceLayer === 'transportation_name' && /highway-name-major/i.test(id)) {
      map.setLayerZoomRange(layer.id, Math.max(layer.minzoom || 0, 8.5), layer.maxzoom ?? 24);
    }
    if (layer.type === 'symbol' && sourceLayer === 'transportation_name' && /highway-shield-non-us/i.test(id)) {
      map.setLayerZoomRange(layer.id, Math.max(layer.minzoom || 0, 9.5), layer.maxzoom ?? 24);
    }
    if (layer.type === 'line' && sourceLayer === 'boundary') {
      paint('line-color', palette.boundary);
      // Quiet at country scale, clearer when zoomed in.
      paint('line-opacity', ['interpolate', ['linear'], ['zoom'], 4, 0.3, 9, 0.6, 13, 0.9]);
      // The national admin boundary duplicates the coastline and draws an
      // unsightly halo around Sri Lanka. Keep internal admin borders, but omit
      // admin_level=2 country outlines from this island-focused basemap.
      if (['boundary_2', 'boundary_country_z5-'].includes(layer.id)) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
      if (!containsMaritimeExclusion(layer.filter)) map.setFilter(layer.id, ['all', layer.filter || ['all'], ['!=', ['get', 'maritime'], 1]]);
      applied.boundaries++;
    }
    if (layer.type === 'symbol') {
      const hasText = layer.layout?.['text-field'] !== undefined;
      if (hasText) {
        const waterLabel = /water|river/i.test(id + sourceLayer);
        const roadLabel = /road|highway|transportation_name/i.test(id + sourceLayer);
        paint('text-color', waterLabel ? palette.waterLabel : roadLabel ? palette.roadLabel : palette.label);
        paint('text-halo-color', palette.halo);
        paint('text-halo-width', roadLabel ? 1.4 : 1.8);
        // The Mazo POI layers animate label visibility by zoom. Do not replace
        // their MapLibre expression when applying a light/dark theme.
        if (!id.startsWith('mazo-poi-')) paint('text-opacity', 1);
        if (JSON.stringify(layer.layout['text-font']) !== JSON.stringify(GLYPH_FONT)) {
          map.setLayoutProperty(layer.id, 'text-font', [...GLYPH_FONT]);
        }
      }
      if (/^place[_-]/i.test(id) && layer.layout?.['icon-image'] !== undefined) paint('icon-opacity', 1);
      if (/^place[_-]/i.test(id) && hasText) applied.labels++;
      if (/^label_country_/i.test(id) && hasText) {
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name']]);
      }
    }
  }
  return applied;
}
