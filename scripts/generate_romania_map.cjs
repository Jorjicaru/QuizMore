const fs = require('fs');
const path = require('path');

const geojsonPath = path.join(__dirname, '../data/geo/romania-counties.geojson');
const geo = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

// SVG projection setup (960x660 canvas)
const minX = 20.263331;
const maxX = 29.718042;
const minY = 43.619704;
const maxY = 48.265448;

const viewBoxWidth = 960;
const viewBoxHeight = 660;
const paddingX = 42;
const paddingY = 28;
const mapWidth = viewBoxWidth - paddingX * 2;
const mapHeight = viewBoxHeight - paddingY * 2;

function project(lon, lat) {
  const x = paddingX + ((lon - minX) / (maxX - minX)) * mapWidth;
  const y = paddingY + ((maxY - lat) / (maxY - minY)) * mapHeight;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

function simplifyPoints(points, tolerance = 1.0) {
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

function geometryToSvgPath(geom) {
  const rings = [];
  if (geom.type === 'Polygon') {
    for (const rawRing of geom.coordinates) {
      const proj = rawRing.map(pt => project(pt[0], pt[1]));
      rings.push(simplifyPoints(proj));
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const rawRing of poly) {
        const proj = rawRing.map(pt => project(pt[0], pt[1]));
        rings.push(simplifyPoints(proj));
      }
    }
  }

  return rings
    .filter(r => r.length >= 3)
    .map(ring => {
      const first = ring[0];
      const rest = ring.slice(1).map(p => `L${p[0]} ${p[1]}`).join(' ');
      return `M${first[0]} ${first[1]} ${rest} Z`;
    })
    .join(' ');
}

// Centroid computation
function getCountyCenter(geom) {
  let sumX = 0, sumY = 0, count = 0;
  function addPt(c) {
    if (typeof c[0] === 'number') {
      const p = project(c[0], c[1]);
      sumX += p[0];
      sumY += p[1];
      count++;
    } else {
      c.forEach(addPt);
    }
  }
  addPt(geom.coordinates);
  return [Math.round(sumX / count), Math.round(sumY / count)];
}

const countyData = {};
for (const f of geo.features) {
  const name = f.properties.name;
  countyData[name] = {
    name,
    svgPath: geometryToSvgPath(f.geometry),
    center: getCountyCenter(f.geometry),
    rawCoords: f.geometry,
  };
}

// Compute county adjacency with spatial grid
const grid = new Map();
for (const f of geo.features) {
  const name = f.properties.name;
  const seen = new Set();
  function addCoords(c) {
    if (typeof c[0] === 'number') {
      const gx = Math.floor(c[0] * 120);
      const gy = Math.floor(c[1] * 120);
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
for (const name of Object.keys(countyData)) countyAdjacency[name] = new Set();

for (const [key, list] of grid.entries()) {
  if (list.length > 1) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        countyAdjacency[list[i]].add(list[j]);
        countyAdjacency[list[j]].add(list[i]);
      }
    }
  }
}

// Group definitions builder
function buildTerritoryGroup(groupDef, fallbackNeighbors = {}) {
  // groupDef: Array of { id, name, shortName, region, counties: string[] }
  const territoryMap = {};
  const territoryCountyMap = new Map();

  for (const t of groupDef) {
    const combinedPaths = t.counties.map(c => countyData[c].svgPath).join(' ');
    let sumX = 0, sumY = 0;
    for (const c of t.counties) {
      sumX += countyData[c].center[0];
      sumY += countyData[c].center[1];
    }
    const labelX = t.customLabelX ?? Math.round(sumX / t.counties.length);
    const labelY = t.customLabelY ?? Math.round(sumY / t.counties.length);

    territoryMap[t.id] = {
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      region: t.region,
      labelX,
      labelY,
      polygon: combinedPaths,
      neighbors: new Set(),
      counties: t.counties,
    };

    for (const c of t.counties) {
      territoryCountyMap.set(c, t.id);
    }
  }

  // Derive neighbors from county-level adjacency
  for (const t of groupDef) {
    for (const c of t.counties) {
      for (const neighborCounty of countyAdjacency[c]) {
        const neighborTerritoryId = territoryCountyMap.get(neighborCounty);
        if (neighborTerritoryId && neighborTerritoryId !== t.id) {
          territoryMap[t.id].neighbors.add(neighborTerritoryId);
          territoryMap[neighborTerritoryId].neighbors.add(t.id);
        }
      }
    }
  }

  // Add any fallback manual connections if any exist
  for (const [id, extra] of Object.entries(fallbackNeighbors)) {
    if (territoryMap[id]) {
      for (const n of extra) {
        if (territoryMap[n]) {
          territoryMap[id].neighbors.add(n);
          territoryMap[n].neighbors.add(id);
        }
      }
    }
  }

  return groupDef.map(t => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    region: t.region,
    labelX: territoryMap[t.id].labelX,
    labelY: territoryMap[t.id].labelY,
    polygon: territoryMap[t.id].polygon,
    neighbors: Array.from(territoryMap[t.id].neighbors).sort(),
  }));
}

