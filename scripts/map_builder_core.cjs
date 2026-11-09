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

/**
 * Documented GIS Topological Tolerances (V4.0 / V5.0):
 * - BOUNDARY_PROXIMITY_TOLERANCE_KM = 0.35 km (350m): maximum digitization gap between two shared county border lines in GeoJSON.
 * - MIN_SHARED_BORDER_KM = 1.5 km (1500m): minimum positive shared linear border length required for two counties/territories to be neighbors.
 *   Single-point contacts (0 km) or tiny corner touches (< 1.5 km) are strictly excluded.
 */
const BOUNDARY_PROXIMITY_TOLERANCE_KM = 0.35;
const MIN_SHARED_BORDER_KM = 1.5;

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

// Extract exterior rings (in WGS84 [lon, lat]) from a Polygon/MultiPolygon feature
function extractWgs84Rings(feature) {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    return geom.coordinates;
  }
  if (geom.type === 'MultiPolygon') {
    const rings = [];
    for (const poly of geom.coordinates) {
      for (const r of poly) rings.push(r);
    }
    return rings;
  }
  return [];
}

// Fast degree-to-km conversion around Romania's latitude (~46 deg N)
const KM_PER_DEG_LAT = 111.132;
const KM_PER_DEG_LON = 111.320 * Math.cos((46 * Math.PI) / 180); // ~77.33 km/deg

function toLocalKm(coord) {
  return [coord[0] * KM_PER_DEG_LON, coord[1] * KM_PER_DEG_LAT];
}

function pointToSegmentDistKm(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function minDistToSegmentsKm(px, py, segmentsB) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < segmentsB.length; i++) {
    const s = segmentsB[i];
    const d = pointToSegmentDistKm(px, py, s[0], s[1], s[2], s[3]);
    if (d < best) {
      best = d;
      if (best <= 0.01) return best;
    }
  }
  return best;
}

function buildCountySegmentsKm(feature) {
  const rings = extractWgs84Rings(feature);
  const segments = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const ring of rings) {
    const kmPts = ring.map(toLocalKm);
    for (let i = 0; i < kmPts.length - 1; i++) {
      const a = kmPts[i];
      const b = kmPts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len <= 0.001) continue;
      segments.push([a[0], a[1], b[0], b[1], len]);
      if (a[0] < minX) minX = a[0];
      if (b[0] < minX) minX = b[0];
      if (a[0] > maxX) maxX = a[0];
      if (b[0] > maxX) maxX = b[0];
      if (a[1] < minY) minY = a[1];
      if (b[1] < minY) minY = b[1];
      if (a[1] > maxY) maxY = a[1];
      if (b[1] > maxY) maxY = b[1];
    }
  }
  return { segments, bbox: [minX, minY, maxX, maxY] };
}

/**
 * Computes the topological shared boundary length (in km) between two counties.
 * A segment of county A counts as shared with county B only if its start, midpoint, AND end
 * all lie within BOUNDARY_PROXIMITY_TOLERANCE_KM (0.35 km) of county B's boundary segments.
 * Single-point touches have 0 km shared length and are strictly rejected.
 */
function computeSharedBorderLengthKm(dataA, dataB) {
  const pad = BOUNDARY_PROXIMITY_TOLERANCE_KM + 0.5;
  if (
    dataA.bbox[2] + pad < dataB.bbox[0] ||
    dataB.bbox[2] + pad < dataA.bbox[0] ||
    dataA.bbox[3] + pad < dataB.bbox[1] ||
    dataB.bbox[3] + pad < dataA.bbox[1]
  ) {
    return 0;
  }

  function directedSharedKm(segsFrom, segsTo) {
    let totalKm = 0;
    for (const seg of segsFrom) {
      const [ax, ay, bx, by, len] = seg;
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5;
      const dMid = minDistToSegmentsKm(mx, my, segsTo);
      if (dMid > BOUNDARY_PROXIMITY_TOLERANCE_KM) continue;
      const dStart = minDistToSegmentsKm(ax, ay, segsTo);
      if (dStart > BOUNDARY_PROXIMITY_TOLERANCE_KM) continue;
      const dEnd = minDistToSegmentsKm(bx, by, segsTo);
      if (dEnd > BOUNDARY_PROXIMITY_TOLERANCE_KM) continue;
      totalKm += len;
    }
    return totalKm;
  }

  const ab = directedSharedKm(dataA.segments, dataB.segments);
  const ba = directedSharedKm(dataB.segments, dataA.segments);
  return Math.max(ab, ba);
}

// Map county features by name & pre-simplify slightly in projected space for internal line lookup
const countyFeatures = {};
const countyProjectedPoints = {};
const countyGridCells = {};
const countySegmentData = {};

for (const f of geo.features) {
  const name = f.properties.name;
  countyFeatures[name] = f;
  countySegmentData[name] = buildCountySegmentsKm(f);

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

// Compute canonical county-level topological adjacency using real shared border length >= MIN_SHARED_BORDER_KM
const countyNamesList = Object.keys(countyFeatures).sort();
const countyAdjacency = {};
const countySharedBorderKm = {};
for (const name of countyNamesList) {
  countyAdjacency[name] = new Set();
  countySharedBorderKm[name] = {};
}

for (let i = 0; i < countyNamesList.length; i++) {
  for (let j = i + 1; j < countyNamesList.length; j++) {
    const c1 = countyNamesList[i];
    const c2 = countyNamesList[j];
    const sharedKm = computeSharedBorderLengthKm(countySegmentData[c1], countySegmentData[c2]);
    if (sharedKm >= MIN_SHARED_BORDER_KM) {
      countyAdjacency[c1].add(c2);
      countyAdjacency[c2].add(c1);
      countySharedBorderKm[c1][c2] = Math.round(sharedKm * 10) / 10;
      countySharedBorderKm[c2][c1] = Math.round(sharedKm * 10) / 10;
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

// Verify that a multi-county territory forms a single connected component in the topological adjacency graph
function verifyCountyGroupContiguity(playerCount, territoryId, counties) {
  if (counties.length <= 1) return;
  const allowed = new Set(counties);
  const visited = new Set([counties[0]]);
  const queue = [counties[0]];
  while (queue.length > 0) {
    const curr = queue.shift();
    for (const next of countyAdjacency[curr] || []) {
      if (allowed.has(next) && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  if (visited.size !== counties.length) {
    const disconnected = counties.filter(c => !visited.has(c));
    throw new Error(
      `Territory ${territoryId} in ${playerCount}p preset is NOT geographically contiguous! Disconnected counties: ${disconnected.join(', ')}`
    );
  }
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
    verifyCountyGroupContiguity(playerCount, tDef.id, tDef.counties);
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

  // Derive canonical symmetric neighbors from topological county-level shared border length (>= 1.5 km)
  const territoryById = new Map(territories.map(t => [t.id, t]));
  for (let i = 0; i < territoryDefinitions.length; i++) {
    for (let j = i + 1; j < territoryDefinitions.length; j++) {
      const tA = territoryDefinitions[i];
      const tB = territoryDefinitions[j];
      let sharedKm = 0;
      for (const cA of tA.counties) {
        for (const cB of tB.counties) {
          sharedKm += countySharedBorderKm[cA]?.[cB] || 0;
        }
      }
      if (sharedKm >= MIN_SHARED_BORDER_KM) {
        territoryById.get(tA.id).neighbors.add(tB.id);
        territoryById.get(tB.id).neighbors.add(tA.id);
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
  countyAdjacency,
  countySharedBorderKm,
  MIN_SHARED_BORDER_KM,
  BOUNDARY_PROXIMITY_TOLERANCE_KM,
};
