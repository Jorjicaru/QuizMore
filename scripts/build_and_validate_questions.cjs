const fs = require('fs');
const path = require('path');

function normalizeQuestionText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// Helper to build 4 distinct options with deterministic rotation of correctAnswerIndex
function buildChoiceOptions(correctValue, distractorPool, seedIndex) {
  const corrStr = String(correctValue).trim();
  const corrNorm = normalizeQuestionText(corrStr);
  const filtered = [];
  const seen = new Set([corrNorm]);
  for (const item of distractorPool) {
    const cleanItem = String(item).trim();
    const norm = normalizeQuestionText(cleanItem);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      filtered.push(cleanItem);
    }
  }
  if (filtered.length < 3) {
    throw new Error(`Insufficient distractors for value "${corrStr}"`);
  }
  const d1 = filtered[(seedIndex * 3 + 1) % filtered.length];
  let d2Idx = (seedIndex * 5 + 2) % filtered.length;
  if (d2Idx === (seedIndex * 3 + 1) % filtered.length) {
    d2Idx = (d2Idx + 1) % filtered.length;
  }
  let d3Idx = (seedIndex * 7 + 3) % filtered.length;
  while (
    d3Idx === (seedIndex * 3 + 1) % filtered.length ||
    d3Idx === d2Idx
  ) {
    d3Idx = (d3Idx + 1) % filtered.length;
  }
  const distractors = [d1, filtered[d2Idx], filtered[d3Idx]];
  const targetIdx = seedIndex % 4;
  const options = [];
  let dPtr = 0;
  for (let i = 0; i < 4; i++) {
    if (i === targetIdx) options.push(corrStr);
    else options.push(distractors[dPtr++]);
  }
  return { options, correctAnswerIndex: targetIdx };
}

// ---------------------------------------------------------------------------
// 1. LOAD ORIGINAL 6,241 ARCHIVE (PRESERVING ALL ORIGINAL RECORDS)
// ---------------------------------------------------------------------------
const questionsDir = path.join(process.cwd(), 'data', 'questions');
const archivePath = path.join(questionsDir, 'archive_v91_original.json');

if (!fs.existsSync(archivePath)) {
  throw new Error(
    'Lipsește arhiva originală data/questions/archive_v91_original.json cu cele 6.241 înregistrări.'
  );
}

const originalArchive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
const originalChoice = originalArchive.choice || [];
const originalEstimation = originalArchive.estimation || [];

if (originalChoice.length !== 3324 || originalEstimation.length !== 2917) {
  throw new Error(
    `Arhiva originală trebuie să conțină exact 3.324 choice și 2.917 estimation (actual: ${originalChoice.length} + ${originalEstimation.length}).`
  );
}

// ---------------------------------------------------------------------------
// 2. CURATED, NATURAL ROMANIAN REPLACEMENTS & CONVERSIONS BY QUESTION ID
// ---------------------------------------------------------------------------

const RO_COUNTIES = [
  { county: 'Alba', seat: 'Alba Iulia', code: 'AB', region: 'Transilvania', river: 'Mureș' },
  { county: 'Arad', seat: 'Arad', code: 'AR', region: 'Crișana', river: 'Mureș' },
  { county: 'Argeș', seat: 'Pitești', code: 'AG', region: 'Muntenia', river: 'Argeș' },
  { county: 'Bacău', seat: 'Bacău', code: 'BC', region: 'Moldova', river: 'Bistrița' },
  { county: 'Bihor', seat: 'Oradea', code: 'BH', region: 'Crișana', river: 'Crișul Repede' },
  { county: 'Bistrița-Năsăud', seat: 'Bistrița', code: 'BN', region: 'Transilvania', river: 'Bistrița Ardeleană' },
  { county: 'Botoșani', seat: 'Botoșani', code: 'BT', region: 'Moldova', river: 'Prut' },
  { county: 'Brașov', seat: 'Brașov', code: 'BV', region: 'Transilvania', river: 'Olt' },
  { county: 'Brăila', seat: 'Brăila', code: 'BR', region: 'Muntenia', river: 'Dunărea' },
  { county: 'Buzău', seat: 'Buzău', code: 'BZ', region: 'Muntenia', river: 'Buzău' },
  { county: 'Caraș-Severin', seat: 'Reșița', code: 'CS', region: 'Banat', river: 'Bârzava' },
  { county: 'Călărași', seat: 'Călărași', code: 'CL', region: 'Muntenia', river: 'Borcea' },
  { county: 'Cluj', seat: 'Cluj-Napoca', code: 'CJ', region: 'Transilvania', river: 'Someșul Mic' },
  { county: 'Constanța', seat: 'Constanța', code: 'CT', region: 'Dobrogea', river: 'Dunărea' },
  { county: 'Covasna', seat: 'Sfântu Gheorghe', code: 'CV', region: 'Transilvania', river: 'Olt' },
  { county: 'Dâmbovița', seat: 'Târgoviște', code: 'DB', region: 'Muntenia', river: 'Ialomița' },
  { county: 'Dolj', seat: 'Craiova', code: 'DJ', region: 'Oltenia', river: 'Jiu' },
  { county: 'Galați', seat: 'Galați', code: 'GL', region: 'Moldova', river: 'Dunărea' },
  { county: 'Giurgiu', seat: 'Giurgiu', code: 'GR', region: 'Muntenia', river: 'Dunărea' },
  { county: 'Gorj', seat: 'Târgu Jiu', code: 'GJ', region: 'Oltenia', river: 'Jiu' },
  { county: 'Harghita', seat: 'Miercurea Ciuc', code: 'HR', region: 'Transilvania', river: 'Olt' },
  { county: 'Hunedoara', seat: 'Deva', code: 'HD', region: 'Transilvania', river: 'Mureș' },
  { county: 'Ialomița', seat: 'Slobozia', code: 'IL', region: 'Muntenia', river: 'Ialomița' },
  { county: 'Iași', seat: 'Iași', code: 'IS', region: 'Moldova', river: 'Bahlui' },
  { county: 'Ilfov', seat: 'Buftea', code: 'IF', region: 'Muntenia', river: 'Colentina' },
  { county: 'Maramureș', seat: 'Baia Mare', code: 'MM', region: 'Maramureș', river: 'Săsar' },
  { county: 'Mehedinți', seat: 'Drobeta-Turnu Severin', code: 'MH', region: 'Oltenia', river: 'Dunărea' },
  { county: 'Mureș', seat: 'Târgu Mureș', code: 'MS', region: 'Transilvania', river: 'Mureș' },
  { county: 'Neamț', seat: 'Piatra Neamț', code: 'NT', region: 'Moldova', river: 'Bistrița' },
  { county: 'Olt', seat: 'Slatina', code: 'OT', region: 'Oltenia', river: 'Olt' },
  { county: 'Prahova', seat: 'Ploiești', code: 'PH', region: 'Muntenia', river: 'Prahova' },
  { county: 'Satu Mare', seat: 'Satu Mare', code: 'SM', region: 'Maramureș', river: 'Someș' },
  { county: 'Sălaj', seat: 'Zalău', code: 'SJ', region: 'Transilvania', river: 'Zalău' },
  { county: 'Sibiu', seat: 'Sibiu', code: 'SB', region: 'Transilvania', river: 'Cibin' },
  { county: 'Suceava', seat: 'Suceava', code: 'SV', region: 'Bucovina', river: 'Suceava' },
  { county: 'Teleorman', seat: 'Alexandria', code: 'TR', region: 'Muntenia', river: 'Vedea' },
  { county: 'Timiș', seat: 'Timișoara', code: 'TM', region: 'Banat', river: 'Bega' },
  { county: 'Tulcea', seat: 'Tulcea', code: 'TL', region: 'Dobrogea', river: 'Dunărea' },
  { county: 'Vaslui', seat: 'Vaslui', code: 'VS', region: 'Moldova', river: 'Bârlad' },
  { county: 'Vâlcea', seat: 'Râmnicu Vâlcea', code: 'VL', region: 'Oltenia', river: 'Olt' },
  { county: 'Vrancea', seat: 'Focșani', code: 'VN', region: 'Moldova', river: 'Milcov' },
];

// Clean currency names without country adjective giveaways
const CLEAN_CURRENCY_BY_COUNTRY_SLUG = {
  romania: 'Leu',
  franta: 'Euro',
  germania: 'Euro',
  italia: 'Euro',
  spania: 'Euro',
  portugalia: 'Euro',
  grecia: 'Euro',
  austria: 'Euro',
  elvetia: 'Franc',
  olanda: 'Euro',
  belgia: 'Euro',
  polonia: 'Zlot',
  cehia: 'Coroană',
  slovacia: 'Euro',
  ungaria: 'Forint',
  bulgaria: 'Leva',
  serbia: 'Dinar',
  croatia: 'Euro',
  slovenia: 'Euro',
  republica_moldova: 'Leu',
  ucraina: 'Grivnă',
  suedia: 'Coroană',
  norvegia: 'Coroană',
  finlanda: 'Euro',
  danemarca: 'Coroană',
  irlanda: 'Euro',
  islanda: 'Coroană',
  regatul_unit: 'Liră sterlină',
  turcia: 'Liră',
  japonia: 'Yen',
  coreea_de_sud: 'Won',
  china: 'Yuan',
  india: 'Rupie',
  thailanda: 'Baht',
  vietnam: 'Dong',
  indonezia: 'Rupie',
  filipine: 'Peso',
  egipt: 'Liră',
  maroc: 'Dirham',
  kenya: 'Șiling',
  nigeria: 'Naira',
  canada: 'Dolar',
  statele_unite_ale_americii: 'Dolar',
  mexic: 'Peso',
  brazilia: 'Real',
  argentina: 'Peso',
  chile: 'Peso',
  peru: 'Sol',
  columbia: 'Peso',
  australia: 'Dolar',
  noua_zeelanda: 'Dolar',
  albania: 'Lek',
  macedonia_de_nord: 'Denar',
  muntenegru: 'Euro',
  bosnia_si_hertegovina: 'Marcă convertibilă',
  estonia: 'Euro',
  letonia: 'Euro',
  lituania: 'Euro',
  luxemburg: 'Euro',
  cipru: 'Euro',
};
const ALL_CLEAN_CURRENCIES = [...new Set(Object.values(CLEAN_CURRENCY_BY_COUNTRY_SLUG))];