// 1. 10 Territories (2 players)
const defs10 = [
  { id: 'maramures_crisana', name: 'Maramureș & Crișana', shortName: 'MM-CR', region: 'Nord-Vest', counties: ['Maramures', 'Satu Mare', 'Bihor', 'Salaj'], customLabelX: 195, customLabelY: 155 },
  { id: 'bucovina', name: 'Bucovina & Botoșani', shortName: 'SV-BT', region: 'Nord-Est', counties: ['Suceava', 'Botosani'], customLabelX: 570, customLabelY: 90 },
  { id: 'moldova_nord', name: 'Moldova de Nord (Iași & Neamț)', shortName: 'IS-NT', region: 'Moldova', counties: ['Iasi', 'Neamt'], customLabelX: 685, customLabelY: 180 },
  { id: 'moldova_sud', name: 'Moldova de Sud', shortName: 'BC-GL', region: 'Moldova', counties: ['Bacau', 'Vaslui', 'Vrancea', 'Galati'], customLabelX: 710, customLabelY: 330 },
  { id: 'transilvania_nord', name: 'Transilvania de Nord', shortName: 'CJ-MS', region: 'Transilvania', counties: ['Cluj', 'Bistrita-Nasaud', 'Mures', 'Harghita'], customLabelX: 395, customLabelY: 200 },
  { id: 'banat_hunedoara', name: 'Banat & Hunedoara', shortName: 'TM-HD', region: 'Banat', counties: ['Timis', 'Arad', 'Caras-Severin', 'Hunedoara'], customLabelX: 135, customLabelY: 375 },
  { id: 'transilvania_sud', name: 'Transilvania de Sud', shortName: 'SB-BV', region: 'Transilvania', counties: ['Sibiu', 'Alba', 'Brasov', 'Covasna'], customLabelX: 435, customLabelY: 335 },
  { id: 'oltenia', name: 'Oltenia', shortName: 'OLT', region: 'Oltenia', counties: ['Mehedinti', 'Gorj', 'Dolj', 'Valcea', 'Olt'], customLabelX: 285, customLabelY: 510 },
  { id: 'muntenia_baragan', name: 'Muntenia & Bărăgan', shortName: 'MUNT', region: 'Muntenia', counties: ['Arges', 'Dambovita', 'Prahova', 'Buzau', 'Braila', 'Bucuresti', 'Ilfov', 'Giurgiu', 'Teleorman', 'Calarasi', 'Ialomita'], customLabelX: 575, customLabelY: 505 },
  { id: 'dobrogea', name: 'Dobrogea (Constanța & Tulcea)', shortName: 'DOB', region: 'Dobrogea', counties: ['Constanta', 'Tulcea'], customLabelX: 840, customLabelY: 515 },
];

