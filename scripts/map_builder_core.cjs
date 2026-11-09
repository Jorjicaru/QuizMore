const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

const geojsonPath = path.join(__dirname, '../data/geo/romania-counties.geojson');
const geo = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

// SVG projection setup (960x660 canvas)
const minLon = 20.263331;
const maxLon = 29.718042;
const minLat = 43.619704;
const maxLat = 48.265448;

const viewBoxWidth = 960;
const viewBoxHeight = 660;
const paddingX = 42;
const paddingY = 28;
const mapWidth = viewBoxWidth - paddingX * 2;
const mapHeight = viewBoxHeight - paddingY * 2;

function project(lon, lat) {
  const x = paddingX + ((lon - minLon) / (maxLon - minLon)) * mapWidth;
  const y = paddingY + ((maxLat - lat) / (maxLat - minLat)) * mapHeight;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

function simplifyPoints(points, tolerance = 0.8) {
  if (points.length <= 4) return points;
  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const pt = points[i];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lenSq = dx * dx + dy * dy;
    let dist;
    if (lenSq === 0) dist = Math.hypot(pt[0] - start[0], pt[1] - start[1]);
    else {
      let t = Math.max(0, Math.min(1, ((pt[0] - start[0]) * dx + (pt[1] - start[1]) * dy) / lenSq));
      dist = Math.hypot(pt[0] - (start[0] + t * dx), pt[1] - (start[1] + t * dy));
    }
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), tolerance);
    const right = simplifyPoints(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

function ringSignedArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(area / 2);
}

function geometryToSvgPath(geom, hasEnclaveHole = false) {
  const rings = [];
  if (geom.type === 'Polygon') {
    const sourceRings = hasEnclaveHole ? geom.coordinates : [geom.coordinates[0]];
    for (const rawRing of sourceRings) {
      const proj = rawRing.map(pt => project(pt[0], pt[1]));
      const simp = simplifyPoints(proj);
      if (simp.length >= 3 && ringSignedArea(simp) > 8) {
        rings.push(simp);
      }
    }
  } else if (geom.type === 'MultiPolygon') {
    // Keep major polygons (filter out microscopic topological union slivers)
    const polyEntries = geom.coordinates.map(poly => {
      const extProj = poly[0].map(pt => project(pt[0], pt[1]));
      return { poly, area: ringSignedArea(extProj) };
    }).sort((a, b) => b.area - a.area);

    const maxArea = polyEntries[0]?.area || 0;
    for (const entry of polyEntries) {
      if (entry.area < Math.min(25, maxArea * 0.01)) continue;
      const sourceRings = hasEnclaveHole ? entry.poly : [entry.poly[0]];
      for (const rawRing of sourceRings) {
        const proj = rawRing.map(pt => project(pt[0], pt[1]));
        const simp = simplifyPoints(proj);
        if (simp.length >= 3 && ringSignedArea(simp) > 8) {
          rings.push(simp);
        }
      }
    }
  }

  return rings
    .map(ring => {
      const first = ring[0];
      const rest = ring.slice(1).map(p => `L${p[0]} ${p[1]}`).join(' ');
      return `M${first[0]} ${first[1]} ${rest} Z`;
    })
    .join(' ');
}

// Map county features by name & pre-simplify slightly in projected space for internal line lookup
const countyFeatures = {};
const countyProjectedPoints = {};
const countyGridCells = {};

for (const f of geo.features) {
  const name = f.properties.name;
  countyFeatures[name] = f;
  const pts = [];
  if (f.geometry.type === 'Polygon') {
    f.geometry.coordinates[0].forEach(p => pts.push(project(p[0], p[1])));
  } else if (f.geometry.type === 'MultiPolygon') {
    f.geometry.coordinates.forEach(poly => poly[0].forEach(p => pts.push(project(p[0], p[1]))));
  }
  const simp = simplifyPoints(pts, 0.9);
  countyProjectedPoints[name] = simp;
  const cellSet = new Set();
  for (const pt of pts) {
    const gx = Math.round(pt[0]);
    const gy = Math.round(pt[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        cellSet.add(`${gx + dx},${gy + dy}`);
      }
    }
  }
  countyGridCells[name] = cellSet;
}