// Clean natural Romanian questions for all 56 HISTORY_EVENTS (never leaking year, leader, or place)
const CLEAN_HISTORY_BY_INDEX = [
  {
    idx: 1,
    year: 1330,
    leader: 'Basarab I',
    place: 'Posada',
    qYear: 'În ce an a avut loc Bătălia de la Posada?',
    qLeader: 'Ce domnitor muntean a câștigat Bătălia de la Posada în anul 1330?',
    qPlace: 'Unde l-a învins Basarab I pe regele Carol Robert de Anjou în 1330?',
  },
  {
    idx: 2,
    year: 1457,
    leader: 'Ștefan cel Mare',
    place: 'Suceava',
    qYear: 'În ce an a urcat Ștefan cel Mare pe tronul Moldovei?',
    qLeader: 'Ce domnitor al Moldovei a urcat pe tron în anul 1457?',
    qPlace: 'În ce cetate de scaun a domnit Ștefan cel Mare după urcarea pe tron?',
  },
  {
    idx: 3,
    year: 1467,
    leader: 'Ștefan cel Mare',
    place: 'Baia',
    qYear: 'În ce an a avut loc Bătălia de la Baia din Moldova?',
    qLeader: 'Ce domnitor român l-a înfruntat pe regele Matei Corvin la Baia în 1467?',
    qPlace: 'În ce localitate din Moldova l-a învins Ștefan cel Mare pe Matei Corvin?',
  },
  {
    idx: 4,
    year: 1475,
    leader: 'Ștefan cel Mare',
    place: 'Vaslui',
    qYear: 'În ce an a avut loc Bătălia de la Vaslui (Podul Înalt)?',
    qLeader: 'Cine a condus oastea Moldovei în victoria de la Podul Înalt din 1475?',
    qPlace: 'Lângă ce oraș a obținut Ștefan cel Mare victoria antiotomană din ianuarie 1475?',
  },
  {
    idx: 5,
    year: 1476,
    leader: 'Ștefan cel Mare',
    place: 'Războieni',
    qYear: 'În ce an a avut loc Bătălia de la Războieni (Valea Albă)?',
    qLeader: 'Ce domnitor moldovean a luptat împotriva lui Mahomed al II-lea la Valea Albă?',
    qPlace: 'În ce loc numit și Valea Albă a luptat Ștefan cel Mare în 1476?',
  },
  {
    idx: 6,
    year: 1466,
    leader: 'Ștefan cel Mare',
    place: 'Putna',
    qYear: 'În ce an a început zidirea Mănăstirii Putna în Moldova?',
    qLeader: 'Ce domnitor al Moldovei a ctitorit Mănăstirea Putna?',
    qPlace: 'La ce mănăstire din Bucovina se află mormântul lui Ștefan cel Mare?',
  },
  {
    idx: 7,
    year: 1488,
    leader: 'Ștefan cel Mare',
    place: 'Voroneț',
    qYear: 'În ce an a fost ctitorită celebra Mănăstire Voroneț?',
    qLeader: 'Ce domnitor al Moldovei a ctitorit Mănăstirea Voroneț în anul 1488?',
    qPlace: 'Ce mănăstire bucovineană ctitorită în 1488 este vestită pentru albastrul ei exterior?',
  },
  {
    idx: 8,
    year: 1497,
    leader: 'Ștefan cel Mare',
    place: 'Codrii Cosminului',
    qYear: 'În ce an a avut loc Bătălia din Codrii Cosminului?',
    qLeader: 'Ce domnitor român l-a învins pe regele Ioan Albert în Codrii Cosminului?',
    qPlace: 'Unde a învins Ștefan cel Mare oastea regelui polon Ioan Albert în 1497?',
  },
  {
    idx: 9,
    year: 1386,
    leader: 'Mircea cel Bătrân',
    place: 'Curtea de Argeș',
    qYear: 'În ce an a început domnia lui Mircea cel Bătrân în Țara Românească?',
    qLeader: 'Ce mare voievod a urcat pe tronul Țării Românești în anul 1386?',
    qPlace: 'Care era cetatea de scaun a Țării Românești la urcarea pe tron în 1386?',
  },
  {
    idx: 10,
    year: 1395,
    leader: 'Mircea cel Bătrân',
    place: 'Rovine',
    qYear: 'În ce an a avut loc Bătălia de la Rovine?',
    qLeader: 'Ce domnitor muntean a condus oastea română în Bătălia de la Rovine?',
    qPlace: 'Unde l-a înfruntat Mircea cel Bătrân pe sultanul Baiazid I în anul 1395?',
  },
  {
    idx: 11,
    year: 1462,
    leader: 'Vlad Țepeș',
    place: 'Târgoviște',
    qYear: 'În ce an a avut loc Atacul de noapte condus de Vlad Țepeș?',
    qLeader: 'Ce domnitor muntean a condus Atacul de noapte împotriva lui Mahomed al II-lea?',
    qPlace: 'Lângă ce cetate de scaun a avut loc Atacul de noapte din iunie 1462?',
  },
  {
    idx: 12,
    year: 1459,
    leader: 'Vlad Țepeș',
    place: 'București',
    qYear: 'În ce an a fost atestată documentar pentru prima dată Cetatea Bucureștilor?',
    qLeader: 'În timpul cărui domnitor a fost emis primul document care atestă Cetatea Bucureștilor?',
    qPlace: 'Ce oraș de astăzi a fost atestat documentar prima oară la 20 septembrie 1459?',
  },
  {
    idx: 13,
    year: 1595,
    leader: 'Mihai Viteazul',
    place: 'Călugăreni',
    qYear: 'În ce an a avut loc Bătălia de la Călugăreni?',
    qLeader: 'Ce voievod român l-a învins pe Sinan Pașa la Călugăreni în anul 1595?',
    qPlace: 'Unde a obținut Mihai Viteazul celebra victorie antiotomană din august 1595?',
  },
  {
    idx: 14,
    year: 1599,
    leader: 'Mihai Viteazul',
    place: 'Șelimbăr',
    qYear: 'În ce an a avut loc Bătălia de la Șelimbăr?',
    qLeader: 'Cine a câștigat Bătălia de la Șelimbăr în octombrie 1599?',
    qPlace: 'Lângă Sibiu, în ce localitate a învins Mihai Viteazul în octombrie 1599?',
  },
  {
    idx: 15,
    year: 1600,
    leader: 'Mihai Viteazul',
    place: 'Iași',
    qYear: 'În ce an a realizat Mihai Viteazul prima unire a celor trei țări române?',
    qLeader: 'Ce voievod a realizat în anul 1600 prima unire politică a țărilor române?',
    qPlace: 'În ce capitală a Moldovei a intrat Mihai Viteazul în mai 1600?',
  },
  {
    idx: 16,
    year: 1688,
    leader: 'Constantin Brâncoveanu',
    place: 'București',
    qYear: 'În ce an a început domnia lui Constantin Brâncoveanu în Țara Românească?',
    qLeader: 'Ce domnitor al Țării Românești a urcat pe tron în anul 1688?',
    qPlace: null,
  },
  {
    idx: 17,
    year: 1714,
    leader: 'Constantin Brâncoveanu',
    place: 'Constantinopol',
    qYear: 'În ce an a avut loc martiriul domnitorului Constantin Brâncoveanu și al fiilor săi?',
    qLeader: 'Ce domnitor român a suferit martiriul împreună cu cei patru fii în 1714?',
    qPlace: 'În ce oraș au fost martirizați Constantin Brâncoveanu și fiii săi în 1714?',
  },
  {
    idx: 18,
    year: 1711,
    leader: 'Dimitrie Cantemir',
    place: 'Stănilești',
    qYear: 'În ce an a avut loc Bătălia de la Stănilești pe Prut?',
    qLeader: 'Ce domnitor cărturar al Moldovei s-a aliat cu Petru cel Mare în 1711?',
    qPlace: 'În ce localitate de pe Prut s-a dat bătălia ruso-moldo-otomană din 1711?',
  },
  {
    idx: 19,
    year: 1784,
    leader: 'Horea',
    place: 'Câmpeni',
    qYear: 'În ce an a izbucnit marea răscoală din Transilvania condusă de Horea, Cloșca și Crișan?',
    qLeader: 'Cine a condus, alături de Cloșca și Crișan, răscoala țărănească din 1784?',
    qPlace: 'În ce centru din Munții Apuseni s-au adunat răsculații lui Horea în 1784?',
  },
  {
    idx: 20,
    year: 1821,
    leader: 'Tudor Vladimirescu',
    place: 'Padeș',
    qYear: 'În ce an a avut loc Revoluția condusă de Tudor Vladimirescu?',
    qLeader: 'Cine a condus Revoluția de la 1821 din Țara Românească?',
    qPlace: 'În ce localitate din Gorj a fost citită proclamația lui Tudor Vladimirescu în 1821?',
  },
  {
    idx: 21,
    year: 1848,
    leader: 'Avram Iancu',
    place: 'Blaj',
    qYear: 'În ce an a avut loc Adunarea Națională de pe Câmpia Libertății de la Blaj?',
    qLeader: 'Ce conducător pașoptist transilvănean a fost supranumit „Crăișorul Munților”?',
    qPlace: 'În ce oraș din Transilvania s-a ținut Adunarea de pe Câmpia Libertății în 1848?',
  },
  {
    idx: 22,
    year: 1859,
    leader: 'Alexandru Ioan Cuza',
    place: 'București',
    qYear: 'În ce an s-a înfăptuit Mica Unire a Principatelor Române?',
    qLeader: 'Cine a fost ales domnitor al Moldovei și al Țării Românești în ianuarie 1859?',
    qPlace: 'În ce oraș a avut loc votul decisiv de la 24 ianuarie 1859 pentru Unire?',
  },
  {
    idx: 23,
    year: 1860,
    leader: 'Alexandru Ioan Cuza',
    place: 'Iași',
    qYear: 'În ce an a fost înființată Universitatea din Iași, prima din România?',
    qLeader: 'Ce domnitor a fondat prima universitate modernă din România în anul 1860?',
    qPlace: 'În ce oraș a fost fondată în 1860 prima universitate modernă din România?',
  },
  {
    idx: 24,
    year: 1864,
    leader: 'Alexandru Ioan Cuza',
    place: 'București',
    qYear: 'În ce an a fost înființată Universitatea din București prin decret domnesc?',
    qLeader: 'Prin decretul cărui domnitor a fost înființată Universitatea din București în 1864?',
    qPlace: null,
  },
  {
    idx: 25,
    year: 1866,
    leader: 'Carol I',
    place: 'București',
    qYear: 'În ce an a devenit principele Carol de Hohenzollern domnitor al României?',
    qLeader: 'Ce principe a depus jurământul ca domnitor al României la 10 mai 1866?',
    qPlace: null,
  },
  {
    idx: 26,
    year: 1877,
    leader: 'Mihail Kogălniceanu',
    place: 'București',
    qYear: 'În ce an a fost proclamată Independența de Stat a României?',
    qLeader: 'Ce ministru de externe a rostit în Parlament declarația de independență la 9 mai 1877?',
    qPlace: null,
  },
  {
    idx: 27,
    year: 1881,
    leader: 'Carol I',
    place: 'București',
    qYear: 'În ce an a fost proclamată România ca Regat?',
    qLeader: 'Cine a fost încoronat ca prim rege al României în anul 1881?',
    qPlace: null,
  },
  {
    idx: 28,
    year: 1895,
    leader: 'Anghel Saligny',
    place: 'Cernavodă',
    qYear: 'În ce an a fost inaugurat complexul de poduri dunărene proiectat de Anghel Saligny?',
    qLeader: 'Ce mare inginer român a proiectat Podul Regele Carol I peste Dunăre?',
    qPlace: 'La ce oraș de pe Dunăre a fost inaugurat în 1895 podul lui Anghel Saligny?',
  },
  {
    idx: 29,
    year: 1916,
    leader: 'Ferdinand I',
    place: 'București',
    qYear: 'În ce an a intrat România în Primul Război Mondial?',
    qLeader: 'Sub domnia cărui rege a intrat România în Primul Război Mondial în 1916?',
    qPlace: null,
  },
  {
    idx: 30,
    year: 1917,
    leader: 'Eremia Grigorescu',
    place: 'Mărășești',
    qYear: 'În ce an s-au purtat bătăliile de la Mărăști, Mărășești și Oituz?',
    qLeader: 'Ce general român a condus Armata 1 în Bătălia de la Mărășești din 1917?',
    qPlace: 'În ce localitate din Vrancea s-a dat în vara anului 1917 cea mai mare bătălie?',
  },
  {
    idx: 31,
    year: 1918,
    leader: 'Ferdinand I',
    place: 'Alba Iulia',
    qYear: 'În ce an a avut loc Marea Adunare Națională care a votat Marea Unire?',
    qLeader: 'Ce rege al României a fost supranumit „Întregitorul” după Marea Unire din 1918?',
    qPlace: 'În ce oraș a fost proclamată Marea Unire la 1 decembrie 1918?',
  },
  {
    idx: 32,
    year: 1922,
    leader: 'Ferdinand I',
    place: 'Alba Iulia',
    qYear: 'În ce an au fost încoronați Regele Ferdinand I și Regina Maria la Alba Iulia?',
    qLeader: 'Ce rege a fost încoronat alături de Regina Maria la 15 octombrie 1922?',
    qPlace: 'În ce oraș transilvănean au fost încoronați suveranii României Mari în octombrie 1922?',
  },
  {
    idx: 33,
    year: 1923,
    leader: 'Ion I. C. Brătianu',
    place: 'București',
    qYear: 'În ce an a fost adoptată Constituția României Mari din perioada interbelică?',
    qLeader: 'Ce prim-ministru liberal a condus guvernul care a promovat Constituția din 1923?',
    qPlace: null,
  },
  {
    idx: 34,
    year: 1989,
    leader: null,
    place: 'Timișoara',
    qYear: 'În ce an a avut loc Revoluția anticomunistă din România?',
    qLeader: null,
    qPlace: 'În ce oraș din Banat a izbucnit Revoluția anticomunistă în decembrie 1989?',
  },
  {
    idx: 35,
    year: 2004,
    leader: null,
    place: 'Bruxelles',
    qYear: 'În ce an a aderat oficial România la Alianța Nord-Atlantică (NATO)?',
    qLeader: null,
    qPlace: 'În ce oraș european se află sediul central al Alianței Nord-Atlantice (NATO)?',
  },
  {
    idx: 36,
    year: 2007,
    leader: null,
    place: 'București',
    qYear: 'În ce an a devenit România stat membru al Uniunii Europene?',
    qLeader: null,
    qPlace: null,
  },
  {
    idx: 37,
    year: 1453,
    leader: 'Mahomed al II-lea',
    place: 'Constantinopol',
    qYear: 'În ce an a căzut Constantinopolul sub asediul Imperiului Otoman?',
    qLeader: 'Ce sultan otoman a cucerit Constantinopolul în anul 1453?',
    qPlace: 'Ce capitală imperială a căzut sub asediul otoman în mai 1453?',
  },
  {
    idx: 38,
    year: 1492,
    leader: 'Cristofor Columb',
    place: 'San Salvador',
    qYear: 'În ce an a ajuns navigatorul Cristofor Columb în Lumea Nouă?',
    qLeader: 'Ce navigator genovez a traversat Oceanul Atlantic în anul 1492?',
    qPlace: 'Cum a numit Cristofor Columb prima insulă din Caraibe pe care a debarcat?',
  },
  {
    idx: 39,
    year: 1517,
    leader: 'Martin Luther',
    place: 'Wittenberg',
    qYear: 'În ce an a publicat Martin Luther cele 95 de teze, declanșând Reforma Protestantă?',
    qLeader: 'Ce teolog german a inițiat Reforma Protestantă în anul 1517?',
    qPlace: 'În ce oraș german a afișat Martin Luther cele 95 de teze în 1517?',
  },
  {
    idx: 40,
    year: 1648,
    leader: null,
    place: 'Münster',
    qYear: 'În ce an a fost semnată Pacea de la Westfalia?',
    qLeader: null,
    qPlace: 'În ce oraș din Westfalia a fost semnat tratatul de pace din 1648?',
  },
  {
    idx: 41,
    year: 1776,
    leader: 'Thomas Jefferson',
    place: 'Philadelphia',
    qYear: 'În ce an a fost adoptată Declarația de Independență a Statelor Unite?',
    qLeader: 'Cine a fost autorul principal al Declarației de Independență a SUA din 1776?',
    qPlace: 'În ce oraș american a fost adoptată Declarația de Independență la 4 iulie 1776?',
  },
  {
    idx: 42,
    year: 1789,
    leader: null,
    place: 'Paris',
    qYear: 'În ce an a izbucnit Revoluția Franceză prin căderea Bastiliei?',
    qLeader: null,
    qPlace: 'În ce capitală europeană a avut loc căderea închisorii Bastilia la 14 iulie 1789?',
  },
  {
    idx: 43,
    year: 1804,
    leader: 'Napoleon Bonaparte',
    place: 'Paris',
    qYear: 'În ce an a fost încoronat Napoleon Bonaparte ca Împărat al francezilor?',
    qLeader: 'Cine s-a încoronat Împărat al francezilor în Catedrala Notre-Dame în 1804?',
    qPlace: 'În ce oraș a fost încoronat Napoleon Bonaparte ca împărat în decembrie 1804?',
  },
  {
    idx: 44,
    year: 1815,
    leader: 'Ducele de Wellington',
    place: 'Waterloo',
    qYear: 'În ce an a avut loc celebra Bătălie de la Waterloo?',
    qLeader: 'Ce comandant britanic l-a învins pe Napoleon Bonaparte la Waterloo în 1815?',
    qPlace: 'În ce localitate din Belgia a suferit Napoleon Bonaparte înfrângerea finală din 1815?',
  },
  {
    idx: 45,
    year: 1869,
    leader: 'Ferdinand de Lesseps',
    place: 'Suez',
    qYear: 'În ce an a fost inaugurat Canalul Suez pentru navigația maritimă?',
    qLeader: 'Ce diplomat și antreprenor francez a coordonat construirea Canalului Suez?',
    qPlace: 'Ce canal maritim inaugurat în 1869 leagă Marea Mediterană de Marea Roșie?',
  },
  {
    idx: 46,
    year: 1914,
    leader: null,
    place: 'Sarajevo',
    qYear: 'În ce an a izbucnit Primul Război Mondial?',
    qLeader: null,
    qPlace: 'În ce oraș a avut loc atentatul din iunie 1914 care a declanșat războiul?',
  },
  {
    idx: 47,
    year: 1919,
    leader: null,
    place: 'Versailles',
    qYear: 'În ce an a fost semnat Tratatul de Pace de la Versailles cu Germania?',
    qLeader: null,
    qPlace: 'La ce palat de lângă Paris s-a semnat în 1919 tratatul cu Germania?',
  },
  {
    idx: 48,
    year: 1939,
    leader: null,
    place: 'Varșovia',
    qYear: 'În ce an a izbucnit Al Doilea Război Mondial în Europa?',
    qLeader: null,
    qPlace: 'Ce capitală europeană a fost asediată la începutul celui de-Al Doilea Război Mondial?',
  },
  {
    idx: 49,
    year: 1944,
    leader: 'Dwight D. Eisenhower',
    place: 'Normandia',
    qYear: 'În ce an a avut loc debarcarea aliaților în Normandia (Ziua Z)?',
    qLeader: 'Ce general american a fost comandantul suprem al debarcării din Normandia în 1944?',
    qPlace: 'În ce regiune de coastă a Franței a avut loc debarcarea aliată din iunie 1944?',
  },
  {
    idx: 50,
    year: 1945,
    leader: null,
    place: 'San Francisco',
    qYear: 'În ce an s-a încheiat Al Doilea Război Mondial și s-a înființat ONU?',
    qLeader: null,
    qPlace: 'În ce oraș american a fost semnată Carta Națiunilor Unite în anul 1945?',
  },
  {
    idx: 51,
    year: 1957,
    leader: null,
    place: 'Roma',
    qYear: 'În ce an s-a semnat Tratatul de la Roma al Comunității Economice Europene?',
    qLeader: null,
    qPlace: 'În ce capitală europeană s-au semnat în 1957 tratatele fondatoare ale CEE?',
  },
  {
    idx: 52,
    year: 1961,
    leader: 'Iuri Gagarin',
    place: 'Baikonur',
    qYear: 'În ce an a realizat Iuri Gagarin primul zbor al omului în spațiul cosmic?',
    qLeader: 'Cine a fost primul om din istorie care a zburat în spațiul cosmic în 1961?',
    qPlace: 'De pe ce cosmodrom a decolat nava Vostok 1 în aprilie 1961?',
  },
  {
    idx: 53,
    year: 1969,
    leader: 'Neil Armstrong',
    place: 'Marea Liniștii',
    qYear: 'În ce an a pășit primul om pe Lună în cadrul misiunii Apollo 11?',
    qLeader: 'Cine a fost primul astronaut care a pășit pe suprafața Lunii în 1969?',
    qPlace: 'În ce regiune selenarǎ a aselenizat modulul misiunii Apollo 11 în iulie 1969?',
  },
  {
    idx: 54,
    year: 1981,
    leader: 'Dumitru Prunariu',
    place: 'Baikonur',
    qYear: 'În ce an a zburat în spațiul cosmic Dumitru Prunariu, primul cosmonaut român?',
    qLeader: 'Cine este primul și singurul cosmonaut român care a zburat în spațiul cosmic?',
    qPlace: 'De pe ce cosmodrom a fost lansată misiunea Soiuz 40 cu Dumitru Prunariu?',
  },
  {
    idx: 55,
    year: 1989,
    leader: null,
    place: 'Berlin',
    qYear: 'În ce an a căzut Zidul Berlinului, simbolul divizării Europei?',
    qLeader: null,
    qPlace: 'În ce oraș german a fost dărâmat în noiembrie 1989 zidul Războiului Rece?',
  },
  {
    idx: 56,
    year: 1992,
    leader: null,
    place: 'Maastricht',
    qYear: 'În ce an a fost semnat Tratatul de la Maastricht al Uniunii Europene?',
    qLeader: null,
    qPlace: 'În ce oraș olandez a fost semnat în 1992 tratatul care a creat Uniunea Europeană?',
  },
];

const VALID_HISTORY_LEADERS = [
  ...new Set(CLEAN_HISTORY_BY_INDEX.map((x) => x.leader).filter(Boolean)),
];
const VALID_HISTORY_PLACES = [
  ...new Set(CLEAN_HISTORY_BY_INDEX.map((x) => x.place).filter(Boolean)),
];
const VALID_HISTORY_YEARS = [
  ...new Set(CLEAN_HISTORY_BY_INDEX.map((x) => String(x.year))),
];

// Clean Cultural Works (50 works) with clean titles (no parenthetical spoilers in options!)
const CLEAN_CULTURAL_WORKS = [
  { idx: 1, title: 'Luceafărul', author: 'Mihai Eminescu', year: 1883, kind: 'poem filosofic', cat: 'literatura' },
  { idx: 2, title: 'O scrisoare pierdută', author: 'Ion Luca Caragiale', year: 1884, kind: 'comedie clasică', cat: 'literatura' },
  { idx: 3, title: 'Amintiri din copilărie', author: 'Ion Creangă', year: 1892, kind: 'operă memorialistică', cat: 'literatura' },
  { idx: 4, title: 'Moara cu noroc', author: 'Ioan Slavici', year: 1881, kind: 'nuvelă psihologică', cat: 'literatura' },
  { idx: 5, title: 'Mara', author: 'Ioan Slavici', year: 1894, kind: 'roman realist ardelenesc', cat: 'literatura' },
  { idx: 6, title: 'Ion', author: 'Liviu Rebreanu', year: 1920, kind: 'roman realist despre pământ', cat: 'literatura' },
  { idx: 7, title: 'Pădurea spânzuraților', author: 'Liviu Rebreanu', year: 1922, kind: 'roman psihologic de război', cat: 'literatura' },
  { idx: 8, title: 'Răscoala', author: 'Liviu Rebreanu', year: 1932, kind: 'roman social despre anul 1907', cat: 'literatura' },
  { idx: 9, title: 'Baltagul', author: 'Mihail Sadoveanu', year: 1930, kind: 'roman pastoral tradițional', cat: 'literatura' },
  { idx: 10, title: 'Hanu Ancuței', author: 'Mihail Sadoveanu', year: 1928, kind: 'volum de nouă povestiri', cat: 'literatura' },
  { idx: 11, title: 'Ultima noapte de dragoste, întâia noapte de război', author: 'Camil Petrescu', year: 1930, kind: 'roman subiectiv de analiză', cat: 'literatura' },
  { idx: 12, title: 'Patul lui Procust', author: 'Camil Petrescu', year: 1933, kind: 'roman epistolar modern', cat: 'literatura' },
  { idx: 13, title: 'Maitreyi', author: 'Mircea Eliade', year: 1933, kind: 'roman al experienței exotice', cat: 'literatura' },
  { idx: 14, title: 'Enigma Otiliei', author: 'George Călinescu', year: 1938, kind: 'roman de inspirație balzaciană', cat: 'literatura' },
  { idx: 15, title: 'Moromeții', author: 'Marin Preda', year: 1955, kind: 'roman despre satul din Câmpia Dunării', cat: 'literatura' },
  { idx: 16, title: 'Cel mai iubit dintre pământeni', author: 'Marin Preda', year: 1980, kind: 'ultim mare roman publicat în 1980', cat: 'literatura' },
  { idx: 17, title: 'Plumb', author: 'George Bacovia', year: 1916, kind: 'volum de poezii simboliste', cat: 'literatura' },
  { idx: 18, title: 'Cuvinte potrivite', author: 'Tudor Arghezi', year: 1927, kind: 'volum de debut poetic', cat: 'literatura' },
  { idx: 19, title: 'Poemele luminii', author: 'Lucian Blaga', year: 1919, kind: 'volum expresionist de versuri', cat: 'literatura' },
  { idx: 20, title: 'Joc secund', author: 'Ion Barbu', year: 1930, kind: 'volum de poezie ermetică', cat: 'literatura' },
  { idx: 21, title: 'Cântăreața cheală', author: 'Eugen Ionescu', year: 1950, kind: 'piesă a teatrului absurdului', cat: 'literatura' },
  { idx: 22, title: 'Coloana Infinitului', author: 'Constantin Brâncuși', year: 1938, kind: 'sculptură monumentală de la Târgu Jiu', cat: 'arta' },
  { idx: 23, title: 'Rapsodia Română nr. 1', author: 'George Enescu', year: 1901, kind: 'rapsodie simfonică în La major', cat: 'muzica' },
  { idx: 24, title: 'Oedipe', author: 'George Enescu', year: 1936, kind: 'operă lirică în patru acte', cat: 'muzica' },
  { idx: 25, title: 'Balada pentru vioară și orchestră', author: 'Ciprian Porumbescu', year: 1880, kind: 'celebră compoziție instrumentală romantică', cat: 'muzica' },
  { idx: 26, title: 'Don Quijote de la Mancha', author: 'Miguel de Cervantes', year: 1605, kind: 'roman clasic spaniol', cat: 'literatura' },
  { idx: 27, title: 'Hamlet', author: 'William Shakespeare', year: 1601, kind: 'tragedie despre prințul Danemarcei', cat: 'literatura' },
  { idx: 28, title: 'Mizerabilii', author: 'Victor Hugo', year: 1862, kind: 'roman romantic francez', cat: 'literatura' },
  { idx: 29, title: 'Crimă și pedeapsă', author: 'Fiodor Dostoievski', year: 1866, kind: 'roman psihologic rus', cat: 'literatura' },
  { idx: 30, title: 'Război și pace', author: 'Lev Tolstoi', year: 1869, kind: 'frescă epică a Rusiei napoleoniene', cat: 'literatura' },
  { idx: 31, title: 'O mie nouă sute optzeci și patru', author: 'George Orwell', year: 1949, kind: 'roman distopic despre Big Brother', cat: 'literatura' },
  { idx: 32, title: 'Un veac de singurătate', author: 'Gabriel Garcia Marquez', year: 1967, kind: 'roman al realismului magic', cat: 'literatura' },
  { idx: 33, title: 'Bătrânul și marea', author: 'Ernest Hemingway', year: 1952, kind: 'nuvelă parabolă despre un pescar', cat: 'literatura' },
  { idx: 34, title: 'Micul Prinț', author: 'Antoine de Saint-Exupery', year: 1943, kind: 'poveste filosofică alegorică', cat: 'literatura' },
  { idx: 35, title: 'Stăpânul Inelelor: Frăția Inelului', author: 'J. R. R. Tolkien', year: 1954, kind: 'epopee fantastică modernă', cat: 'literatura' },
  { idx: 36, title: 'Noaptea înstelată', author: 'Vincent van Gogh', year: 1889, kind: 'pictură postimpresionistă celebră', cat: 'arta' },
  { idx: 37, title: 'Guernica', author: 'Pablo Picasso', year: 1937, kind: 'pictură murală antirăzboinică', cat: 'arta' },
  { idx: 38, title: 'Persistența memoriei', author: 'Salvador Dali', year: 1931, kind: 'pictură suprarealistă cu ceasuri topite', cat: 'arta' },
  { idx: 39, title: 'Simfonia a IX-a', author: 'Ludwig van Beethoven', year: 1824, kind: 'simfonie corală ce include Oda Bucuriei', cat: 'muzica' },
  { idx: 40, title: 'Anotimpurile', author: 'Antonio Vivaldi', year: 1725, kind: 'ciclu de patru concerte baroce', cat: 'muzica' },
  { idx: 41, title: 'Flautul fermecat', author: 'Wolfgang Amadeus Mozart', year: 1791, kind: 'operă în două acte', cat: 'muzica' },
  { idx: 42, title: 'Lacul lebedelor', author: 'Piotr Ilici Ceaikovski', year: 1877, kind: 'balet clasic în patru acte', cat: 'muzica' },
  { idx: 43, title: 'Nașul', author: 'Francis Ford Coppola', year: 1972, kind: 'film clasic despre familia Corleone', cat: 'cinematografie' },
  { idx: 44, title: 'Pulp Fiction', author: 'Quentin Tarantino', year: 1994, kind: 'film american premiat la Cannes', cat: 'cinematografie' },
  { idx: 45, title: 'Titanic', author: 'James Cameron', year: 1997, kind: 'film epic despre celebrul pachebot', cat: 'cinematografie' },
  { idx: 46, title: '4 luni, 3 săptămâni și 2 zile', author: 'Cristian Mungiu', year: 2007, kind: 'film românesc distins cu Palme d’Or', cat: 'cinematografie' },
  { idx: 47, title: 'Moartea domnului Lăzărescu', author: 'Cristi Puiu', year: 2005, kind: 'film reprezentativ al Noului Val Românesc', cat: 'cinematografie' },
  { idx: 48, title: 'Poziția copilului', author: 'Călin Peter Netzer', year: 2013, kind: 'film românesc premiat cu Ursul de Aur', cat: 'cinematografie' },
  { idx: 49, title: 'Aferim!', author: 'Radu Jude', year: 2015, kind: 'film istoric alb-negru din 2015', cat: 'cinematografie' },
  { idx: 50, title: 'Oppenheimer', author: 'Christopher Nolan', year: 2023, kind: 'film biografic premiat cu Oscar', cat: 'cinematografie' },
];

