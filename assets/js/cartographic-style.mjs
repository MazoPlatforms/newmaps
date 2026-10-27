export const MAZO_PALETTE = Object.freeze({
  light: Object.freeze({
    land: '#f4f2eb',
    water: '#b9dce7',
    waterLine: '#80b8c9',
    vegetation: '#d5e5d4',
    vegetationDark: '#c4dbc6',
    built: '#e7e6df',
    building: '#e5ddce',
    buildingOutline: '#c7bcaa',
    roadCase: '#d2cec4',
    roadMajor: '#e4b66e',
    roadSecondary: '#d8c5a4',
    roadLocal: '#fffefa',
    path: '#b2aa93',
    label: '#354751',
    roadLabel: '#4c5c63',
    waterLabel: '#32768a',
    halo: '#f7f5ef',
    boundary: '#9aa7a3',
  }),
  dark: Object.freeze({
    land: '#1b2a31',
    water: '#102a38',
    waterLine: '#326277',
    vegetation: '#244337',
    vegetationDark: '#2b4e3d',
    built: '#25343a',
    building: '#52656c',
    buildingOutline: '#73868a',
    roadCase: '#101c23',
    roadMajor: '#d9ae70',
    roadSecondary: '#9dafad',
    roadLocal: '#70858a',
    path: '#78847f',
    label: '#e0e9e9',
    roadLabel: '#c5d1d2',
    waterLabel: '#79bfd0',
    halo: '#18262d',
    boundary: '#62767c',
  }),
});

const ROAD_MAJOR = /motorway|trunk|primary|highway_(major|motorway)/i;
const ROAD_SECONDARY = /secondary|tertiary|highway_(secondary|tertiary)/i;
const ROAD_LOCAL = /minor|service|track|link|street|path|pedestrian|residential/i;

function roadWidth(layerId) {
  const group = ROAD_MAJOR.test(layerId) ? 'major' : ROAD_SECONDARY.test(layerId) ? 'secondary' : 'local';
  const stops = group === 'major'
    ? [5, 0.55, 8, 0.9, 11, 1.5, 14, 2.7, 16, 4, 18, 5.7, 20, 7.5]
    : group === 'secondary'
      ? [6, 0.4, 9, 0.8, 12, 1.55, 14, 2.35, 16, 3.2, 18, 4.5, 20, 5.8]
      : [11, 0.6, 13, 1.05, 14, 1.5, 16, 2.25, 18, 3.3, 20, 4.5];
  const offset = /casing/i.test(layerId) ? 1.15 : 0;
  const widths = stops.map((value, index) => index % 2 ? value + offset : value);
  return ['interpolate', ['exponential', 1.2], ['zoom'], ...widths];
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
      paint('background-color', palette.water);
      applied.water++;
    }
    if (layer.type === 'fill' && (sourceLayer === 'water' || /water[_-]fill|ocean/i.test(id))) {
      paint('fill-color', palette.water);
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
    if (layer.type === 'fill' && (sourceLayer === 'landcover' || sourceLayer === 'park' || /landcover|landuse_(park|forest)|^park$/i.test(id))) {
      const nature = /wood|forest|tree|park|grass|wetland|nature|garden/i.test(id + sourceLayer);
      const denseVegetation = /wood|forest|tree/i.test(id + sourceLayer);
      paint('fill-color', denseVegetation ? palette.vegetationDark : nature ? palette.vegetation : palette.built);
      applied.vegetation++;
    }
    if (layer.type === 'fill' && sourceLayer === 'landuse') {
      const built = /residential|commercial|industrial/i.test(id);
      paint('fill-color', built ? palette.built : palette.vegetation);
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
      if (/casing/i.test(id) && layer.paint?.['line-opacity'] !== undefined) paint('line-opacity', 1);
      applied.roads++;
    }
    if (layer.type === 'line' && sourceLayer === 'boundary') {
      paint('line-color', palette.boundary);
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
        paint('text-opacity', 1);
      }
      if (/^place[_-]/i.test(id) && layer.layout?.['icon-image'] !== undefined) paint('icon-opacity', 1);
      if (/^place[_-]/i.test(id) && hasText) applied.labels++;
    }
  }
  return applied;
}