// Compute county adjacencies using shared boundary grid
const grid = new Map();
for (const f of geo.features) {
  const name = f.properties.name;
  const seen = new Set();
  function addCoords(c) {
    if (typeof c[0] === 'number') {
      const gx = Math.floor(c[0] * 100);
      const gy = Math.floor(c[1] * 100);
      const key = `${gx},${gy}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(name);
      }
    } else {
      c.forEach(addCoords);
    }
  }
  addCoords(f.geometry.coordinates);
}

const countyAdjacency = {};
for (const name of Object.keys(countyFeatures)) countyAdjacency[name] = new Set();

for (const [, list] of grid.entries()) {
  if (list.length > 1) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        countyAdjacency[list[i]].add(list[j]);
        countyAdjacency[list[j]].add(list[i]);
      }
    }
  }
}

const unionCache = new Map();

// Union/Dissolve a group of counties into a single clean Polygon/MultiPolygon
function unionCounties(countyNames) {
  if (countyNames.length === 1) {
    return countyFeatures[countyNames[0]].geometry;
  }
  const cacheKey = countyNames.slice().sort().join('|');
  if (unionCache.has(cacheKey)) {
    return unionCache.get(cacheKey);
  }
  const features = countyNames.map(name => countyFeatures[name]);
  let merged = features[0];
  for (let i = 1; i < features.length; i++) {
    try {
      merged = turf.union(turf.featureCollection([merged, features[i]]));
    } catch (e) {
      try {
        const b1 = turf.buffer(merged, 0.0001, { units: 'kilometers' });
        const b2 = turf.buffer(features[i], 0.0001, { units: 'kilometers' });
        merged = turf.union(turf.featureCollection([b1, b2]));
      } catch (err2) {
        console.error('Fatal union failure:', err2.message);
      }
    }
  }
  unionCache.set(cacheKey, merged.geometry);
  return merged.geometry;
}

// Compute label point strictly inside polygon
function computeLabelPoint(geom) {
  try {
    const pt = turf.pointOnFeature({ type: 'Feature', geometry: geom, properties: {} });
    const coords = pt.geometry.coordinates;
    const p = project(coords[0], coords[1]);
    return { x: Math.round(p[0]), y: Math.round(p[1]) };
  } catch (e) {
    const c = turf.centroid({ type: 'Feature', geometry: geom, properties: {} });
    const p = project(c.geometry.coordinates[0], c.geometry.coordinates[1]);
    return { x: Math.round(p[0]), y: Math.round(p[1]) };
  }
}

// Fast O(V) calculation of internal county border lines shared between counties of the same territory
function computeInternalCountyLines(countyNames) {
  if (countyNames.length <= 1) return '';
  const lines = [];
  for (let i = 0; i < countyNames.length; i++) {
    for (let j = i + 1; j < countyNames.length; j++) {
      const c1 = countyNames[i];
      const c2 = countyNames[j];
      if (!countyAdjacency[c1]?.has(c2)) continue;
      const pts1 = countyProjectedPoints[c1] || [];
      const cells2 = countyGridCells[c2];
      let currentSegment = [];
      for (const pt of pts1) {
        const key = `${Math.round(pt[0])},${Math.round(pt[1])}`;
        if (cells2.has(key)) {
          currentSegment.push(pt);
        } else {
          if (currentSegment.length >= 2) {
            const simp = simplifyPoints(currentSegment, 1.2);
            if (simp.length >= 2) {
              lines.push(`M${simp[0][0]} ${simp[0][1]} ` + simp.slice(1).map(p => `L${p[0]} ${p[1]}`).join(' '));
            }
          }
          currentSegment = [];
        }
      }
      if (currentSegment.length >= 2) {
        const simp = simplifyPoints(currentSegment, 1.2);
        if (simp.length >= 2) {
          lines.push(`M${simp[0][0]} ${simp[0][1]} ` + simp.slice(1).map(p => `L${p[0]} ${p[1]}`).join(' '));
        }
      }
    }
  }
  return lines.join(' ');
}

// Function to process a full preset definition
function processPreset(playerCount, territoryDefinitions) {
  const allCountiesInPreset = new Set();
  const territoryCountyMap = new Map();
  const territories = [];

  for (const tDef of territoryDefinitions) {
    for (const c of tDef.counties) {
      if (!countyFeatures[c]) {
        throw new Error(`County ${c} does not exist in GeoJSON!`);
      }
      if (allCountiesInPreset.has(c)) {
        throw new Error(`County ${c} is duplicated in preset for ${playerCount} players!`);
      }
      allCountiesInPreset.add(c);
      territoryCountyMap.set(c, tDef.id);
    }
  }

  // Verify all 42 counties are covered
  if (allCountiesInPreset.size !== 42) {
    const missing = Object.keys(countyFeatures).filter(c => !allCountiesInPreset.has(c));
    throw new Error(`Preset for ${playerCount} players missing ${42 - allCountiesInPreset.size} counties: ${missing.join(', ')}`);
  }

  // Build each territory with unified geometry and interior point
  for (const tDef of territoryDefinitions) {
    const unionedGeom = unionCounties(tDef.counties);
    const isIlfovWithoutBucuresti = tDef.counties.includes('Ilfov') && !tDef.counties.includes('Bucuresti');
    const svgPath = geometryToSvgPath(unionedGeom, isIlfovWithoutBucuresti);
    const labelPt = tDef.customLabelX && tDef.customLabelY 
      ? { x: tDef.customLabelX, y: tDef.customLabelY }
      : computeLabelPoint(unionedGeom);
    const internalLines = computeInternalCountyLines(tDef.counties);

    territories.push({
      id: tDef.id,
      name: tDef.name,
      shortName: tDef.shortName,
      region: tDef.region,
      labelX: labelPt.x,
      labelY: labelPt.y,
      polygon: svgPath,
      internalLinesSvg: internalLines,
      counties: tDef.counties,
      neighbors: new Set(),
    });
  }

  // Derive neighbors from county-level adjacency
  const territoryById = new Map(territories.map(t => [t.id, t]));
  for (const tDef of territoryDefinitions) {
    const currentT = territoryById.get(tDef.id);
    for (const c of tDef.counties) {
      for (const neighborCounty of countyAdjacency[c]) {
        const neighborTerritoryId = territoryCountyMap.get(neighborCounty);
        if (neighborTerritoryId && neighborTerritoryId !== tDef.id) {
          currentT.neighbors.add(neighborTerritoryId);
          territoryById.get(neighborTerritoryId)?.neighbors.add(tDef.id);
        }
      }
    }
  }

  return territories.map(t => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    region: t.region,
    labelX: t.labelX,
    labelY: t.labelY,
    polygon: t.polygon,
    internalLinesSvg: t.internalLinesSvg,
    counties: t.counties,
    neighbors: Array.from(t.neighbors).sort(),
  }));
}

module.exports = {
  processPreset,
};