const CLEAN_CULT_AUTHORS = [...new Set(CLEAN_CULTURAL_WORKS.map((w) => w.author))];
const CLEAN_CULT_TITLES = [...new Set(CLEAN_CULTURAL_WORKS.map((w) => w.title))];
const CLEAN_CULT_YEARS = [...new Set(CLEAN_CULTURAL_WORKS.map((w) => String(w.year)))];

// Clean Sports Facts (20 facts) without (#1) and without leaking city/champion/year in prompt
const CLEAN_SPORTS_FACTS = [
  {
    idx: 1,
    champion: 'Nadia Comăneci',
    host: 'Montreal',
    year: 1976,
    qChamp: 'Cine a obținut prima notă de 10 din istoria gimnasticii olimpice?',
    qHost: 'În ce oraș au avut loc Jocurile Olimpice de vară din anul 1976?',
    qYear: 'În ce an a obținut Nadia Comăneci prima notă de 10 la Jocurile Olimpice?',
    qMetric: 'Câte note de 10 a primit Nadia Comăneci la Jocurile Olimpice de la Montreal?',
    metricOpts: ['3', '5', '7', '10'],
    metricAns: '7',
  },
  {
    idx: 2,
    champion: 'Steaua București',
    host: 'Sevilla',
    year: 1986,
    qChamp: 'Ce echipă românească de fotbal a câștigat Cupa Campionilor Europeni în 1986?',
    qHost: 'În ce oraș spaniol a câștigat Steaua București finala Cupei Campionilor din 1986?',
    qYear: 'În ce an a câștigat Steaua București Cupa Campionilor Europeni la fotbal?',
    qMetric: 'Câte lovituri de la 11 metri a apărat Helmuth Duckadam în finala de la Sevilla?',
    metricOpts: ['2', '3', '4', '5'],
    metricAns: '4',
  },
  {
    idx: 3,
    champion: 'Gheorghe Hagi',
    host: 'Monte Carlo',
    year: 1987,
    qChamp: 'Cine a marcat golul victoriei Stelei în Supercupa Europei din anul 1987?',
    qHost: 'În ce oraș s-a disputat Supercupa Europei câștigată de Steaua București în 1987?',
    qYear: 'În ce an a cucerit Steaua București Supercupa Europei împotriva echipei Dinamo Kiev?',
    qMetric: null,
  },
  {
    idx: 4,
    champion: 'România',
    host: 'Pasadena',
    year: 1994,
    qChamp: 'Ce echipă națională a învins Argentina cu 3–2 în optimile Cupei Mondiale din 1994?',
    qHost: 'În ce oraș californian a învins România naționala Argentinei la Cupa Mondială din 1994?',
    qYear: 'În ce an s-a calificat naționala de fotbal a României în sferturile Cupei Mondiale?',
    qMetric: null,
  },
  {
    idx: 5,
    champion: 'Simona Halep',
    host: 'Paris',
    year: 2018,
    qChamp: 'Ce jucătoare română de tenis a câștigat trofeul de la Roland Garros în 2018?',
    qHost: 'În ce oraș se desfășoară anual turneul de Grand Slam de la Roland Garros?',
    qYear: 'În ce an a cucerit Simona Halep titlul de Grand Slam de la Roland Garros?',
    qMetric: null,
  },
  {
    idx: 6,
    champion: 'Simona Halep',
    host: 'Londra',
    year: 2019,
    qChamp: 'Ce jucătoare română a învins-o pe Serena Williams în finala de la Wimbledon 2019?',
    qHost: 'În ce oraș are loc celebrul turneu de tenis pe iarbă de la Wimbledon?',
    qYear: 'În ce an a câștigat Simona Halep turneul de la Wimbledon la simplu feminin?',
    qMetric: null,
  },
  {
    idx: 7,
    champion: 'Ilie Năstase',
    host: 'Paris',
    year: 1973,
    qChamp: 'Ce tenismen român a câștigat turneul de la Roland Garros fără set pierdut în 1973?',
    qHost: 'În ce capitală europeană a cucerit Ilie Năstase titlul de Grand Slam din 1973?',
    qYear: 'În ce an a câștigat Ilie Năstase titlul de simplu la Roland Garros?',
    qMetric: null,
  },
  {
    idx: 8,
    champion: 'Virginia Ruzici',
    host: 'Paris',
    year: 1978,
    qChamp: 'Ce jucătoare română de tenis a câștigat trofeul de la Roland Garros în 1978?',
    qHost: 'În ce oraș a cucerit Virginia Ruzici titlul de Grand Slam din anul 1978?',
    qYear: 'În ce an a câștigat Virginia Ruzici proba de simplu feminin la Roland Garros?',
    qMetric: null,
  },
  {
    idx: 9,
    champion: 'David Popovici',
    host: 'Paris',
    year: 2024,
    qChamp: 'Ce înotător român a devenit campion olimpic la 200 m liber în anul 2024?',
    qHost: 'În ce oraș au avut loc Jocurile Olimpice de vară din anul 2024?',
    qYear: 'În ce an a cucerit David Popovici aurul olimpic la proba de 200 m liber?',
    qMetric: null,
  },
  {
    idx: 10,
    champion: 'Ivan Patzaichin',
    host: 'Los Angeles',
    year: 1984,
    qChamp: 'Ce legendar canotor român a fost supranumit „Amiralul flotei olimpice românești”?',
    qHost: 'În ce oraș american s-au desfășurat Jocurile Olimpice de vară din anul 1984?',
    qYear: 'În ce an a cucerit Ivan Patzaichin al patrulea aur olimpic la Los Angeles?',
    qMetric: 'Câte medalii olimpice de aur a cucerit Ivan Patzaichin de-a lungul carierei?',
    metricOpts: ['2', '3', '4', '6'],
    metricAns: '4',
  },
  {
    idx: 11,
    champion: 'Constantina Diță',
    host: 'Beijing',
    year: 2008,
    qChamp: 'Ce atletă din România a câștigat maratonul olimpic feminin în anul 2008?',
    qHost: 'În ce oraș din Asia s-au desfășurat Jocurile Olimpice de vară din anul 2008?',
    qYear: 'În ce an a câștigat Constantina Diță proba olimpică de maraton la Beijing?',
    qMetric: null,
  },
  {
    idx: 12,
    champion: 'Gabriela Szabo',
    host: 'Sydney',
    year: 2000,
    qChamp: 'Ce atletă română a cucerit aurul olimpic la 5000 m în anul 2000?',
    qHost: 'În ce oraș australian s-au desfășurat Jocurile Olimpice de vară din anul 2000?',
    qYear: 'În ce an a devenit Gabriela Szabo campioană olimpică la proba de 5000 m?',
    qMetric: null,
  },
  {
    idx: 13,
    champion: 'Spyridon Louis',
    host: 'Atena',
    year: 1896,
    qChamp: 'Cine a câștigat prima probă olimpică de maraton din era modernă în 1896?',
    qHost: 'În ce oraș s-a desfășurat prima ediție a Jocurilor Olimpice moderne în 1896?',
    qYear: 'În ce an a avut loc prima ediție a Jocurilor Olimpice moderne la Atena?',
    qMetric: 'Câte națiuni au participat la prima ediție a Jocurilor Olimpice moderne din 1896?',
    metricOpts: ['8', '14', '24', '32'],
    metricAns: '14',
  },
  {
    idx: 14,
    champion: 'Uruguay',
    host: 'Montevideo',
    year: 1930,
    qChamp: 'Ce echipă națională a câștigat prima ediție a Campionatului Mondial de Fotbal în 1930?',
    qHost: 'În ce oraș a avut loc finala primului Campionat Mondial de Fotbal în 1930?',
    qYear: 'În ce an s-a desfășurat prima ediție a Campionatului Mondial de Fotbal FIFA?',
    qMetric: 'Câte echipe naționale au participat la primul Campionat Mondial de Fotbal din 1930?',
    metricOpts: ['8', '13', '16', '24'],
    metricAns: '13',
  },
  {
    idx: 15,
    champion: 'Usain Bolt',
    host: 'Berlin',
    year: 2009,
    qChamp: 'Ce sprinter jamaican a stabilit recordul mondial de 9,58 secunde la 100 m?',
    qHost: 'În ce oraș german a stabilit Usain Bolt recordul mondial la 100 m în 2009?',
    qYear: 'În ce an a stabilit Usain Bolt recordul mondial de 9,58 secunde la 100 m?',
    qMetric: null,
  },
  {
    idx: 16,
    champion: 'Argentina',
    host: 'Lusail',
    year: 2022,
    qChamp: 'Ce echipă națională condusă de Lionel Messi a câștigat Cupa Mondială FIFA din 2022?',
    qHost: 'În ce oraș din Qatar s-a disputat finala Cupei Mondiale FIFA din anul 2022?',
    qYear: 'În ce an a câștigat naționala Argentinei condusă de Lionel Messi Cupa Mondială?',
    qMetric: null,
  },
  {
    idx: 17,
    champion: 'Elisabeta Lipă',
    host: 'Atena',
    year: 2004,
    qChamp: 'Ce mare canotoare română a cucerit cinci medalii olimpice de aur în carieră?',
    qHost: 'În ce oraș au avut loc Jocurile Olimpice de vară din anul 2004?',
    qYear: 'În ce an a cucerit Elisabeta Lipă a cincea sa medalie olimpică de aur?',
    qMetric: 'Câte medalii olimpice de aur are în palmares canotoarea română Elisabeta Lipă?',
    metricOpts: ['3', '4', '5', '6'],
    metricAns: '5',
  },
  {
    idx: 18,
    champion: 'Cătălina Ponor',
    host: 'Atena',
    year: 2004,
    qChamp: 'Ce gimnastă română a cucerit trei medalii de aur la Jocurile Olimpice din 2004?',
    qHost: 'În ce capitală europeană a cucerit Cătălina Ponor trei titluri olimpice în 2004?',
    qYear: 'În ce an a câștigat Cătălina Ponor trei medalii olimpice de aur la gimnastică?',
    qMetric: 'Câte medalii de aur a cucerit gimnasta Cătălina Ponor la Jocurile Olimpice din 2004?',
    metricOpts: ['1', '2', '3', '4'],
    metricAns: '3',
  },
  {
    idx: 19,
    champion: 'Sandra Izbașa',
    host: 'Londra',
    year: 2012,
    qChamp: 'Ce gimnastă română a câștigat aurul olimpic la sărituri în anul 2012?',
    qHost: 'În ce oraș european s-au desfășurat Jocurile Olimpice de vară din anul 2012?',
    qYear: 'În ce an a cucerit Sandra Izbașa titlul olimpic la sărituri la Londra?',
    qMetric: 'Câte medalii olimpice de aur a câștigat gimnasta Sandra Izbașa în carieră?',
    metricOpts: ['1', '2', '3', '4'],
    metricAns: '2',
  },
  {
    idx: 20,
    champion: 'România',
    host: 'Berlin',
    year: 1974,
    qChamp: 'Ce echipă națională a cucerit al patrulea său titlu mondial la handbal masculin în 1974?',
    qHost: 'În ce oraș a câștigat România finala Campionatului Mondial de handbal masculin din 1974?',
    qYear: 'În ce an a cucerit România al patrulea titlu mondial la handbal masculin?',
    qMetric: 'Câte titluri mondiale are în palmares echipa națională masculină de handbal a României?',
    metricOpts: ['2', '3', '4', '5'],
    metricAns: '4',
  },
];

const CLEAN_SPORT_CHAMPIONS = [...new Set(CLEAN_SPORTS_FACTS.map((s) => s.champion))];
const CLEAN_SPORT_HOSTS = [...new Set(CLEAN_SPORTS_FACTS.map((s) => s.host))];
const CLEAN_SPORT_YEARS = [...new Set(CLEAN_SPORTS_FACTS.map((s) => String(s.year)))];

// Clean Tech & Science (20 items) without parenthetical spoilers
const CLEAN_TECH_FACTS = [
  {
    idx: 1,
    cleanTopic: 'Limbajul de programare C',
    creator: 'Dennis Ritchie',
    year: 1972,
    qCreator: 'Cine a creat limbajul de programare C la laboratoarele Bell Labs?',
    qTopic: 'Ce limbaj de programare fundamental a fost creat de Dennis Ritchie?',
    qYear: 'În ce an a fost creat limbajul de programare C de către Dennis Ritchie?',
    qMetric: null,
  },
  {
    idx: 2,
    cleanTopic: 'World Wide Web (WWW)',
    creator: 'Tim Berners-Lee',
    year: 1989,
    qCreator: 'Cine a inventat sistemul World Wide Web (WWW) la CERN?',
    qTopic: 'Ce tehnologie globală a fost propusă și creată de Tim Berners-Lee la CERN?',
    qYear: 'În ce an a propus Tim Berners-Lee sistemul World Wide Web la CERN?',
    qMetric: null,
  },
  {
    idx: 3,
    cleanTopic: 'Nucleul Linux',
    creator: 'Linus Torvalds',
    year: 1991,
    qCreator: 'Cine a creat nucleul sistemului de operare open-source Linux în anul 1991?',
    qTopic: 'Ce proiect software open-source a fost inițiat de Linus Torvalds în 1991?',
    qYear: 'În ce an a fost lansată prima versiune a nucleului Linux?',
    qMetric: null,
  },
  {
    idx: 4,
    cleanTopic: 'Limbajul de programare Python',
    creator: 'Guido van Rossum',
    year: 1991,
    qCreator: 'Cine este creatorul limbajului de programare Python?',
    qTopic: 'Ce limbaj de programare popular a fost creat de informaticianul Guido van Rossum?',
    qYear: 'În ce an a fost lansat public limbajul de programare Python?',
    qMetric: null,
  },
  {
    idx: 5,
    cleanTopic: 'Limbajul de programare Java',
    creator: 'James Gosling',
    year: 1995,
    qCreator: 'Cine este părintele limbajului de programare Java, lansat la Sun Microsystems?',
    qTopic: 'Ce limbaj de programare a fost conceput de James Gosling la Sun Microsystems?',
    qYear: 'În ce an a fost lansat oficial limbajul de programare Java?',
    qMetric: null,
  },
  {
    idx: 6,
    cleanTopic: 'Limbajul de programare JavaScript',
    creator: 'Brendan Eich',
    year: 1995,
    qCreator: 'Cine a creat limbajul de programare JavaScript pentru browserul Netscape?',
    qTopic: 'Ce limbaj esențial pentru paginile web a fost creat de Brendan Eich?',
    qYear: 'În ce an a apărut limbajul de programare JavaScript?',
    qMetric: null,
  },
  {
    idx: 7,
    cleanTopic: 'Limbajul de programare C++',
    creator: 'Bjarne Stroustrup',
    year: 1985,
    qCreator: 'Cine a creat limbajul de programare orientat pe obiecte C++?',
    qTopic: 'Ce limbaj de programare a fost dezvoltat de informaticianul danez Bjarne Stroustrup?',
    qYear: 'În ce an a fost publicată prima ediție comercială a limbajului C++?',
    qMetric: null,
  },
  {
    idx: 8,
    cleanTopic: 'Sistemul de control al versiunilor Git',
    creator: 'Linus Torvalds',
    year: 2005,
    qCreator: 'Cine a creat în anul 2005 sistemul distribuit de control al versiunilor Git?',
    qTopic: 'Ce utilitar distribuit pentru cod sursă a creat Linus Torvalds în 2005?',
    qYear: 'În ce an a fost lansat sistemul de control al versiunilor Git?',
    qMetric: null,
  },
  {
    idx: 9,
    cleanTopic: 'Primul smartphone iPhone',
    creator: 'Steve Jobs',
    year: 2007,
    qCreator: 'Cine a prezentat pe scenă primul model de telefon iPhone în anul 2007?',
    qTopic: 'Ce produs revoluționar Apple a fost prezentat de Steve Jobs în ianuarie 2007?',
    qYear: 'În ce an a fost lansat pe piață primul model de smartphone iPhone?',
    qMetric: null,
  },
  {
    idx: 10,
    cleanTopic: 'Compania Microsoft',
    creator: 'Bill Gates și Paul Allen',
    year: 1975,
    qCreator: 'Cine a fondat compania de software Microsoft în anul 1975?',
    qTopic: 'Ce mare companie de tehnologie a fost fondată de Bill Gates și Paul Allen?',
    qYear: 'În ce an a fost înființată compania Microsoft de Bill Gates și Paul Allen?',
    qMetric: null,
  },
  {
    idx: 11,
    cleanTopic: 'Motorul de căutare Google',
    creator: 'Larry Page și Sergey Brin',
    year: 1998,
    qCreator: 'Cine a fondat motorul de căutare Google în anul 1998?',
    qTopic: 'Ce mare platformă web au fondat doctoranzii Larry Page și Sergey Brin?',
    qYear: 'În ce an a fost fondată oficial compania Google în California?',
    qMetric: null,
  },
  {
    idx: 12,
    cleanTopic: 'Limbajul de programare TypeScript',
    creator: 'Anders Hejlsberg',
    year: 2012,
    qCreator: 'Ce inginer software a proiectat limbajele C# și TypeScript la Microsoft?',
    qTopic: 'Ce limbaj de programare tipizat, bazat pe JavaScript, a creat Anders Hejlsberg?',
    qYear: 'În ce an a fost lansat public limbajul de programare TypeScript?',
    qMetric: null,
  },
  {
    idx: 13,
    cleanTopic: 'Descoperirea penicilinei',
    creator: 'Alexander Fleming',
    year: 1928,
    qCreator: 'Ce savant scoțian a descoperit penicilina, primul antibiotic modern, în 1928?',
    qTopic: 'Ce realizare medicală epocală îi aparține bacteriologului Alexander Fleming?',
    qYear: 'În ce an a descoperit Alexander Fleming efectul antibacterian al penicilinei?',
    qMetric: 'Câte oase are în mod normal scheletul unui om adult?',
    metricOpts: ['186', '206', '226', '256'],
    metricAns: '206',
  },
  {
    idx: 14,
    cleanTopic: 'Descoperirea pancreinei (efectul antidiabetic)',
    creator: 'Nicolae Paulescu',
    year: 1921,
    qCreator: 'Ce fiziolog român a publicat în 1921 cercetările despre pancreină, hormonul antidiabetic?',
    qTopic: 'Ce realizare științifică din domeniul fiziologiei îi aparține savantului Nicolae Paulescu?',
    qYear: 'În ce an a publicat Nicolae Paulescu studiul despre extractul pancreatic antidiabetic?',
    qMetric: 'Câți cromozomi are în mod normal o celulă somatică umană?',
    metricOpts: ['23', '44', '46', '48'],
    metricAns: '46',
  },
  {
    idx: 15,
    cleanTopic: 'Structura dublu-elicoidală a moleculei de ADN',
    creator: 'James Watson și Francis Crick',
    year: 1953,
    qCreator: 'Cine a descris în anul 1953 structura de dublu helix a moleculei de ADN?',
    qTopic: 'Ce realizare fundamentală pentru genetică au publicat James Watson și Francis Crick?',
    qYear: 'În ce an a fost identificată structura dublu-elicoidală a moleculei de ADN?',
    qMetric: 'Câți dinți are dentiția definitivă completă a unui om adult?',
    metricOpts: ['24', '28', '32', '36'],
    metricAns: '32',
  },
  {
    idx: 16,
    cleanTopic: 'Teoria Restrânsă a Relativității',
    creator: 'Albert Einstein',
    year: 1905,
    qCreator: 'Ce mare fizician a formulat Teoria Restrânsă a Relativității în anul 1905?',
    qTopic: 'Ce contribuție fundamentală la fizica modernă îi aparține lui Albert Einstein?',
    qYear: 'În ce an a publicat Albert Einstein Teoria Restrânsă a Relativității?',
    qMetric: null,
  },
  {
    idx: 17,
    cleanTopic: 'Legea atracției universale (Principia Mathematica)',
    creator: 'Isaac Newton',
    year: 1687,
    qCreator: 'Cine a formulat legea atracției universale în lucrarea „Principia Mathematica”?',
    qTopic: 'Ce contribuție fundamentală la mecanica clasică îi aparține savantului Isaac Newton?',
    qYear: 'În ce an a publicat Isaac Newton lucrarea „Philosophiae Naturalis Principia Mathematica”?',
    qMetric: null,
  },
  {
    idx: 18,
    cleanTopic: 'Tabelul Periodic al Elementelor Chimice',
    creator: 'Dmitri Mendeleev',
    year: 1869,
    qCreator: 'Ce chimist a elaborat în anul 1869 Tabelul Periodic al Elementelor?',
    qTopic: 'Ce realizare epocală din anul 1869 îi aparține savantului rus Dmitri Mendeleev?',
    qYear: 'În ce an a prezentat Dmitri Mendeleev prima versiune a Tabelului Periodic?',
    qMetric: 'Câte elemente chimice recunoscute oficial conține în prezent Tabelul Periodic?',
    metricOpts: ['92', '108', '118', '126'],
    metricAns: '118',
  },
  {
    idx: 19,
    cleanTopic: 'Primul aeroplan cu reacție (1910)',
    creator: 'Henri Coandă',
    year: 1910,
    qCreator: 'Ce inventator român a proiectat și expus la Paris aparatul experimental din 1910?',
    qTopic: 'Ce realizare din istoria aviației îi aparține savantului român Henri Coandă?',
    qYear: 'În ce an a expus Henri Coandă la Paris aparatul cu motor reactiv?',
    qMetric: null,
  },
  {
    idx: 20,
    cleanTopic: 'Stiloul cu rezervor (condeiul portăreț)',
    creator: 'Petrache Poenaru',
    year: 1827,
    qCreator: 'Ce cărturar și inventator român a brevetat în 1827 stiloul cu rezervor de cerneală?',
    qTopic: 'Ce invenție brevetată la Paris în 1827 îi aparține lui Petrache Poenaru?',
    qYear: 'În ce an a brevetat Petrache Poenaru „condeiul portăreț fără sfârșit” (stiloul)?',
    qMetric: 'Câte grade are un cerc complet în geometria plană?',
    metricOpts: ['180', '270', '360', '400'],
    metricAns: '360',
  },
];