// 2. 15 Territories (3 players - the classic Conquiztador layout from image_b5a87907.png)
const defs15 = [
  { id: 'maramures', name: 'Maramureș & Satu Mare', shortName: 'MM-SM', region: 'Nord', counties: ['Maramures', 'Satu Mare', 'Bistrita-Nasaud'], customLabelX: 280, customLabelY: 95 },
  { id: 'bucovina', name: 'Bucovina (Suceava & Botoșani)', shortName: 'SV-BT', region: 'Nord-Est', counties: ['Suceava', 'Botosani'], customLabelX: 570, customLabelY: 90 },
  { id: 'moldova_nord', name: 'Moldova de Nord (Iași & Neamț)', shortName: 'IS-NT', region: 'Moldova', counties: ['Iasi', 'Neamt'], customLabelX: 685, customLabelY: 180 },
  { id: 'moldova_sud', name: 'Moldova de Sud (Bacău & Galați)', shortName: 'BC-GL', region: 'Moldova', counties: ['Bacau', 'Vaslui', 'Vrancea', 'Galati'], customLabelX: 710, customLabelY: 330 },
  { id: 'crisana', name: 'Crișana (Bihor & Arad)', shortName: 'BH-AR', region: 'Vest', counties: ['Bihor', 'Arad'], customLabelX: 135, customLabelY: 225 },
  { id: 'cluj', name: 'Cluj & Sălaj', shortName: 'CJ-SJ', region: 'Transilvania', counties: ['Cluj', 'Salaj'], customLabelX: 300, customLabelY: 195 },
  { id: 'mures', name: 'Mureș & Harghita', shortName: 'MS-HR', region: 'Transilvania', counties: ['Mures', 'Harghita'], customLabelX: 475, customLabelY: 215 },
  { id: 'banat', name: 'Banat (Timiș & Caraș-Severin)', shortName: 'TM-CS', region: 'Banat', counties: ['Timis', 'Caras-Severin'], customLabelX: 110, customLabelY: 410 },
  { id: 'hunedoara', name: 'Hunedoara & Alba', shortName: 'HD-AB', region: 'Transilvania', counties: ['Hunedoara', 'Alba'], customLabelX: 290, customLabelY: 320 },
  { id: 'brasov', name: 'Brașov, Sibiu & Covasna', shortName: 'BV-SB', region: 'Transilvania', counties: ['Brasov', 'Sibiu', 'Covasna'], customLabelX: 470, customLabelY: 335 },
  { id: 'oltenia_vest', name: 'Oltenia de Vest (Gorj & Mehedinți)', shortName: 'GJ-MH', region: 'Oltenia', counties: ['Gorj', 'Mehedinti'], customLabelX: 220, customLabelY: 480 },
  { id: 'oltenia_est', name: 'Oltenia de Est (Dolj, Vâlcea & Olt)', shortName: 'DJ-VL', region: 'Oltenia', counties: ['Dolj', 'Valcea', 'Olt'], customLabelX: 350, customLabelY: 530 },
  { id: 'muntenia_vest', name: 'Muntenia de Nord (Argeș & Prahova)', shortName: 'AG-PH', region: 'Muntenia', counties: ['Arges', 'Dambovita', 'Prahova'], customLabelX: 485, customLabelY: 460 },
  { id: 'muntenia_est', name: 'Muntenia de Sud & Bărăgan', shortName: 'B-IL', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov', 'Giurgiu', 'Teleorman', 'Calarasi', 'Ialomita', 'Buzau', 'Braila'], customLabelX: 630, customLabelY: 520 },
  { id: 'dobrogea', name: 'Dobrogea (Constanța & Tulcea)', shortName: 'CT-TL', region: 'Dobrogea', counties: ['Constanta', 'Tulcea'], customLabelX: 840, customLabelY: 515 },
];

// 3. 25 Territories (4-5 players)
const defs25 = [
  { id: 'satu_mare_maramures', name: 'Satu Mare & Maramureș', shortName: 'SM-MM', region: 'Nord', counties: ['Satu Mare', 'Maramures'], customLabelX: 240, customLabelY: 80 },
  { id: 'bistrita_nasaud', name: 'Bistrița-Năsăud', shortName: 'BN', region: 'Transilvania', counties: ['Bistrita-Nasaud'] },
  { id: 'suceava', name: 'Suceava', shortName: 'SV', region: 'Bucovina', counties: ['Suceava'] },
  { id: 'botosani', name: 'Botoșani', shortName: 'BT', region: 'Moldova', counties: ['Botosani'] },
  { id: 'iasi', name: 'Iași', shortName: 'IS', region: 'Moldova', counties: ['Iasi'] },
  { id: 'neamt', name: 'Neamț', shortName: 'NT', region: 'Moldova', counties: ['Neamt'] },
  { id: 'vaslui', name: 'Vaslui', shortName: 'VS', region: 'Moldova', counties: ['Vaslui'] },
  { id: 'bacau', name: 'Bacău', shortName: 'BC', region: 'Moldova', counties: ['Bacau'] },
  { id: 'vrancea_galati', name: 'Vrancea & Galați', shortName: 'VN-GL', region: 'Moldova', counties: ['Vrancea', 'Galati'] },
  { id: 'bihor', name: 'Bihor', shortName: 'BH', region: 'Crișana', counties: ['Bihor'] },
  { id: 'salaj_cluj', name: 'Sălaj & Cluj', shortName: 'SJ-CJ', region: 'Transilvania', counties: ['Salaj', 'Cluj'] },
  { id: 'mures', name: 'Mureș', shortName: 'MS', region: 'Transilvania', counties: ['Mures'] },
  { id: 'harghita_covasna', name: 'Harghita & Covasna', shortName: 'HR-CV', region: 'Transilvania', counties: ['Harghita', 'Covasna'] },
  { id: 'arad', name: 'Arad', shortName: 'AR', region: 'Crișana', counties: ['Arad'] },
  { id: 'alba_hunedoara', name: 'Alba & Hunedoara', shortName: 'AB-HD', region: 'Transilvania', counties: ['Alba', 'Hunedoara'] },
  { id: 'sibiu_brasov', name: 'Sibiu & Brașov', shortName: 'SB-BV', region: 'Transilvania', counties: ['Sibiu', 'Brasov'] },
  { id: 'timis', name: 'Timiș', shortName: 'TM', region: 'Banat', counties: ['Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'gorj_mehedinti', name: 'Gorj & Mehedinți', shortName: 'GJ-MH', region: 'Oltenia', counties: ['Gorj', 'Mehedinti'] },
  { id: 'valcea_arges', name: 'Vâlcea & Argeș', shortName: 'VL-AG', region: 'Oltenia/Muntenia', counties: ['Valcea', 'Arges'] },
  { id: 'dolj_olt', name: 'Dolj & Olt', shortName: 'DJ-OT', region: 'Oltenia', counties: ['Dolj', 'Olt'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'buzau_braila', name: 'Buzău & Brăila', shortName: 'BZ-BR', region: 'Muntenia', counties: ['Buzau', 'Braila'] },
  { id: 'bucuresti_ilfov_sud', name: 'București & Ilfov-Sud', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov', 'Giurgiu', 'Teleorman', 'Calarasi', 'Ialomita'] },
  { id: 'dobrogea', name: 'Dobrogea (Constanța & Tulcea)', shortName: 'CT-TL', region: 'Dobrogea', counties: ['Constanta', 'Tulcea'] },
];

// 4. 29 Territories (6-10 players)
const defs29 = [
  { id: 'satu_mare', name: 'Satu Mare', shortName: 'SM', region: 'Nord', counties: ['Satu Mare'] },
  { id: 'maramures', name: 'Maramureș', shortName: 'MM', region: 'Nord', counties: ['Maramures'] },
  { id: 'bistrita_nasaud', name: 'Bistrița-Năsăud', shortName: 'BN', region: 'Transilvania', counties: ['Bistrita-Nasaud'] },
  { id: 'suceava', name: 'Suceava', shortName: 'SV', region: 'Bucovina', counties: ['Suceava'] },
  { id: 'botosani', name: 'Botoșani', shortName: 'BT', region: 'Moldova', counties: ['Botosani'] },
  { id: 'iasi', name: 'Iași', shortName: 'IS', region: 'Moldova', counties: ['Iasi'] },
  { id: 'neamt', name: 'Neamț', shortName: 'NT', region: 'Moldova', counties: ['Neamt'] },
  { id: 'vaslui', name: 'Vaslui', shortName: 'VS', region: 'Moldova', counties: ['Vaslui'] },
  { id: 'bacau', name: 'Bacău', shortName: 'BC', region: 'Moldova', counties: ['Bacau'] },
  { id: 'vrancea', name: 'Vrancea', shortName: 'VN', region: 'Moldova', counties: ['Vrancea'] },
  { id: 'galati', name: 'Galați', shortName: 'GL', region: 'Moldova', counties: ['Galati'] },
  { id: 'bihor', name: 'Bihor', shortName: 'BH', region: 'Crișana', counties: ['Bihor'] },
  { id: 'salaj', name: 'Sălaj', shortName: 'SJ', region: 'Transilvania', counties: ['Salaj'] },
  { id: 'cluj', name: 'Cluj', shortName: 'CJ', region: 'Transilvania', counties: ['Cluj'] },
  { id: 'mures', name: 'Mureș', shortName: 'MS', region: 'Transilvania', counties: ['Mures'] },
  { id: 'harghita_covasna', name: 'Harghita & Covasna', shortName: 'HR-CV', region: 'Transilvania', counties: ['Harghita', 'Covasna'] },
  { id: 'arad', name: 'Arad', shortName: 'AR', region: 'Crișana', counties: ['Arad'] },
  { id: 'alba_hunedoara', name: 'Alba & Hunedoara', shortName: 'AB-HD', region: 'Transilvania', counties: ['Alba', 'Hunedoara'] },
  { id: 'sibiu_brasov', name: 'Sibiu & Brașov', shortName: 'SB-BV', region: 'Transilvania', counties: ['Sibiu', 'Brasov'] },
  { id: 'timis', name: 'Timiș', shortName: 'TM', region: 'Banat', counties: ['Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'gorj_mehedinti', name: 'Gorj & Mehedinți', shortName: 'GJ-MH', region: 'Oltenia', counties: ['Gorj', 'Mehedinti'] },
  { id: 'valcea_arges', name: 'Vâlcea & Argeș', shortName: 'VL-AG', region: 'Oltenia/Muntenia', counties: ['Valcea', 'Arges'] },
  { id: 'dolj_olt', name: 'Dolj & Olt', shortName: 'DJ-OT', region: 'Oltenia', counties: ['Dolj', 'Olt'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'buzau', name: 'Buzău', shortName: 'BZ', region: 'Muntenia', counties: ['Buzau'] },
  { id: 'braila', name: 'Brăila', shortName: 'BR', region: 'Muntenia', counties: ['Braila'] },
  { id: 'bucuresti_ilfov_sud', name: 'București & Muntenia Sud', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov', 'Giurgiu', 'Teleorman', 'Calarasi', 'Ialomita'] },
  { id: 'tulcea', name: 'Tulcea', shortName: 'TL', region: 'Dobrogea', counties: ['Tulcea'] },
  { id: 'constanta', name: 'Constanța', shortName: 'CT', region: 'Dobrogea', counties: ['Constanta'] },
];

const t10 = buildTerritoryGroup(defs10);
const t15 = buildTerritoryGroup(defs15);
const t25 = buildTerritoryGroup(defs25);
// Ensure defs29 has exactly 29 territories (pick 29)
const t29 = buildTerritoryGroup(defs29.slice(0, 29));

console.log('Territory counts:', {
  t10: t10.length,
  t15: t15.length,
  t25: t25.length,
  t29: t29.length,
});

// Generate TypeScript code
const tsContent = `/**
 * Date Geografice Reale ale României – Proiectate SVG conform ANCPI / OpenStreetMap
 * Generat automat din data/geo/romania-counties.geojson
 *
 * Configurație scalabilă în funcție de numărul de jucători:
 * - 2 jucători: 10 teritorii
 * - 3 jucători: 15 teritorii (harta clasică Conquiztador)
 * - 4–5 jucători: 25 teritorii
 * - 6–10 jucători: 29 teritorii
 */

export interface TerritoryDef {
  id: string;
  name: string;
  shortName: string;
  region: string;
  labelX: number;
  labelY: number;
  polygon: string;
  neighbors: string[];
}

export const ROMANIA_10_TERRITORIES: TerritoryDef[] = ${JSON.stringify(t10, null, 2)};

export const ROMANIA_15_TERRITORIES: TerritoryDef[] = ${JSON.stringify(t15, null, 2)};

export const ROMANIA_25_TERRITORIES: TerritoryDef[] = ${JSON.stringify(t25, null, 2)};

export const ROMANIA_29_TERRITORIES: TerritoryDef[] = ${JSON.stringify(t29, null, 2)};

/**
 * Generează starea teritoriilor inițializată pentru un meci.
 * Se scalează dinamic în funcție de numărul de jucători:
 * - 2 jucători: 10 regiuni
 * - 3 jucători: 15 regiuni
 * - 4-5 jucători: 25 regiuni
 * - 6-10 jucători: 29 regiuni
 */
export function createMapForPlayerCount(playerCount: number): Record<string, any> {
  let defs = ROMANIA_15_TERRITORIES;

  if (playerCount <= 2) {
    defs = ROMANIA_10_TERRITORIES;
  } else if (playerCount === 3) {
    defs = ROMANIA_15_TERRITORIES;
  } else if (playerCount <= 5) {
    defs = ROMANIA_25_TERRITORIES;
  } else {
    defs = ROMANIA_29_TERRITORIES;
  }

  const validIds = new Set(defs.map(t => t.id));
  const neighborsById = new Map<string, Set<string>>();

  for (const t of defs) {
    neighborsById.set(t.id, new Set(t.neighbors.filter(id => validIds.has(id) && id !== t.id)));
  }

  // Normalize graph edges (garantează simetrie bidirecțională completă: dacă A este vecin cu B, atunci și B este vecin cu A)
  for (const [id, neighbors] of neighborsById.entries()) {
    for (const neighborId of neighbors) {
      neighborsById.get(neighborId)?.add(id);
    }
  }

  const map: Record<string, any> = {};
  for (const t of defs) {
    map[t.id] = {
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      region: t.region,
      svgPath: t.polygon,
      labelX: t.labelX,
      labelY: t.labelY,
      points: 0, // Teritoriile neutre NU afișează puncte până la cucerire!
      ownerId: null,
      isBase: false,
      basePlayerName: undefined,
      castleTowers: 3,
      defensiveBonus: 0,
      neighbors: Array.from(neighborsById.get(t.id) || []),
    };
  }

  return map;
}
`;

fs.writeFileSync(path.join(__dirname, '../server/romaniaMapData.ts'), tsContent, 'utf8');
console.log('Successfully generated server/romaniaMapData.ts from GeoJSON!');