const CLEAN_TECH_CREATORS = [...new Set(CLEAN_TECH_FACTS.map((t) => t.creator))];
const CLEAN_TECH_TOPICS = [...new Set(CLEAN_TECH_FACTS.map((t) => t.cleanTopic))];
const CLEAN_TECH_YEARS = [...new Set(CLEAN_TECH_FACTS.map((t) => String(t.year)))];

// Clean Geographic Features (Mountain peaks & rivers without name leaks or raw measurement prompts)
const CLEAN_GEO_MASSIF_POOL = [
  'Munții Făgăraș',
  'Munții Parâng',
  'Munții Retezat',
  'Munții Bucegi',
  'Munții Godeanu',
  'Masivul Ceahlău',
  'Munții Apuseni',
  'Munții Vrancei',
  'Munții Buzăului',
  'Munții Măcinului',
  'Munții Himalaya',
  'Munții Karakorum',
  'Munții Alpi',
  'Munții Anzi',
];

const CLEAN_GEO_MASSIF_QUESTIONS = {
  1: { q: 'În ce masiv montan din Carpații Meridionali se află Vârful Moldoveanu?', ans: 'Munții Făgăraș' },
  2: { q: 'În ce masiv montan se află Vârful Negoiu, al doilea vârf din România?', ans: 'Munții Făgăraș' },
  3: { q: 'În ce masiv montan din România este situat Vârful Viștea Mare?', ans: 'Munții Făgăraș' },
  5: { q: 'În ce masiv montan se află Vârful Peleaga?', ans: 'Munții Retezat' },
  6: { q: 'În ce masiv din Carpații Meridionali se află Vârful Păpușa?', ans: 'Munții Retezat' },
  7: { q: 'În ce masiv montan se află Vârful Omu și Sfinxul?', ans: 'Munții Bucegi' },
  9: { q: 'În ce masiv montan din Carpații Meridionali se află Vârful Gugu?', ans: 'Munții Godeanu' },
  13: { q: 'În ce masiv din Carpații Orientali se află Vârful Toaca?', ans: 'Masivul Ceahlău' },
  14: { q: 'În ce masiv montan se află Vârful Ocolașul Mare?', ans: 'Masivul Ceahlău' },
  16: { q: 'În ce grupă montană se află Vârful Curcubăta Mare (Bihor)?', ans: 'Munții Apuseni' },
  17: { q: 'În ce grupă a Carpaților Occidentali se află Vârful Vlădeasa?', ans: 'Munții Apuseni' },
  18: { q: 'În ce grupă montană din vestul țării se află Vârful Muntele Mare?', ans: 'Munții Apuseni' },
  20: { q: 'În ce munți din Carpații de Curbură se află Vârful Goru?', ans: 'Munții Vrancei' },
  21: { q: 'În ce munți din Carpații de Curbură se află Vârful Penteleu?', ans: 'Munții Buzăului' },
  22: { q: 'În ce munți vechi din Dobrogea se află Vârful Țuțuiatu?', ans: 'Munții Măcinului' },
  23: { q: 'În ce lanț montan din Asia se află Vârful Everest?', ans: 'Munții Himalaya' },
  24: { q: 'În ce lanț montan asiatic se află Vârful K2 (Godwin-Austen)?', ans: 'Munții Karakorum' },
  25: { q: 'În ce lanț montan european se află Vârful Mont Blanc?', ans: 'Munții Alpi' },
  26: { q: 'În ce lanț montan din America de Sud se află Vârful Aconcagua?', ans: 'Munții Anzi' },
};

const CLEAN_GEO_SUPERLATIVES = {
  1: {
    q: 'Care este cel mai înalt vârf montan din România?',
    ans: 'Vârful Moldoveanu',
    pool: ['Vârful Moldoveanu', 'Vârful Negoiu', 'Vârful Omu', 'Vârful Peleaga'],
  },
  2: {
    q: 'Care este al doilea cel mai înalt vârf montan din România, după Moldoveanu?',
    ans: 'Vârful Negoiu',
    pool: ['Vârful Parângul Mare', 'Vârful Negoiu', 'Vârful Omu', 'Vârful Toaca'],
  },
  4: {
    q: 'Care este cel mai înalt vârf din Munții Parâng?',
    ans: 'Vârful Parângul Mare',
    pool: ['Vârful Parângul Mare', 'Vârful Peleaga', 'Vârful Gugu', 'Vârful Ciucaș'],
  },
  5: {
    q: 'Care este cel mai înalt vârf din Munții Retezat?',
    ans: 'Vârful Peleaga',
    pool: ['Vârful Peleaga', 'Vârful Omu', 'Vârful Toaca', 'Vârful Vlădeasa'],
  },
  7: {
    q: 'Care este cel mai înalt vârf din Munții Bucegi?',
    ans: 'Vârful Omu',
    pool: ['Vârful Omu', 'Vârful Moldoveanu', 'Vârful Ciucaș', 'Vârful Rarău'],
  },
  8: {
    q: 'Care este cel mai înalt vârf montan din Carpații Orientali?',
    ans: 'Vârful Pietrosu Rodnei',
    pool: ['Vârful Pietrosu Rodnei', 'Vârful Toaca', 'Vârful Rarău', 'Vârful Goru'],
  },
  16: {
    q: 'Care este cel mai înalt vârf din Munții Apuseni?',
    ans: 'Vârful Curcubăta Mare',
    pool: ['Vârful Curcubăta Mare', 'Vârful Vlădeasa', 'Vârful Muntele Mare', 'Vârful Retezat'],
  },
  22: {
    q: 'Care este cel mai înalt vârf din Munții Măcinului din Dobrogea?',
    ans: 'Vârful Țuțuiatu',
    pool: ['Vârful Țuțuiatu', 'Vârful Penteleu', 'Vârful Goru', 'Vârful Toaca'],
  },
  23: {
    q: 'Care este cel mai înalt vârf montan de pe Pământ?',
    ans: 'Vârful Everest',
    pool: ['Vârful Everest', 'Vârful K2', 'Vârful Mont Blanc', 'Vârful Aconcagua'],
  },
  24: {
    q: 'Care este al doilea cel mai înalt vârf montan din lume, după Everest?',
    ans: 'Vârful K2',
    pool: ['Vârful K2', 'Vârful Kangchenjunga', 'Vârful Aconcagua', 'Vârful Kilimanjaro'],
  },
  25: {
    q: 'Care este cel mai înalt vârf montan din Munții Alpi?',
    ans: 'Vârful Mont Blanc',
    pool: ['Vârful Mont Blanc', 'Vârful Matterhorn', 'Vârful Grossglockner', 'Vârful Olimp'],
  },
  26: {
    q: 'Care este cel mai înalt vârf montan din America de Sud, situat în Anzi?',
    ans: 'Vârful Aconcagua',
    pool: ['Vârful Aconcagua', 'Vârful Chimborazo', 'Vârful Denali', 'Vârful Kilimanjaro'],
  },
  27: {
    q: 'Care este cel mai înalt masiv și vârf montan de pe continentul african?',
    ans: 'Vârful Kilimanjaro',
    pool: ['Vârful Kilimanjaro', 'Vârful Kenya', 'Vârful Toubkal', 'Vârful Aconcagua'],
  },
  28: {
    q: 'Care este cel mai înalt vârf montan din America de Nord, situat în Alaska?',
    ans: 'Vârful Denali',
    pool: ['Vârful Denali', 'Vârful Logan', 'Vârful Whitney', 'Vârful Rainier'],
  },
  29: {
    q: 'În ce mare se varsă fluviul Dunărea prin cele trei brațe ale Deltei?',
    ans: 'Marea Neagră',
    pool: ['Marea Neagră', 'Marea Mediterană', 'Marea Baltică', 'Marea Nordului'],
  },
  33: {
    q: 'Care este cel mai lung râu care curge integral pe teritoriul României?',
    ans: 'Râul Olt',
    pool: ['Râul Olt', 'Râul Mureș', 'Râul Siret', 'Râul Prut'],
  },
  34: {
    q: 'Ce râu important străbate Moldova de la nord la sud și se varsă în Dunăre?',
    ans: 'Râul Siret',
    pool: ['Râul Siret', 'Râul Jiu', 'Râul Someș', 'Râul Olt'],
  },
  38: {
    q: 'Ce râu important străbate Oltenia și trece prin municipiul Craiova?',
    ans: 'Râul Jiu',
    pool: ['Râul Jiu', 'Râul Bahlui', 'Râul Mureș', 'Râul Bega'],
  },
};

// Clean Extra Domain Bank questions (no (#1), no mixed units, no compactPhrase truncation!)
const CLEAN_EXTRA_CH_VAL = {
  // BIOLOGIE
  extra_biologie_ch_val_2: {
    q: 'Câte oase are aproximativ scheletul unui nou-născut uman înainte de sudarea lor?',
    ans: '270',
    opts: ['206', '230', '270', '310'],
  },
  extra_biologie_ch_val_3: {
    q: 'Câte vertebre are în total coloana vertebrală umană, inclusiv cele sudate?',
    ans: '33',
    opts: ['24', '28', '33', '38'],
  },
  extra_biologie_ch_val_4: {
    q: 'Câte vertebre cervicale au omul și marea majoritate a mamiferelor?',
    ans: '7',
    opts: ['5', '7', '12', '14'],
  },
  extra_biologie_ch_val_5: {
    q: 'Câte vertebre toracale articulate cu coastele are coloana vertebrală umană?',
    ans: '12',
    opts: ['7', '10', '12', '15'],
  },
  extra_biologie_ch_val_6: {
    q: 'Câte vertebre lombare are coloana vertebrală a omului?',
    ans: '5',
    opts: ['4', '5', '7', '9'],
  },
  extra_biologie_ch_val_7: {
    q: 'Câte coaste are în mod normal cutia toracică umană (12 perechi)?',
    ans: '24',
    opts: ['18', '20', '24', '28'],
  },
  extra_biologie_ch_val_8: {
    q: 'Câți dinți temporari (dinți de lapte) are în total un copil?',
    ans: '20',
    opts: ['16', '20', '24', '28'],
  },
  extra_biologie_ch_val_9: {
    q: 'Câte perechi de nervi cranieni are sistemul nervos periferic al omului?',
    ans: '12',
    opts: ['8', '10', '12', '16'],
  },
  extra_biologie_ch_val_10: {
    q: 'Câte perechi de nervi spinali pornesc din măduva spinării la om?',
    ans: '31',
    opts: ['24', '28', '31', '36'],
  },
  extra_biologie_ch_val_11: {
    q: 'Câte camere (atrii și ventricule) are inima mamiferelor și a păsărilor?',
    ans: '4',
    opts: ['2', '3', '4', '5'],
  },
  extra_biologie_ch_val_13: {
    q: 'Câte săptămâni durează în medie o sarcină normală la specia umană?',
    ans: '40',
    opts: ['32', '36', '40', '44'],
  },
  extra_biologie_ch_val_14: {
    q: 'Câte zile trăiește în medie o hematie (globulă roșie) în sângele uman?',
    ans: '120',
    opts: ['30', '60', '120', '180'],
  },
  extra_biologie_ch_val_15: {
    q: 'Câți cromozomi conține o celulă reproducătoare umană (gamet)?',
    ans: '23',
    opts: ['16', '23', '32', '46'],
  },
  extra_biologie_ch_val_16: {
    q: 'Câte luni durează gestația la elefantul african, cea mai lungă dintre mamiferele terestre?',
    ans: '22',
    opts: ['12', '16', '22', '28'],
  },
  extra_biologie_ch_val_17: {
    q: 'Câte inimi are o caracatiță (una sistemică și două branhiale)?',
    ans: '3',
    opts: ['1', '2', '3', '4'],
  },
  extra_biologie_ch_val_18: {
    q: 'Câte picioare articulate au păianjenii și scorpionii (arahnidele)?',
    ans: '8',
    opts: ['6', '8', '10', '12'],
  },
  extra_biologie_ch_val_19: {
    q: 'Câte picioare au toate insectele adulte?',
    ans: '6',
    opts: ['4', '6', '8', '10'],
  },
  extra_biologie_ch_val_20: {
    q: 'Câte picioare locomotoare au crustaceele decapode precum crabii și homarii?',
    ans: '10',
    opts: ['6', '8', '10', '12'],
  },
  extra_biologie_ch_val_21: {
    q: 'Din câte oase este alcătuit craniul uman (fără oscioarele urechii)?',
    ans: '22',
    opts: ['14', '18', '22', '28'],
  },
  extra_biologie_ch_val_22: {
    q: 'Câte oscioare ale auzului există în total în ambele urechi medii ale omului?',
    ans: '6',
    opts: ['2', '4', '6', '8'],
  },
  extra_biologie_ch_val_23: {
    q: 'Câți lobi pulmonari are plămânul drept al omului?',
    ans: '3',
    opts: ['2', '3', '4', '5'],
  },
  extra_biologie_ch_val_25: {
    q: 'În ce an a înființat Emil Racoviță la Cluj primul Institut de Speologie din lume?',
    ans: '1920',
    opts: ['1907', '1920', '1932', '1945'],
  },

  // FIZICA (general knowledge discoveries without raw unit conversions)
  extra_fizica_ch_val_25: {
    q: 'În ce an a descoperit fizicianul german Wilhelm Conrad Röntgen razele X?',
    ans: '1895',
    opts: ['1875', '1885', '1895', '1905'],
  },

  // ARTA
  extra_arta_ch_val_1: {
    q: 'În ce an a fost inaugurat Ansamblul monumental al lui Constantin Brâncuși la Târgu Jiu?',
    ans: '1938',
    opts: ['1926', '1932', '1938', '1947'],
  },
  extra_arta_ch_val_2: {
    q: 'Câte scaune în formă de clepsidră înconjoară Masa Tăcerii de la Târgu Jiu?',
    ans: '12',
    opts: ['8', '10', '12', '16'],
  },
  extra_arta_ch_val_4: {
    q: 'În ce an a finalizat Michelangelo Buonarroti frescele de pe bolta Capelei Sixtine?',
    ans: '1512',
    opts: ['1492', '1504', '1512', '1536'],
  },
  extra_arta_ch_val_5: {
    q: 'În ce an a finalizat Michelangelo celebra sculptură în marmură „David” la Florența?',
    ans: '1504',
    opts: ['1488', '1504', '1520', '1545'],
  },
  extra_arta_ch_val_6: {
    q: 'În ce an a finalizat Leonardo da Vinci pictura „Cina cea de Taină”?',
    ans: '1498',
    opts: ['1475', '1498', '1515', '1530'],
  },
  extra_arta_ch_val_7: {
    q: 'În ce an a pictat Claude Monet tabloul „Impresie, răsărit de soare”?',
    ans: '1872',
    opts: ['1855', '1872', '1889', '1901'],
  },
  extra_arta_ch_val_8: {
    q: 'În ce an a finalizat Rembrandt van Rijn celebrul tablou „Rondul de noapte”?',
    ans: '1642',
    opts: ['1618', '1642', '1665', '1680'],
  },
  extra_arta_ch_val_9: {
    q: 'În jurul cărui an a pictat Johannes Vermeer capodopera „Fata cu cercel de perlă”?',
    ans: '1665',
    opts: ['1620', '1642', '1665', '1690'],
  },
  extra_arta_ch_val_10: {
    q: 'În ce an a realizat Edvard Munch prima versiune celebră a tabloului „Țipătul”?',
    ans: '1893',
    opts: ['1874', '1893', '1908', '1922'],
  },
  extra_arta_ch_val_11: {
    q: 'În ce an a pictat Gustav Klimt celebrul tablou „Sărutul”, expus la Viena?',
    ans: '1908',
    opts: ['1888', '1898', '1908', '1924'],
  },
  extra_arta_ch_val_12: {
    q: 'În ce an s-a născut pictorul național român Nicolae Grigorescu?',
    ans: '1838',
    opts: ['1818', '1838', '1850', '1868'],
  },
  extra_arta_ch_val_13: {
    q: 'În ce an s-a născut pictorul român Ștefan Luchian, supranumit „poetul florilor”?',
    ans: '1868',
    opts: ['1848', '1868', '1886', '1902'],
  },
  extra_arta_ch_val_14: {
    q: 'În ce an s-a născut la Bârlad pictorul român Nicolae Tonitza?',
    ans: '1886',
    opts: ['1868', '1876', '1886', '1902'],
  },
  extra_arta_ch_val_15: {
    q: 'În ce an s-a născut pictorul român Ion Andreescu, autorul tabloului „Stejarul”?',
    ans: '1850',
    opts: ['1838', '1850', '1868', '1880'],
  },
  extra_arta_ch_val_16: {
    q: 'În ce an a înființat Theodor Aman Școala de Arte Frumoase din București?',
    ans: '1864',
    opts: ['1848', '1859', '1864', '1888'],
  },
  extra_arta_ch_val_17: {
    q: 'În ce an a fost inaugurată Piramida de sticlă din curtea Muzeului Luvru din Paris?',
    ans: '1989',
    opts: ['1977', '1989', '1995', '2001'],
  },
  extra_arta_ch_val_18: {
    q: 'În ce an a fost inaugurată Statuia Libertății din New York, dăruită de Franța?',
    ans: '1886',
    opts: ['1876', '1886', '1896', '1906'],
  },
  extra_arta_ch_val_19: {
    q: 'În ce an a fost inaugurat oficial Castelul Peleș din Sinaia?',
    ans: '1883',
    opts: ['1866', '1877', '1883', '1906'],
  },
  extra_arta_ch_val_20: {
    q: 'În ce an a fost inaugurat edificiul Ateneului Român din București?',
    ans: '1888',
    opts: ['1868', '1878', '1888', '1898'],
  },
  extra_arta_ch_val_21: {
    q: 'În ce an s-a născut la Hobița marele sculptor român Constantin Brâncuși?',
    ans: '1876',
    opts: ['1866', '1876', '1886', '1896'],
  },
  extra_arta_ch_val_22: {
    q: 'În ce an a fost inaugurat Arcul de Triumf din piatră din București?',
    ans: '1936',
    opts: ['1918', '1922', '1936', '1945'],
  },
  extra_arta_ch_val_23: {
    q: 'În ce an a fost inaugurat Turnul Eiffel din Paris, cu ocazia Expoziției Universale?',
    ans: '1889',
    opts: ['1879', '1889', '1900', '1910'],
  },
  extra_arta_ch_val_24: {
    q: 'În ce an s-a deschis publicului Muzeul Brukenthal din Sibiu, cel mai vechi din România?',
    ans: '1817',
    opts: ['1790', '1817', '1848', '1866'],
  },
  extra_arta_ch_val_25: {
    q: 'În ce an s-a născut la Malaga pictorul spaniol Pablo Picasso?',
    ans: '1881',
    opts: ['1869', '1881', '1893', '1904'],
  },

  // MUZICA
  extra_muzica_ch_val_1: {
    q: 'În ce an s-a născut la Liveni marele compozitor român George Enescu?',
    ans: '1881',
    opts: ['1871', '1881', '1891', '1901'],
  },
  extra_muzica_ch_val_2: {
    q: 'În ce an a avut loc la București prima ediție a Festivalului Internațional „George Enescu”?',
    ans: '1958',
    opts: ['1948', '1955', '1958', '1965'],
  },
  extra_muzica_ch_val_3: {
    q: 'În ce an a avut loc la Brașov premiera operetei „Crai Nou” de Ciprian Porumbescu?',
    ans: '1882',
    opts: ['1868', '1875', '1882', '1895'],
  },
  extra_muzica_ch_val_4: {
    q: 'În ce an s-a născut marele compozitor baroc Johann Sebastian Bach?',
    ans: '1685',
    opts: ['1650', '1685', '1715', '1756'],
  },
  extra_muzica_ch_val_5: {
    q: 'În ce an s-a născut la Salzburg compozitorul Wolfgang Amadeus Mozart?',
    ans: '1756',
    opts: ['1732', '1756', '1770', '1791'],
  },
  extra_muzica_ch_val_6: {
    q: 'Câte simfonii a compus și finalizat Ludwig van Beethoven?',
    ans: '9',
    opts: ['5', '7', '9', '12'],
  },
  extra_muzica_ch_val_7: {
    q: 'Câte clape (albe și negre) are un pian modern standard de concert?',
    ans: '88',
    opts: ['64', '76', '88', '96'],
  },
  extra_muzica_ch_val_8: {
    q: 'Câte corzi are o vioară clasică?',
    ans: '4',
    opts: ['4', '5', '6', '8'],
  },
  extra_muzica_ch_val_9: {
    q: 'Câte corzi are o chitară clasică sau acustică standard?',
    ans: '6',
    opts: ['4', '5', '6', '8'],
  },
  extra_muzica_ch_val_10: {
    q: 'Din câte linii orizontale paralele este format portativul muzical clasic?',
    ans: '5',
    opts: ['4', '5', '6', '7'],
  },
  extra_muzica_ch_val_12: {
    q: 'În ce an a avut loc la Milano premiera operei „Nabucco” de Giuseppe Verdi?',
    ans: '1842',
    opts: ['1822', '1842', '1862', '1882'],
  },
  extra_muzica_ch_val_13: {
    q: 'În ce an a avut loc la Cairo premiera operei „Aida” de Giuseppe Verdi?',
    ans: '1871',
    opts: ['1851', '1871', '1887', '1901'],
  },
  extra_muzica_ch_val_14: {
    q: 'În ce an a avut loc la Paris premiera operei „Carmen” de Georges Bizet?',
    ans: '1875',
    opts: ['1855', '1875', '1890', '1905'],
  },
  extra_muzica_ch_val_15: {
    q: 'În ce an a avut loc la Roma premiera operei „Tosca” de Giacomo Puccini?',
    ans: '1900',
    opts: ['1880', '1890', '1900', '1915'],
  },
  extra_muzica_ch_val_16: {
    q: 'În ce an a avut loc la Milano premiera operei „Turandot” de Giacomo Puccini?',
    ans: '1926',
    opts: ['1904', '1914', '1926', '1938'],
  },
  extra_muzica_ch_val_17: {
    q: 'În ce an a avut loc premiera baletului „Spărgătorul de nuci” de Ceaikovski?',
    ans: '1892',
    opts: ['1877', '1892', '1905', '1918'],
  },
  extra_muzica_ch_val_18: {
    q: 'În ce an a avut loc la Paris premiera celebrului „Boléro” de Maurice Ravel?',
    ans: '1928',
    opts: ['1908', '1918', '1928', '1938'],
  },
  extra_muzica_ch_val_19: {
    q: 'În ce an s-a născut pianistul și compozitorul rus Serghei Rahmaninov?',
    ans: '1873',
    opts: ['1853', '1873', '1891', '1906'],
  },
  extra_muzica_ch_val_20: {
    q: 'În ce an s-a născut lângă Varșovia marele compozitor romantic Frédéric Chopin?',
    ans: '1810',
    opts: ['1790', '1810', '1828', '1849'],
  },
  extra_muzica_ch_val_21: {
    q: 'În ce an s-a născut la București marele pianist și compozitor român Dinu Lipatti?',
    ans: '1917',
    opts: ['1905', '1917', '1927', '1937'],
  },
  extra_muzica_ch_val_22: {
    q: 'În ce an s-a născut la Roman celebrul dirijor român Sergiu Celibidache?',
    ans: '1912',
    opts: ['1898', '1912', '1924', '1936'],
  },
  extra_muzica_ch_val_23: {
    q: 'Câte corzi are în mod standard o harpă modernă de concert?',
    ans: '47',
    opts: ['24', '36', '47', '64'],
  },
  extra_muzica_ch_val_24: {
    q: 'Câte Rapsodii Române (Op. 11) a compus George Enescu?',
    ans: '2',
    opts: ['2', '3', '4', '5'],
  },
  extra_muzica_ch_val_25: {
    q: 'În ce an a avut loc la Dublin premiera oratoriului „Mesia” de Georg Friedrich Händel?',
    ans: '1742',
    opts: ['1715', '1742', '1768', '1791'],
  },

  // CINEMATOGRAFIE
  extra_cinematografie_ch_val_1: {
    q: 'În ce an au realizat frații Lumière prima proiecție publică de film la Paris?',
    ans: '1895',
    opts: ['1885', '1895', '1905', '1912'],
  },
  extra_cinematografie_ch_val_2: {
    q: 'În ce an a avut loc la Hollywood prima ceremonie de decernare a Premiilor Oscar?',
    ans: '1929',
    opts: ['1919', '1929', '1939', '1949'],
  },
  extra_cinematografie_ch_val_3: {
    q: 'Câte premii Oscar au câștigat, la egalitate, filmele „Ben-Hur”, „Titanic” și „Întoarcerea Regelui”?',
    ans: '11',
    opts: ['8', '9', '11', '14'],
  },
  extra_cinematografie_ch_val_4: {
    q: 'În ce an a avut premiera filmul istoric „Independența României”, primul lungmetraj artistic românesc?',
    ans: '1912',
    opts: ['1902', '1912', '1922', '1932'],
  },
  extra_cinematografie_ch_val_5: {
    q: 'În ce an a câștigat Liviu Ciulei premiul pentru regie la Festivalul de la Cannes?',
    ans: '1965',
    opts: ['1957', '1965', '1972', '1980'],
  },
  extra_cinematografie_ch_val_6: {
    q: 'În ce an a câștigat Ion Popescu-Gopo trofeul Palme d’Or pentru scurtmetraj cu „Scurtă istorie”?',
    ans: '1957',
    opts: ['1948', '1957', '1965', '1974'],
  },
  extra_cinematografie_ch_val_7: {
    q: 'În ce an a fost lansat filmul istoric „Mihai Viteazul”, regizat de Sergiu Nicolaescu?',
    ans: '1971',
    opts: ['1963', '1971', '1979', '1985'],
  },
  extra_cinematografie_ch_val_8: {
    q: 'În ce an a avut premiera filmul „Moromeții”, regizat de Stere Gulea cu Victor Rebengiuc?',
    ans: '1987',
    opts: ['1975', '1981', '1987', '1993'],
  },
  extra_cinematografie_ch_val_9: {
    q: 'În ce an a avut premiera comedia românească „Filantropica”, regizată de Nae Caranfil?',
    ans: '2002',
    opts: ['1996', '2002', '2007', '2012'],
  },
  extra_cinematografie_ch_val_10: {
    q: 'În ce an a fost premiat la Cannes filmul „A fost sau n-a fost?”?',
    ans: '2006',
    opts: ['2001', '2006', '2010', '2015'],
  },
  extra_cinematografie_ch_val_11: {
    q: 'În ce an s-a desfășurat la Cluj-Napoca prima ediție a festivalului de film TIFF?',
    ans: '2002',
    opts: ['1995', '2002', '2007', '2012'],
  },
  extra_cinematografie_ch_val_12: {
    q: 'În ce an a fost lansat filmul clasic „Cetățeanul Kane”, regizat de Orson Welles?',
    ans: '1941',
    opts: ['1931', '1941', '1951', '1961'],
  },
  extra_cinematografie_ch_val_13: {
    q: 'În ce an a avut premiera filmul clasic „Casablanca”, cu Humphrey Bogart și Ingrid Bergman?',
    ans: '1942',
    opts: ['1934', '1942', '1950', '1958'],
  },
  extra_cinematografie_ch_val_14: {
    q: 'În ce an a fost lansat filmul japonez „Cei șapte samurai”, regizat de Akira Kurosawa?',
    ans: '1954',
    opts: ['1946', '1954', '1962', '1970'],
  },
  extra_cinematografie_ch_val_15: {
    q: 'În ce an a fost lansat filmul „2001: O odisee spațială” de Stanley Kubrick?',
    ans: '1968',
    opts: ['1960', '1968', '1977', '1984'],
  },
  extra_cinematografie_ch_val_16: {
    q: 'În ce an a fost lansat primul film „Războiul Stelelor”, regizat de George Lucas?',
    ans: '1977',
    opts: ['1971', '1977', '1983', '1989'],
  },
  extra_cinematografie_ch_val_17: {
    q: 'În ce an a fost lansat filmul „Lista lui Schindler”, regizat de Steven Spielberg?',
    ans: '1993',
    opts: ['1985', '1993', '1998', '2003'],
  },
  extra_cinematografie_ch_val_18: {
    q: 'În ce an a fost lansat filmul „Închisoarea îngerilor” (The Shawshank Redemption)?',
    ans: '1994',
    opts: ['1988', '1994', '1999', '2004'],
  },
  extra_cinematografie_ch_val_19: {
    q: 'În ce an a fost lansat primul film din seria SF „Matrix” (The Matrix)?',
    ans: '1999',
    opts: ['1993', '1999', '2003', '2008'],
  },
  extra_cinematografie_ch_val_20: {
    q: 'În ce an a câștigat filmul sud-coreean „Parazit” (Parasite) trofeul Palme d’Or la Cannes?',
    ans: '2019',
    opts: ['2014', '2017', '2019', '2022'],
  },
  extra_cinematografie_ch_val_21: {
    q: 'În ce an a avut premiera filmul românesc „Reconstituirea”, regizat de Lucian Pintilie?',
    ans: '1968',
    opts: ['1959', '1968', '1976', '1984'],
  },
  extra_cinematografie_ch_val_22: {
    q: 'În ce an a avut premiera comedia românească „Nea Mărin miliardar”, cu Amza Pellea?',
    ans: '1979',
    opts: ['1971', '1979', '1985', '1990'],
  },
  extra_cinematografie_ch_val_23: {
    q: 'În ce an a fost lansat primul film din seria de comedie „Brigada Diverse” (B.D.)?',
    ans: '1970',
    opts: ['1964', '1970', '1978', '1984'],
  },
  extra_cinematografie_ch_val_24: {
    q: 'Câte cadre pe secundă (fps) are standardul clasic de proiecție cinematografică?',
    ans: '24',
    opts: ['16', '24', '30', '60'],
  },

  // TEHNOLOGIE
  extra_tehnologie_ch_val_1: {
    q: 'În ce an au realizat frații Orville și Wilbur Wright primul zbor mecanic propulsat?',
    ans: '1903',
    opts: ['1895', '1903', '1910', '1918'],
  },
  extra_tehnologie_ch_val_2: {
    q: 'În ce an a realizat Traian Vuia zborul istoric de la Montesson?',
    ans: '1906',
    opts: ['1900', '1906', '1912', '1920'],
  },
  extra_tehnologie_ch_val_3: {
    q: 'În ce an a zburat Aurel Vlaicu cu avionul „Vlaicu I” pe Câmpul Cotrocenilor?',
    ans: '1910',
    opts: ['1904', '1910', '1916', '1924'],
  },
  extra_tehnologie_ch_val_4: {
    q: 'În ce an a publicat savantul sibian Hermann Oberth lucrarea „Racheta spre spațiile interplanetare”?',
    ans: '1923',
    opts: ['1911', '1923', '1935', '1948'],
  },
  extra_tehnologie_ch_val_5: {
    q: 'În ce an a brevetat fizicianul român Nicolae Vasilescu-Karpen celebra pilă termoelectrică Karpen?',
    ans: '1922',
    opts: ['1908', '1922', '1934', '1950'],
  },
  extra_tehnologie_ch_val_6: {
    q: 'În ce an a obținut inventatorul român Anastase Dragomir brevetul francez pentru cabina catapultabilă?',
    ans: '1930',
    opts: ['1918', '1930', '1942', '1954'],
  },
  extra_tehnologie_ch_val_7: {
    q: 'În ce an a fost lansat pe orbită Sputnik 1, primul satelit artificial al Pământului?',
    ans: '1957',
    opts: ['1949', '1957', '1961', '1969'],
  },
  extra_tehnologie_ch_val_8: {
    q: 'În ce an a fost lansat pe orbită Telescopul Spațial Hubble?',
    ans: '1990',
    opts: ['1981', '1990', '1998', '2005'],
  },
  extra_tehnologie_ch_val_9: {
    q: 'În ce an a fost lansat în spațiu Telescopul Spațial James Webb (JWST)?',
    ans: '2021',
    opts: ['2015', '2018', '2021', '2023'],
  },
  extra_tehnologie_ch_val_10: {
    q: 'În ce an a fost lansat Intel 4004, primul microprocesor comercial pe un singur cip?',
    ans: '1971',
    opts: ['1964', '1971', '1978', '1984'],
  },
  extra_tehnologie_ch_val_12: {
    q: 'În ce an a obținut Alexander Graham Bell brevetul istoric pentru telefonul electric?',
    ans: '1876',
    opts: ['1860', '1876', '1889', '1901'],
  },
  extra_tehnologie_ch_val_13: {
    q: 'În ce an a demonstrat Thomas Alva Edison becul electric cu filament incandescent practic?',
    ans: '1879',
    opts: ['1865', '1879', '1892', '1904'],
  },
  extra_tehnologie_ch_val_14: {
    q: 'În ce an a brevetat inginerul german Karl Benz primul automobil cu motor pe benzină?',
    ans: '1886',
    opts: ['1872', '1886', '1898', '1908'],
  },
  extra_tehnologie_ch_val_15: {
    q: 'În ce an a fost dată în folosință prima linie de metrou din București?',
    ans: '1979',
    opts: ['1968', '1974', '1979', '1986'],
  },
  extra_tehnologie_ch_val_16: {
    q: 'În ce an a fost inaugurat oficial drumul montan Transfăgărășan (DN7C)?',
    ans: '1974',
    opts: ['1966', '1974', '1980', '1988'],
  },
  extra_tehnologie_ch_val_19: {
    q: 'În ce an a fost inaugurat Sistemul Hidroenergetic Porțile de Fier I?',
    ans: '1972',
    opts: ['1964', '1972', '1980', '1986'],
  },
  extra_tehnologie_ch_val_20: {
    q: 'În ce an a fost pusă în funcțiune Unitatea 1 a Centralei de la Cernavodă?',
    ans: '1996',
    opts: ['1988', '1992', '1996', '2002'],
  },
  extra_tehnologie_ch_val_21: {
    q: 'În ce an a fost inaugurat Canalul Dunăre–Marea Neagră (ramura Cernavodă–Agigea)?',
    ans: '1984',
    opts: ['1974', '1979', '1984', '1989'],
  },
  extra_tehnologie_ch_val_23: {
    q: 'În ce an s-a deschis la Ploiești prima rafinărie industrială de petrol din lume?',
    ans: '1857',
    opts: ['1848', '1857', '1869', '1881'],
  },
  extra_tehnologie_ch_val_24: {
    q: 'În ce an a introdus Timișoara iluminatul stradal electric, în premieră europeană?',
    ans: '1884',
    opts: ['1874', '1884', '1894', '1904'],
  },
  extra_tehnologie_ch_val_25: {
    q: 'În ce an a publicat savantul român Gogu Constantinescu volumul fundamental despre teoria sonicității?',
    ans: '1918',
    opts: ['1906', '1918', '1928', '1938'],
  },

  // SPORT
  extra_sport_ch_val_1: {
    q: 'Câți jucători are pe teren o echipă de fotbal la începutul unui meci regulamentar?',
    ans: '11',
    opts: ['9', '10', '11', '12'],
  },
  extra_sport_ch_val_2: {
    q: 'Câte minute durează timpul regulamentar al unui meci de fotbal, fără prelungiri?',
    ans: '90',
    opts: ['60', '80', '90', '100'],
  },
  extra_sport_ch_val_4: {
    q: 'Câți jucători ai unei echipe de baschet se află simultan pe teren în timpul jocului?',
    ans: '5',
    opts: ['5', '6', '7', '8'],
  },
  extra_sport_ch_val_6: {
    q: 'Câți jucători ai unei echipe de volei pe sală se află simultan pe teren?',
    ans: '6',
    opts: ['5', '6', '7', '8'],
  },
  extra_sport_ch_val_7: {
    q: 'Câți jucători ai unei echipe de handbal (inclusiv portarul) se află simultan pe teren?',
    ans: '7',
    opts: ['5', '6', '7', '9'],
  },
  extra_sport_ch_val_8: {
    q: 'Câte minute de joc efectiv are un meci regulamentar de handbal la seniori?',
    ans: '60',
    opts: ['40', '50', '60', '80'],
  },
  extra_sport_ch_val_9: {
    q: 'Câți jucători titulari are pe teren o echipă în rugby-ul clasic (Rugby Union)?',
    ans: '15',
    opts: ['11', '13', '15', '18'],
  },
  extra_sport_ch_val_10: {
    q: 'Câte minute durează timpul regulamentar al unui meci de rugby în XV?',
    ans: '80',
    opts: ['60', '70', '80', '90'],
  },
  extra_sport_ch_val_14: {
    q: 'Câte probe individuale cuprinde concursul masculin de decatlon în atletism?',
    ans: '10',
    opts: ['7', '8', '10', '12'],
  },
  extra_sport_ch_val_15: {
    q: 'Câte probe individuale cuprinde concursul feminin de heptatlon în aer liber?',
    ans: '7',
    opts: ['5', '7', '8', '10'],
  },
  extra_sport_ch_val_16: {
    q: 'Câte pătrate (câmpuri albe și negre) are în total o tablă clasică de șah?',
    ans: '64',
    opts: ['49', '64', '81', '100'],
  },
  extra_sport_ch_val_17: {
    q: 'Câte piese se află în total pe tabla de șah la începutul partidei?',
    ans: '32',
    opts: ['16', '24', '32', '40'],
  },
  extra_sport_ch_val_18: {
    q: 'Câte turnee de Grand Slam se dispută anual în tenisul profesionist mondial?',
    ans: '4',
    opts: ['3', '4', '5', '6'],
  },
  extra_sport_ch_val_19: {
    q: 'Câte cercuri întrețesute se află pe drapelul oficial al Jocurilor Olimpice?',
    ans: '5',
    opts: ['4', '5', '6', '7'],
  },
  extra_sport_ch_val_20: {
    q: 'În ce an a fost inaugurată actuala Arenă Națională din București?',
    ans: '2011',
    opts: ['2004', '2008', '2011', '2015'],
  },
  extra_sport_ch_val_21: {
    q: 'În ce an a cucerit România prima sa medalie olimpică (bronzul la rugby)?',
    ans: '1924',
    opts: ['1912', '1924', '1936', '1952'],
  },
  extra_sport_ch_val_22: {
    q: 'În ce an a cucerit Iosif Sîrbu prima medalie olimpică de aur a României?',
    ans: '1952',
    opts: ['1936', '1948', '1952', '1960'],
  },
  extra_sport_ch_val_24: {
    q: 'La câte ediții consecutive ale Jocurilor Olimpice a participat atleta română Lia Manoliu?',
    ans: '6',
    opts: ['4', '5', '6', '7'],
  },
  extra_sport_ch_val_25: {
    q: 'De câte ori a fost desemnată Cristina Neagu cea mai bună handbalistă a lumii?',
    ans: '4',
    opts: ['2', '3', '4', '5'],
  },

  // LITERATURA
  extra_literatura_ch_val_1: {
    q: 'Câte strofe are poemul „Luceafărul” de Mihai Eminescu?',
    ans: '98',
    opts: ['72', '84', '98', '108'],
  },
  extra_literatura_ch_val_2: {
    q: 'În ce an s-a născut poetul național Mihai Eminescu?',
    ans: '1850',
    opts: ['1837', '1850', '1863', '1875'],
  },
  extra_literatura_ch_val_3: {
    q: 'În ce an s-a născut marele dramaturg român Ion Luca Caragiale?',
    ans: '1852',
    opts: ['1837', '1852', '1866', '1880'],
  },
  extra_literatura_ch_val_4: {
    q: 'În ce an s-a născut la Humulești povestitorul Ion Creangă?',
    ans: '1837',
    opts: ['1821', '1837', '1850', '1864'],
  },
  extra_literatura_ch_val_5: {
    q: 'În ce an a fost înființată la Iași societatea literară „Junimea”?',
    ans: '1863',
    opts: ['1840', '1855', '1863', '1878'],
  },
  extra_literatura_ch_val_6: {
    q: 'În ce an a apărut la Iași primul număr al revistei „Convorbiri literare”?',
    ans: '1867',
    opts: ['1848', '1859', '1867', '1881'],
  },
  extra_literatura_ch_val_7: {
    q: 'În ce an a fost premiat Vasile Alecsandri la Montpellier pentru „Cântecul Gintei Latine”?',
    ans: '1878',
    opts: ['1859', '1866', '1878', '1890'],
  },
  extra_literatura_ch_val_8: {
    q: 'În ce an s-a născut la Hordou poetul George Coșbuc?',
    ans: '1866',
    opts: ['1850', '1866', '1880', '1895'],
  },
  extra_literatura_ch_val_9: {
    q: 'În ce an s-a născut la Lancrăm poetul și filosoful Lucian Blaga?',
    ans: '1895',
    opts: ['1880', '1885', '1895', '1907'],
  },
  extra_literatura_ch_val_10: {
    q: 'În ce an s-a născut la București poetul Tudor Arghezi?',
    ans: '1880',
    opts: ['1866', '1880', '1895', '1907'],
  },
  extra_literatura_ch_val_11: {
    q: 'În ce an s-a născut la Bacău poetul simbolist George Bacovia?',
    ans: '1881',
    opts: ['1868', '1881', '1894', '1905'],
  },
  extra_literatura_ch_val_12: {
    q: 'În ce an s-a născut romancierul Liviu Rebreanu?',
    ans: '1885',
    opts: ['1872', '1885', '1895', '1907'],
  },
  extra_literatura_ch_val_13: {
    q: 'În ce an s-a născut la Pașcani scriitorul Mihail Sadoveanu?',
    ans: '1880',
    opts: ['1866', '1880', '1894', '1905'],
  },
  extra_literatura_ch_val_14: {
    q: 'În ce an s-a născut scriitorul și dramaturgul Camil Petrescu?',
    ans: '1894',
    opts: ['1880', '1894', '1907', '1922'],
  },
  extra_literatura_ch_val_15: {
    q: 'În ce an s-a născut la București scriitorul și istoricul religiilor Mircea Eliade?',
    ans: '1907',
    opts: ['1895', '1907', '1922', '1933'],
  },
  extra_literatura_ch_val_16: {
    q: 'În ce an a fost ales dramaturgul Eugen Ionescu membru al Academiei Franceze?',
    ans: '1970',
    opts: ['1955', '1962', '1970', '1981'],
  },
  extra_literatura_ch_val_17: {
    q: 'În ce an s-a născut la Siliștea-Gumești scriitorul Marin Preda?',
    ans: '1922',
    opts: ['1907', '1914', '1922', '1933'],
  },
  extra_literatura_ch_val_18: {
    q: 'În ce an s-a născut la Ploiești poetul Nichita Stănescu?',
    ans: '1933',
    opts: ['1922', '1933', '1941', '1950'],
  },
  extra_literatura_ch_val_19: {
    q: 'În ce an s-a născut la Bulzești poetul și dramaturgul Marin Sorescu?',
    ans: '1936',
    opts: ['1922', '1936', '1945', '1954'],
  },
  extra_literatura_ch_val_20: {
    q: 'Câte cânturi are în total capodopera „Divina Comedie” a lui Dante Alighieri?',
    ans: '100',
    opts: ['33', '66', '99', '100'],
  },
  extra_literatura_ch_val_21: {
    q: 'Din ce an datează Scrisoarea lui Neacșu din Câmpulung, primul text păstrat în limba română?',
    ans: '1521',
    opts: ['1488', '1521', '1570', '1600'],
  },
  extra_literatura_ch_val_22: {
    q: 'În ce an a fost tipărită Biblia de la București (Biblia lui Șerban Cantacuzino)?',
    ans: '1688',
    opts: ['1643', '1648', '1688', '1714'],
  },
  extra_literatura_ch_val_23: {
    q: 'În ce an a apărut la Iași revista „Dacia literară”, condusă de Mihail Kogălniceanu?',
    ans: '1840',
    opts: ['1829', '1840', '1848', '1863'],
  },
  extra_literatura_ch_val_24: {
    q: 'Câte versuri are în mod fix un sonet clasic?',
    ans: '14',
    opts: ['10', '12', '14', '16'],
  },
  extra_literatura_ch_val_25: {
    q: 'În câte cânturi (cărți) este împărțită fiecare dintre epopeile homerice „Iliada” și „Odiseea”?',
    ans: '24',
    opts: ['12', '18', '24', '33'],
  },

  // CULTURA GENERALA
  extra_cultura_generala_ch_val_1: {
    q: 'În ce an a fost înființată Academia Română (inițial Societatea Literară Română)?',
    ans: '1866',
    opts: ['1848', '1859', '1866', '1880'],
  },
  extra_cultura_generala_ch_val_2: {
    q: 'În ce an a fost înființată Banca Națională a României (BNR)?',
    ans: '1880',
    opts: ['1866', '1880', '1895', '1918'],
  },
  extra_cultura_generala_ch_val_3: {
    q: 'În ce an a devenit leul moneda națională a României prin legea monetară?',
    ans: '1867',
    opts: ['1859', '1867', '1880', '1900'],
  },
  extra_cultura_generala_ch_val_4: {
    q: 'În ce an a avut loc denominarea leului românesc (trecerea la leul greu, RON)?',
    ans: '2005',
    opts: ['1999', '2002', '2005', '2007'],
  },
  extra_cultura_generala_ch_val_5: {
    q: 'În ce an a fost inclusă Rezervația Biosferei Delta Dunării în Patrimoniul Mondial UNESCO?',
    ans: '1991',
    opts: ['1985', '1991', '1999', '2007'],
  },
  extra_cultura_generala_ch_val_6: {
    q: 'În ce an a fost inclus centrul istoric al Cetății Sighișoara în Patrimoniul Mondial UNESCO?',
    ans: '1999',
    opts: ['1991', '1995', '1999', '2007'],
  },
  extra_cultura_generala_ch_val_7: {
    q: 'În ce an au fost incluse cetățile dacice din Munții Orăștiei în Patrimoniul Mondial UNESCO?',
    ans: '1999',
    opts: ['1991', '1999', '2005', '2012'],
  },
  extra_cultura_generala_ch_val_8: {
    q: 'În ce an a fost înscris Peisajul Cultural Minier Roșia Montană în Patrimoniul Mondial UNESCO?',
    ans: '2021',
    opts: ['2010', '2016', '2021', '2023'],
  },
  extra_cultura_generala_ch_val_9: {
    q: 'În ce an a deținut municipiul Sibiu titlul de Capitală Culturală Europeană?',
    ans: '2007',
    opts: ['2004', '2007', '2012', '2019'],
  },
  extra_cultura_generala_ch_val_10: {
    q: 'În ce an a exercitat municipiul Timișoara titlul de Capitală Europeană a Culturii?',
    ans: '2023',
    opts: ['2019', '2021', '2023', '2024'],
  },
  extra_cultura_generala_ch_val_11: {
    q: 'În ce an au fost decernate pentru prima dată în istorie Premiile Nobel?',
    ans: '1901',
    opts: ['1888', '1901', '1912', '1925'],
  },
  extra_cultura_generala_ch_val_12: {
    q: 'În ce an a primit savantul român George Emil Palade Premiul Nobel pentru Medicină?',
    ans: '1974',
    opts: ['1965', '1974', '1981', '1989'],
  },
  extra_cultura_generala_ch_val_13: {
    q: 'Câte zile are exact un an bisect în calendarul gregorian?',
    ans: '366',
    opts: ['364', '365', '366', '367'],
  },
  extra_cultura_generala_ch_val_14: {
    q: 'Câte state membre are în prezent Uniunea Europeană?',
    ans: '27',
    opts: ['25', '27', '28', '30'],
  },
  extra_cultura_generala_ch_val_15: {
    q: 'Câte stele aurii dispuse în cerc se află pe drapelul oficial al Uniunii Europene?',
    ans: '12',
    opts: ['10', '12', '15', '27'],
  },
  extra_cultura_generala_ch_val_16: {
    q: 'Câte județe are România (fără Municipiul București, care are statut special)?',
    ans: '41',
    opts: ['38', '40', '41', '42'],
  },
  extra_cultura_generala_ch_val_17: {
    q: 'În câte sectoare administrative este împărțit Municipiul București?',
    ans: '6',
    opts: ['4', '5', '6', '7'],
  },
  extra_cultura_generala_ch_val_18: {
    q: 'Câte erau în mod tradițional Minunile Lumii Antice?',
    ans: '7',
    opts: ['5', '7', '9', '12'],
  },
  extra_cultura_generala_ch_val_19: {
    q: 'Câte litere conține alfabetul oficial al limbii române contemporane?',
    ans: '31',
    opts: ['26', '28', '31', '33'],
  },
  extra_cultura_generala_ch_val_20: {
    q: 'Câte carate are aurul pur (999,9‰) în bijuterie?',
    ans: '24',
    opts: ['14', '18', '22', '24'],
  },
};

// Clean non-numeric subject/author/concept questions for extra_*_ch_subj_*
const CLEAN_EXTRA_CH_SUBJ = {
  // BIOLOGIE
  extra_biologie_ch_subj_1: {
    q: 'Ce organ muscular asigură circulația sângelui în corpul uman?',
    ans: 'Inima',
    opts: ['Inima', 'Ficatul', 'Splina', 'Pancreasul'],
  },
  extra_biologie_ch_subj_3: {
    q: 'Ce structură osoasă protejează măduva spinării la vertebrate?',
    ans: 'Coloana vertebrală',
    opts: ['Coloana vertebrală', 'Clavicula', 'Sternul', 'Omoplatul'],
  },
  extra_biologie_ch_subj_7: {
    q: 'Ce structură osoasă protejează inima și plămânii în corpul uman?',
    ans: 'Cutia toracică',
    opts: ['Cutia toracică', 'Bazinul osos', 'Femurul', 'Rotula'],
  },
  extra_biologie_ch_subj_14: {
    q: 'Ce celule sanguine au rolul principal de a transporta oxigenul în organism?',
    ans: 'Hematiile (globulele roșii)',
    opts: ['Hematiile (globulele roșii)', 'Leucocitele', 'Trombocitele', 'Neuronii'],
  },
  extra_biologie_ch_subj_15: {
    q: 'Ce structuri din nucleul celular poartă informația genetică ereditară?',
    ans: 'Cromozomii',
    opts: ['Cromozomii', 'Ribozomii', 'Lizozomii', 'Mitocondriile'],
  },
  extra_biologie_ch_subj_16: {
    q: 'Care este cel mai mare mamifer terestru din fauna actuală?',
    ans: 'Elefantul african',
    opts: ['Elefantul african', 'Rinocerul alb', 'Hipopotamul', 'Girafa'],
  },
  extra_biologie_ch_subj_17: {
    q: 'Ce animal marin nevertebrat din clasa cefalopodelor are opt brațe și trei inimi?',
    ans: 'Caracatița',
    opts: ['Caracatița', 'Meduza', 'Steaua de mare', 'Coralul'],
  },
  extra_biologie_ch_subj_22: {
    q: 'Cum se numesc cele trei oscioare ale auzului din urechea medie umană?',
    ans: 'Ciocanul, nicovala și scărița',
    opts: ['Ciocanul, nicovala și scărița', 'Radiusul, cubitusul și carpienele', 'Tibia, peroneul și rotula', 'Atlas, axis și sacrum'],
  },
  extra_biologie_ch_subj_25: {
    q: 'Ce savant român a întemeiat biospeologia și primul Institut de Speologie din lume?',
    ans: 'Emil Racoviță',
    opts: ['Emil Racoviță', 'Grigore Antipa', 'Victor Babeș', 'Ioan Cantacuzino'],
  },

  // FIZICA
  extra_fizica_ch_subj_1: {
    q: 'Ce fenomen fizic atrage corpurile cu masă spre centrul Pământului?',
    ans: 'Gravitația',
    opts: ['Gravitația', 'Refracția', 'Difracția', 'Inducția'],
  },
  extra_fizica_ch_subj_16: {
    q: 'Ce fizician italian a inventat barometrul cu mercur în secolul al XVII-lea?',
    ans: 'Evangelista Torricelli',
    opts: ['Evangelista Torricelli', 'Alessandro Volta', 'Luigi Galvani', 'Enrico Fermi'],
  },
  extra_fizica_ch_subj_25: {
    q: 'Ce fizician german a primit primul Premiu Nobel pentru Fizică pentru descoperirea razelor X?',
    ans: 'Wilhelm Conrad Röntgen',
    opts: ['Wilhelm Conrad Röntgen', 'Max Planck', 'Werner Heisenberg', 'Gustav Kirchhoff'],
  },

  // ARTA
  extra_arta_ch_subj_1: {
    q: 'În ce oraș din România se află Ansamblul monumental „Calea Eroilor” realizat de Constantin Brâncuși?',
    ans: 'Târgu Jiu',
    opts: ['Târgu Jiu', 'Craiova', 'Râmnicu Vâlcea', 'Drobeta-Turnu Severin'],
  },
  extra_arta_ch_subj_2: {
    q: 'Ce operă a lui Constantin Brâncuși de la Târgu Jiu este înconjurată de 12 scaune?',
    ans: 'Masa Tăcerii',
    opts: ['Masa Tăcerii', 'Poarta Sărutului', 'Coloana fără Sfârșit', 'Rugăciunea'],
  },
  extra_arta_ch_subj_4: {
    q: 'Ce mare artist renascentist a pictat bolta Capelei Sixtine de la Vatican?',
    ans: 'Michelangelo Buonarroti',
    opts: ['Michelangelo Buonarroti', 'Sandro Botticelli', 'Tiziano Vecellio', 'Caravaggio'],
  },
  extra_arta_ch_subj_5: {
    q: 'În ce oraș italian se află celebra sculptură în marmură „David” a lui Michelangelo?',
    ans: 'Florența',
    opts: ['Florența', 'Veneția', 'Milano', 'Napoli'],
  },
  extra_arta_ch_subj_6: {
    q: 'Cine a pictat celebra frescă renascentistă „Cina cea de Taină” de la Milano?',
    ans: 'Leonardo da Vinci',
    opts: ['Leonardo da Vinci', 'Rafael Sanzio', 'Donatello', 'Giotto'],
  },
  extra_arta_ch_subj_7: {
    q: 'Ce pictor francez a realizat pânza „Impresie, răsărit de soare”, care a dat numele impresionismului?',
    ans: 'Claude Monet',
    opts: ['Claude Monet', 'Édouard Manet', 'Pierre-Auguste Renoir', 'Paul Cézanne'],
  },
  extra_arta_ch_subj_8: {
    q: 'Ce maestru al barocului olandez a pictat celebrul tablou „Rondul de noapte”?',
    ans: 'Rembrandt van Rijn',
    opts: ['Rembrandt van Rijn', 'Johannes Vermeer', 'Peter Paul Rubens', 'Frans Hals'],
  },
  extra_arta_ch_subj_9: {
    q: 'Cine a pictat celebra capodoperă olandeză „Fata cu cercel de perlă”?',
    ans: 'Johannes Vermeer',
    opts: ['Johannes Vermeer', 'Rembrandt van Rijn', 'Jan van Eyck', 'Hieronymus Bosch'],
  },
  extra_arta_ch_subj_10: {
    q: 'Ce pictor expresionist norvegian a realizat celebrul tablou „Țipătul”?',
    ans: 'Edvard Munch',
    opts: ['Edvard Munch', 'Gustav Klimt', 'Egon Schiele', 'Paul Klee'],
  },
  extra_arta_ch_subj_11: {
    q: 'Ce pictor austriac a realizat capodopera „Sărutul”, expusă la Palatul Belvedere din Viena?',
    ans: 'Gustav Klimt',
    opts: ['Gustav Klimt', 'Oskar Kokoschka', 'Wassily Kandinsky', 'Henri Matisse'],
  },
  extra_arta_ch_subj_12: {
    q: 'Ce mare pictor român a realizat tablourile „Carul cu boi” și „Atacul de la Smârdan”?',
    ans: 'Nicolae Grigorescu',
    opts: ['Nicolae Grigorescu', 'Ștefan Luchian', 'Nicolae Tonitza', 'Theodor Pallady'],
  },
  extra_arta_ch_subj_13: {
    q: 'Ce pictor român este celebru pentru tabloul „Anemone” și portretul „Un zugrav”?',
    ans: 'Ștefan Luchian',
    opts: ['Ștefan Luchian', 'Ion Andreescu', 'Gheorghe Petrașcu', 'Camil Ressu'],
  },
  extra_arta_ch_subj_15: {
    q: 'Ce pictor român din secolul al XIX-lea a pictat capodoperele „Stejarul” și „Iarna la Barbizon”?',
    ans: 'Ion Andreescu',
    opts: ['Ion Andreescu', 'Theodor Aman', 'Sava Henția', 'Gheorghe Tattarescu'],
  },
  extra_arta_ch_subj_17: {
    q: 'În curtea cărui mare muzeu din Paris se află celebra Piramidă de sticlă și metal?',
    ans: 'Muzeul Luvru',
    opts: ['Muzeul Luvru', 'Muzeul Orsay', 'Centrul Pompidou', 'Muzeul Rodin'],
  },
  extra_arta_ch_subj_18: {
    q: 'Ce sculptor francez a realizat Statuia Libertății din New York?',
    ans: 'Frédéric Auguste Bartholdi',
    opts: ['Frédéric Auguste Bartholdi', 'Auguste Rodin', 'Antoine Bourdelle', 'Camille Claudel'],
  },
  extra_arta_ch_subj_19: {
    q: 'În ce stațiune de pe Valea Prahovei se află Castelul Peleș?',
    ans: 'Sinaia',
    opts: ['Sinaia', 'Predeal', 'Bușteni', 'Azuga'],
  },
  extra_arta_ch_subj_20: {
    q: 'Pentru ce edificiu cultural din București s-a organizat Campania publică „Dați un leu pentru Ateneu”?',
    ans: 'Ateneul Român',
    opts: ['Ateneul Român', 'Opera Națională', 'Teatrul Național', 'Cercul Militar Național'],
  },
  extra_arta_ch_subj_23: {
    q: 'Ce inginer francez a proiectat celebrul turn metalic inaugurat la Paris în anul 1889?',
    ans: 'Gustave Eiffel',
    opts: ['Gustave Eiffel', 'Charles Garnier', 'Eugène Viollet-le-Duc', 'Hector Guimard'],
  },
  extra_arta_ch_subj_24: {
    q: 'În ce oraș din Transilvania se află Muzeul Național Brukenthal, deschis în anul 1817?',
    ans: 'Sibiu',
    opts: ['Sibiu', 'Brașov', 'Cluj-Napoca', 'Sighișoara'],
  },

  // MUZICA
  extra_muzica_ch_subj_1: {
    q: 'În ce județ se află satul Liveni, locul natal al compozitorului George Enescu?',
    ans: 'Botoșani',
    opts: ['Botoșani', 'Suceava', 'Iași', 'Neamț'],
  },
  extra_muzica_ch_subj_3: {
    q: 'Cine a compus opereta românească „Crai Nou”, prezentată la Brașov în 1882?',
    ans: 'Ciprian Porumbescu',
    opts: ['Ciprian Porumbescu', 'George Stephănescu', 'Eduard Caudella', 'Tiberiu Brediceanu'],
  },
  extra_muzica_ch_subj_12: {
    q: 'Ce compozitor italian a scris opera „Nabucco”, celebră pentru „Corul sclavilor evrei”?',
    ans: 'Giuseppe Verdi',
    opts: ['Giuseppe Verdi', 'Giacomo Puccini', 'Gioachino Rossini', 'Gaetano Donizetti'],
  },
  extra_muzica_ch_subj_13: {
    q: 'Ce compozitor italian a scris opera „Aida”, prezentată în premieră la Cairo în 1871?',
    ans: 'Giuseppe Verdi',
    opts: ['Giuseppe Verdi', 'Vincenzo Bellini', 'Pietro Mascagni', 'Ruggero Leoncavallo'],
  },
  extra_muzica_ch_subj_14: {
    q: 'Cine a compus celebra operă franceză „Carmen”?',
    ans: 'Georges Bizet',
    opts: ['Georges Bizet', 'Charles Gounod', 'Jules Massenet', 'Camille Saint-Saëns'],
  },
  extra_muzica_ch_subj_15: {
    q: 'Ce compozitor italian a creat operele „Tosca”, „Boema” și „Madama Butterfly”?',
    ans: 'Giacomo Puccini',
    opts: ['Giacomo Puccini', 'Giuseppe Verdi', 'Claudio Monteverdi', 'Antonio Salieri'],
  },
  extra_muzica_ch_subj_16: {
    q: 'Din ce operă de Giacomo Puccini face parte celebra arie de tenor „Nessun dorma”?',
    ans: 'Turandot',
    opts: ['Turandot', 'Rigoletto', 'Traviata', 'Bărbierul din Sevilla'],
  },
  extra_muzica_ch_subj_17: {
    q: 'Cine a compus muzica baletului clasic „Spărgătorul de nuci”?',
    ans: 'Piotr Ilici Ceaikovski',
    opts: ['Piotr Ilici Ceaikovski', 'Igor Stravinski', 'Serghei Prokofiev', 'Nikolai Rimski-Korsakov'],
  },
  extra_muzica_ch_subj_18: {
    q: 'Ce compozitor francez a scris celebra lucrare orchestrală „Boléro”?',
    ans: 'Maurice Ravel',
    opts: ['Maurice Ravel', 'Claude Debussy', 'Hector Berlioz', 'Erik Satie'],
  },
  extra_muzica_ch_subj_20: {
    q: 'Ce mare compozitor romantic de origine poloneză a fost supranumit „poetul pianului”?',
    ans: 'Frédéric Chopin',
    opts: ['Frédéric Chopin', 'Franz Liszt', 'Robert Schumann', 'Johannes Brahms'],
  },
  extra_muzica_ch_subj_25: {
    q: 'Cine a compus oratoriul „Mesia” (Messiah), care include celebrul cor „Hallelujah”?',
    ans: 'Georg Friedrich Händel',
    opts: ['Georg Friedrich Händel', 'Johann Sebastian Bach', 'Joseph Haydn', 'Felix Mendelssohn'],
  },

  // CINEMATOGRAFIE
  extra_cinematografie_ch_subj_1: {
    q: 'Cine a realizat la Paris, în decembrie 1895, prima proiecție publică comercială de film?',
    ans: 'Frații Auguste și Louis Lumière',
    opts: ['Frații Auguste și Louis Lumière', 'Georges Méliès', 'Charles Pathé', 'Léon Gaumont'],
  },
  extra_cinematografie_ch_subj_5: {
    q: 'Cine a regizat filmul românesc „Pădurea spânzuraților”, premiat pentru regie la Cannes în 1965?',
    ans: 'Liviu Ciulei',
    opts: ['Liviu Ciulei', 'Lucian Pintilie', 'Mircea Daneliuc', 'Dan Pița'],
  },
  extra_cinematografie_ch_subj_6: {
    q: 'Ce cineast român a câștigat Palme d’Or la Cannes în 1957 pentru animația „Scurtă istorie”?',
    ans: 'Ion Popescu-Gopo',
    opts: ['Ion Popescu-Gopo', 'Jean Georgescu', 'Victor Iliu', 'Elisabeta Bostan'],
  },
  extra_cinematografie_ch_subj_7: {
    q: 'Ce mare actor român a interpretat rolul titular în filmul „Mihai Viteazul” din 1971?',
    ans: 'Amza Pellea',
    opts: ['Amza Pellea', 'Ilarion Ciobanu', 'Florin Piersic', 'Mircea Albulescu'],
  },
  extra_cinematografie_ch_subj_8: {
    q: 'Ce mare actor român l-a interpretat pe Ilie Moromete în filmul „Moromeții” din 1987?',
    ans: 'Victor Rebengiuc',
    opts: ['Victor Rebengiuc', 'Ștefan Iordache', 'Gheorghe Dinică', 'Toma Caragiu'],
  },
  extra_cinematografie_ch_subj_9: {
    q: 'Cine a regizat comedia românească „Filantropica”, lansată în anul 2002?',
    ans: 'Nae Caranfil',
    opts: ['Nae Caranfil', 'Cristian Mungiu', 'Corneliu Porumboiu', 'Tudor Giurgiu'],
  },
  extra_cinematografie_ch_subj_10: {
    q: 'Cine a regizat filmul românesc „A fost sau n-a fost?”, premiat la Cannes?',
    ans: 'Corneliu Porumboiu',
    opts: ['Corneliu Porumboiu', 'Cristi Puiu', 'Radu Muntean', 'Cătălin Mitulescu'],
  },
  extra_cinematografie_ch_subj_12: {
    q: 'Cine a regizat și a jucat rolul principal în filmul clasic „Cetățeanul Kane” din 1941?',
    ans: 'Orson Welles',
    opts: ['Orson Welles', 'Alfred Hitchcock', 'Billy Wilder', 'John Ford'],
  },
  extra_cinematografie_ch_subj_14: {
    q: 'Ce mare regizor japonez a realizat capodoperele „Cei șapte samurai” și „Rashomon”?',
    ans: 'Akira Kurosawa',
    opts: ['Akira Kurosawa', 'Yasujiro Ozu', 'Kenji Mizoguchi', 'Hayao Miyazaki'],
  },
  extra_cinematografie_ch_subj_15: {
    q: 'Cine a regizat filmul SF „2001: O odisee spațială”, lansat în 1968?',
    ans: 'Stanley Kubrick',
    opts: ['Stanley Kubrick', 'Ridley Scott', 'George Lucas', 'Robert Zemeckis'],
  },
  extra_cinematografie_ch_subj_16: {
    q: 'Cine a creat universul cinematografic și a regizat primul film „Războiul Stelelor” din 1977?',
    ans: 'George Lucas',
    opts: ['George Lucas', 'Steven Spielberg', 'James Cameron', 'Peter Jackson'],
  },
  extra_cinematografie_ch_subj_17: {
    q: 'Cine a regizat filmul istoric „Lista lui Schindler”, distins cu 7 premii Oscar?',
    ans: 'Steven Spielberg',
    opts: ['Steven Spielberg', 'Martin Scorsese', 'Roman Polanski', 'Clint Eastwood'],
  },
  extra_cinematografie_ch_subj_20: {
    q: 'Cine a regizat filmul sud-coreean „Parazit” (Parasite), câștigător al Oscarului pentru cel mai bun film?',
    ans: 'Bong Joon-ho',
    opts: ['Bong Joon-ho', 'Park Chan-wook', 'Ang Lee', 'Wong Kar-wai'],
  },
  extra_cinematografie_ch_subj_21: {
    q: 'Cine a regizat filmul românesc de referință „Reconstituirea” din anul 1968?',
    ans: 'Lucian Pintilie',
    opts: ['Lucian Pintilie', 'Sergiu Nicolaescu', 'Mircea Drăgan', 'Stere Gulea'],
  },

  // TEHNOLOGIE
  extra_tehnologie_ch_subj_1: {
    q: 'Cine a realizat la Kitty Hawk, în 1903, primul zbor mecanic controlat cu un avion?',
    ans: 'Frații Orville și Wilbur Wright',
    opts: ['Frații Orville și Wilbur Wright', 'Frații Montgolfier', 'Louis Blériot', 'Alberto Santos-Dumont'],
  },
  extra_tehnologie_ch_subj_2: {
    q: 'Ce pionier român al aviației a zburat la Montesson la 18 martie 1906?',
    ans: 'Traian Vuia',
    opts: ['Traian Vuia', 'Aurel Vlaicu', 'Henri Coandă', 'Elie Carafoli'],
  },
  extra_tehnologie_ch_subj_3: {
    q: 'Ce inginer și pilot român din Binținți a zburat pe Câmpul Cotrocenilor în iunie 1910?',
    ans: 'Aurel Vlaicu',
    opts: ['Aurel Vlaicu', 'Traian Vuia', 'Anastase Dragomir', 'Justin Capră'],
  },
  extra_tehnologie_ch_subj_4: {
    q: 'Ce fizician născut la Sibiu este considerat unul dintre părinții fondatori ai rachetelor și astronauticii?',
    ans: 'Hermann Oberth',
    opts: ['Hermann Oberth', 'Conrad Haas', 'Konstantin Țiolkovski', 'Robert Goddard'],
  },
  extra_tehnologie_ch_subj_5: {
    q: 'Ce savant român a inventat pila termoelectrică cu electrozi inatacabili care îi poartă numele?',
    ans: 'Nicolae Vasilescu-Karpen',
    opts: ['Nicolae Vasilescu-Karpen', 'Dragomir Hurmuzescu', 'Horia Hulubei', 'Ștefan Procopiu'],
  },
  extra_tehnologie_ch_subj_6: {
    q: 'Ce inventator român a brevetat în Franța „cabina catapultabilă”, precursoarea scaunului ejectabil?',
    ans: 'Anastase Dragomir',
    opts: ['Anastase Dragomir', 'Aurel Persu', 'Gogu Constantinescu', 'Elie Radu'],
  },
  extra_tehnologie_ch_subj_7: {
    q: 'Cum s-a numit primul satelit artificial al Pământului, lansat pe orbită în octombrie 1957?',
    ans: 'Sputnik 1',
    opts: ['Sputnik 1', 'Explorer 1', 'Vostok 1', 'Vanguard 1'],
  },
  extra_tehnologie_ch_subj_12: {
    q: 'Cine a obținut în anul 1876 brevetul istoric pentru inventarea telefonului electric?',
    ans: 'Alexander Graham Bell',
    opts: ['Alexander Graham Bell', 'Samuel Morse', 'Guglielmo Marconi', 'Nikola Tesla'],
  },
  extra_tehnologie_ch_subj_13: {
    q: 'Ce mare inventator american a perfecționat becul electric incandescent și fonograful?',
    ans: 'Thomas Alva Edison',
    opts: ['Thomas Alva Edison', 'George Westinghouse', 'Michael Faraday', 'James Watt'],
  },
  extra_tehnologie_ch_subj_18: {
    q: 'Cum se numește cea mai înaltă șosea din România (DN67C), care traversează Munții Parâng?',
    ans: 'Transalpina',
    opts: ['Transalpina', 'Transfăgărășanul', 'Transbucegi', 'Transrarăul'],
  },
  extra_tehnologie_ch_subj_23: {
    q: 'În ce oraș din România s-a deschis în 1857 prima rafinărie industrială de petrol?',
    ans: 'Ploiești',
    opts: ['Ploiești', 'Câmpina', 'Moinești', 'Moreni'],
  },
  extra_tehnologie_ch_subj_24: {
    q: 'Ce oraș din România a devenit în 1884 primul oraș iluminat electric stradal din Europa?',
    ans: 'Timișoara',
    opts: ['Timișoara', 'București', 'Iași', 'Cluj-Napoca'],
  },
  extra_tehnologie_ch_subj_25: {
    q: 'Ce inginer și savant român a întemeiat o nouă știință tehnică numită teoria sonicității?',
    ans: 'Gogu Constantinescu',
    opts: ['Gogu Constantinescu', 'Anghel Saligny', 'Henri Coandă', 'Petrache Poenaru'],
  },

  // SPORT
  extra_sport_ch_subj_18: {
    q: 'Pe ce suprafață de joc se dispută turneul de tenis de la Roland Garros?',
    ans: 'Zgură',
    opts: ['Zgură', 'Iarbă', 'Hard (ciment)', 'Carpetă'],
  },
  extra_sport_ch_subj_22: {
    q: 'Cine a cucerit la Helsinki, în 1952, primul titlu olimpic din istoria României?',
    ans: 'Iosif Sîrbu',
    opts: ['Iosif Sîrbu', 'Leon Rotman', 'Nicolae Linca', 'Iolanda Balaș'],
  },
  extra_sport_ch_subj_23: {
    q: 'În ce probă atletică a dominat atleta română Iolanda Balaș, stabilind 14 recorduri mondiale?',
    ans: 'Săritura în înălțime',
    opts: ['Săritura în înălțime', 'Săritura în lungime', 'Aruncarea suliței', 'Proba de maraton'],
  },
  extra_sport_ch_subj_24: {
    q: 'În ce probă atletică a cucerit Lia Manoliu titlul olimpic la Jocurile Olimpice din 1968?',
    ans: 'Aruncarea discului',
    opts: ['Aruncarea discului', 'Aruncarea greutății', 'Săritura în lungime', '100 m garduri'],
  },

  // LITERATURA
  extra_literatura_ch_subj_5: {
    q: 'Ce critic literar a fost mentorul societății „Junimea”, înființată la Iași în anul 1863?',
    ans: 'Titu Maiorescu',
    opts: ['Titu Maiorescu', 'Eugen Lovinescu', 'George Călinescu', 'Garabet Ibrăileanu'],
  },
  extra_literatura_ch_subj_7: {
    q: 'Ce poet pașoptist a fost supranumit „bardul de la Mircești”?',
    ans: 'Vasile Alecsandri',
    opts: ['Vasile Alecsandri', 'Grigore Alexandrescu', 'Dimitrie Bolintineanu', 'Cezar Bolliac'],
  },
  extra_literatura_ch_subj_20: {
    q: 'Cine este autorul marii epopei alegorice în versuri „Divina Comedie”?',
    ans: 'Dante Alighieri',
    opts: ['Dante Alighieri', 'Giovanni Boccaccio', 'Francesco Petrarca', 'Torquato Tasso'],
  },
  extra_literatura_ch_subj_21: {
    q: 'Cărui jude al Brașovului îi era adresată Scrisoarea lui Neacșu din anul 1521?',
    ans: 'Johannes Benkner',
    opts: ['Johannes Benkner', 'Johannes Honterus', 'Samuel von Brukenthal', 'Stephan Ludwig Roth'],
  },
  extra_literatura_ch_subj_23: {
    q: 'Cine a condus revista „Dacia literară”, apărută la Iași în anul 1840?',
    ans: 'Mihail Kogălniceanu',
    opts: ['Mihail Kogălniceanu', 'Ion Heliade Rădulescu', 'George Barițiu', 'Costache Negruzzi'],
  },
  extra_literatura_ch_subj_25: {
    q: 'Cărui mare poet antic grec îi sunt atribuite epopeile „Iliada” și „Odiseea”?',
    ans: 'Homer',
    opts: ['Homer', 'Hesiod', 'Sofocle', 'Euripide'],
  },

  // CULTURA GENERALA
  extra_cultura_generala_ch_subj_2: {
    q: 'Cine este considerat fondatorul Băncii Naționale a României din 1880, alături de Ion C. Brătianu?',
    ans: 'Eugeniu Carada',
    opts: ['Eugeniu Carada', 'Spiru Haret', 'Take Ionescu', 'Petre P. Carp'],
  },
  extra_cultura_generala_ch_subj_11: {
    q: 'Ce inventator suedez a instituit prin testament celebrele premii internaționale decernate din 1901?',
    ans: 'Alfred Nobel',
    opts: ['Alfred Nobel', 'Anders Celsius', 'Carl Linné', 'Svante Arrhenius'],
  },
  extra_cultura_generala_ch_subj_18: {
    q: 'Care este singura dintre cele Șapte Minuni ale Lumii Antice care s-a păstrat până astăzi?',
    ans: 'Marea Piramidă din Giza',
    opts: [
      'Marea Piramidă din Giza',
      'Colosul din Rodos',
      'Farul din Alexandria',
      'Grădinile Suspendate ale Semiramidei',
    ],
  },
};

// ---------------------------------------------------------------------------
// 3. AUDIT AND TRANSFORM ALL 6,241 ORIGINAL RECORDS
// ---------------------------------------------------------------------------

const auditedChoice = [];
const auditedEstimation = [];
const usedActiveFingerprints = new Set();

function makeDisabledRecord(origQ) {
  return {
    ...origQ,
    reviewStatus: 'disabled',
    isDisabled: true,
    verified: false,
  };
}

function makeActiveChoiceRecord(origQ, newQuestionText, options, correctAnswerIndex, customExplanation) {
  const cleanQ = String(newQuestionText).trim();
  const fp = normalizeQuestionText(cleanQ);
  if (usedActiveFingerprints.has(fp)) {
    throw new Error(`Duplicate active question text for ${origQ.id}: "${cleanQ}"`);
  }
  usedActiveFingerprints.add(fp);

  const cleanOpts = options.map((o) => String(o).trim());
  const base = {
    id: origQ.id,
    category: origQ.category,
    difficulty: origQ.difficulty || 'mediu',
    type: 'choice',
    question: cleanQ,
    options: cleanOpts,
    correctAnswerIndex,
    explanation: String(customExplanation || origQ.explanation || `Răspunsul corect este ${cleanOpts[correctAnswerIndex]}.`).trim(),
    sourceUrl: origQ.sourceUrl,
    sourceTitle: origQ.sourceTitle,
    sourceCheckedAt: origQ.sourceCheckedAt || '2026-11-10',
    factKey: origQ.factKey,
    reviewStatus: 'approved',
    isDisabled: false,
    verified: true,
  };
  return base;
}

// 3.A Audit the 3,324 original choice records
for (const origQ of originalChoice) {
  const id = origQ.id;

  // 1. Romanian Counties
  if (id.startsWith('geo_ro_seat_')) {
    const code = id.replace('geo_ro_seat_', '').toUpperCase();
    const c = RO_COUNTIES.find((x) => x.code === code);
    // Disable if seat contains county name (e.g. Brașov -> Brașov, Alba Iulia -> Alba, Cluj-Napoca -> Cluj)
    if (!c || normalizeQuestionText(c.seat).includes(normalizeQuestionText(c.county.split('-')[0]))) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      auditedChoice.push(
        makeActiveChoiceRecord(
          origQ,
          `Care este municipiul reședință al județului ${c.county}?`,
          origQ.options,
          origQ.correctAnswerIndex
        )
      );
    }
    continue;
  }

  if (id.startsWith('geo_ro_county_of_')) {
    const code = id.replace('geo_ro_county_of_', '').toUpperCase();
    const c = RO_COUNTIES.find((x) => x.code === code);
    if (!c || normalizeQuestionText(c.seat).includes(normalizeQuestionText(c.county.split('-')[0]))) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      auditedChoice.push(
        makeActiveChoiceRecord(
          origQ,
          `Cărui județ îi aparține municipiul reședință ${c.seat}?`,
          origQ.options,
          origQ.correctAnswerIndex
        )
      );
    }
    continue;
  }

  if (id.startsWith('geo_ro_code_')) {
    const code = id.replace('geo_ro_code_', '').toUpperCase();
    const c = RO_COUNTIES.find((x) => x.code === code);
    auditedChoice.push(
      makeActiveChoiceRecord(
        origQ,
        `Care este indicativul auto al județului ${c.county}?`,
        origQ.options,
        origQ.correctAnswerIndex
      )
    );
    continue;
  }

  if (id.startsWith('geo_ro_region_')) {
    const code = id.replace('geo_ro_region_', '').toUpperCase();
    const c = RO_COUNTIES.find((x) => x.code === code);
    if (!c || normalizeQuestionText(c.county) === normalizeQuestionText(c.region)) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      auditedChoice.push(
        makeActiveChoiceRecord(
          origQ,
          `În ce regiune istorică se află județul ${c.county}?`,
          origQ.options,
          origQ.correctAnswerIndex
        )
      );
    }
    continue;
  }

  if (id.startsWith('geo_ro_river_')) {
    const code = id.replace('geo_ro_river_', '').toUpperCase();
    const c = RO_COUNTIES.find((x) => x.code === code);
    // Disable if river name overlaps with county name (e.g. Argeș, Buzău, Ialomița, Mureș, Olt, Prahova, Suceava, Bistrița)
    if (!c || normalizeQuestionText(c.river).includes(normalizeQuestionText(c.county.split('-')[0]))) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      auditedChoice.push(
        makeActiveChoiceRecord(
          origQ,
          `Ce râu important străbate județul ${c.county}?`,
          origQ.options,
          origQ.correctAnswerIndex
        )
      );
    }
    continue;
  }

  // 2. World Countries
  if (id.startsWith('geo_world_cap_')) {
    const slug = id.replace('geo_world_cap_', '');
    if (slug === 'luxemburg' || slug === 'mexic') {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      auditedChoice.push(
        makeActiveChoiceRecord(origQ, origQ.question, origQ.options, origQ.correctAnswerIndex)
      );
    }
    continue;
  }

  if (id.startsWith('geo_world_state_')) {
    const slug = id.replace('geo_world_state_', '');
    if (slug === 'luxemburg' || slug === 'mexic') {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      auditedChoice.push(
        makeActiveChoiceRecord(origQ, origQ.question, origQ.options, origQ.correctAnswerIndex)
      );
    }
    continue;
  }

  if (id.startsWith('geo_world_curr_')) {
    const slug = id.replace('geo_world_curr_', '');
    const cleanCurr = CLEAN_CURRENCY_BY_COUNTRY_SLUG[slug];
    if (!cleanCurr) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const seedIdx = Object.keys(CLEAN_CURRENCY_BY_COUNTRY_SLUG).indexOf(slug);
      const { options, correctAnswerIndex } = buildChoiceOptions(
        cleanCurr,
        ALL_CLEAN_CURRENCIES,
        seedIdx + 2
      );
      auditedChoice.push(
        makeActiveChoiceRecord(origQ, origQ.question, options, correctAnswerIndex)
      );
    }
    continue;
  }

  if (id.startsWith('geo_world_cont_')) {
    const slug = id.replace('geo_world_cont_', '');
    if (slug === 'statele_unite_ale_americii') {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      auditedChoice.push(
        makeActiveChoiceRecord(origQ, origQ.question, origQ.options, origQ.correctAnswerIndex)
      );
    }
    continue;
  }

  // 3. Chemical Elements
  if (id.startsWith('chem_sym_')) {
    const cleanQ = origQ.question.replace('simbolul chimic oficial pentru', 'simbolul chimic pentru');
    auditedChoice.push(
      makeActiveChoiceRecord(origQ, cleanQ, origQ.options, origQ.correctAnswerIndex)
    );
    continue;
  }

  if (id.startsWith('chem_name_')) {
    const cleanQ = origQ.question.replace('este reprezentat prin simbolul', 'are simbolul');
    auditedChoice.push(
      makeActiveChoiceRecord(origQ, cleanQ, origQ.options, origQ.correctAnswerIndex)
    );
    continue;
  }

  // Disable niche chemistry/physics classifications & measurements (group/category, Z, atomic mass u.a.m., boiling point °C)
  if (
    id.startsWith('chem_group_') ||
    id.startsWith('chem_z_to_name_') ||
    id.startsWith('chem_mass_choice_') ||
    id.startsWith('phys_boil_choice_')
  ) {
    auditedChoice.push(makeDisabledRecord(origQ));
    continue;
  }

  // 4. Historical Events
  if (id.startsWith('hist_yr_choice_')) {
    const idx = Number(id.replace('hist_yr_choice_', ''));
    const h = CLEAN_HISTORY_BY_INDEX.find((x) => x.idx === idx);
    if (!h || !h.qYear) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        String(h.year),
        VALID_HISTORY_YEARS,
        idx
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, h.qYear, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('hist_leader_choice_')) {
    const idx = Number(id.replace('hist_leader_choice_', ''));
    const h = CLEAN_HISTORY_BY_INDEX.find((x) => x.idx === idx);
    if (!h || !h.leader || !h.qLeader) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        h.leader,
        VALID_HISTORY_LEADERS,
        idx + 1
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, h.qLeader, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('hist_place_choice_')) {
    const idx = Number(id.replace('hist_place_choice_', ''));
    const h = CLEAN_HISTORY_BY_INDEX.find((x) => x.idx === idx);
    if (!h || !h.place || !h.qPlace) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        h.place,
        VALID_HISTORY_PLACES,
        idx + 2
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, h.qPlace, options, correctAnswerIndex));
    }
    continue;
  }

  // 5. Cultural Works
  if (id.startsWith('cult_author_')) {
    const idx = Number(id.replace('cult_author_', ''));
    const w = CLEAN_CULTURAL_WORKS.find((x) => x.idx === idx);
    if (!w) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        w.author,
        CLEAN_CULT_AUTHORS,
        idx
      );
      const qText =
        w.cat === 'cinematografie'
          ? `Cine a regizat filmul „${w.title}”?`
          : w.cat === 'muzica'
          ? `Cine a compus lucrarea muzicală „${w.title}”?`
          : w.cat === 'arta'
          ? `Cine a realizat opera de artă „${w.title}”?`
          : `Cine este autorul operei literare „${w.title}”?`;
      auditedChoice.push(makeActiveChoiceRecord(origQ, qText, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('cult_title_')) {
    const idx = Number(id.replace('cult_title_', ''));
    const w = CLEAN_CULTURAL_WORKS.find((x) => x.idx === idx);
    if (!w) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const sameCatTitles = CLEAN_CULTURAL_WORKS.filter((x) => x.cat === w.cat).map((x) => x.title);
      const pool = sameCatTitles.length >= 4 ? sameCatTitles : CLEAN_CULT_TITLES;
      const { options, correctAnswerIndex } = buildChoiceOptions(w.title, pool, idx + 1);
      const qText = `Ce ${w.kind} îi aparține lui ${w.author}?`;
      auditedChoice.push(makeActiveChoiceRecord(origQ, qText, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('cult_year_choice_')) {
    const idx = Number(id.replace('cult_year_choice_', ''));
    const w = CLEAN_CULTURAL_WORKS.find((x) => x.idx === idx);
    if (!w) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        String(w.year),
        CLEAN_CULT_YEARS,
        idx + 2
      );
      const qText =
        w.idx === 11
          ? 'În ce an a apărut romanul „Ultima noapte de dragoste, întâia noapte de război”?'
          : w.idx === 31
          ? 'În ce an a apărut romanul distopic „1984” de George Orwell?'
          : w.idx === 46
          ? 'În ce an a câștigat filmul „4 luni, 3 săptămâni și 2 zile” Palme d’Or?'
          : w.cat === 'cinematografie'
          ? `În ce an a fost lansat filmul „${w.title}” regizat de ${w.author}?`
          : `În ce an a apărut opera „${w.title}” de ${w.author}?`;
      auditedChoice.push(makeActiveChoiceRecord(origQ, qText, options, correctAnswerIndex));
    }
    continue;
  }

  // 6. Geographic Features
  if (id.startsWith('geo_feat_massif_')) {
    const idx = Number(id.replace('geo_feat_massif_', ''));
    const spec = CLEAN_GEO_MASSIF_QUESTIONS[idx];
    if (!spec) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        spec.ans,
        CLEAN_GEO_MASSIF_POOL,
        idx
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, spec.q, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('geo_feat_name_')) {
    const idx = Number(id.replace('geo_feat_name_', ''));
    const spec = CLEAN_GEO_SUPERLATIVES[idx];
    if (!spec) {
      // Disable measurement-based peak/river questions
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(spec.ans, spec.pool, idx + 1);
      auditedChoice.push(makeActiveChoiceRecord(origQ, spec.q, options, correctAnswerIndex));
    }
    continue;
  }

  // 7. Sports Facts
  if (id.startsWith('sport_champ_')) {
    const idx = Number(id.replace('sport_champ_', ''));
    const s = CLEAN_SPORTS_FACTS.find((x) => x.idx === idx);
    if (!s || !s.qChamp) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        s.champion,
        CLEAN_SPORT_CHAMPIONS,
        idx
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, s.qChamp, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('sport_host_')) {
    const idx = Number(id.replace('sport_host_', ''));
    const s = CLEAN_SPORTS_FACTS.find((x) => x.idx === idx);
    if (!s || !s.qHost) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        s.host,
        CLEAN_SPORT_HOSTS,
        idx + 1
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, s.qHost, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('sport_yr_choice_')) {
    const idx = Number(id.replace('sport_yr_choice_', ''));
    const s = CLEAN_SPORTS_FACTS.find((x) => x.idx === idx);
    if (!s || !s.qYear) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        String(s.year),
        CLEAN_SPORT_YEARS,
        idx + 2
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, s.qYear, options, correctAnswerIndex));
    }
    continue;
  }

  // 8. Tech & Science
  if (id.startsWith('tech_creator_')) {
    const idx = Number(id.replace('tech_creator_', ''));
    const t = CLEAN_TECH_FACTS.find((x) => x.idx === idx);
    if (!t || !t.qCreator) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        t.creator,
        CLEAN_TECH_CREATORS,
        idx
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, t.qCreator, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('tech_topic_')) {
    const idx = Number(id.replace('tech_topic_', ''));
    const t = CLEAN_TECH_FACTS.find((x) => x.idx === idx);
    if (!t || !t.qTopic) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        t.cleanTopic,
        CLEAN_TECH_TOPICS,
        idx + 1
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, t.qTopic, options, correctAnswerIndex));
    }
    continue;
  }

  if (id.startsWith('tech_yr_choice_')) {
    const idx = Number(id.replace('tech_yr_choice_', ''));
    const t = CLEAN_TECH_FACTS.find((x) => x.idx === idx);
    if (!t || !t.qYear) {
      auditedChoice.push(makeDisabledRecord(origQ));
    } else {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        String(t.year),
        CLEAN_TECH_YEARS,
        idx + 2
      );
      auditedChoice.push(makeActiveChoiceRecord(origQ, t.qYear, options, correctAnswerIndex));
    }
    continue;
  }

  // 9. Extra Domain Bank (ch_val and ch_subj)
  if (CLEAN_EXTRA_CH_VAL[id]) {
    const spec = CLEAN_EXTRA_CH_VAL[id];
    const seed = auditedChoice.length;
    const { options, correctAnswerIndex } = buildChoiceOptions(spec.ans, spec.opts, seed);
    auditedChoice.push(makeActiveChoiceRecord(origQ, spec.q, options, correctAnswerIndex));
    continue;
  }

  if (CLEAN_EXTRA_CH_SUBJ[id]) {
    const spec = CLEAN_EXTRA_CH_SUBJ[id];
    const seed = auditedChoice.length;
    const { options, correctAnswerIndex } = buildChoiceOptions(spec.ans, spec.opts, seed);
    auditedChoice.push(makeActiveChoiceRecord(origQ, spec.q, options, correctAnswerIndex));
    continue;
  }

  // All remaining synthetic/calculation/conversion/set-comparison choice questions are marked disabled
  auditedChoice.push(makeDisabledRecord(origQ));
}

// 3.B Audit the 2,917 original estimation records:
// Convert to multiple-choice ONLY when the existing answer and source support a simple, unambiguous general-knowledge question
// that isn't already active in choice.json. Mark all other estimation records as disabled.
let convertedFromEstimationCount = 0;

for (const origEst of originalEstimation) {
  const id = origEst.id;

  // 1. Romania's UN admission year (1955)
  if (id === 'est_world_un_romania') {
    const { options, correctAnswerIndex } = buildChoiceOptions(
      '1955',
      ['1945', '1955', '1965', '1975'],
      1
    );
    auditedChoice.push(
      makeActiveChoiceRecord(
        origEst,
        'În ce an a aderat România la Organizația Națiunilor Unite (ONU)?',
        options,
        correctAnswerIndex
      )
    );
    convertedFromEstimationCount++;
    continue;
  }

  // 2. Historical events whose year question was missing in original choice.json (idx 19 and 29)
  if (id.startsWith('est_hist_year_')) {
    const idx = Number(id.replace('est_hist_year_', ''));
    const hasChoiceAlready = originalChoice.some((q) => q.id === `hist_yr_choice_${idx}`);
    const h = CLEAN_HISTORY_BY_INDEX.find((x) => x.idx === idx);
    if (!hasChoiceAlready && h && h.qYear) {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        String(h.year),
        VALID_HISTORY_YEARS,
        idx
      );
      auditedChoice.push(makeActiveChoiceRecord(origEst, h.qYear, options, correctAnswerIndex));
      convertedFromEstimationCount++;
      continue;
    }
  }

  // 3. Cultural work whose year question was missing in original choice.json (idx 22)
  if (id.startsWith('est_cult_year_')) {
    const idx = Number(id.replace('est_cult_year_', ''));
    const hasChoiceAlready = originalChoice.some((q) => q.id === `cult_year_choice_${idx}`);
    const w = CLEAN_CULTURAL_WORKS.find((x) => x.idx === idx);
    if (!hasChoiceAlready && w) {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        String(w.year),
        CLEAN_CULT_YEARS,
        idx + 2
      );
      auditedChoice.push(
        makeActiveChoiceRecord(
          origEst,
          `În ce an a fost realizată sculptura „${w.title}” de ${w.author}?`,
          options,
          correctAnswerIndex
        )
      );
      convertedFromEstimationCount++;
      continue;
    }
  }

  // 4. Sports years missing from original choice.json + general-knowledge sports metrics
  if (id.startsWith('est_sport_yr_')) {
    const idx = Number(id.replace('est_sport_yr_', ''));
    const hasChoiceAlready = originalChoice.some((q) => q.id === `sport_yr_choice_${idx}`);
    const s = CLEAN_SPORTS_FACTS.find((x) => x.idx === idx);
    if (!hasChoiceAlready && s && s.qYear) {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        String(s.year),
        CLEAN_SPORT_YEARS,
        idx + 2
      );
      auditedChoice.push(makeActiveChoiceRecord(origEst, s.qYear, options, correctAnswerIndex));
      convertedFromEstimationCount++;
      continue;
    }
  }

  if (id.startsWith('est_sport_metric_')) {
    const idx = Number(id.replace('est_sport_metric_', ''));
    const s = CLEAN_SPORTS_FACTS.find((x) => x.idx === idx);
    if (s && s.qMetric && s.metricOpts && s.metricAns) {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        s.metricAns,
        s.metricOpts,
        idx + 3
      );
      auditedChoice.push(makeActiveChoiceRecord(origEst, s.qMetric, options, correctAnswerIndex));
      convertedFromEstimationCount++;
      continue;
    }
  }

  // 5. Tech years missing from original choice.json + general-knowledge science/tech constants
  if (id.startsWith('est_tech_yr_')) {
    const idx = Number(id.replace('est_tech_yr_', ''));
    const hasChoiceAlready = originalChoice.some((q) => q.id === `tech_yr_choice_${idx}`);
    const t = CLEAN_TECH_FACTS.find((x) => x.idx === idx);
    if (!hasChoiceAlready && t && t.qYear) {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        String(t.year),
        CLEAN_TECH_YEARS,
        idx + 2
      );
      auditedChoice.push(makeActiveChoiceRecord(origEst, t.qYear, options, correctAnswerIndex));
      convertedFromEstimationCount++;
      continue;
    }
  }

  if (id.startsWith('est_tech_metric_')) {
    const idx = Number(id.replace('est_tech_metric_', ''));
    const t = CLEAN_TECH_FACTS.find((x) => x.idx === idx);
    if (t && t.qMetric && t.metricOpts && t.metricAns) {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        t.metricAns,
        t.metricOpts,
        idx + 3
      );
      auditedChoice.push(makeActiveChoiceRecord(origEst, t.qMetric, options, correctAnswerIndex));
      convertedFromEstimationCount++;
      continue;
    }
  }

  // 6. Extra domain items whose ch_val was missing in original choice.json
  if (id.includes('_est_val_')) {
    const chValId = id.replace('_est_val_', '_ch_val_');
    const hasChValAlready = originalChoice.some((q) => q.id === chValId);
    const spec = CLEAN_EXTRA_CH_VAL[chValId];
    if (!hasChValAlready && spec) {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        spec.ans,
        spec.opts,
        auditedChoice.length
      );
      auditedChoice.push(makeActiveChoiceRecord(origEst, spec.q, options, correctAnswerIndex));
      convertedFromEstimationCount++;
      continue;
    }
  }

  // All other estimation questions are marked inactive (disabled)
  auditedEstimation.push(makeDisabledRecord(origEst));
}

// ---------------------------------------------------------------------------
// 4. STRICT QUALITY & REGRESSION AUDIT ON ALL ACTIVE QUESTIONS
// ---------------------------------------------------------------------------
const allQuestions = [...auditedChoice, ...auditedEstimation];
const activeQuestions = allQuestions.filter((q) => q.reviewStatus === 'approved' && !q.isDisabled);
const disabledQuestions = allQuestions.filter((q) => q.reviewStatus === 'disabled' || q.isDisabled);

if (allQuestions.length !== 6241) {
  throw new Error(`Totalul înregistrărilor trebuie să rămână 6.241 (actual: ${allQuestions.length})`);
}

const DANGLING_END_WORDS = new Set([
  'al', 'a', 'ai', 'ale', 'in', 'de', 'la', 'pe', 'cu', 'din', 'pentru',
  'si', 'sau', 'catre', 'dupa', 'sub', 'intre', 'prin', 'despre', 'asupra',
  'contra', 'fara', 'pana', 'impotriva', 'domnitorului', 'domnitorul', 'lui',
]);

let validationErrors = 0;

for (const q of activeQuestions) {
  if (q.type !== 'choice') {
    console.error(`[EROARE] Întrebarea activă ${q.id} nu este de tip choice (${q.type}).`);
    validationErrors++;
  }

  const wc = countWords(q.question);
  if (wc < 4 || wc > 15) {
    console.error(`[EROARE] Întrebarea activă ${q.id} are ${wc} cuvinte (permis 4..15): "${q.question}"`);
    validationErrors++;
  }

  if (!q.question.endsWith('?')) {
    console.error(`[EROARE] Întrebarea activă ${q.id} nu se termină cu '?': "${q.question}"`);
    validationErrors++;
  }

  // Check for parenthesized numbers/metadata leaks: (21.2), (#4), (set ...), (seria ...)
  if (
    /\(\d+(?:\.\d+)?\)/.test(q.question) ||
    /\(#\d+\)/.test(q.question) ||
    /\(set\s+/i.test(q.question) ||
    /\(seria\s+/i.test(q.question)
  ) {
    console.error(`[EROARE] Scurgere de metadate/index în întrebarea ${q.id}: "${q.question}"`);
    validationErrors++;
  }

  // Check for dangling prepositions/articles before '?' (not quoted symbols like „Al”?)
  if (!/[”"]\?$/.test(q.question)) {
    const strippedEnd = q.question.replace(/[?')\s]+$/g, '');
    const lastWord = normalizeQuestionText(strippedEnd.split(/\s+/).pop() || '');
    if (DANGLING_END_WORDS.has(lastWord)) {
      console.error(`[EROARE] Enunț trunchiat la final în ${q.id} (ultimul cuvânt: "${lastWord}"): "${q.question}"`);
      validationErrors++;
    }
  }

  // Check 4 options
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    console.error(`[EROARE] Întrebarea ${q.id} nu are 4 variante.`);
    validationErrors++;
    continue;
  }

  const optNorms = q.options.map((o) => normalizeQuestionText(o));
  if (new Set(optNorms).size !== 4) {
    console.error(`[EROARE] Variante duplicate la ${q.id}: ${JSON.stringify(q.options)}`);
    validationErrors++;
  }

  // Check that the correct answer is NOT leaked in the question prompt
  const correctOpt = q.options[q.correctAnswerIndex];
  const normPromptTokens = new Set(normalizeQuestionText(q.question).split(' ').filter(Boolean));
  const normCorrect = normalizeQuestionText(correctOpt);

  if (normCorrect.length >= 2) {
    // Full answer phrase check with word boundaries
    const paddedPrompt = ` ${normalizeQuestionText(q.question)} `;
    if (paddedPrompt.includes(` ${normCorrect} `)) {
      console.error(
        `[EROARE] Răspunsul corect "${correctOpt}" apare direct în enunțul ${q.id}: "${q.question}"`
      );
      validationErrors++;
    }
  }

  // Also check distinctive multi-letter proper name tokens (excluding generic words)
  const GENERIC_TOKENS = new Set([
    'varful', 'muntii', 'masivul', 'raul', 'fluviul', 'lacul', 'marea',
    'limbajul', 'programare', 'primul', 'prima', 'sistemul', 'compania',
    'motorul', 'opera', 'filmul', 'tabloul', 'statul', 'orasul', 'municipiul',
    'judetul', 'regiunea', 'insula', 'republica', 'romania', 'romaniei',
    'romana', 'romaneasca', 'europa', 'america', 'nord', 'sud', 'est', 'vest',
    'mare', 'mica', 'noua', 'veche', 'cel', 'cea', 'cei', 'cele', 'din', 'pentru',
  ]);
  for (const token of normCorrect.split(' ')) {
    if (token.length >= 5 && !GENERIC_TOKENS.has(token) && !/^\d+$/.test(token)) {
      if (normPromptTokens.has(token)) {
        console.error(
          `[EROARE] Cuvânt-cheie din răspuns ("${token}" din "${correctOpt}") scurs în enunțul ${q.id}: "${q.question}"`
        );
        validationErrors++;
      }
    }
  }
}

if (validationErrors > 0) {
  console.error(`Auditul a eșuat cu ${validationErrors} erori.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5. WRITE CANONICAL FILES & MANIFEST
// ---------------------------------------------------------------------------
fs.writeFileSync(
  path.join(questionsDir, 'choice.json'),
  JSON.stringify(auditedChoice, null, 2),
  'utf8'
);

fs.writeFileSync(
  path.join(questionsDir, 'estimation.json'),
  JSON.stringify(auditedEstimation, null, 2),
  'utf8'
);

const activeCategoryBreakdown = {};
const activeDifficultyBreakdown = {};
for (const q of activeQuestions) {
  activeCategoryBreakdown[q.category] = (activeCategoryBreakdown[q.category] || 0) + 1;
  activeDifficultyBreakdown[q.difficulty] = (activeDifficultyBreakdown[q.difficulty] || 0) + 1;
}

const manifest = {
  version: '9.4.0',
  generatedAt: new Date().toISOString(),
  totalQuestions: allQuestions.length,
  approvedCount: activeQuestions.length,
  disabledCount: disabledQuestions.length,
  convertedFromEstimationCount,
  draftCount: 0,
  rejectedCount: 0,
  activeChoiceCount: activeQuestions.length,
  activeEstimationCount: 0,
  choiceFileCount: auditedChoice.length,
  estimationFileCount: auditedEstimation.length,
  archiveFile: 'data/questions/archive_v91_original.json',
  duplicateIds: 0,
  duplicateActiveTexts: 0,
  activeCategoryBreakdown,
  activeDifficultyBreakdown,
};

fs.writeFileSync(
  path.join(questionsDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf8'
);

const exampleDbPath = path.join(process.cwd(), 'data', 'conquiz_db.example.json');
const exampleDb = {
  users: {},
  questions: allQuestions,
  games: [],
  friends: [],
  notifications: [],
};
fs.writeFileSync(exampleDbPath, JSON.stringify(exampleDb, null, 2), 'utf8');

console.log('Canonical V9.4 audited question bank generated & validated successfully:');
console.log(JSON.stringify(manifest, null, 2));
