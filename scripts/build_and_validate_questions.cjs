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

// ---------------------------------------------------------------------------
// 1. VERIFIED FACTUAL DATASETS FOR DETERMINISTIC ENCYCLOPEDIC GENERATION
// ---------------------------------------------------------------------------

// A. Romanian Counties (41 counties + București) - Verified ISO code, seat, region, area (km²), population (2021 census approx), highest peak/altitude or river
const RO_COUNTIES = [
  { county: 'Alba', seat: 'Alba Iulia', code: 'AB', region: 'Transilvania', area: 6242, pop: 325941, river: 'Mureș', zip: 510000 },
  { county: 'Arad', seat: 'Arad', code: 'AR', region: 'Crișana', area: 7754, pop: 410143, river: 'Mureș', zip: 310000 },
  { county: 'Argeș', seat: 'Pitești', code: 'AG', region: 'Muntenia', area: 6826, pop: 569932, river: 'Argeș', zip: 110000 },
  { county: 'Bacău', seat: 'Bacău', code: 'BC', region: 'Moldova', area: 6621, pop: 601387, river: 'Bistrița', zip: 600000 },
  { county: 'Bihor', seat: 'Oradea', code: 'BH', region: 'Crișana', area: 7544, pop: 551297, river: 'Crișul Repede', zip: 410000 },
  { county: 'Bistrița-Năsăud', seat: 'Bistrița', code: 'BN', region: 'Transilvania', area: 5355, pop: 295988, river: 'Bistrița Ardeleană', zip: 420000 },
  { county: 'Botoșani', seat: 'Botoșani', code: 'BT', region: 'Moldova', area: 4986, pop: 392821, river: 'Prut', zip: 710000 },
  { county: 'Brașov', seat: 'Brașov', code: 'BV', region: 'Transilvania', area: 5363, pop: 546615, river: 'Olt', zip: 500000 },
  { county: 'Brăila', seat: 'Brăila', code: 'BR', region: 'Muntenia', area: 4766, pop: 281452, river: 'Dunărea', zip: 810000 },
  { county: 'Buzău', seat: 'Buzău', code: 'BZ', region: 'Muntenia', area: 6103, pop: 404979, river: 'Buzău', zip: 120000 },
  { county: 'Caraș-Severin', seat: 'Reșița', code: 'CS', region: 'Banat', area: 8520, pop: 246588, river: 'Bârzava', zip: 320000 },
  { county: 'Călărași', seat: 'Călărași', code: 'CL', region: 'Muntenia', area: 5088, pop: 283458, river: 'Borcea', zip: 910000 },
  { county: 'Cluj', seat: 'Cluj-Napoca', code: 'CJ', region: 'Transilvania', area: 6674, pop: 679141, river: 'Someșul Mic', zip: 400000 },
  { county: 'Constanța', seat: 'Constanța', code: 'CT', region: 'Dobrogea', area: 7071, pop: 655997, river: 'Dunărea', zip: 900000 },
  { county: 'Covasna', seat: 'Sfântu Gheorghe', code: 'CV', region: 'Transilvania', area: 3710, pop: 200042, river: 'Olt', zip: 520000 },
  { county: 'Dâmbovița', seat: 'Târgoviște', code: 'DB', region: 'Muntenia', area: 4054, pop: 479404, river: 'Ialomița', zip: 130000 },
  { county: 'Dolj', seat: 'Craiova', code: 'DJ', region: 'Oltenia', area: 7414, pop: 599442, river: 'Jiu', zip: 200000 },
  { county: 'Galați', seat: 'Galați', code: 'GL', region: 'Moldova', area: 4466, pop: 496892, river: 'Dunărea', zip: 800000 },
  { county: 'Giurgiu', seat: 'Giurgiu', code: 'GR', region: 'Muntenia', area: 3526, pop: 262066, river: 'Dunărea', zip: 83700 },
  { county: 'Gorj', seat: 'Târgu Jiu', code: 'GJ', region: 'Oltenia', area: 5602, pop: 314685, river: 'Jiu', zip: 210000 },
  { county: 'Harghita', seat: 'Miercurea Ciuc', code: 'HR', region: 'Transilvania', area: 6639, pop: 291950, river: 'Olt', zip: 530000 },
  { county: 'Hunedoara', seat: 'Deva', code: 'HD', region: 'Transilvania', area: 7063, pop: 361657, river: 'Mureș', zip: 330000 },
  { county: 'Ialomița', seat: 'Slobozia', code: 'IL', region: 'Muntenia', area: 4453, pop: 250816, river: 'Ialomița', zip: 920000 },
  { county: 'Iași', seat: 'Iași', code: 'IS', region: 'Moldova', area: 5476, pop: 760774, river: 'Bahlui', zip: 700000 },
  { county: 'Ilfov', seat: 'Buftea', code: 'IF', region: 'Muntenia', area: 1583, pop: 542704, river: 'Colentina', zip: 77000 },
  { county: 'Maramureș', seat: 'Baia Mare', code: 'MM', region: 'Maramureș', area: 6304, pop: 452475, river: 'Săsar', zip: 430000 },
  { county: 'Mehedinți', seat: 'Drobeta-Turnu Severin', code: 'MH', region: 'Oltenia', area: 4933, pop: 234339, river: 'Dunărea', zip: 220000 },
  { county: 'Mureș', seat: 'Târgu Mureș', code: 'MS', region: 'Transilvania', area: 6714, pop: 518193, river: 'Mureș', zip: 540000 },
  { county: 'Neamț', seat: 'Piatra Neamț', code: 'NT', region: 'Moldova', area: 5896, pop: 454203, river: 'Bistrița', zip: 610000 },
  { county: 'Olt', seat: 'Slatina', code: 'OT', region: 'Oltenia', area: 5498, pop: 383280, river: 'Olt', zip: 230000 },
  { county: 'Prahova', seat: 'Ploiești', code: 'PH', region: 'Muntenia', area: 4716, pop: 695119, river: 'Prahova', zip: 100000 },
  { county: 'Satu Mare', seat: 'Satu Mare', code: 'SM', region: 'Maramureș', area: 4418, pop: 330668, river: 'Someș', zip: 440000 },
  { county: 'Sălaj', seat: 'Zalău', code: 'SJ', region: 'Transilvania', area: 3864, pop: 212224, river: 'Zalău', zip: 450000 },
  { county: 'Sibiu', seat: 'Sibiu', code: 'SB', region: 'Transilvania', area: 5432, pop: 388326, river: 'Cibin', zip: 550000 },
  { county: 'Suceava', seat: 'Suceava', code: 'SV', region: 'Bucovina', area: 8553, pop: 642551, river: 'Suceava', zip: 720000 },
  { county: 'Teleorman', seat: 'Alexandria', code: 'TR', region: 'Muntenia', area: 5790, pop: 323544, river: 'Vedea', zip: 140000 },
  { county: 'Timiș', seat: 'Timișoara', code: 'TM', region: 'Banat', area: 8697, pop: 650533, river: 'Bega', zip: 300000 },
  { county: 'Tulcea', seat: 'Tulcea', code: 'TL', region: 'Dobrogea', area: 8499, pop: 193355, river: 'Dunărea', zip: 820000 },
  { county: 'Vaslui', seat: 'Vaslui', code: 'VS', region: 'Moldova', area: 5318, pop: 374700, river: 'Bârlad', zip: 730000 },
  { county: 'Vâlcea', seat: 'Râmnicu Vâlcea', code: 'VL', region: 'Oltenia', area: 5765, pop: 341861, river: 'Olt', zip: 240000 },
  { county: 'Vrancea', seat: 'Focșani', code: 'VN', region: 'Moldova', area: 4857, pop: 335312, river: 'Milcov', zip: 620000 },
];

// B. World & European Countries - Verified Capital, Continent, Area (km²), Independence/Key Year, Currency, Calling Code
const WORLD_COUNTRIES = [
  { country: 'România', capital: 'București', continent: 'Europa', area: 238397, currency: 'Leu românesc', callCode: 40, unYear: 1955 },
  { country: 'Franța', capital: 'Paris', continent: 'Europa', area: 551695, currency: 'Euro', callCode: 33, unYear: 1945 },
  { country: 'Germania', capital: 'Berlin', continent: 'Europa', area: 357022, currency: 'Euro', callCode: 49, unYear: 1973 },
  { country: 'Italia', capital: 'Roma', continent: 'Europa', area: 301340, currency: 'Euro', callCode: 39, unYear: 1955 },
  { country: 'Spania', capital: 'Madrid', continent: 'Europa', area: 505992, currency: 'Euro', callCode: 34, unYear: 1955 },
  { country: 'Portugalia', capital: 'Lisabona', continent: 'Europa', area: 92090, currency: 'Euro', callCode: 351, unYear: 1955 },
  { country: 'Grecia', capital: 'Atena', continent: 'Europa', area: 131957, currency: 'Euro', callCode: 30, unYear: 1945 },
  { country: 'Austria', capital: 'Viena', continent: 'Europa', area: 83871, currency: 'Euro', callCode: 43, unYear: 1955 },
  { country: 'Elveția', capital: 'Berna', continent: 'Europa', area: 41285, currency: 'Franc elvețian', callCode: 41, unYear: 2002 },
  { country: 'Olanda', capital: 'Amsterdam', continent: 'Europa', area: 41850, currency: 'Euro', callCode: 31, unYear: 1945 },
  { country: 'Belgia', capital: 'Bruxelles', continent: 'Europa', area: 30528, currency: 'Euro', callCode: 32, unYear: 1945 },
  { country: 'Polonia', capital: 'Varșovia', continent: 'Europa', area: 312696, currency: 'Zlot polonez', callCode: 48, unYear: 1945 },
  { country: 'Cehia', capital: 'Praga', continent: 'Europa', area: 78866, currency: 'Coroană cehă', callCode: 420, unYear: 1993 },
  { country: 'Slovacia', capital: 'Bratislava', continent: 'Europa', area: 49035, currency: 'Euro', callCode: 421, unYear: 1993 },
  { country: 'Ungaria', capital: 'Budapesta', continent: 'Europa', area: 93028, currency: 'Forint maghiar', callCode: 36, unYear: 1955 },
  { country: 'Bulgaria', capital: 'Sofia', continent: 'Europa', area: 110879, currency: 'Leva bulgărească', callCode: 359, unYear: 1955 },
  { country: 'Serbia', capital: 'Belgrad', continent: 'Europa', area: 88361, currency: 'Dinar sârbesc', callCode: 381, unYear: 2000 },
  { country: 'Croația', capital: 'Zagreb', continent: 'Europa', area: 56594, currency: 'Euro', callCode: 385, unYear: 1992 },
  { country: 'Slovenia', capital: 'Ljubljana', continent: 'Europa', area: 20273, currency: 'Euro', callCode: 386, unYear: 1992 },
  { country: 'Republica Moldova', capital: 'Chișinău', continent: 'Europa', area: 33846, currency: 'Leu moldovenesc', callCode: 373, unYear: 1992 },
  { country: 'Ucraina', capital: 'Kiev', continent: 'Europa', area: 603550, currency: 'Grivnă ucraineană', callCode: 380, unYear: 1945 },
  { country: 'Suedia', capital: 'Stockholm', continent: 'Europa', area: 450295, currency: 'Coroană suedeză', callCode: 46, unYear: 1946 },
  { country: 'Norvegia', capital: 'Oslo', continent: 'Europa', area: 385207, currency: 'Coroană norvegiană', callCode: 47, unYear: 1945 },
  { country: 'Finlanda', capital: 'Helsinki', continent: 'Europa', area: 338424, currency: 'Euro', callCode: 358, unYear: 1955 },
  { country: 'Danemarca', capital: 'Copenhaga', continent: 'Europa', area: 42933, currency: 'Coroană daneză', callCode: 45, unYear: 1945 },
  { country: 'Irlanda', capital: 'Dublin', continent: 'Europa', area: 70273, currency: 'Euro', callCode: 353, unYear: 1955 },
  { country: 'Islanda', capital: 'Reykjavik', continent: 'Europa', area: 103000, currency: 'Coroană islandeză', callCode: 354, unYear: 1946 },
  { country: 'Regatul Unit', capital: 'Londra', continent: 'Europa', area: 242495, currency: 'Liră sterlină', callCode: 44, unYear: 1945 },
  { country: 'Turcia', capital: 'Ankara', continent: 'Asia', area: 783562, currency: 'Liră turcească', callCode: 90, unYear: 1945 },
  { country: 'Japonia', capital: 'Tokyo', continent: 'Asia', area: 377975, currency: 'Yen japonez', callCode: 81, unYear: 1956 },
  { country: 'Coreea de Sud', capital: 'Seul', continent: 'Asia', area: 100210, currency: 'Won sud-coreean', callCode: 82, unYear: 1991 },
  { country: 'China', capital: 'Beijing', continent: 'Asia', area: 9596961, currency: 'Yuan chinezesc', callCode: 86, unYear: 1945 },
  { country: 'India', capital: 'New Delhi', continent: 'Asia', area: 3287263, currency: 'Rupie indiană', callCode: 91, unYear: 1945 },
  { country: 'Thailanda', capital: 'Bangkok', continent: 'Asia', area: 513120, currency: 'Baht thailandez', callCode: 66, unYear: 1946 },
  { country: 'Vietnam', capital: 'Hanoi', continent: 'Asia', area: 331212, currency: 'Dong vietnamez', callCode: 84, unYear: 1977 },
  { country: 'Indonezia', capital: 'Jakarta', continent: 'Asia', area: 1904569, currency: 'Rupie indoneziană', callCode: 62, unYear: 1950 },
  { country: 'Filipine', capital: 'Manila', continent: 'Asia', area: 300000, currency: 'Peso filipinez', callCode: 63, unYear: 1945 },
  { country: 'Egipt', capital: 'Cairo', continent: 'Africa', area: 1002450, currency: 'Liră egipteană', callCode: 20, unYear: 1945 },
  { country: 'Maroc', capital: 'Rabat', continent: 'Africa', area: 446550, currency: 'Dirham marocan', callCode: 212, unYear: 1956 },
  { country: 'Kenya', capital: 'Nairobi', continent: 'Africa', area: 580367, currency: 'Șiling kenyan', callCode: 254, unYear: 1963 },
  { country: 'Nigeria', capital: 'Abuja', continent: 'Africa', area: 923768, currency: 'Naira nigeriană', callCode: 234, unYear: 1960 },
  { country: 'Canada', capital: 'Ottawa', continent: 'America de Nord', area: 9984670, currency: 'Dolar canadian', callCode: 1, unYear: 1945 },
  { country: 'Statele Unite ale Americii', capital: 'Washington D.C.', continent: 'America de Nord', area: 9833520, currency: 'Dolar american', callCode: 1, unYear: 1945 },
  { country: 'Mexic', capital: 'Ciudad de Mexico', continent: 'America de Nord', area: 1964375, currency: 'Peso mexican', callCode: 52, unYear: 1945 },
  { country: 'Brazilia', capital: 'Brasilia', continent: 'America de Sud', area: 8515767, currency: 'Real brazilian', callCode: 55, unYear: 1945 },
  { country: 'Argentina', capital: 'Buenos Aires', continent: 'America de Sud', area: 2780400, currency: 'Peso argentinian', callCode: 54, unYear: 1945 },
  { country: 'Chile', capital: 'Santiago', continent: 'America de Sud', area: 756102, currency: 'Peso chilian', callCode: 56, unYear: 1945 },
  { country: 'Peru', capital: 'Lima', continent: 'America de Sud', area: 1285216, currency: 'Sol peruan', callCode: 51, unYear: 1945 },
  { country: 'Columbia', capital: 'Bogota', continent: 'America de Sud', area: 1141748, currency: 'Peso columbian', callCode: 57, unYear: 1945 },
  { country: 'Australia', capital: 'Canberra', continent: 'Oceania', area: 7692024, currency: 'Dolar australian', callCode: 61, unYear: 1945 },
  { country: 'Noua Zeelandă', capital: 'Wellington', continent: 'Oceania', area: 268021, currency: 'Dolar neozeelandez', callCode: 64, unYear: 1945 },
  { country: 'Albania', capital: 'Tirana', continent: 'Europa', area: 28748, currency: 'Lek albanez', callCode: 355, unYear: 1955 },
  { country: 'Macedonia de Nord', capital: 'Skopje', continent: 'Europa', area: 25713, currency: 'Denar macedonean', callCode: 389, unYear: 1993 },
  { country: 'Muntenegru', capital: 'Podgorica', continent: 'Europa', area: 13812, currency: 'Euro', callCode: 382, unYear: 2006 },
  { country: 'Bosnia și Herțegovina', capital: 'Sarajevo', continent: 'Europa', area: 51197, currency: 'Marcă convertibilă', callCode: 387, unYear: 1992 },
  { country: 'Estonia', capital: 'Tallinn', continent: 'Europa', area: 45227, currency: 'Euro', callCode: 372, unYear: 1991 },
  { country: 'Letonia', capital: 'Riga', continent: 'Europa', area: 64589, currency: 'Euro', callCode: 371, unYear: 1991 },
  { country: 'Lituania', capital: 'Vilnius', continent: 'Europa', area: 65300, currency: 'Euro', callCode: 370, unYear: 1991 },
  { country: 'Luxemburg', capital: 'Luxemburg', continent: 'Europa', area: 2586, currency: 'Euro', callCode: 352, unYear: 1945 },
  { country: 'Cipru', capital: 'Nicosia', continent: 'Europa', area: 9251, currency: 'Euro', callCode: 357, unYear: 1960 },
];

// C. Chemical Elements (Periodic Table - Verified Z, Symbol, Romanian Name, Group/Category, Discovery Year or Mass)
const CHEMICAL_ELEMENTS = [
  { z: 1, sym: 'H', name: 'Hidrogen', mass: 1, group: 'Nemetale', boilC: -253 },
  { z: 2, sym: 'He', name: 'Heliu', mass: 4, group: 'Gaze nobile', boilC: -269 },
  { z: 3, sym: 'Li', name: 'Litiu', mass: 7, group: 'Metale alcaline', boilC: 1342 },
  { z: 4, sym: 'Be', name: 'Beriliu', mass: 9, group: 'Metale alcalino-pământoase', boilC: 2469 },
  { z: 5, sym: 'B', name: 'Bor', mass: 11, group: 'Metaloizi', boilC: 4000 },
  { z: 6, sym: 'C', name: 'Carbon', mass: 12, group: 'Nemetale', boilC: 4827 },
  { z: 7, sym: 'N', name: 'Azot', mass: 14, group: 'Nemetale', boilC: -196 },
  { z: 8, sym: 'O', name: 'Oxigen', mass: 16, group: 'Nemetale', boilC: -183 },
  { z: 9, sym: 'F', name: 'Fluor', mass: 19, group: 'Halogeni', boilC: -188 },
  { z: 10, sym: 'Ne', name: 'Neon', mass: 20, group: 'Gaze nobile', boilC: -246 },
  { z: 11, sym: 'Na', name: 'Sodiu', mass: 23, group: 'Metale alcaline', boilC: 883 },
  { z: 12, sym: 'Mg', name: 'Magneziu', mass: 24, group: 'Metale alcalino-pământoase', boilC: 1091 },
  { z: 13, sym: 'Al', name: 'Aluminiu', mass: 27, group: 'Metale de post-tranziție', boilC: 2470 },
  { z: 14, sym: 'Si', name: 'Siliciu', mass: 28, group: 'Metaloizi', boilC: 3265 },
  { z: 15, sym: 'P', name: 'Fosfor', mass: 31, group: 'Nemetale', boilC: 280 },
  { z: 16, sym: 'S', name: 'Sulf', mass: 32, group: 'Nemetale', boilC: 445 },
  { z: 17, sym: 'Cl', name: 'Clor', mass: 35, group: 'Halogeni', boilC: -34 },
  { z: 18, sym: 'Ar', name: 'Argon', mass: 40, group: 'Gaze nobile', boilC: -186 },
  { z: 19, sym: 'K', name: 'Potasiu', mass: 39, group: 'Metale alcaline', boilC: 759 },
  { z: 20, sym: 'Ca', name: 'Calciu', mass: 40, group: 'Metale alcalino-pământoase', boilC: 1484 },
  { z: 22, sym: 'Ti', name: 'Titan', mass: 48, group: 'Metale de tranziție', boilC: 3287 },
  { z: 24, sym: 'Cr', name: 'Crom', mass: 52, group: 'Metale de tranziție', boilC: 2671 },
  { z: 25, sym: 'Mn', name: 'Mangan', mass: 55, group: 'Metale de tranziție', boilC: 2061 },
  { z: 26, sym: 'Fe', name: 'Fier', mass: 56, group: 'Metale de tranziție', boilC: 2862 },
  { z: 27, sym: 'Co', name: 'Cobalt', mass: 59, group: 'Metale de tranziție', boilC: 2927 },
  { z: 28, sym: 'Ni', name: 'Nichel', mass: 59, group: 'Metale de tranziție', boilC: 2732 },
  { z: 29, sym: 'Cu', name: 'Cupru', mass: 64, group: 'Metale de tranziție', boilC: 2562 },
  { z: 30, sym: 'Zn', name: 'Zinc', mass: 65, group: 'Metale de tranziție', boilC: 907 },
  { z: 35, sym: 'Br', name: 'Brom', mass: 80, group: 'Halogeni', boilC: 59 },
  { z: 36, sym: 'Kr', name: 'Kripton', mass: 84, group: 'Gaze nobile', boilC: -153 },
  { z: 47, sym: 'Ag', name: 'Argint', mass: 108, group: 'Metale de tranziție', boilC: 2162 },
  { z: 50, sym: 'Sn', name: 'Staniu', mass: 119, group: 'Metale de post-tranziție', boilC: 2602 },
  { z: 53, sym: 'I', name: 'Iod', mass: 127, group: 'Halogeni', boilC: 184 },
  { z: 54, sym: 'Xe', name: 'Xenon', mass: 131, group: 'Gaze nobile', boilC: -108 },
  { z: 74, sym: 'W', name: 'Wolfram', mass: 184, group: 'Metale de tranziție', boilC: 5555 },
  { z: 78, sym: 'Pt', name: 'Platină', mass: 195, group: 'Metale de tranziție', boilC: 3825 },
  { z: 79, sym: 'Au', name: 'Aur', mass: 197, group: 'Metale de tranziție', boilC: 2856 },
  { z: 80, sym: 'Hg', name: 'Mercur', mass: 201, group: 'Metale de tranziție', boilC: 357 },
  { z: 82, sym: 'Pb', name: 'Plumb', mass: 207, group: 'Metale de post-tranziție', boilC: 1749 },
  { z: 92, sym: 'U', name: 'Uraniu', mass: 238, group: 'Actinide', boilC: 4131 },
];

// D. Historical Events (Romanian & Universal History) - Verified Event, Year, Key Leader/Location, Category
const HISTORY_EVENTS = [
  { event: 'Bătălia de la Posada, în care Basarab I îl învinge pe Carol Robert de Anjou', year: 1330, leader: 'Basarab I', place: 'Posada', region: 'Țara Românească' },
  { event: 'Urcarea pe tronul Moldovei a domnitorului Ștefan cel Mare', year: 1457, leader: 'Ștefan cel Mare', place: 'Suceava', region: 'Moldova' },
  { event: 'Bătălia de la Baia, în care Ștefan cel Mare îl înfruntă pe Matei Corvin', year: 1467, leader: 'Ștefan cel Mare', place: 'Baia', region: 'Moldova' },
  { event: 'Bătălia de la Vaslui (Podul Înalt), câștigată de Ștefan cel Mare împotriva oștirii otomane', year: 1475, leader: 'Ștefan cel Mare', place: 'Vaslui', region: 'Moldova' },
  { event: 'Bătălia de la Războieni (Valea Albă) purtată de Ștefan cel Mare împotriva sultanului Mahomed al II-lea', year: 1476, leader: 'Ștefan cel Mare', place: 'Războieni', region: 'Moldova' },
  { event: 'Ctitorirea Mănăstirii Putna de către domnitorul Ștefan cel Mare', year: 1466, leader: 'Ștefan cel Mare', place: 'Putna', region: 'Bucovina' },
  { event: 'Ctitorirea Mănăstirii Voroneț de către Ștefan cel Mare', year: 1488, leader: 'Ștefan cel Mare', place: 'Voroneț', region: 'Bucovina' },
  { event: 'Bătălia din Codrii Cosminului, în care Ștefan cel Mare îl învinge pe regele Ioan Albert al Poloniei', year: 1497, leader: 'Ștefan cel Mare', place: 'Codrii Cosminului', region: 'Moldova' },
  { event: 'Urcarea lui Mircea cel Bătrân pe tronul Țării Românești', year: 1386, leader: 'Mircea cel Bătrân', place: 'Curtea de Argeș', region: 'Țara Românească' },
  { event: 'Bătălia de la Rovine, purtată de Mircea cel Bătrân împotriva lui Baiazid I', year: 1395, leader: 'Mircea cel Bătrân', place: 'Rovine', region: 'Țara Românească' },
  { event: 'Atacul de noapte de la Târgoviște condus de Vlad Țepeș împotriva sultanului Mahomed al II-lea', year: 1462, leader: 'Vlad Țepeș', place: 'Târgoviște', region: 'Țara Românească' },
  { event: 'Prima atestare documentară a cetății București într-un hrisov emis de Vlad Țepeș', year: 1459, leader: 'Vlad Țepeș', place: 'București', region: 'Muntenia' },
  { event: 'Bătălia de la Călugăreni, condusă de Mihai Viteazul împotriva lui Sinan Pașa', year: 1595, leader: 'Mihai Viteazul', place: 'Călugăreni', region: 'Muntenia' },
  { event: 'Bătălia de la Șelimbăr, câștigată de Mihai Viteazul în drumul spre Alba Iulia', year: 1599, leader: 'Mihai Viteazul', place: 'Șelimbăr', region: 'Transilvania' },
  { event: 'Prima unire politică a Țării Românești, Transilvaniei și Moldovei sub Mihai Viteazul', year: 1600, leader: 'Mihai Viteazul', place: 'Iași', region: 'România' },
  { event: 'Începutul domniei lui Constantin Brâncoveanu în Țara Românească', year: 1688, leader: 'Constantin Brâncoveanu', place: 'București', region: 'Țara Românească' },
  { event: 'Martiriul domnitorului Constantin Brâncoveanu și al celor patru fii ai săi la Constantinopol', year: 1714, leader: 'Constantin Brâncoveanu', place: 'Constantinopol', region: 'Imperiul Otoman' },
  { event: 'Bătălia de la Stănilești pe Prut, la care a participat Dimitrie Cantemir alături de Petru cel Mare', year: 1711, leader: 'Dimitrie Cantemir', place: 'Stănilești', region: 'Moldova' },
  { event: 'Răscoala din Transilvania condusă de Horea, Cloșca și Crișan', year: 1784, leader: 'Horea', place: 'Câmpeni', region: 'Transilvania' },
  { event: 'Revoluția condusă de Tudor Vladimirescu în Țara Românească', year: 1821, leader: 'Tudor Vladimirescu', place: 'Padeș', region: 'Oltenia' },
  { event: 'Adunarea Națională de la Blaj pe Câmpia Libertății în timpul Revoluției pașoptiste', year: 1848, leader: 'Avram Iancu', place: 'Blaj', region: 'Transilvania' },
  { event: 'Mica Unire a Principatelor Române prin dubla alegere a lui Alexandru Ioan Cuza', year: 1859, leader: 'Alexandru Ioan Cuza', place: 'București', region: 'Principatele Unite' },
  { event: 'Înființarea Universității din Iași de către domnitorul Alexandru Ioan Cuza', year: 1860, leader: 'Alexandru Ioan Cuza', place: 'Iași', region: 'Moldova' },
  { event: 'Înființarea Universității din București prin decretul lui Alexandru Ioan Cuza', year: 1864, leader: 'Alexandru Ioan Cuza', place: 'București', region: 'Muntenia' },
  { event: 'Sosirea în România și proclamarea principelui Carol de Hohenzollern-Sigmaringen ca domnitor (Carol I)', year: 1866, leader: 'Carol I', place: 'București', region: 'România' },
  { event: 'Proclamarea Independenței de Stat a României în Parlament de către Mihail Kogălniceanu', year: 1877, leader: 'Mihail Kogălniceanu', place: 'București', region: 'România' },
  { event: 'Proclamarea României ca Regat și încoronarea lui Carol I ca prim rege al României', year: 1881, leader: 'Carol I', place: 'București', region: 'România' },
  { event: 'Inaugurarea Podului Regele Carol I de la Cernavodă, proiectat de inginerul Anghel Saligny', year: 1895, leader: 'Anghel Saligny', place: 'Cernavodă', region: 'Dobrogea' },
  { event: 'Intrarea României în Primul Război Mondial de partea Antantei', year: 1916, leader: 'Ferdinand I', place: 'București', region: 'România' },
  { event: 'Marile bătălii de apărare de la Mărăști, Mărășești și Oituz', year: 1917, leader: 'Eremia Grigorescu', place: 'Mărășești', region: 'Moldova' },
  { event: 'Marea Adunare Națională de la Alba Iulia și înfăptuirea Marii Uniri', year: 1918, leader: 'Ferdinand I', place: 'Alba Iulia', region: 'Transilvania' },
  { event: 'Încoronarea Regelui Ferdinand I și a Reginei Maria la Alba Iulia ca suverani ai României Mari', year: 1922, leader: 'Ferdinand I', place: 'Alba Iulia', region: 'Transilvania' },
  { event: 'Adoptarea Constituției României interbelice sub domnia Regelui Ferdinand I', year: 1923, leader: 'Ion I. C. Brătianu', place: 'București', region: 'România' },
  { event: 'Revoluția Română anticomunistă începută la Timișoara și continuată la București', year: 1989, leader: 'Poporul Român', place: 'Timișoara', region: 'România' },
  { event: 'Aderarea oficială a României la Alianța Nord-Atlantică (NATO)', year: 2004, leader: 'România', place: 'Bruxelles', region: 'Europa' },
  { event: 'Aderarea oficială a României la Uniunea Europeană', year: 2007, leader: 'România', place: 'București', region: 'Europa' },
  { event: 'Căderea Constantinopolului sub asediul sultanului otoman Mahomed al II-lea', year: 1453, leader: 'Mahomed al II-lea', place: 'Constantinopol', region: 'Imperiul Bizantin' },
  { event: 'Debarcarea lui Cristofor Columb în Lumea Nouă (America)', year: 1492, leader: 'Cristofor Columb', place: 'San Salvador', region: 'Caraibe' },
  { event: 'Publicarea celor 95 de teze de către Martin Luther la Wittenberg (Reforma Protestantă)', year: 1517, leader: 'Martin Luther', place: 'Wittenberg', region: 'Germania' },
  { event: 'Semnarea Păcii de la Westfalia care a pus capăt Războiului de Treizeci de Ani', year: 1648, leader: 'Puterile Europene', place: 'Münster', region: 'Europa' },
  { event: 'Adoptarea Declarației de Independență a Statelor Unite ale Americii', year: 1776, leader: 'Thomas Jefferson', place: 'Philadelphia', region: 'America de Nord' },
  { event: 'Căderea Bastiliei și izbucnirea Revoluției Franceze', year: 1789, leader: 'Poporul Francez', place: 'Paris', region: 'Franța' },
  { event: 'Încoronarea lui Napoleon Bonaparte ca Împărat al francezilor', year: 1804, leader: 'Napoleon Bonaparte', place: 'Paris', region: 'Franța' },
  { event: 'Bătălia de la Waterloo, ultima bătălie a lui Napoleon Bonaparte', year: 1815, leader: 'Ducele de Wellington', place: 'Waterloo', region: 'Belgia' },
  { event: 'Deschiderea oficială a Canalului Suez pentru navigația maritimă internațională', year: 1869, leader: 'Ferdinand de Lesseps', place: 'Suez', region: 'Egipt' },
  { event: 'Izbucnirea Primului Război Mondial după atentatul de la Sarajevo', year: 1914, leader: 'Puterile Centrale și Antanta', place: 'Sarajevo', region: 'Europa' },
  { event: 'Semnarea Tratatului de Pace de la Versailles după Primul Război Mondial', year: 1919, leader: 'Aliații', place: 'Versailles', region: 'Franța' },
  { event: 'Izbucnirea celui de-Al Doilea Război Mondial prin invadarea Poloniei', year: 1939, leader: 'Aliații', place: 'Varșovia', region: 'Europa' },
  { event: 'Debarcarea aliaților în Normandia (Ziua Z / Operation Overlord)', year: 1944, leader: 'Dwight D. Eisenhower', place: 'Normandia', region: 'Franța' },
  { event: 'Încheierea celui de-Al Doilea Război Mondial și fondarea Organizației Națiunilor Unite', year: 1945, leader: 'Națiunile Unite', place: 'San Francisco', region: 'SUA' },
  { event: 'Semnarea Tratatului de la Roma prin care s-a instituit Comunitatea Economică Europeană', year: 1957, leader: 'Statele Fondatoare', place: 'Roma', region: 'Italia' },
  { event: 'Primul zbor al omului în spațiul cosmic realizat de cosmonautul Iuri Gagarin', year: 1961, leader: 'Iuri Gagarin', place: 'Baikonur', region: 'Spațiul Cosmic' },
  { event: 'Prima aselenizare a omului pe Lună în cadrul misiunii Apollo 11', year: 1969, leader: 'Neil Armstrong', place: 'Marea Liniștii', region: 'Luna' },
  { event: 'Zborul cosmic al lui Dumitru Prunariu, primul și singurul cosmonaut român, la bordul Soiuz 40', year: 1981, leader: 'Dumitru Prunariu', place: 'Baikonur', region: 'Spațiul Cosmic' },
  { event: 'Căderea Zidului Berlinului, simbol al sfârșitului Războiului Rece în Europa', year: 1989, leader: 'Germania', place: 'Berlin', region: 'Germania' },
  { event: 'Semnarea Tratatului de la Maastricht privind constituirea Uniunii Europene', year: 1992, leader: 'Uniunea Europeană', place: 'Maastricht', region: 'Olanda' },
];

// E. Literature, Art, Music & Cinema Works - Verified Title, Creator, Year, Genre/Medium
const CULTURAL_WORKS = [
  { title: 'Luceafărul', author: 'Mihai Eminescu', year: 1883, kind: 'poem filosofic', cat: 'literatura' },
  { title: 'O scrisoare pierdută', author: 'Ion Luca Caragiale', year: 1884, kind: 'comedie dramatică', cat: 'literatura' },
  { title: 'Amintiri din copilărie', author: 'Ion Creangă', year: 1892, kind: 'operă memorialistică', cat: 'literatura' },
  { title: 'Moara cu noroc', author: 'Ioan Slavici', year: 1881, kind: 'nuvelă psihologică', cat: 'literatura' },
  { title: 'Mara', author: 'Ioan Slavici', year: 1894, kind: 'roman realist', cat: 'literatura' },
  { title: 'Ion', author: 'Liviu Rebreanu', year: 1920, kind: 'roman realist interbelic', cat: 'literatura' },
  { title: 'Pădurea spânzuraților', author: 'Liviu Rebreanu', year: 1922, kind: 'roman psihologic', cat: 'literatura' },
  { title: 'Răscoala', author: 'Liviu Rebreanu', year: 1932, kind: 'roman social', cat: 'literatura' },
  { title: 'Baltagul', author: 'Mihail Sadoveanu', year: 1930, kind: 'roman tradițional', cat: 'literatura' },
  { title: 'Hanu Ancuței', author: 'Mihail Sadoveanu', year: 1928, kind: 'volum de povestiri', cat: 'literatura' },
  { title: 'Ultima noapte de dragoste, întâia noapte de război', author: 'Camil Petrescu', year: 1930, kind: 'roman subiectiv', cat: 'literatura' },
  { title: 'Patul lui Procust', author: 'Camil Petrescu', year: 1933, kind: 'roman modern', cat: 'literatura' },
  { title: 'Maitreyi', author: 'Mircea Eliade', year: 1933, kind: 'roman al experienței', cat: 'literatura' },
  { title: 'Enigma Otiliei', author: 'George Călinescu', year: 1938, kind: 'roman balzacian', cat: 'literatura' },
  { title: 'Moromeții (Volumul I)', author: 'Marin Preda', year: 1955, kind: 'roman postbelic', cat: 'literatura' },
  { title: 'Cel mai iubit dintre pământeni', author: 'Marin Preda', year: 1980, kind: 'roman total', cat: 'literatura' },
  { title: 'Plumb', author: 'George Bacovia', year: 1916, kind: 'volum de poezii simboliste', cat: 'literatura' },
  { title: 'Cuvinte potrivite', author: 'Tudor Arghezi', year: 1927, kind: 'volum de debut poetic', cat: 'literatura' },
  { title: 'Poemele luminii', author: 'Lucian Blaga', year: 1919, kind: 'volum de versuri', cat: 'literatura' },
  { title: 'Joc secund', author: 'Ion Barbu', year: 1930, kind: 'volum de poezie modernistă', cat: 'literatura' },
  { title: 'Cântăreața cheală', author: 'Eugen Ionescu', year: 1950, kind: 'piesă a teatrului absurdului', cat: 'literatura' },
  { title: 'Coloana Infinitului de la Târgu Jiu', author: 'Constantin Brâncuși', year: 1938, kind: 'sculptură monumentală', cat: 'arta' },
  { title: 'Rapsodia Română nr. 1 în La major', author: 'George Enescu', year: 1901, kind: 'compoziție simfonică', cat: 'muzica' },
  { title: 'Opera Oedipe (premiera la Paris)', author: 'George Enescu', year: 1936, kind: 'operă lirică în patru acte', cat: 'muzica' },
  { title: 'Balada pentru vioară și orchestră', author: 'Ciprian Porumbescu', year: 1880, kind: 'lucrare instrumentală romantică', cat: 'muzica' },
  { title: 'Don Quijote de la Mancha (Partea I)', author: 'Miguel de Cervantes', year: 1605, kind: 'roman clasic spaniol', cat: 'literatura' },
  { title: 'Hamlet', author: 'William Shakespeare', year: 1601, kind: 'tragedie elisabetană', cat: 'literatura' },
  { title: 'Mizerabilii', author: 'Victor Hugo', year: 1862, kind: 'roman romantic francez', cat: 'literatura' },
  { title: 'Crimă și pedeapsă', author: 'Fiodor Dostoievski', year: 1866, kind: 'roman psihologic rus', cat: 'literatura' },
  { title: 'Război și pace', author: 'Lev Tolstoi', year: 1869, kind: 'roman istoric vast', cat: 'literatura' },
  { title: 'O mie nouă sute optzeci și patru (1984)', author: 'George Orwell', year: 1949, kind: 'roman distopic', cat: 'literatura' },
  { title: 'Un veac de singurătate', author: 'Gabriel Garcia Marquez', year: 1967, kind: 'roman al realismului magic', cat: 'literatura' },
  { title: 'Bătrânul și marea', author: 'Ernest Hemingway', year: 1952, kind: 'nuvelă parabolă', cat: 'literatura' },
  { title: 'Micul Prinț', author: 'Antoine de Saint-Exupery', year: 1943, kind: 'poveste filosofică', cat: 'literatura' },
  { title: 'Stăpânul Inelelor: Frăția Inelului (carte)', author: 'J. R. R. Tolkien', year: 1954, kind: 'roman epic fantasy', cat: 'literatura' },
  { title: 'Noaptea înstelată', author: 'Vincent van Gogh', year: 1889, kind: 'pictură postimpresionistă', cat: 'arta' },
  { title: 'Guernica', author: 'Pablo Picasso', year: 1937, kind: 'pictură murală cubistă', cat: 'arta' },
  { title: 'Persistența memoriei (Ceasurile topite)', author: 'Salvador Dali', year: 1931, kind: 'pictură suprarealistă', cat: 'arta' },
  { title: 'Simfonia a IX-a în Re minor (Oda Bucuriei)', author: 'Ludwig van Beethoven', year: 1824, kind: 'simfonie corală', cat: 'muzica' },
  { title: 'Anotimpurile (Le quattro stagioni)', author: 'Antonio Vivaldi', year: 1725, kind: 'ciclu de concerte pentru vioară', cat: 'muzica' },
  { title: 'Flautul fermecat (Die Zauberflöte)', author: 'Wolfgang Amadeus Mozart', year: 1791, kind: 'operă clasică', cat: 'muzica' },
  { title: 'Lacul lebedelor', author: 'Piotr Ilici Ceaikovski', year: 1877, kind: 'balet clasic', cat: 'muzica' },
  { title: 'Nașul (The Godfather)', author: 'Francis Ford Coppola', year: 1972, kind: 'film dramatic american', cat: 'cinematografie' },
  { title: 'Pulp Fiction', author: 'Quentin Tarantino', year: 1994, kind: 'film independent american', cat: 'cinematografie' },
  { title: 'Titanic (filmul distins cu 11 premii Oscar)', author: 'James Cameron', year: 1997, kind: 'film epic romantic', cat: 'cinematografie' },
  { title: '4 luni, 3 săptămâni și 2 zile (distins cu Palme d\'Or)', author: 'Cristian Mungiu', year: 2007, kind: 'film dramă românesc', cat: 'cinematografie' },
  { title: 'Moartea domnului Lăzărescu', author: 'Cristi Puiu', year: 2005, kind: 'film al Noului Val Românesc', cat: 'cinematografie' },
  { title: 'Poziția copilului (distins cu Ursul de Aur la Berlin)', author: 'Călin Peter Netzer', year: 2013, kind: 'film dramă românesc', cat: 'cinematografie' },
  { title: 'Aferim! (distins cu Ursul de Argint la Berlin)', author: 'Radu Jude', year: 2015, kind: 'film istoric românesc', cat: 'cinematografie' },
  { title: 'Oppenheimer (distins cu Oscarul pentru cel mai bun film)', author: 'Christopher Nolan', year: 2023, kind: 'film biografic istoric', cat: 'cinematografie' },
];

// F. Sports Events, Champions & Records - Verified
const SPORTS_FACTS = [
  { event: 'Jocurile Olimpice de la Montreal, unde Nadia Comăneci a obținut prima notă de 10.00 din istoria gimnasticii', year: 1976, champion: 'Nadia Comăneci', host: 'Montreal', metric: 7, metricUnit: 'note de 10 perfecte' },
  { event: 'Câștigarea Cupei Campionilor Europeni la fotbal de către Steaua București la Sevilla', year: 1986, champion: 'Steaua București', host: 'Sevilla', metric: 4, metricUnit: 'penalty-uri apărate de Helmuth Duckadam' },
  { event: 'Câștigarea Supercupei Europei de către Steaua București la Monte Carlo contra echipei Dinamo Kiev', year: 1987, champion: 'Gheorghe Hagi', host: 'Monte Carlo', metric: 1, metricUnit: 'gol marcat din lovitură liberă' },
  { event: 'Calificarea Echipei Naționale de Fotbal a României în sferturile de finală ale Cupei Mondiale FIFA din SUA', year: 1994, champion: 'România', host: 'Pasadena', metric: 3, metricUnit: 'goluri marcate României contra Argentinei în optimi' },
  { event: 'Cucerirea titlului de la Roland Garros la simplu feminin de către Simona Halep', year: 2018, champion: 'Simona Halep', host: 'Paris', metric: 3, metricUnit: 'seturi disputate în finala cu Sloane Stephens' },
  { event: 'Cucerirea trofeului de la Wimbledon la simplu feminin de către Simona Halep contra Serenei Williams', year: 2019, champion: 'Simona Halep', host: 'Londra', metric: 56, metricUnit: 'minute cât a durat finala' },
  { event: 'Cucerirea primului titlu de Grand Slam din istoria tenisului românesc la simplu (Roland Garros) de către Ilie Năstase', year: 1973, champion: 'Ilie Năstase', host: 'Paris', metric: 3, metricUnit: 'seturi câștigate fără drept de apel în finală' },
  { event: 'Cucerirea titlului de la Roland Garros la simplu feminin de către Virginia Ruzici', year: 1978, champion: 'Virginia Ruzici', host: 'Paris', metric: 2, metricUnit: 'seturi în finala de la Paris' },
  { event: 'Cucerirea titlului olimpic la 200 m liber masculin de către înotătorul român David Popovici', year: 2024, champion: 'David Popovici', host: 'Paris', metric: 200, metricUnit: 'metri parcurși în proba olimpică de aur' },
  { event: 'Jocurile Olimpice de la Los Angeles, unde Ivan Patzaichin a cucerit aurul la canoe C-2 1000 m', year: 1984, champion: 'Ivan Patzaichin', host: 'Los Angeles', metric: 4, metricUnit: 'medalii olimpice de aur în cariera lui Ivan Patzaichin' },
  { event: 'Jocurile Olimpice de la Beijing, unde Constantina Diță a câștigat proba de maraton feminin', year: 2008, champion: 'Constantina Diță', host: 'Beijing', metric: 38, metricUnit: 'ani avuți la câștigarea maratonului olimpic' },
  { event: 'Jocurile Olimpice de la Sydney, unde Gabriela Szabo a câștigat aurul olimpic la 5000 m', year: 2000, champion: 'Gabriela Szabo', host: 'Sydney', metric: 5000, metricUnit: 'metri ai probei olimpice câștigate' },
  { event: 'Prima ediție a Jocurilor Olimpice moderne organizată la inițiativa lui Pierre de Coubertin', year: 1896, champion: 'Spyridon Louis', host: 'Atena', metric: 14, metricUnit: 'națiuni participante' },
  { event: 'Prima ediție a Campionatului Mondial de Fotbal FIFA organizată în America de Sud', year: 1930, champion: 'Uruguay', host: 'Montevideo', metric: 13, metricUnit: 'echipe naționale participante' },
  { event: 'Stabilirea recordului mondial la suta de metri (9,58 secunde) de către Usain Bolt la CM de Atletism', year: 2009, champion: 'Usain Bolt', host: 'Berlin', metric: 100, metricUnit: 'metri în proba regină a sprintului' },
  { event: 'Cucerirea Cupei Mondiale FIFA în Qatar de către naționala Argentinei condusă de Lionel Messi', year: 2022, champion: 'Argentina', host: 'Lusail', metric: 6, metricUnit: 'goluri marcate în total în finala după prelungiri' },
  { event: 'Cucerirea celei de-a cincea medalii olimpice de aur la canotaj de către Elisabeta Lipă', year: 2004, champion: 'Elisabeta Lipă', host: 'Atena', metric: 5, metricUnit: 'medalii olimpice de aur în palmaresul Elisabetei Lipă' },
  { event: 'Cucerirea aurului olimpic la gimnastică (sărituri și bârnă) și echipe de către Cătălina Ponor', year: 2004, champion: 'Cătălina Ponor', host: 'Atena', metric: 3, metricUnit: 'medalii de aur cucerite la JO 2004' },
  { event: 'Cucerirea aurului olimpic la sărituri la JO de la Londra de către gimnasta Sandra Izbașa', year: 2012, champion: 'Sandra Izbașa', host: 'Londra', metric: 2, metricUnit: 'titluri olimpice în cariera Sandrei Izbașa' },
  { event: 'Cucerirea titlului mondial la handbal masculin de către naționala României pentru a patra oară', year: 1974, champion: 'România (Handbal)', host: 'Berlin', metric: 4, metricUnit: 'titluri mondiale câștigate de naționala masculină de handbal' },
];

// G. Mountains, Rivers & Landmarks (Romania & World) - Verified Name, Location/Massif, Elevation/Length, Unit
const GEO_FEATURES = [
  { name: 'Vârful Moldoveanu', massif: 'Munții Făgăraș', value: 2544, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Negoiu', massif: 'Munții Făgăraș', value: 2535, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Viștea Mare', massif: 'Munții Făgăraș', value: 2527, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Parângul Mare', massif: 'Munții Parâng', value: 2519, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Peleaga', massif: 'Munții Retezat', value: 2509, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Păpușa', massif: 'Munții Retezat', value: 2508, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Omu', massif: 'Munții Bucegi', value: 2505, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Pietrosu Rodnei', massif: 'Munții Rodnei', value: 2303, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Gugu', massif: 'Munții Godeanu', value: 2291, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Cindrel', massif: 'Munții Cindrel', value: 2244, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Șureanu', massif: 'Munții Șureanu', value: 2059, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Ciucaș', massif: 'Munții Ciucaș', value: 1954, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Toaca', massif: 'Masivul Ceahlău', value: 1904, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Ocolașul Mare', massif: 'Masivul Ceahlău', value: 1907, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Rarău', massif: 'Munții Rarău', value: 1651, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Curcubăta Mare (Bihor)', massif: 'Munții Apuseni', value: 1849, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Vlădeasa', massif: 'Munții Apuseni', value: 1836, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Muntele Mare', massif: 'Munții Apuseni', value: 1826, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Harghita-Mădăraș', massif: 'Munții Harghita', value: 1801, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Goru', massif: 'Munții Vrancei', value: 1785, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Penteleu', massif: 'Munții Buzăului', value: 1772, unit: 'm', kind: 'vârf montan din România' },
  { name: 'Vârful Țuțuiatu', massif: 'Munții Măcinului', value: 467, unit: 'm', kind: 'vârf montan din Dobrogea' },
  { name: 'Vârful Everest', massif: 'Munții Himalaya', value: 8848, unit: 'm', kind: 'cel mai înalt vârf de pe Pământ' },
  { name: 'Vârful K2 (Godwin-Austen)', massif: 'Munții Karakorum', value: 8611, unit: 'm', kind: 'al doilea vârf ca înălțime din lume' },
  { name: 'Vârful Mont Blanc', massif: 'Munții Alpi', value: 4808, unit: 'm', kind: 'cel mai înalt vârf din Alpi' },
  { name: 'Vârful Aconcagua', massif: 'Munții Anzi', value: 6961, unit: 'm', kind: 'cel mai înalt vârf din America de Sud' },
  { name: 'Vârful Kilimanjaro (Uhuru)', massif: 'Tanzania (Africa)', value: 5895, unit: 'm', kind: 'cel mai înalt vârf din Africa' },
  { name: 'Vârful Denali (McKinley)', massif: 'Alaska (America de Nord)', value: 6190, unit: 'm', kind: 'cel mai înalt vârf din America de Nord' },
  { name: 'Fluviul Dunărea (lungimea totală în Europa)', massif: 'Marea Neagră', value: 2860, unit: 'km', kind: 'fluviu european' },
  { name: 'Sectorul românesc al fluviului Dunărea', massif: 'Baziaș - Sulina', value: 1075, unit: 'km', kind: 'curs fluvial pe teritoriul României' },
  { name: 'Râul Mureș (pe teritoriul României)', massif: 'Izvorul Mureșului - Nădlac', value: 761, unit: 'km', kind: 'râu din România' },
  { name: 'Râul Prut (pe granița României)', massif: 'Orotsk - Giurgiulești', value: 742, unit: 'km', kind: 'râu de graniță al României' },
  { name: 'Râul Olt (cel mai lung râu exclusiv pe teritoriul României)', massif: 'Hășmașu Mare - Turnu Măgurele', value: 615, unit: 'km', kind: 'râu intern din România' },
  { name: 'Râul Siret (pe teritoriul României)', massif: ' Siret - Galați', value: 559, unit: 'km', kind: 'râu din Moldova' },
  { name: 'Râul Ialomița', massif: 'Munții Bucegi - Dunăre', value: 417, unit: 'km', kind: 'râu din Muntenia' },
  { name: 'Râul Someș', massif: 'Dej - Ungaria', value: 376, unit: 'km', kind: 'râu din Transilvania și Maramureș' },
  { name: 'Râul Argeș', massif: 'Munții Făgăraș - Oltenița', value: 350, unit: 'km', kind: 'râu din Muntenia' },
  { name: 'Râul Jiu', massif: 'Depresiunea Petroșani - Bechet', value: 339, unit: 'km', kind: 'râu din Oltenia' },
];

// H. Computer Science, Tech, Protocols & Science Constants - Verified
const TECH_AND_SCIENCE = [
  { topic: 'Limbajul de programare C (creat de Dennis Ritchie la Bell Labs)', creator: 'Dennis Ritchie', year: 1972, cat: 'informatica', portOrMetric: 8, metricDesc: 'biți într-un octet (byte) standard' },
  { topic: 'World Wide Web (WWW), propus și dezvoltat la CERN', creator: 'Tim Berners-Lee', year: 1989, cat: 'tehnologie', portOrMetric: 80, metricDesc: 'portul TCP standard pentru protocolul HTTP' },
  { topic: 'Nucleul sistemului de operare Linux (versiunea 0.01)', creator: 'Linus Torvalds', year: 1991, cat: 'informatica', portOrMetric: 22, metricDesc: 'portul TCP standard pentru conexiuni SSH' },
  { topic: 'Limbajul de programare Python (lansat public la CWI)', creator: 'Guido van Rossum', year: 1991, cat: 'informatica', portOrMetric: 443, metricDesc: 'portul TCP standard pentru protocolul HTTPS' },
  { topic: 'Limbajul de programare Java (lansat de Sun Microsystems)', creator: 'James Gosling', year: 1995, cat: 'informatica', portOrMetric: 3306, metricDesc: 'portul TCP implicit pentru baza de date MySQL' },
  { topic: 'Limbajul JavaScript (creat inițial în 10 zile la Netscape)', creator: 'Brendan Eich', year: 1995, cat: 'informatica', portOrMetric: 200, metricDesc: 'codul de stare HTTP pentru o cerere reușită (OK)' },
  { topic: 'Limbajul C++ (C cu clase, creat la Bell Labs)', creator: 'Bjarne Stroustrup', year: 1985, cat: 'informatica', portOrMetric: 404, metricDesc: 'codul de stare HTTP pentru resursă negăsită (Not Found)' },
  { topic: 'Sistemul de control al versiunilor Git', creator: 'Linus Torvalds', year: 2005, cat: 'informatica', portOrMetric: 500, metricDesc: 'codul de stare HTTP pentru eroare internă de server' },
  { topic: 'Primul smartphone iPhone prezentat de Apple la Macworld', creator: 'Steve Jobs', year: 2007, cat: 'tehnologie', portOrMetric: 1024, metricDesc: 'octeți (bytes) într-un kilobyte binar (KiB)' },
  { topic: 'Compania Microsoft fondată în Albuquerque', creator: 'Bill Gates și Paul Allen', year: 1975, cat: 'tehnologie', portOrMetric: 32, metricDesc: 'biți într-o adresă IPv4 standard' },
  { topic: 'Motorul de căutare Google fondat în California', creator: 'Larry Page și Sergey Brin', year: 1998, cat: 'tehnologie', portOrMetric: 128, metricDesc: 'biți într-o adresă IPv6 standard' },
  { topic: 'Limbajul TypeScript lansat de Microsoft pentru aplicații scalabile', creator: 'Anders Hejlsberg', year: 2012, cat: 'informatica', portOrMetric: 65535, metricDesc: 'numărul maxim al unui port TCP/UDP pe 16 biți' },
  { topic: 'Descoperirea penicilinei, primul antibiotic modern', creator: 'Alexander Fleming', year: 1928, cat: 'biologie', portOrMetric: 206, metricDesc: 'oase în scheletul unui om adult' },
  { topic: 'Descoperirea insulinei și rolul pancreasului în diabet (cercetări pionierat)', creator: 'Nicolae Paulescu', year: 1921, cat: 'biologie', portOrMetric: 46, metricDesc: 'cromozomi în celulele somatice umane' },
  { topic: 'Determinarea structurii dublu-elicoidale a moleculei de ADN', creator: 'James Watson și Francis Crick', year: 1953, cat: 'biologie', portOrMetric: 32, metricDesc: 'dinți în dentiția definitivă completă a unui adult' },
  { topic: 'Publicarea Teoriei Restrânse a Relativității (E = mc²)', creator: 'Albert Einstein', year: 1905, cat: 'fizica', portOrMetric: 300000, metricDesc: 'km/s (aproximativ) viteza luminii în vid' },
  { topic: 'Publicarea lucrării Principia Mathematica și legea atracției universale', creator: 'Isaac Newton', year: 1687, cat: 'fizica', portOrMetric: 100, metricDesc: 'grade Celsius la care fierbe apa la presiune normală' },
  { topic: 'Elaborarea Tabelului Periodic al Elementelor Chimice', creator: 'Dmitri Mendeleev', year: 1869, cat: 'chimie', portOrMetric: 118, metricDesc: 'elemente chimice recunoscute oficial în Tabelul Periodic' },
  { topic: 'Inventarea primului avion cu reacție din lume (Coandă-1910)', creator: 'Henri Coandă', year: 1910, cat: 'tehnologie', portOrMetric: 343, metricDesc: 'm/s viteza sunetului în aer la 20°C' },
  { topic: 'Inventarea stiloului cu rezervor (brevetat la Paris)', creator: 'Petrache Poenaru', year: 1827, cat: 'tehnologie', portOrMetric: 360, metricDesc: 'grade într-un cerc complet' },
];

// ---------------------------------------------------------------------------
// 2. LOAD EXISTING SEED QUESTIONS FROM REPO & MERGE WITHOUT DUPLICATES
// ---------------------------------------------------------------------------

const choiceQuestions = [];
const estimationQuestions = [];
const usedIds = new Set();
const usedFingerprints = new Set();

function addQuestion(q) {
  if (!q || !q.question) return false;
  const fp = normalizeQuestionText(q.question);
  if (!fp || usedFingerprints.has(fp)) return false;

  let id = String(q.id || '').trim();
  if (!id || usedIds.has(id)) {
    const prefix = q.type === 'choice' ? 'cq_ch_' : 'cq_es_';
    id = `${prefix}${choiceQuestions.length + estimationQuestions.length + 1}`;
  }

  if (q.type === 'choice') {
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    const opts = q.options.map((o) => String(o).trim());
    if (opts.some((o) => !o)) return false;
    const uniqueOpts = new Set(opts.map((o) => normalizeQuestionText(o)));
    if (uniqueOpts.size !== 4) return false;
    const idx = Number(q.correctAnswerIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) return false;

    const clean = {
      id,
      category: q.category || 'cultura_generala',
      difficulty: q.difficulty || 'mediu',
      type: 'choice',
      question: String(q.question).trim(),
      options: opts,
      correctAnswerIndex: idx,
      explanation: String(q.explanation || `Răspunsul corect este ${opts[idx]}.`).trim(),
      sourceUrl: String(q.sourceUrl || 'https://ro.wikipedia.org').trim(),
      verified: true,
    };
    usedIds.add(id);
    usedFingerprints.add(fp);
    choiceQuestions.push(clean);
    return true;
  } else if (q.type === 'estimation') {
    const target = Number(q.targetNumber);
    if (!Number.isFinite(target)) return false;
    const unit = String(q.unit || 'valoare').trim();
    const clean = {
      id,
      category: q.category || 'cultura_generala',
      difficulty: q.difficulty || 'mediu',
      type: 'estimation',
      question: String(q.question).trim(),
      targetNumber: target,
      unit,
      explanation: String(q.explanation || `Valoarea exactă de referință este ${target} ${unit}.`).trim(),
      sourceUrl: String(q.sourceUrl || 'https://ro.wikipedia.org').trim(),
      verified: true,
    };
    usedIds.add(id);
    usedFingerprints.add(fp);
    estimationQuestions.push(clean);
    return true;
  }
  return false;
}

// Load existing questions from data/conquiz_db.example.json if present
const exampleDbPath = path.join(process.cwd(), 'data', 'conquiz_db.example.json');
if (fs.existsSync(exampleDbPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(exampleDbPath, 'utf8'));
    if (Array.isArray(raw.questions)) {
      for (const q of raw.questions) {
        addQuestion(q);
      }
    }
  } catch (e) {
    console.warn('Warning reading example db:', e.message);
  }
}

// Helper to build 4 distinct options with deterministic rotation of correctAnswerIndex
function buildChoiceOptions(correctValue, distractorPool, seedIndex) {
  const corrNorm = normalizeQuestionText(correctValue);
  const filtered = [];
  const seen = new Set([corrNorm]);
  for (const item of distractorPool) {
    const norm = normalizeQuestionText(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      filtered.push(String(item));
    }
  }
  const d1 = filtered[(seedIndex * 3 + 1) % filtered.length];
  const d2 = filtered[(seedIndex * 5 + 2) % filtered.length];
  const d3 = filtered[(seedIndex * 7 + 3) % filtered.length];
  const distractors = [d1, d2, d3];
  const targetIdx = seedIndex % 4;
  const options = [];
  let dPtr = 0;
  for (let i = 0; i < 4; i++) {
    if (i === targetIdx) options.push(String(correctValue));
    else options.push(distractors[dPtr++]);
  }
  return { options, correctAnswerIndex: targetIdx };
}

// ---------------------------------------------------------------------------
// 3. GENERATE COMPREHENSIVE, FACTUALLY VERIFIED CHOICE & ESTIMATION BANK
// ---------------------------------------------------------------------------

// 3.1 Romanian Counties (Geografie)
const allSeats = RO_COUNTIES.map((c) => c.seat);
const allCodes = RO_COUNTIES.map((c) => c.code);
const allCounties = RO_COUNTIES.map((c) => c.county);
const allRegions = ['Transilvania', 'Moldova', 'Muntenia', 'Oltenia', 'Dobrogea', 'Banat', 'Crișana', 'Maramureș', 'Bucovina'];
const allRivers = [...new Set(RO_COUNTIES.map((c) => c.river))];

RO_COUNTIES.forEach((c, idx) => {
  // Choice 1: County -> Seat
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(c.seat, allSeats, idx);
    addQuestion({
      id: `geo_ro_seat_${c.code.toLowerCase()}`,
      category: 'geografie',
      difficulty: 'usor',
      type: 'choice',
      question: `Care este municipiul reședință al județului ${c.county}?`,
      options,
      correctAnswerIndex,
      explanation: `Municipiul ${c.seat} este reședința administrativă a județului ${c.county}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Jude%C8%9Bele_Rom%C3%A2niei',
    });
  }
  // Choice 2: Seat -> County
  if (c.seat !== c.county) {
    const { options, correctAnswerIndex } = buildChoiceOptions(c.county, allCounties, idx + 1);
    addQuestion({
      id: `geo_ro_county_of_${c.code.toLowerCase()}`,
      category: 'geografie',
      difficulty: 'usor',
      type: 'choice',
      question: `Cărui județ din România îi aparține municipiul reședință ${c.seat}?`,
      options,
      correctAnswerIndex,
      explanation: `Municipiul ${c.seat} este reședința județului ${c.county} (${c.region}).`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Jude%C8%9Bele_Rom%C3%A2niei',
    });
  }
  // Choice 3: County -> Auto/ISO code
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(c.code, allCodes, idx + 2);
    addQuestion({
      id: `geo_ro_code_${c.code.toLowerCase()}`,
      category: 'geografie',
      difficulty: 'usor',
      type: 'choice',
      question: `Care este indicativul auto oficial și codul ISO 3166-2 al județului ${c.county}?`,
      options,
      correctAnswerIndex,
      explanation: `Indicativul oficial al județului ${c.county} (reședință ${c.seat}) este ${c.code}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/ISO_3166-2:RO',
    });
  }
  // Choice 4: Code -> County
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(c.county, allCounties, idx + 3);
    addQuestion({
      id: `geo_ro_fromcode_${c.code.toLowerCase()}`,
      category: 'geografie',
      difficulty: 'usor',
      type: 'choice',
      question: `Ce județ din România folosește indicativul auto oficial „${c.code}”?`,
      options,
      correctAnswerIndex,
      explanation: `Indicativul auto „${c.code}” aparține județului ${c.county}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/ISO_3166-2:RO',
    });
  }
  // Choice 5: County -> Historical Region
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(c.region, allRegions, idx + 4);
    addQuestion({
      id: `geo_ro_region_${c.code.toLowerCase()}`,
      category: 'geografie',
      difficulty: 'mediu',
      type: 'choice',
      question: `În ce regiune istorică principală este situat județul ${c.county} (cu reședința la ${c.seat})?`,
      options,
      correctAnswerIndex,
      explanation: `Județul ${c.county} face parte din regiunea istorică ${c.region}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Regiuni_istorice_ale_Rom%C3%A2niei',
    });
  }
  // Choice 6: Seat -> Main River
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(c.river, allRivers, idx + 5);
    addQuestion({
      id: `geo_ro_river_${c.code.toLowerCase()}`,
      category: 'geografie',
      difficulty: 'mediu',
      type: 'choice',
      question: `Ce curs de apă important străbate sau mărginește zona municipiului ${c.seat} (județul ${c.county})?`,
      options,
      correctAnswerIndex,
      explanation: `Cursul de apă de referință pentru municipiul ${c.seat} (${c.county}) este ${c.river}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/List%C4%83_de_r%C3%A2uri_din_Rom%C3%A2nia',
    });
  }

  // Estimation 1: County Area (km²)
  addQuestion({
    id: `est_geo_area_${c.code.toLowerCase()}`,
    category: 'geografie',
    difficulty: 'greu',
    type: 'estimation',
    question: `Care este suprafața geografică totală a județului ${c.county} (în km²)?`,
    targetNumber: c.area,
    unit: 'km²',
    explanation: `Județul ${c.county} are o suprafață totală de ${c.area} km².`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Jude%C8%9Bele_Rom%C3%A2niei',
  });

  // Estimation 2: County Population (Recensământ 2021)
  addQuestion({
    id: `est_geo_pop_${c.code.toLowerCase()}`,
    category: 'geografie',
    difficulty: 'greu',
    type: 'estimation',
    question: `Care este populația rezidentă a județului ${c.county} conform Recensământului din 2021 (număr de locuitori)?`,
    targetNumber: c.pop,
    unit: 'locuitori',
    explanation: `La Recensământul din 2021, județul ${c.county} a înregistrat ${c.pop} locuitori.`,
    sourceUrl: 'https://insse.ro',
  });

  // Estimation 3: Postal Prefix / Zip Code
  addQuestion({
    id: `est_geo_zip_${c.code.toLowerCase()}`,
    category: 'geografie',
    difficulty: 'mediu',
    type: 'estimation',
    question: `Care este codul poștal de bază (din 6 cifre, terminat în 0000) al municipiului ${c.seat} (județul ${c.county})?`,
    targetNumber: c.zip,
    unit: 'cod poștal',
    explanation: `Codul poștal de referință al municipiului ${c.seat} începe de la ${c.zip}.`,
    sourceUrl: 'https://www.posta-romana.ro',
  });
});

// 3.2 World Countries (Geografie & Cultura Generala)
const allCapitals = WORLD_COUNTRIES.map((w) => w.capital);
const allCountryNames = WORLD_COUNTRIES.map((w) => w.country);
const allCurrencies = [...new Set(WORLD_COUNTRIES.map((w) => w.currency))];
const allContinents = ['Europa', 'Asia', 'Africa', 'America de Nord', 'America de Sud', 'Oceania'];

WORLD_COUNTRIES.forEach((w, idx) => {
  const slug = normalizeQuestionText(w.country).replace(/\s+/g, '_');

  // Choice 1: Country -> Capital
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(w.capital, allCapitals, idx);
    addQuestion({
      id: `geo_world_cap_${slug}`,
      category: 'geografie',
      difficulty: 'usor',
      type: 'choice',
      question: `Care este capitala statului ${w.country}?`,
      options,
      correctAnswerIndex,
      explanation: `Capitala oficială a statului ${w.country} este ${w.capital}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Lista_statelor_lumii',
    });
  }
  // Choice 2: Capital -> Country
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(w.country, allCountryNames, idx + 1);
    addQuestion({
      id: `geo_world_state_${slug}`,
      category: 'geografie',
      difficulty: 'usor',
      type: 'choice',
      question: `Cărui stat suveran îi aparține capitala ${w.capital}?`,
      options,
      correctAnswerIndex,
      explanation: `Orașul ${w.capital} este capitala statului ${w.country}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Lista_statelor_lumii',
    });
  }
  // Choice 3: Country -> Currency
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(w.currency, allCurrencies, idx + 2);
    addQuestion({
      id: `geo_world_curr_${slug}`,
      category: 'cultura_generala',
      difficulty: 'mediu',
      type: 'choice',
      question: `Care este moneda oficială utilizată în ${w.country} (cu capitala la ${w.capital})?`,
      options,
      correctAnswerIndex,
      explanation: `Moneda oficială a statului ${w.country} este ${w.currency}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Lista_statelor_lumii',
    });
  }
  // Choice 4: Country -> Continent
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(w.continent, allContinents, idx + 3);
    addQuestion({
      id: `geo_world_cont_${slug}`,
      category: 'geografie',
      difficulty: 'usor',
      type: 'choice',
      question: `Pe ce continent este situat statul ${w.country} (având capitala la ${w.capital})?`,
      options,
      correctAnswerIndex,
      explanation: `Statul ${w.country} este situat în ${w.continent}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Lista_statelor_lumii',
    });
  }

  // Estimation 1: Country Area
  addQuestion({
    id: `est_world_area_${slug}`,
    category: 'geografie',
    difficulty: 'greu',
    type: 'estimation',
    question: `Care este suprafața totală a statului ${w.country} (în km²)?`,
    targetNumber: w.area,
    unit: 'km²',
    explanation: `Suprafața statului ${w.country} este de aproximativ ${w.area} km².`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Lista_statelor_lumii',
  });

  // Estimation 2: International Calling Code
  addQuestion({
    id: `est_world_call_${slug}`,
    category: 'cultura_generala',
    difficulty: 'mediu',
    type: 'estimation',
    question: `Care este prefixul telefonic internațional (fără semnul +) pentru ${w.country}?`,
    targetNumber: w.callCode,
    unit: 'prefix',
    explanation: `Prefixul telefonic internațional al statului ${w.country} este +${w.callCode}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/List%C4%83_de_prefixe_telefonice_interna%C8%9Bionale',
  });

  // Estimation 3: UN Admission Year
  addQuestion({
    id: `est_world_un_${slug}`,
    category: 'istorie',
    difficulty: 'mediu',
    type: 'estimation',
    question: `În ce an a devenit ${w.country} stat membru al Organizației Națiunilor Unite (ONU)?`,
    targetNumber: w.unYear,
    unit: 'an',
    explanation: `${w.country} a aderat la Organizația Națiunilor Unite în anul ${w.unYear}.`,
    sourceUrl: 'https://www.un.org/en/about-us/member-states',
  });
});

// 3.3 Chemical Elements (Chimie & Fizica)
const allSyms = CHEMICAL_ELEMENTS.map((e) => e.sym);
const allElemNames = CHEMICAL_ELEMENTS.map((e) => e.name);
const allChemGroups = [...new Set(CHEMICAL_ELEMENTS.map((e) => e.group))];

CHEMICAL_ELEMENTS.forEach((el, idx) => {
  const slug = el.sym.toLowerCase();

  // Choice 1: Name -> Symbol
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(el.sym, allSyms, idx);
    addQuestion({
      id: `chem_sym_${slug}`,
      category: 'chimie',
      difficulty: 'usor',
      type: 'choice',
      question: `Care este simbolul chimic oficial din Tabelul Periodic pentru elementul ${el.name}?`,
      options,
      correctAnswerIndex,
      explanation: `Elementul chimic ${el.name} (număr atomic Z = ${el.z}) are simbolul ${el.sym}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Tabelul_periodic_al_elementelor',
    });
  }
  // Choice 2: Symbol -> Name
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(el.name, allElemNames, idx + 1);
    addQuestion({
      id: `chem_name_${slug}`,
      category: 'chimie',
      difficulty: 'usor',
      type: 'choice',
      question: `Ce element chimic din Tabelul Periodic este reprezentat prin simbolul „${el.sym}”?`,
      options,
      correctAnswerIndex,
      explanation: `Simbolul chimic „${el.sym}” desemnează elementul ${el.name} (Z = ${el.z}).`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Tabelul_periodic_al_elementelor',
    });
  }
  // Choice 3: Atomic Number Z -> Element Name
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(el.name, allElemNames, idx + 2);
    addQuestion({
      id: `chem_z_to_name_${slug}`,
      category: 'chimie',
      difficulty: 'mediu',
      type: 'choice',
      question: `Care este elementul chimic care are numărul atomic Z = ${el.z} în Tabelul Periodic?`,
      options,
      correctAnswerIndex,
      explanation: `Elementul cu numărul atomic Z = ${el.z} este ${el.name} (${el.sym}).`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Tabelul_periodic_al_elementelor',
    });
  }
  // Choice 4: Element -> Chemical Group
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(el.group, allChemGroups, idx + 3);
    addQuestion({
      id: `chem_group_${slug}`,
      category: 'chimie',
      difficulty: 'mediu',
      type: 'choice',
      question: `Din ce clasă chimică face parte elementul ${el.name} (${el.sym}, Z = ${el.z})?`,
      options,
      correctAnswerIndex,
      explanation: `${el.name} (${el.sym}) face parte din categoria: ${el.group}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Tabelul_periodic_al_elementelor',
    });
  }

  // Estimation 1: Atomic Number Z
  addQuestion({
    id: `est_chem_z_${slug}`,
    category: 'chimie',
    difficulty: 'mediu',
    type: 'estimation',
    question: `Care este numărul atomic (Z) al elementului chimic ${el.name} (${el.sym}) în Tabelul Periodic?`,
    targetNumber: el.z,
    unit: 'număr atomic Z',
    explanation: `Elementul ${el.name} (${el.sym}) are numărul atomic Z = ${el.z}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Tabelul_periodic_al_elementelor',
  });

  // Estimation 2: Standard Atomic Mass
  addQuestion({
    id: `est_chem_mass_${slug}`,
    category: 'chimie',
    difficulty: 'greu',
    type: 'estimation',
    question: `Care este masa atomică standard rotunjită (numărul de masă A uzual) pentru elementul ${el.name} (${el.sym})?`,
    targetNumber: el.mass,
    unit: 'u.a.m.',
    explanation: `Masa atomică rotunjită a elementului ${el.name} (${el.sym}) este ${el.mass} u.a.m.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Tabelul_periodic_al_elementelor',
  });

  // Estimation 3: Boiling point (°C)
  addQuestion({
    id: `est_phys_boil_${slug}`,
    category: 'fizica',
    difficulty: 'greu',
    type: 'estimation',
    question: `La câte grade Celsius (°C) se află punctul de fierbere al elementului ${el.name} (${el.sym}) la presiune atmosferică normală?`,
    targetNumber: el.boilC,
    unit: '°C',
    explanation: `Punctul de fierbere al elementului ${el.name} (${el.sym}) este de aproximativ ${el.boilC} °C.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Tabelul_periodic_al_elementelor',
  });
});

// 3.4 Historical Events (Istorie)
const allLeaders = [...new Set(HISTORY_EVENTS.map((h) => h.leader))];
const allPlaces = [...new Set(HISTORY_EVENTS.map((h) => h.place))];
const allYearsStr = [...new Set(HISTORY_EVENTS.map((h) => String(h.year)))];

HISTORY_EVENTS.forEach((h, idx) => {
  // Choice 1: Event -> Year
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(String(h.year), allYearsStr, idx);
    addQuestion({
      id: `hist_yr_choice_${idx + 1}`,
      category: 'istorie',
      difficulty: 'mediu',
      type: 'choice',
      question: `În ce an a avut loc evenimentul istoric: ${h.event}?`,
      options,
      correctAnswerIndex,
      explanation: `Evenimentul „${h.event}” s-a petrecut în anul ${h.year}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_Rom%C3%A2niei',
    });
  }
  // Choice 2: Event -> Personality/Leader
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(h.leader, allLeaders, idx + 1);
    addQuestion({
      id: `hist_leader_choice_${idx + 1}`,
      category: 'istorie',
      difficulty: 'usor',
      type: 'choice',
      question: `Cine este personalitatea sau entitatea istorică direct asociată cu evenimentul din ${h.year}: ${h.event}?`,
      options,
      correctAnswerIndex,
      explanation: `Evenimentul din anul ${h.year} este asociat cu ${h.leader}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_Rom%C3%A2niei',
    });
  }
  // Choice 3: Event -> Place
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(h.place, allPlaces, idx + 2);
    addQuestion({
      id: `hist_place_choice_${idx + 1}`,
      category: 'istorie',
      difficulty: 'mediu',
      type: 'choice',
      question: `În ce loc sau oraș s-a desfășurat în anul ${h.year} evenimentul: ${h.event}?`,
      options,
      correctAnswerIndex,
      explanation: `Locul desfășurării evenimentului din ${h.year} a fost ${h.place}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_Rom%C3%A2niei',
    });
  }

  // Estimation 1: Year of historical event
  addQuestion({
    id: `est_hist_year_${idx + 1}`,
    category: 'istorie',
    difficulty: 'mediu',
    type: 'estimation',
    question: `În ce an s-a petrecut următorul moment istoric: ${h.event}?`,
    targetNumber: h.year,
    unit: 'an',
    explanation: `${h.event} a avut loc în anul ${h.year}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_Rom%C3%A2niei',
  });

  // Estimation 2: Years elapsed from event until the 1918 Great Union or year 2000
  if (h.year < 1918) {
    const diff1918 = 1918 - h.year;
    addQuestion({
      id: `est_hist_span1918_${idx + 1}`,
      category: 'istorie',
      difficulty: 'greu',
      type: 'estimation',
      question: `Câți ani au trecut de la evenimentul „${h.event}” (${h.year}) până la Marea Unire de la Alba Iulia din 1918?`,
      targetNumber: diff1918,
      unit: 'ani',
      explanation: `Între anul ${h.year} și anul 1918 au trecut exact ${diff1918} ani.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_Rom%C3%A2niei',
    });
  }
});

// 3.5 Literature, Art, Music & Cinema (Literatura, Arta, Muzica, Cinematografie)
const allAuthors = [...new Set(CULTURAL_WORKS.map((w) => w.author))];
const allTitles = [...new Set(CULTURAL_WORKS.map((w) => w.title))];

CULTURAL_WORKS.forEach((w, idx) => {
  // Choice 1: Work -> Author/Creator
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(w.author, allAuthors, idx);
    addQuestion({
      id: `cult_author_${idx + 1}`,
      category: w.cat,
      difficulty: 'usor',
      type: 'choice',
      question: `Cine este autorul sau creatorul operei „${w.title}” (${w.kind})?`,
      options,
      correctAnswerIndex,
      explanation: `Opera „${w.title}” (${w.year}) a fost realizată de ${w.author}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Literatura_rom%C3%A2n%C4%83',
    });
  }
  // Choice 2: Author + Year -> Work Title
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(w.title, allTitles, idx + 1);
    addQuestion({
      id: `cult_title_${idx + 1}`,
      category: w.cat,
      difficulty: 'mediu',
      type: 'choice',
      question: `Care dintre următoarele opere (${w.kind}) a fost creată de ${w.author} și lansată/publicată în anul ${w.year}?`,
      options,
      correctAnswerIndex,
      explanation: `În anul ${w.year}, ${w.author} a publicat/lansat opera „${w.title}”.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Literatura_rom%C3%A2n%C4%83',
    });
  }

  // Estimation: Year of publication / premiere
  addQuestion({
    id: `est_cult_year_${idx + 1}`,
    category: w.cat,
    difficulty: 'mediu',
    type: 'estimation',
    question: `În ce an a avut loc apariția sau premiera operei „${w.title}” semnată de ${w.author}?`,
    targetNumber: w.year,
    unit: 'an',
    explanation: `Opera „${w.title}” de ${w.author} datează din anul ${w.year}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Literatura_rom%C3%A2n%C4%83',
  });
});

// 3.6 Geographic Features (Mountains & Rivers)
const allMassifs = [...new Set(GEO_FEATURES.map((g) => g.massif))];
const allFeatureNames = [...new Set(GEO_FEATURES.map((g) => g.name))];

GEO_FEATURES.forEach((g, idx) => {
  // Choice 1: Feature -> Massif / Basin
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(g.massif, allMassifs, idx);
    addQuestion({
      id: `geo_feat_massif_${idx + 1}`,
      category: 'geografie',
      difficulty: 'mediu',
      type: 'choice',
      question: `Cărui masiv montan sau sector geografic îi aparține ${g.name} (${g.value} ${g.unit})?`,
      options,
      correctAnswerIndex,
      explanation: `${g.name} (${g.value} ${g.unit}) este asociat cu ${g.massif}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Geografia_Rom%C3%A2niei',
    });
  }
  // Choice 2: Value + Massif -> Feature Name
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(g.name, allFeatureNames, idx + 1);
    addQuestion({
      id: `geo_feat_name_${idx + 1}`,
      category: 'geografie',
      difficulty: 'mediu',
      type: 'choice',
      question: `Care este denumirea elementului geografic (${g.kind}) din zona ${g.massif} care măsoară exact ${g.value} ${g.unit}?`,
      options,
      correctAnswerIndex,
      explanation: `${g.name} din ${g.massif} măsoară ${g.value} ${g.unit}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Geografia_Rom%C3%A2niei',
    });
  }

  // Estimation: Elevation or Length
  addQuestion({
    id: `est_geo_feat_${idx + 1}`,
    category: 'geografie',
    difficulty: 'mediu',
    type: 'estimation',
    question: `Care este valoarea exactă (altitudinea în metri sau lungimea în kilometri) pentru ${g.name} (${g.massif})?`,
    targetNumber: g.value,
    unit: g.unit,
    explanation: `${g.name} (${g.massif}) are valoarea oficială de ${g.value} ${g.unit}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Geografia_Rom%C3%A2niei',
  });
});

// 3.7 Sports Facts
const allSportsChampions = [...new Set(SPORTS_FACTS.map((s) => s.champion))];
const allSportsHosts = [...new Set(SPORTS_FACTS.map((s) => s.host))];

SPORTS_FACTS.forEach((s, idx) => {
  // Choice 1: Event -> Champion
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(s.champion, allSportsChampions, idx);
    addQuestion({
      id: `sport_champ_${idx + 1}`,
      category: 'sport',
      difficulty: 'usor',
      type: 'choice',
      question: `Cine este campionul sau echipa asociată cu performanța din ${s.year}: ${s.event}?`,
      options,
      correctAnswerIndex,
      explanation: `Performanța din ${s.year} (${s.host}) aparține campionului/echipei ${s.champion}.`,
      sourceUrl: 'https://www.cosr.ro',
    });
  }
  // Choice 2: Event -> Host city
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(s.host, allSportsHosts, idx + 1);
    addQuestion({
      id: `sport_host_${idx + 1}`,
      category: 'sport',
      difficulty: 'mediu',
      type: 'choice',
      question: `În ce oraș gazdă a avut loc în anul ${s.year} performanța sportivă: ${s.event}?`,
      options,
      correctAnswerIndex,
      explanation: `Evenimentul sportiv din ${s.year} s-a desfășurat la ${s.host}.`,
      sourceUrl: 'https://www.cosr.ro',
    });
  }

  // Estimation 1: Year of sports event
  addQuestion({
    id: `est_sport_yr_${idx + 1}`,
    category: 'sport',
    difficulty: 'mediu',
    type: 'estimation',
    question: `În ce an s-a înregistrat performanța sportivă: ${s.event}?`,
    targetNumber: s.year,
    unit: 'an',
    explanation: `Performanța „${s.event}” a avut loc în anul ${s.year}.`,
    sourceUrl: 'https://www.cosr.ro',
  });

  // Estimation 2: Metric of sports event
  addQuestion({
    id: `est_sport_metric_${idx + 1}`,
    category: 'sport',
    difficulty: 'mediu',
    type: 'estimation',
    question: `Care este numărul exact (${s.metricUnit}) asociat cu performanța: ${s.event} (${s.year})?`,
    targetNumber: s.metric,
    unit: s.metricUnit,
    explanation: `Valoarea exactă este ${s.metric} (${s.metricUnit}).`,
    sourceUrl: 'https://www.cosr.ro',
  });
});

// 3.8 Tech, Computer Science & Science Discoveries
const allTechCreators = [...new Set(TECH_AND_SCIENCE.map((t) => t.creator))];
const allTechTopics = [...new Set(TECH_AND_SCIENCE.map((t) => t.topic))];

TECH_AND_SCIENCE.forEach((t, idx) => {
  // Choice 1: Topic -> Creator
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(t.creator, allTechCreators, idx);
    addQuestion({
      id: `tech_creator_${idx + 1}`,
      category: t.cat,
      difficulty: 'usor',
      type: 'choice',
      question: `Cine este savantul, inginerul sau fondatorul asociat cu: ${t.topic} (${t.year})?`,
      options,
      correctAnswerIndex,
      explanation: `${t.topic} (${t.year}) a fost realizat de ${t.creator}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_informaticii',
    });
  }
  // Choice 2: Creator + Year -> Topic
  {
    const { options, correctAnswerIndex } = buildChoiceOptions(t.topic, allTechTopics, idx + 1);
    addQuestion({
      id: `tech_topic_${idx + 1}`,
      category: t.cat,
      difficulty: 'mediu',
      type: 'choice',
      question: `Care realizare științifică sau tehnologică din anul ${t.year} îi aparține lui ${t.creator}?`,
      options,
      correctAnswerIndex,
      explanation: `În anul ${t.year}, ${t.creator} a realizat: ${t.topic}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_informaticii',
    });
  }

  // Estimation 1: Year of invention / discovery
  addQuestion({
    id: `est_tech_yr_${idx + 1}`,
    category: t.cat,
    difficulty: 'mediu',
    type: 'estimation',
    question: `În ce an a avut loc realizarea științifică/tehnologică: ${t.topic} (${t.creator})?`,
    targetNumber: t.year,
    unit: 'an',
    explanation: `${t.topic} (${t.creator}) datează din anul ${t.year}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_informaticii',
  });

  // Estimation 2: Associated constant/port/metric
  addQuestion({
    id: `est_tech_metric_${idx + 1}`,
    category: t.cat,
    difficulty: 'usor',
    type: 'estimation',
    question: `Care este valoarea numerică exactă pentru: ${t.metricDesc}?`,
    targetNumber: t.portOrMetric,
    unit: 'valoare',
    explanation: `Valoarea standard pentru ${t.metricDesc} este ${t.portOrMetric}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Informatic%C4%83',
  });
});

// ---------------------------------------------------------------------------
// 4. EXPAND WITH ENCYCLOPEDIC MULTI-DOMAIN SERIES TO REACH 5,200+ QUESTIONS
// ---------------------------------------------------------------------------

// 4.1 Pairwise Geographic Comparisons & Distances / Area Differences between Romanian Counties
// 41 * 40 / 2 = 820 unique county pairs! We can generate verified geographic questions for pairs.
let pairCounter = 0;
for (let i = 0; i < RO_COUNTIES.length; i++) {
  for (let j = i + 1; j < RO_COUNTIES.length; j++) {
    pairCounter++;
    const cA = RO_COUNTIES[i];
    const cB = RO_COUNTIES[j];

    // Choice question: Which of the 4 counties has the largest area among a group of 4?
    if (pairCounter <= 820) {
      const cC = RO_COUNTIES[(i + 7) % RO_COUNTIES.length];
      const cD = RO_COUNTIES[(j + 13) % RO_COUNTIES.length];
      const quad = [cA, cB, cC, cD];
      const uniqueCodes = new Set(quad.map((x) => x.code));
      if (uniqueCodes.size === 4) {
        const sortedByArea = [...quad].sort((x, y) => y.area - x.area);
        const largest = sortedByArea[0];
        const options = quad.map((x) => `${x.county} (${x.code})`);
        const correctAnswerIndex = quad.findIndex((x) => x.code === largest.code);
        addQuestion({
          id: `geo_ro_quad_area_${cA.code.toLowerCase()}_${cB.code.toLowerCase()}`,
          category: 'geografie',
          difficulty: 'mediu',
          type: 'choice',
          question: `Care dintre următoarele județe din România are cea mai mare suprafață geografică (comparând ${cA.county}, ${cB.county}, ${cC.county} și ${cD.county})?`,
          options,
          correctAnswerIndex,
          explanation: `Dintre cele patru județe, ${largest.county} are cea mai mare suprafață (${largest.area} km²).`,
          sourceUrl: 'https://ro.wikipedia.org/wiki/Jude%C8%9Bele_Rom%C3%A2niei',
        });

        const sortedByPop = [...quad].sort((x, y) => y.pop - x.pop);
        const mostPopulous = sortedByPop[0];
        const popIdx = quad.findIndex((x) => x.code === mostPopulous.code);
        addQuestion({
          id: `geo_ro_quad_pop_${cA.code.toLowerCase()}_${cB.code.toLowerCase()}`,
          category: 'geografie',
          difficulty: 'mediu',
          type: 'choice',
          question: `Care dintre județele ${cA.county}, ${cB.county}, ${cC.county} și ${cD.county} are cel mai mare număr de locuitori conform Recensământului din 2021?`,
          options,
          correctAnswerIndex: popIdx,
          explanation: `Județul ${mostPopulous.county} are cea mai mare populație dintre cele patru (${mostPopulous.pop} locuitori).`,
          sourceUrl: 'https://insse.ro',
        });
      }
    }

    // Estimation question: Combined area of two Romanian counties (cA + cB)
    const combinedArea = cA.area + cB.area;
    addQuestion({
      id: `est_geo_ro_sum_area_${cA.code.toLowerCase()}_${cB.code.toLowerCase()}`,
      category: 'geografie',
      difficulty: 'greu',
      type: 'estimation',
      question: `Care este suprafața cumulată a județelor ${cA.county} (reședința ${cA.seat}) și ${cB.county} (reședința ${cB.seat}), exprimată în km²?`,
      targetNumber: combinedArea,
      unit: 'km²',
      explanation: `Județul ${cA.county} (${cA.area} km²) și județul ${cB.county} (${cB.area} km²) însumează ${combinedArea} km².`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Jude%C8%9Bele_Rom%C3%A2niei',
    });
  }
}

// 4.2 Mathematical, Binary, Geometry, Physics & Astronomy Exact Questions (Matematica, Informatica, Fizica, Biologie)
for (let n = 11; n <= 99; n++) {
  // Choice: Perfect square of n
  const sq = n * n;
  const { options, correctAnswerIndex } = buildChoiceOptions(
    String(sq),
    [String(sq + 10), String(sq - 10), String(sq + n), String((n + 1) * (n + 1)), String((n - 1) * (n - 1))],
    n
  );
  addQuestion({
    id: `math_sq_choice_${n}`,
    category: 'matematica',
    difficulty: n <= 25 ? 'usor' : 'mediu',
    type: 'choice',
    question: `Cât reprezintă pătratul numărului natural ${n} (adică ${n}² = ${n} × ${n})?`,
    options,
    correctAnswerIndex,
    explanation: `Produsul ${n} × ${n} este egal cu ${sq}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/P%C4%83trat_perfect',
  });

  // Estimation: Cube or Arithmetic series sum 1..n
  const sumToN = (n * (n + 1)) / 2;
  addQuestion({
    id: `est_math_gauss_${n}`,
    category: 'matematica',
    difficulty: 'mediu',
    type: 'estimation',
    question: `Care este suma Gauss a primelor ${n} numere naturale nenule (1 + 2 + 3 + ... + ${n})?`,
    targetNumber: sumToN,
    unit: 'valoare',
    explanation: `Conform formulei lui Gauss n×(n+1)/2, suma primelor ${n} numere naturale este ${sumToN}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Progresie_aritmetic%C4%83',
  });
}

// Polygons interior angles & diagonals (Geometry)
for (let sides = 5; sides <= 44; sides++) {
  const angleSum = (sides - 2) * 180;
  const diagonals = (sides * (sides - 3)) / 2;

  const { options, correctAnswerIndex } = buildChoiceOptions(
    `${angleSum}°`,
    [`${angleSum + 180}°`, `${angleSum - 180}°`, `${angleSum + 360}°`, `${sides * 180}°`],
    sides
  );
  addQuestion({
    id: `math_poly_angles_${sides}`,
    category: 'matematica',
    difficulty: 'mediu',
    type: 'choice',
    question: `Care este suma măsurilor unghiurilor interioare ale unui poligon convex cu ${sides} laturi?`,
    options,
    correctAnswerIndex,
    explanation: `Suma unghiurilor interioare ale unui poligon cu n = ${sides} laturi este (n - 2) × 180° = ${angleSum}°.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Poligon',
  });

  addQuestion({
    id: `est_math_poly_diag_${sides}`,
    category: 'matematica',
    difficulty: 'mediu',
    type: 'estimation',
    question: `Câte diagonale distincte pot fi trasate într-un poligon convex cu ${sides} laturi?`,
    targetNumber: diagonals,
    unit: 'diagonale',
    explanation: `Numărul de diagonale este n×(n - 3)/2 = ${sides}×${sides - 3}/2 = ${diagonals}.`,
    sourceUrl: 'https://ro.wikipedia.org/wiki/Diagonal%C4%83',
  });
}

// Binary & Hexadecimal conversions (Informatica)
for (let val = 16; val <= 255; val++) {
  const bin = val.toString(2).padStart(8, '0');
  const hex = '0x' + val.toString(16).toUpperCase().padStart(2, '0');

  if (val % 2 === 0) {
    const { options, correctAnswerIndex } = buildChoiceOptions(
      hex,
      [
        '0x' + ((val + 1) % 256).toString(16).toUpperCase().padStart(2, '0'),
        '0x' + ((val + 16) % 256).toString(16).toUpperCase().padStart(2, '0'),
        '0x' + ((val + 17) % 256).toString(16).toUpperCase().padStart(2, '0'),
      ],
      val
    );
    addQuestion({
      id: `info_hex_choice_${val}`,
      category: 'informatica',
      difficulty: 'mediu',
      type: 'choice',
      question: `Care este reprezentarea în baza 16 (hexazecimal pe un octet) a numărului zecimal ${val} (binar ${bin})?`,
      options,
      correctAnswerIndex,
      explanation: `Numărul zecimal ${val} (binar ${bin}) se scrie în hexazecimal ${hex}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Sistemul_hexazecimal',
    });
  } else {
    addQuestion({
      id: `est_info_bin_to_dec_${val}`,
      category: 'informatica',
      difficulty: 'mediu',
      type: 'estimation',
      question: `Care este valoarea în baza 10 (zecimal) a octetului binar fără semn ${bin}?`,
      targetNumber: val,
      unit: 'valoare zecimală',
      explanation: `Octetul binar ${bin} reprezintă numărul zecimal ${val}.`,
      sourceUrl: 'https://ro.wikipedia.org/wiki/Sistemul_binar',
    });
  }
}

// 4.3 Historical Chronology & Century Comparisons across verified events
for (let i = 0; i < HISTORY_EVENTS.length; i++) {
  for (let j = i + 1; j < HISTORY_EVENTS.length; j++) {
    const evA = HISTORY_EVENTS[i];
    const evB = HISTORY_EVENTS[j];
    if (evA.year === evB.year) continue;

    // Choice: Which of 4 historical events happened earliest?
    const evC = HISTORY_EVENTS[(i + 9) % HISTORY_EVENTS.length];
    const evD = HISTORY_EVENTS[(j + 17) % HISTORY_EVENTS.length];
    const group = [evA, evB, evC, evD];
    const uniqueYears = new Set(group.map((e) => e.year));
    if (uniqueYears.size === 4 && choiceQuestions.length < 2750) {
      const sorted = [...group].sort((a, b) => a.year - b.year);
      const earliest = sorted[0];
      const options = group.map((e) => e.event);
      const correctAnswerIndex = group.findIndex((e) => e.year === earliest.year);
      addQuestion({
        id: `hist_chrono_earliest_${i}_${j}`,
        category: 'istorie',
        difficulty: 'mediu',
        type: 'choice',
        question: `Care dintre următoarele evenimente istorice s-a petrecut primul în ordine cronologică (comparând momentele asociate cu ${evA.place}, ${evB.place}, ${evC.place} și ${evD.place})?`,
        options,
        correctAnswerIndex,
        explanation: `Primul eveniment în ordine cronologică a fost „${earliest.event}” în anul ${earliest.year}.`,
        sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_Rom%C3%A2niei',
      });
    }

    // Estimation: Exact number of years between two milestone events
    if (estimationQuestions.length < 2750) {
      const span = Math.abs(evB.year - evA.year);
      addQuestion({
        id: `est_hist_span_${i}_${j}`,
        category: 'istorie',
        difficulty: 'greu',
        type: 'estimation',
        question: `Câți ani au trecut între evenimentul „${evA.event}” și evenimentul „${evB.event}”?`,
        targetNumber: span,
        unit: 'ani',
        explanation: `Între anul ${evA.year} și anul ${evB.year} este o diferență de exact ${span} ani.`,
        sourceUrl: 'https://ro.wikipedia.org/wiki/Istoria_Rom%C3%A2niei',
      });
    }
  }
}

// 4.4 Ensure every single one of the 14 game categories has >= 65 choice & >= 65 estimation verified questions
const EXTRA_DOMAIN_BANK = [
  // BIOLOGIE
  {
    cat: 'biologie',
    baseLabel: 'Anatomia și fiziologia corpului uman și zoologia vertebratelor',
    items: [
      { subject: 'Omul adult sănătos (repaus)', metricName: 'frecvența cardiacă medie în repaus (bătăi pe minut)', val: 72, unit: 'bpm', group: 'Fiziologie umană' },
      { subject: 'Scheletul axial și apendicular al unui nou-născut uman', metricName: 'numărul aproximat de oase la naștere înainte de osificare', val: 270, unit: 'oase', group: 'Osteologie' },
      { subject: 'Coloana vertebrală umană completă (inclusiv vertebrele sudate)', metricName: 'numărul total de vertebre (cervicale, toracale, lombare, sacrate, coccigiene)', val: 33, unit: 'vertebre', group: 'Osteologie' },
      { subject: 'Segmentul cervical al coloanei vertebrale la mamifere', metricName: 'numărul de vertebre cervicale la om și majoritatea mamiferelor', val: 7, unit: 'vertebre', group: 'Anatomie comparată' },
      { subject: 'Segmentul toracal al coloanei vertebrale umane', metricName: 'numărul de vertebre toracale articulate cu coastele', val: 12, unit: 'vertebre', group: 'Osteologie' },
      { subject: 'Segmentul lombar al coloanei vertebrale umane', metricName: 'numărul de vertebre lombare', val: 5, unit: 'vertebre', group: 'Osteologie' },
      { subject: 'Cutia toracică umană', metricName: 'numărul total de coaste (12 perechi)', val: 24, unit: 'coaste', group: 'Osteologie' },
      { subject: 'Dentiția temporară (de lapte) la copii', metricName: 'numărul total de dinți de lapte', val: 20, unit: 'dinți', group: 'Stomatologie' },
      { subject: 'Nervii cranieni ai sistemului nervos periferic uman', metricName: 'numărul de perechi de nervi cranieni', val: 12, unit: 'perechi', group: 'Neurologie' },
      { subject: 'Nervii spinali ai măduvei spinării la om', metricName: 'numărul de perechi de nervi spinali', val: 31, unit: 'perechi', group: 'Neurologie' },
      { subject: 'Inima mamiferelor și a păsărilor', metricName: 'numărul de camere (două atrii și două ventricule)', val: 4, unit: 'camere', group: 'Cardiologie' },
      { subject: 'Temperatura internă normală a corpului uman', metricName: 'temperatura fiziologică medie rotunjită în grade Celsius', val: 37, unit: '°C', group: 'Termoreglare' },
      { subject: 'Durata medie a sarcinii (gestației) la specia umană', metricName: 'numărul standard de săptămâni de gestație', val: 40, unit: 'săptămâni', group: 'Embriologie' },
      { subject: 'Durata de viață a unei hematii (globul roșu) în sângele uman', metricName: 'numărul mediu de zile în circulație', val: 120, unit: 'zile', group: 'Hematologie' },
      { subject: 'Genomul nuclear haploid al speciei Homo sapiens', metricName: 'numărul de cromozomi dintr-un gamet uman (ovul sau spermatozoid)', val: 23, unit: 'cromozomi', group: 'Genetică' },
      { subject: 'Gestația elefantului african (Loxodonta africana)', metricName: 'durata medie a gestației în luni', val: 22, unit: 'luni', group: 'Zoologie' },
      { subject: 'Inima caracatiței comune (Octopus vulgaris)', metricName: 'numărul total de inimi (una sistemică și două branhiale)', val: 3, unit: 'inimi', group: 'Biologie marină' },
      { subject: 'Membrele arahnidelor (păianjeni și scorpioni)', metricName: 'numărul de picioare articulate la arahnidele adulte', val: 8, unit: 'picioare', group: 'Entomologie' },
      { subject: 'Membrele insectelor adulte (clasa Insecta)', metricName: 'numărul de picioare toracice la insecte', val: 6, unit: 'picioare', group: 'Entomologie' },
      { subject: 'Membrele crustaceelor decapode (crabi, homari, raci)', metricName: 'numărul de picioare locomotoare', val: 10, unit: 'picioare', group: 'Zoologie' },
    ],
  },
  // FIZICA
  {
    cat: 'fizica',
    baseLabel: 'Mărimi fizice, constante universale și unități din Sistemul Internațional',
    items: [
      { subject: 'Accelerația gravitațională standard la nivelul mării pe Pământ', metricName: 'valoarea rotunjită la întreg în m/s²', val: 10, unit: 'm/s²', group: 'Mecanică clasică' },
      { subject: 'Zero absolut pe scara Celsius (0 Kelvin)', metricName: 'temperatura rotunjită în grade Celsius', val: -273, unit: '°C', group: 'Termodinamică' },
      { subject: 'Punctul de îngheț al apei pure pe scara Fahrenheit', metricName: 'temperatura în grade Fahrenheit (°F)', val: 32, unit: '°F', group: 'Termodinamică' },
      { subject: 'Punctul de fierbere al apei pure pe scara Fahrenheit la 1 atm', metricName: 'temperatura în grade Fahrenheit (°F)', val: 212, unit: '°F', group: 'Termodinamică' },
      { subject: 'Frecvența standard a rețelei electrice de curent alternativ în România și Uniunea Europeană', metricName: 'frecvența în hertzi (Hz)', val: 50, unit: 'Hz', group: 'Electrotehnică' },
      { subject: 'Tensiunea nominală monofazată a rețelei electrice casnice în România', metricName: 'tensiunea eficace în volți (V)', val: 230, unit: 'V', group: 'Electrotehnică' },
      { subject: 'Tensiunea nominală trifazată de joasă tensiune în România', metricName: 'tensiunea între faze în volți (V)', val: 400, unit: 'V', group: 'Electrotehnică' },
      { subject: 'Viteza sunetului în apă dulce la temperatura camerei', metricName: 'viteza de propagare aproximativă în m/s', val: 1480, unit: 'm/s', group: 'Acustică' },
      { subject: 'Densitatea apei lichide pure la temperatura de 4 °C', metricName: 'densitatea în kg/m³', val: 1000, unit: 'kg/m³', group: 'Mecanica fluidelor' },
      { subject: 'Densitatea medie a fierului la temperatura camerei', metricName: 'densitatea în kg/m³', val: 7874, unit: 'kg/m³', group: 'Fizica corpului solid' },
      { subject: 'Densitatea aurului pur la 20 °C', metricName: 'densitatea în kg/m³', val: 19300, unit: 'kg/m³', group: 'Fizica corpului solid' },
      { subject: 'Timpul necesar luminii solare pentru a ajunge de la Soare la Pământ', metricName: 'durata aproximativă în secunde (8 minute și 20 secunde)', val: 500, unit: 'secunde', group: 'Astrofizică' },
      { subject: 'A doua viteză cosmică (viteza de evadare de pe suprafața Pământului)', metricName: 'viteza rotunjită în km/h', val: 40320, unit: 'km/h', group: 'Mecanică cerească' },
      { subject: 'Prima viteză cosmică (viteza orbitală circulară joasă în jurul Pământului)', metricName: 'viteza rotunjită în m/s', val: 7900, unit: 'm/s', group: 'Mecanică cerească' },
      { subject: 'Presiunea atmosferică normală la nivelul mării în hectopascali', metricName: 'valoarea standard rotunjită în hPa (mbar)', val: 1013, unit: 'hPa', group: 'Fizica atmosferei' },
      { subject: 'Presiunea atmosferică normală pe coloana de mercur (Torricelli)', metricName: 'înălțimea coloanei în milimetri coloană de mercur (mmHg)', val: 760, unit: 'mmHg', group: 'Fizica atmosferei' },
      { subject: 'Limita inferioară a frecvențelor sonore audibile de urechea umană', metricName: 'frecvența minimă în hertzi (Hz)', val: 20, unit: 'Hz', group: 'Acustică' },
      { subject: 'Limita superioară a frecvențelor sonore audibile de un om tânăr', metricName: 'frecvența maximă în hertzi (Hz)', val: 20000, unit: 'Hz', group: 'Acustică' },
      { subject: 'Un cal-putere metric (CP) exprimat în wați', metricName: 'puterea echivalentă rotunjită în wați (W)', val: 735, unit: 'W', group: 'Mecanică' },
      { subject: 'O oră exprimată în secunde în Sistemul Internațional', metricName: 'numărul exact de secunde dintr-o oră', val: 3600, unit: 'secunde', group: 'Metrologie' },
    ],
  },
  // ARTA
  {
    cat: 'arta',
    baseLabel: 'Capodopere ale picturii, sculpturii și arhitecturii universale și românești',
    items: [
      { subject: 'Ansamblul monumental „Calea Eroilor” realizat de Constantin Brâncuși la Târgu Jiu', metricName: 'anul inaugurării oficiale a ansamblului sculptural', val: 1938, unit: 'an', group: 'Sculptură modernă' },
      { subject: 'Masa Tăcerii din ansamblul lui Constantin Brâncuși de la Târgu Jiu', metricName: 'numărul de scaune în formă de clepsidră care înconjoară Masa Tăcerii', val: 12, unit: 'scaune', group: 'Sculptură modernă' },
      { subject: 'Coloana fără Sfârșit (Coloana Infinitului) de la Târgu Jiu', metricName: 'înălțimea rotunjită în metri a coloanei proiectate de Brâncuși', val: 29, unit: 'm', group: 'Sculptură modernă' },
      { subject: 'Pictarea bolții Capelei Sixtine de la Vatican de către Michelangelo Buonarroti', metricName: 'anul finalizării și dezvelirii frescelor de pe boltă', val: 1512, unit: 'an', group: 'Renașterea italiană' },
      { subject: 'Sculptura „David” în marmură realizată de Michelangelo la Florența', metricName: 'anul finalizării capodoperei renascentiste', val: 1504, unit: 'an', group: 'Renașterea italiană' },
      { subject: 'Pictura murală „Cina cea de Taină” realizată de Leonardo da Vinci la Milano', metricName: 'anul finalizării lucrării în refectoriul Santa Maria delle Grazie', val: 1498, unit: 'an', group: 'Renașterea italiană' },
      { subject: 'Tabloul „Impresie, răsărit de soare” de Claude Monet (care a dat numele impresionismului)', metricName: 'anul în care a fost pictată pânza la Le Havre', val: 1872, unit: 'an', group: 'Impresionism' },
      { subject: 'Tabloul „Rondul de noapte” realizat de maestrul olandez Rembrandt van Rijn', metricName: 'anul finalizării celebrului tablou din Rijksmuseum', val: 1642, unit: 'an', group: 'Barocul olandez' },
      { subject: 'Tabloul „Fata cu cercel de perlă” pictat de Johannes Vermeer', metricName: 'anul aproximativ al realizării lucrării (1665)', val: 1665, unit: 'an', group: 'Barocul olandez' },
      { subject: 'Tabloul „Țipătul” (prima versiune celebră) realizat de pictorul expresionist Edvard Munch', metricName: 'anul realizării operei la Oslo', val: 1893, unit: 'an', group: 'Expresionism' },
      { subject: 'Tabloul „Sărutul” din perioada de aur a pictorului austriac Gustav Klimt', metricName: 'anul finalizării capodoperei expuse la Palatul Belvedere din Viena', val: 1908, unit: 'an', group: 'Art Nouveau / Secession' },
      { subject: 'Tabloul „Carul cu boi” (versiunea de la Muzeul Național de Artă) de Nicolae Grigorescu', metricName: 'anul nașterii pictorului național Nicolae Grigorescu', val: 1838, unit: 'an', group: 'Pictură românească' },
      { subject: 'Pictorul român Ștefan Luchian („Anemone”, „Albăstrele”)', metricName: 'anul nașterii lui Ștefan Luchian la Ștefănești', val: 1868, unit: 'an', group: 'Pictură românească' },
      { subject: 'Pictorul român Nicolae Tonitza („Ochii copiilor”)', metricName: 'anul nașterii lui Nicolae Tonitza la Bârlad', val: 1886, unit: 'an', group: 'Pictură românească' },
      { subject: 'Pictorul român Ion Andreescu („Stejarul”, „Iarna la Barbizon”)', metricName: 'anul nașterii lui Ion Andreescu', val: 1850, unit: 'an', group: 'Pictură românească' },
      { subject: 'Pictorul român Theodor Aman, fondatorul Școlii Naționale de Arte Frumoase din București', metricName: 'anul fondării Școlii de Arte Frumoase din București împreună cu Gheorghe Tattarescu', val: 1864, unit: 'an', group: 'Pictură românească' },
      { subject: 'Piramida de sticlă și metal din curtea Muzeului Luvru din Paris (arhitect I. M. Pei)', metricName: 'anul inaugurării oficiale a Piramidei de la Luvru', val: 1989, unit: 'an', group: 'Arhitectură modernă' },
      { subject: 'Statuia Libertății din New York, sculptată de Frederic Auguste Bartholdi', metricName: 'anul inaugurării oficiale a monumentului dăruit de Franța', val: 1886, unit: 'an', group: 'Sculptură monumentală' },
      { subject: 'Castelul Peleș din Sinaia, reședința de vară a regilor României', metricName: 'anul inaugurării oficiale a Castelului Peleș sub domnia lui Carol I', val: 1883, unit: 'an', group: 'Arhitectură regală' },
      { subject: 'Ateneul Român din București, edificiu simbol al culturii naționale', metricName: 'anul inaugurării palatului Ateneului Român („Dați un leu pentru Ateneu”)', val: 1888, unit: 'an', group: 'Arhitectură neoclasică' },
    ],
  },
  // MUZICA
  {
    cat: 'muzica',
    baseLabel: 'Mari compozitori, opere lirice, simfonii și instrumente muzicale',
    items: [
      { subject: 'George Enescu, cel mai mare compozitor, violonist și dirijor român', metricName: 'anul nașterii lui George Enescu la Liveni', val: 1881, unit: 'an', group: 'Muzică clasică românească' },
      { subject: 'Festivalul Internațional „George Enescu” de la București', metricName: 'anul primei ediții a Festivalului Internațional George Enescu', val: 1958, unit: 'an', group: 'Muzică clasică românească' },
      { subject: 'Ciprian Porumbescu, compozitorul „Baladei” și al operetei „Crai Nou”', metricName: 'anul premierei primei operete românești „Crai Nou” la Brașov', val: 1882, unit: 'an', group: 'Muzică romantică românească' },
      { subject: 'Johann Sebastian Bach, titanul muzicii baroce europene', metricName: 'anul nașterii lui Johann Sebastian Bach la Eisenach', val: 1685, unit: 'an', group: 'Baroc muzical' },
      { subject: 'Wolfgang Amadeus Mozart, geniul clasicismului vienez', metricName: 'anul nașterii lui Wolfgang Amadeus Mozart la Salzburg', val: 1756, unit: 'an', group: 'Clasicism vienez' },
      { subject: 'Ludwig van Beethoven, punte între clasicism și romantism', metricName: 'numărul total de simfonii finalizate de Ludwig van Beethoven', val: 9, unit: 'simfonii', group: 'Clasicism și Romantism' },
      { subject: 'Pianul modern de concert cu claviatura standardizată', metricName: 'numărul total de clape (52 albe și 36 negre)', val: 88, unit: 'clape', group: 'Organologie' },
      { subject: 'Vioara, viola, violoncelul și contrabasul clasic', metricName: 'numărul standard de corzi ale unei viori clasice', val: 4, unit: 'corzi', group: 'Instrumente cu coarde' },
      { subject: 'Chitara acustică sau clasică standard', metricName: 'numărul standard de corzi ale unei chitare clasice', val: 6, unit: 'corzi', group: 'Instrumente cu coarde' },
      { subject: 'Portativul muzical clasic folosit în notația occidentală', metricName: 'numărul de linii paralele orizontale ale unui portativ', val: 5, unit: 'linii', group: 'Teoria muzicii' },
      { subject: 'Frecvența standard de acordaj pentru nota La central (A4 / diapazon)', metricName: 'frecvența acustică standard în hertzi (Hz)', val: 440, unit: 'Hz', group: 'Acustică muzicală' },
      { subject: 'Opera „Nabucco” (cu celebrul Cor al sclavilor evrei) de Giuseppe Verdi', metricName: 'anul premierei absolute la Teatro alla Scala din Milano', val: 1842, unit: 'an', group: 'Operă italiană' },
      { subject: 'Opera „Aida” compusă de Giuseppe Verdi', metricName: 'anul premierei mondiale la Opera Khedivială din Cairo', val: 1871, unit: 'an', group: 'Operă italiană' },
      { subject: 'Opera „Carmen” compusă de Georges Bizet', metricName: 'anul premierei la Opéra-Comique din Paris', val: 1875, unit: 'an', group: 'Operă franceză' },
      { subject: 'Opera „Tosca” compusă de Giacomo Puccini', metricName: 'anul premierei la Teatro Costanzi din Roma', val: 1900, unit: 'an', group: 'Operă veristă' },
      { subject: 'Opera „Turandot” (cu aria „Nessun dorma”) de Giacomo Puccini', metricName: 'anul premierei postume la Teatro alla Scala din Milano', val: 1926, unit: 'an', group: 'Operă italiană' },
      { subject: 'Baletul „Spărgătorul de nuci” de Piotr Ilici Ceaikovski', metricName: 'anul premierei la Teatrul Mariinski din Sankt Petersburg', val: 1892, unit: 'an', group: 'Balet clasic' },
      { subject: 'Lucrarea orchestrală „Boléro” de Maurice Ravel', metricName: 'anul premierei la Opera din Paris', val: 1928, unit: 'an', group: 'Muzică simfonică' },
      { subject: 'Serghei Rahmaninov, mare pianist și compozitor rus stabilit în Occident', metricName: 'anul nașterii lui Serghei Rahmaninov', val: 1873, unit: 'an', group: 'Postromantism' },
      { subject: 'Frederic Chopin, „poetul pianului” din epoca romantică', metricName: 'anul nașterii lui Frederic Chopin lângă Varșovia', val: 1810, unit: 'an', group: 'Romantism muzical' },
    ],
  },
  // CINEMATOGRAFIE
  {
    cat: 'cinematografie',
    baseLabel: 'Istoria cinematografiei mondiale și românești, festivaluri și premii Oscar',
    items: [
      { subject: 'Prima proiecție publică comercială de film a fraților Auguste și Louis Lumière la Paris', metricName: 'anul primei proiecții cinematografice la Salon Indien du Grand Café', val: 1895, unit: 'an', group: 'Pionierii cinemaului' },
      { subject: 'Prima gală a Premiilor Academiei Americane de Film (Premiile Oscar)', metricName: 'anul primei ceremonii a Premiilor Oscar la Hollywood Roosevelt Hotel', val: 1929, unit: 'an', group: 'Premiile Oscar' },
      { subject: 'Trilogia record „Ben-Hur” (1959), „Titanic” (1997) și „Stăpânul Inelelor: Întoarcerea Regelui” (2003)', metricName: 'numărul record de premii Oscar câștigate de fiecare dintre aceste trei filme', val: 11, unit: 'premii Oscar', group: 'Recorduri Oscar' },
      { subject: 'Filmul istoric românesc „Independența României” regizat de Aristide Demetriade', metricName: 'anul premierei primului lungmetraj artistic românesc', val: 1912, unit: 'an', group: 'Cinema românesc' },
      { subject: 'Filmul „Pădurea spânzuraților” regizat de Liviu Ciulei (Premiul pentru regie la Cannes)', metricName: 'anul în care Liviu Ciulei a câștigat Premiul pentru cel mai bun regizor la Festivalul de la Cannes', val: 1965, unit: 'an', group: 'Cinema românesc' },
      { subject: 'Scurtmetrajul de animație „Scurtă istorie” realizat de Ion Popescu-Gopo (Palme d\'Or la Cannes)', metricName: 'anul în care „Omulețul lui Gopo” a câștigat Palme d\'Or pentru scurtmetraj la Cannes', val: 1957, unit: 'an', group: 'Animație românească' },
      { subject: 'Filmul istoric „Mihai Viteazul” regizat de Sergiu Nicolaescu cu Amza Pellea în rolul titular', metricName: 'anul lansării în cinematografe a epopeii naționale „Mihai Viteazul”', val: 1971, unit: 'an', group: 'Cinema românesc' },
      { subject: 'Filmul „Moromeții” regizat de Stere Gulea cu Victor Rebengiuc în rolul lui Ilie Moromete', metricName: 'anul premierei filmului „Moromeții”', val: 1987, unit: 'an', group: 'Cinema românesc' },
      { subject: 'Filmul „Filantropica” regizat de Nae Caranfil cu Mircea Diaconu și Gheorghe Dinică', metricName: 'anul premierei comediei negre „Filantropica”', val: 2002, unit: 'an', group: 'Cinema românesc' },
      { subject: 'Filmul „A fost sau n-a fost?” (12:08 East of Bucharest) regizat de Corneliu Porumboiu (Camera d\'Or la Cannes)', metricName: 'anul lansării și premierei la Cannes', val: 2006, unit: 'an', group: 'Noul Val Românesc' },
      { subject: 'Festivalul Internațional de Film Transilvania (TIFF) de la Cluj-Napoca', metricName: 'anul primei ediții a festivalului TIFF', val: 2002, unit: 'an', group: 'Festivaluri de film' },
      { subject: 'Filmul clasic „Cetățeanul Kane” (Citizen Kane) regizat și interpretat de Orson Welles', metricName: 'anul lansării filmului „Citizen Kane”', val: 1941, unit: 'an', group: 'Cinema clasic mondial' },
      { subject: 'Filmul „Casablanca” regizat de Michael Curtiz cu Humphrey Bogart și Ingrid Bergman', metricName: 'anul premierei filmului „Casablanca”', val: 1942, unit: 'an', group: 'Cinema clasic mondial' },
      { subject: 'Filmul „Cei șapte samurai” regizat de maestrul japonez Akira Kurosawa', metricName: 'anul lansării capodoperei lui Akira Kurosawa', val: 1954, unit: 'an', group: 'Cinema asiatic' },
      { subject: 'Filmul SF „2001: O odisee spațială” regizat de Stanley Kubrick', metricName: 'anul lansării filmului lui Stanley Kubrick', val: 1968, unit: 'an', group: 'Science-Fiction' },
      { subject: 'Primul film din saga „Războiul Stelelor” (Star Wars: Episodul IV - O nouă speranță) de George Lucas', metricName: 'anul lansării în cinematografe a primului film Star Wars', val: 1977, unit: 'an', group: 'Science-Fiction' },
      { subject: 'Filmul „Lista lui Schindler” regizat de Steven Spielberg', metricName: 'anul lansării filmului distins cu 7 premii Oscar', val: 1993, unit: 'an', group: 'Dramă istorică' },
      { subject: 'Filmul „Închisoarea îngerilor” (The Shawshank Redemption) regizat de Frank Darabont', metricName: 'anul lansării filmului bazat pe nuvela lui Stephen King', val: 1994, unit: 'an', group: 'Dramă americană' },
      { subject: 'Filmul „Matrix” (The Matrix) scris și regizat de frații/surorile Wachowski', metricName: 'anul lansării primului film „The Matrix”', val: 1999, unit: 'an', group: 'Science-Fiction' },
      { subject: 'Filmul sud-coreean „Parazit” (Parasite) regizat de Bong Joon-ho (Palme d\'Or și Oscar pentru cel mai bun film)', metricName: 'anul lansării internaționale a filmului „Parasite”', val: 2019, unit: 'an', group: 'Cinema contemporan' },
    ],
  },
  // TEHNOLOGIE
  {
    cat: 'tehnologie',
    baseLabel: 'Invenții inginerești, aviație, telecomunicații și explorare spațială',
    items: [
      { subject: 'Primul zbor mecanic autopropulsat din lume cu un aparat mai greu decât aerul (Kitty Hawk, frații Wright)', metricName: 'anul primului zbor al fraților Orville și Wilbur Wright', val: 1903, unit: 'an', group: 'Istoria aviației' },
      { subject: 'Primul zbor mondial al unui avion care s-a ridicat de la sol prin mijloace proprii de bord (Traian Vuia la Montesson)', metricName: 'anul zborului istoric al lui Traian Vuia (18 martie)', val: 1906, unit: 'an', group: 'Aviație românească' },
      { subject: 'Construirea și zborul avionului „Vlaicu I” proiectat de inginerul român Aurel Vlaicu', metricName: 'anul primului zbor al lui Aurel Vlaicu pe Câmpul Cotrocenilor', val: 1910, unit: 'an', group: 'Aviație românească' },
      { subject: 'Lucrarea de pionierat „Racheta spre spațiile interplanetare” publicată de fizicianul sibian Hermann Oberth', metricName: 'anul publicării lucrării fundamentale pentru astronautică', val: 1923, unit: 'an', group: 'Astronautică' },
      { subject: 'Inventarea pilei electrice cu combustie internă și electrozi inatacabili (Pila Karpen) de către Nicolae Vasilescu-Karpen', metricName: 'anul brevetării invenției lui Nicolae Vasilescu-Karpen', val: 1922, unit: 'an', group: 'Inginerie electrică' },
      { subject: 'Brevetarea scaunului ejectabil pentru piloți de către inventatorul român Anastase Dragomir', metricName: 'anul obținerii brevetului francez pentru cabina catapultabilă', val: 1930, unit: 'an', group: 'Siguranță aviatică' },
      { subject: 'Lansarea pe orbită a primului satelit artificial al Pământului (Sputnik 1)', metricName: 'anul lansării satelitului Sputnik 1', val: 1957, unit: 'an', group: 'Explorare spațială' },
      { subject: 'Lansarea telescopului spațial Hubble pe orbita terestră joasă de către NASA și ESA', metricName: 'anul lansării Telescopului Spațial Hubble cu naveta Discovery', val: 1990, unit: 'an', group: 'Tehnologie spațială' },
      { subject: 'Lansarea Telescopului Spațial James Webb (JWST) în punctul Lagrange L2', metricName: 'anul lansării Telescopului Spațial James Webb (25 decembrie)', val: 2021, unit: 'an', group: 'Tehnologie spațială' },
      { subject: 'Lansarea primului microprocesor comercial pe un singur cip din lume (Intel 4004)', metricName: 'anul lansării microprocesorului Intel 4004', val: 1971, unit: 'an', group: 'Microelectronică' },
      { subject: 'Numărul de tranzistoare integrate pe primul microprocesor comercial Intel 4004', metricName: 'numărul exact de tranzistoare din cipul Intel 4004', val: 2300, unit: 'tranzistoare', group: 'Microelectronică' },
      { subject: 'Brevetarea telefonului electric de către Alexander Graham Bell', metricName: 'anul obținerii brevetului istoric pentru telefon', val: 1876, unit: 'an', group: 'Telecomunicații' },
      { subject: 'Inventarea becului electric cu filament incandescent practic de către Thomas Alva Edison', metricName: 'anul demonstrării publice a becului incandescent la Menlo Park', val: 1879, unit: 'an', group: 'Electrotehnică' },
      { subject: 'Construirea primului automobil modern cu motor cu ardere internă pe benzină (Benz Patent-Motorwagen)', metricName: 'anul brevetării automobilului de către Karl Benz', val: 1886, unit: 'an', group: 'Inginerie auto' },
      { subject: 'Inaugurarea primei linii de metrou din București (Magistrala 1 pe tronsonul Semănătoarea – Timpuri Noi)', metricName: 'anul dării în folosință a metroului bucureștean', val: 1979, unit: 'an', group: 'Infrastructură de transport' },
      { subject: 'Inaugurarea drumului alpin Transfăgărășan (DN7C) peste Munții Făgăraș', metricName: 'anul inaugurării oficiale a Transfăgărășanului', val: 1974, unit: 'an', group: 'Inginerie civilă' },
      { subject: 'Altitudinea maximă atinsă de șoseaua Transfăgărășan în zona Tunelului Bâlea Lac', metricName: 'altitudinea în metri deasupra nivelului mării', val: 2042, unit: 'm', group: 'Inginerie civilă' },
      { subject: 'Altitudinea maximă atinsă de șoseaua Transalpina (DN67C) în Pasul Urdele din Munții Parâng', metricName: 'altitudinea celui mai înalt punct rutier din România în metri', val: 2145, unit: 'm', group: 'Inginerie civilă' },
      { subject: 'Punerea în funcțiune a Sistemului Hidroenergetic și de Navigație Porțile de Fier I pe Dunăre', metricName: 'anul inaugurării oficiale a hidrocentralei Porțile de Fier I', val: 1972, unit: 'an', group: 'Inginerie energetică' },
      { subject: 'Punerea în funcțiune a Unității 1 a Centralei Nuclearelectrice de la Cernavodă (reactor CANDU)', metricName: 'anul conectării la sistemul energetic național a Unității 1 Cernavodă', val: 1996, unit: 'an', group: 'Energie nucleară' },
    ],
  },
  // SPORT (Extra verified records)
  {
    cat: 'sport',
    baseLabel: 'Regulamente sportive oficiale, dimensiuni de teren și recorduri olimpice',
    items: [
      { subject: 'Terenul de fotbal regulamentar și echipa de start în jocul de fotbal (FIFA)', metricName: 'numărul de jucători dintr-o echipă pe teren la începutul meciului', val: 11, unit: 'jucători', group: 'Fotbal' },
      { subject: 'Durata regulamentară a unui meci de fotbal fără prelungiri (două reprize a câte 45 de minute)', metricName: 'numărul total de minute de joc efectiv regulamentar', val: 90, unit: 'minute', group: 'Fotbal' },
      { subject: 'Lovitura de pedeapsă (penalty) în fotbalul pe teren mare', metricName: 'distanța rotunjită în metri de la punctul cu var până la linia porții (11 metri)', val: 11, unit: 'm', group: 'Fotbal' },
      { subject: 'Jocul de baschet olimpic și FIBA (echipa pe parchet)', metricName: 'numărul de jucători ai unei echipe aflați simultan pe teren', val: 5, unit: 'jucători', group: 'Baschet' },
      { subject: 'Înălțimea oficială a inelului de baschet față de suprafața terenului (10 picioare)', metricName: 'înălțimea exprimată în centimetri', val: 305, unit: 'cm', group: 'Baschet' },
      { subject: 'Jocul de volei pe sală (echipa pe teren)', metricName: 'numărul de jucători ai unei echipe aflați simultan pe terenul de volei', val: 6, unit: 'jucători', group: 'Volei' },
      { subject: 'Jocul de handbal pe teren normal (echipa în teren, inclusiv portarul)', metricName: 'numărul de jucători ai unei echipe aflați simultan pe teren', val: 7, unit: 'jucători', group: 'Handbal' },
      { subject: 'Durata regulamentară a unui meci de handbal seniori (două reprize a câte 30 de minute)', metricName: 'numărul total de minute de joc regulamentar', val: 60, unit: 'minute', group: 'Handbal' },
      { subject: 'Jocul de rugby în XV (Rugby Union)', metricName: 'numărul de jucători titulari ai unei echipe pe teren', val: 15, unit: 'jucători', group: 'Rugby' },
      { subject: 'Durata regulamentară a unui meci de rugby în XV (două reprize a câte 40 de minute)', metricName: 'numărul total de minute de joc', val: 80, unit: 'minute', group: 'Rugby' },
      { subject: 'Bazinul olimpic standard pentru probele de înot de la Jocurile Olimpice', metricName: 'lungimea bazinului olimpic în metri', val: 50, unit: 'm', group: 'Natație' },
      { subject: 'Pista standard de atletism în aer liber (stadion olimpic)', metricName: 'lungimea unui tur complet pe culoarul interior în metri', val: 400, unit: 'm', group: 'Atletism' },
      { subject: 'Proba olimpică de maraton în atletism (42,195 km)', metricName: 'lungimea exactă a cursei de maraton exprimată în metri', val: 42195, unit: 'm', group: 'Atletism' },
      { subject: 'Proba combinată de decatlon din atletismul masculin', metricName: 'numărul total de probe individuale desfășurate pe parcursul a două zile', val: 10, unit: 'probe', group: 'Atletism' },
      { subject: 'Proba combinată de heptatlon din atletismul feminin în aer liber', metricName: 'numărul total de probe individuale', val: 7, unit: 'probe', group: 'Atletism' },
      { subject: 'Tabla clasică de șah utilizată în competițiile FIDE', metricName: 'numărul total de pătrate (câmpuri albe și negre) de pe tabla de șah', val: 64, unit: 'pătrate', group: 'Șah' },
      { subject: 'Piesele de șah la începutul unei partide standard', metricName: 'numărul total de piese (albe și negre cumulate) aflate pe tablă la start', val: 32, unit: 'piese', group: 'Șah' },
      { subject: 'Turneele de Mare Șlem (Grand Slam) din tenisul profesionist mondial într-un an calendaristic', metricName: 'numărul de turnee de Grand Slam (Australian Open, Roland Garros, Wimbledon, US Open)', val: 4, unit: 'turnee', group: 'Tenis' },
      { subject: 'Cercurile întrețesute de pe drapelul olimpic oficial', metricName: 'numărul de cercuri olimpice reprezentând continentele', val: 5, unit: 'cercuri', group: 'Olimpism' },
      { subject: 'Arena Națională din București, cel mai mare stadion din România', metricName: 'anul inaugurării oficiale a noii Arene Naționale din București', val: 2011, unit: 'an', group: 'Infrastructură sportivă' },
    ],
  },
  // LITERATURA
  {
    cat: 'literatura',
    baseLabel: 'Repere cronologice și cantitative din literatura română și universală',
    items: [
      { subject: 'Poemul „Luceafărul” de Mihai Eminescu (publicat în Almanahul Societății Academice România Jună)', metricName: 'numărul total de strofe (catrene) ale poemului „Luceafărul”', val: 98, unit: 'strofe', group: 'Poezie românească' },
      { subject: 'Mihai Eminescu, poetul național al României, născut la Botoșani', metricName: 'anul nașterii lui Mihai Eminescu (15 ianuarie)', val: 1850, unit: 'an', group: 'Literatură clasică' },
      { subject: 'Ion Luca Caragiale, marele dramaturg și prozator clasic român', metricName: 'anul nașterii lui Ion Luca Caragiale la Haimanale', val: 1852, unit: 'an', group: 'Dramaturgie românească' },
      { subject: 'Ion Creangă, autorul „Amintirilor din copilărie” și al poveștilor clasice', metricName: 'anul nașterii lui Ion Creangă la Humulești', val: 1837, unit: 'an', group: 'Proză clasică' },
      { subject: 'Societatea literară „Junimea” înființată la Iași de Titu Maiorescu, Petre P. Carp, Vasile Pogor, Iacob Negruzzi și Theodor Rosetti', metricName: 'anul fondării societății culturale „Junimea” la Iași', val: 1863, unit: 'an', group: 'Critică literară' },
      { subject: 'Revista „Convorbiri literare”, organul de presă al societății Junimea', metricName: 'anul apariției primului număr al revistei „Convorbiri literare” la Iași', val: 1867, unit: 'an', group: 'Presă culturală' },
      { subject: 'Vasile Alecsandri, bardul de la Mircești, laureat al Premiului Gintei Latine la Montpellier', metricName: 'anul în care Vasile Alecsandri a fost premiat la Montpellier pentru „Cântecul Gintei Latine”', val: 1878, unit: 'an', group: 'Poezie pașoptistă' },
      { subject: 'George Coșbuc, poetul „Baladelor și idilelor” și al „Firelor de tort”', metricName: 'anul nașterii lui George Coșbuc la Hordou (Bistrița-Năsăud)', val: 1866, unit: 'an', group: 'Poezie tradiționalistă' },
      { subject: 'Lucian Blaga, filosof și poet expresionist român, născut la Lancrăm', metricName: 'anul nașterii lui Lucian Blaga (9 mai)', val: 1895, unit: 'an', group: 'Modernism interbelic' },
      { subject: 'Tudor Arghezi, autorul „Cuvintelor potrivite” și al „Florilor de mucigai”', metricName: 'anul nașterii lui Tudor Arghezi la București', val: 1880, unit: 'an', group: 'Modernism interbelic' },
      { subject: 'George Bacovia, cel mai important poet simbolist român, născut la Bacău', metricName: 'anul nașterii lui George Bacovia', val: 1881, unit: 'an', group: 'Simbolism românesc' },
      { subject: 'Liviu Rebreanu, creatorul romanului românesc modern, născut la Târlișua', metricName: 'anul nașterii lui Liviu Rebreanu', val: 1885, unit: 'an', group: 'Proză interbelică' },
      { subject: 'Mihail Sadoveanu, mare povestitor și academician român, născut la Pașcani', metricName: 'anul nașterii lui Mihail Sadoveanu', val: 1880, unit: 'an', group: 'Proză interbelică' },
      { subject: 'Camil Petrescu, teoretician al autenticității și sincronismului în proză și teatru', metricName: 'anul nașterii lui Camil Petrescu la București', val: 1894, unit: 'an', group: 'Proză modernă' },
      { subject: 'Mircea Eliade, istoric al religiilor și romancier, născut la București', metricName: 'anul nașterii lui Mircea Eliade', val: 1907, unit: 'an', group: 'Proză și filosofie' },
      { subject: 'Eugen Ionescu (Eugène Ionesco), părinte al teatrului absurdului și membru al Academiei Franceze', metricName: 'anul alegerii lui Eugen Ionescu în Academia Franceză', val: 1970, unit: 'an', group: 'Teatru universal' },
      { subject: 'Marin Preda, mare romancier postbelic, născut la Siliștea-Gumești (Teleorman)', metricName: 'anul nașterii lui Marin Preda', val: 1922, unit: 'an', group: 'Proză postbelică' },
      { subject: 'Nichita Stănescu, liderul generației șaizeciste („Necuvintele”, „11 elegii”)', metricName: 'anul nașterii poetului Nichita Stănescu la Ploiești', val: 1933, unit: 'an', group: 'Neomodernism' },
      { subject: 'Marin Sorescu, poet și dramaturg („Iona”, „La Lilieci”)', metricName: 'anul nașterii lui Marin Sorescu la Bulzești (Dolj)', val: 1936, unit: 'an', group: 'Neomodernism' },
      { subject: 'Capodopera „Divina Comedie” scrisă de Dante Alighieri (Infernul, Purgatoriul, Paradisul)', metricName: 'numărul total de cânturi din „Divina Comedie” (1 + 33 + 33 + 33)', val: 100, unit: 'cânturi', group: 'Literatură universală' },
    ],
  },
  // CULTURA GENERALA
  {
    cat: 'cultura_generala',
    baseLabel: 'Instituții, patrimoniu UNESCO, simboluri naționale și cultură enciclopedică',
    items: [
      { subject: 'Academia Română, cel mai înalt for științific și cultural al României (înființată inițial ca Societatea Literară Română)', metricName: 'anul fondării Academiei Române la București', val: 1866, unit: 'an', group: 'Instituții culturale' },
      { subject: 'Banca Națională a României (BNR), instituție fondată cu aportul lui Eugeniu Carada și Ion C. Brătianu', metricName: 'anul înființării Băncii Naționale a României', val: 1880, unit: 'an', group: 'Instituții naționale' },
      { subject: 'Adoptarea leului ca unitate monetară națională a Principatelor Unite sub domnia lui Carol I', metricName: 'anul adoptării legii monetare prin care leul a devenit moneda națională', val: 1867, unit: 'an', group: 'Istorie monetară' },
      { subject: 'Denominarea monedei naționale a României (trecerea de la 10.000 ROL la 1 RON)', metricName: 'anul denominării leului românesc (1 iulie)', val: 2005, unit: 'an', group: 'Economie și cultură' },
      { subject: 'Includerea Deltei Dunării pe Lista Patrimoniului Mondial Natural UNESCO', metricName: 'anul înscrierii Rezervației Biosferei Delta Dunării în patrimoniul UNESCO', val: 1991, unit: 'an', group: 'Patrimoniu UNESCO' },
      { subject: 'Includerea Cetății Medievale a Sighișoarei în Patrimoniul Mondial UNESCO', metricName: 'anul înscrierii centrului istoric al Sighișoarei în UNESCO', val: 1999, unit: 'an', group: 'Patrimoniu UNESCO' },
      { subject: 'Includerea cetăților dacice din Munții Orăștiei (Sarmizegetusa Regia ș.a.) în Patrimoniul UNESCO', metricName: 'anul înscrierii cetăților dacice pe lista UNESCO', val: 1999, unit: 'an', group: 'Patrimoniu UNESCO' },
      { subject: 'Includerea Peisajului Cultural Minier Roșia Montană în Patrimoniul Mondial UNESCO', metricName: 'anul înscrierii sitului Roșia Montană în patrimoniul UNESCO', val: 2021, unit: 'an', group: 'Patrimoniu UNESCO' },
      { subject: 'Programul „Sibiu – Capitală Culturală Europeană” (împreună cu Luxemburg)', metricName: 'anul în care municipiul Sibiu a deținut titlul de Capitală Culturală Europeană', val: 2007, unit: 'an', group: 'Cultură europeană' },
      { subject: 'Programul „Timișoara – Capitală Europeană a Culturii”', metricName: 'anul în care municipiul Timișoara a exercitat titlul de Capitală Europeană a Culturii', val: 2023, unit: 'an', group: 'Cultură europeană' },
      { subject: 'Premiile Nobel acordate pentru prima dată la Stockholm și Oslo conform testamentului lui Alfred Nobel', metricName: 'anul decernării primelor Premii Nobel din istorie', val: 1901, unit: 'an', group: 'Premiile Nobel' },
      { subject: 'George Emil Palade, primul savant de origine română laureat al Premiului Nobel pentru Fiziologie sau Medicină', metricName: 'anul în care George Emil Palade a primit Premiul Nobel', val: 1974, unit: 'an', group: 'Laureați Nobel' },
      { subject: 'Săptămâna calendaristică și zilele anului bisect în calendarul gregorian', metricName: 'numărul exact de zile dintr-un an bisect', val: 366, unit: 'zile', group: 'Calendar și timp' },
      { subject: 'Statele membre ale Uniunii Europene în prezent (după retragerea Regatului Unit)', metricName: 'numărul actual de state membre ale Uniunii Europene', val: 27, unit: 'state', group: 'Geopolitică europeană' },
      { subject: 'Stelele aurii dispuse în cerc pe drapelul oficial al Uniunii Europene și al Consiliului Europei', metricName: 'numărul de stele de pe drapelul european (simbol al perfecțiunii și unității)', val: 12, unit: 'stele', group: 'Simboluri europene' },
      { subject: 'Județele administrative ale României (fără Municipiul București care are statut special)', metricName: 'numărul exact de județe din România', val: 41, unit: 'județe', group: 'Administrație' },
      { subject: 'Sectoarele administrative ale Municipiului București', metricName: 'numărul de sectoare ale capitalei României', val: 6, unit: 'sectoare', group: 'Administrație' },
      { subject: 'Minunile Lumii Antice menționate în izvoarele elenistice (Marea Piramidă din Giza fiind singura păstrată)', metricName: 'numărul tradițional al Minunilor Lumii Antice', val: 7, unit: 'minuni', group: 'Istorie și cultură' },
      { subject: 'Literele alfabetului limbii române contemporane (inclusiv ă, â, î, ș, ț)', metricName: 'numărul total de litere din alfabetul oficial al limbii române', val: 31, unit: 'litere', group: 'Lingvistică' },
      { subject: 'Numărul caratelor care definesc aurul pur (999,9‰) în bijuterie și metalurgie', metricName: 'numărul de carate corespunzător aurului pur (100%)', val: 24, unit: 'carate', group: 'Cultură generală' },
    ],
  },
];

for (const domain of EXTRA_DOMAIN_BANK) {
  const { cat, items } = domain;
  const allSubjects = items.map((x) => x.subject);
  const allValsStr = items.map((x) => `${x.val} ${x.unit}`);

  items.forEach((item, idx) => {
    // Choice 1: Subject -> Value + Unit
    {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        `${item.val} ${item.unit}`,
        allValsStr,
        idx
      );
      addQuestion({
        id: `extra_${cat}_ch_val_${idx + 1}`,
        category: cat,
        difficulty: 'usor',
        type: 'choice',
        question: `Care este valoarea corectă pentru ${item.metricName} în cazul: ${item.subject}?`,
        options,
        correctAnswerIndex,
        explanation: `Pentru ${item.subject}, ${item.metricName} este ${item.val} ${item.unit}.`,
        sourceUrl: 'https://ro.wikipedia.org',
      });
    }
    // Choice 2: Metric + Value -> Subject
    {
      const { options, correctAnswerIndex } = buildChoiceOptions(
        item.subject,
        allSubjects,
        idx + 1
      );
      addQuestion({
        id: `extra_${cat}_ch_subj_${idx + 1}`,
        category: cat,
        difficulty: 'mediu',
        type: 'choice',
        question: `Cărui reper din domeniul „${item.group}” îi corespunde ${item.metricName} cu valoarea de ${item.val} ${item.unit}?`,
        options,
        correctAnswerIndex,
        explanation: `Valoarea ${item.val} ${item.unit} (${item.metricName}) corespunde reperului: ${item.subject}.`,
        sourceUrl: 'https://ro.wikipedia.org',
      });
    }
    // Choice 3: Comparative question within domain
    {
      const next1 = items[(idx + 1) % items.length];
      const next2 = items[(idx + 2) % items.length];
      const next3 = items[(idx + 3) % items.length];
      const quad = [item, next1, next2, next3];
      const uniqueVals = new Set(quad.map((q) => q.val));
      if (uniqueVals.size === 4) {
        const sorted = [...quad].sort((a, b) => b.val - a.val);
        const highest = sorted[0];
        const options = quad.map((q) => `${q.subject} (${q.metricName})`);
        const correctAnswerIndex = quad.findIndex((q) => q.subject === highest.subject);
        addQuestion({
          id: `extra_${cat}_ch_comp_${idx + 1}`,
          category: cat,
          difficulty: 'greu',
          type: 'choice',
          question: `Care dintre următoarele patru repere din categoria ${cat.toUpperCase()} are cea mai mare valoare numerică asociată (comparând ${item.subject}, ${next1.subject}, ${next2.subject} și ${next3.subject})?`,
          options,
          correctAnswerIndex,
          explanation: `Cea mai mare valoare numerică dintre cele patru este ${highest.val} (${highest.subject}).`,
          sourceUrl: 'https://ro.wikipedia.org',
        });
      }
    }

    // Estimation 1: Direct value
    addQuestion({
      id: `extra_${cat}_est_val_${idx + 1}`,
      category: cat,
      difficulty: 'mediu',
      type: 'estimation',
      question: `Care este valoarea numerică exactă pentru ${item.metricName} referitor la: ${item.subject}?`,
      targetNumber: item.val,
      unit: item.unit,
      explanation: `Valoarea exactă pentru ${item.subject} (${item.metricName}) este ${item.val} ${item.unit}.`,
      sourceUrl: 'https://ro.wikipedia.org',
    });

    // Estimation 2: Difference / Span with partner item in same domain
    const partner = items[(idx + 5) % items.length];
    if (partner.unit === item.unit && partner.val !== item.val) {
      const diffVal = Math.abs(item.val - partner.val);
      addQuestion({
        id: `extra_${cat}_est_diff_${idx + 1}`,
        category: cat,
        difficulty: 'greu',
        type: 'estimation',
        question: `Care este diferența absolută (în ${item.unit}) dintre valoarea asociată cu „${item.subject}” și cea asociată cu „${partner.subject}”?`,
        targetNumber: diffVal,
        unit: item.unit,
        explanation: `Diferența dintre ${item.val} ${item.unit} și ${partner.val} ${item.unit} este exact ${diffVal} ${item.unit}.`,
        sourceUrl: 'https://ro.wikipedia.org',
      });
    } else {
      const doubled = item.val * 2;
      addQuestion({
        id: `extra_${cat}_est_dbl_${idx + 1}`,
        category: cat,
        difficulty: 'greu',
        type: 'estimation',
        question: `Cât reprezintă dublul valorii numerice pentru ${item.metricName} în cazul reperului „${item.subject}”?`,
        targetNumber: doubled,
        unit: item.unit,
        explanation: `Întrucât valoarea de bază este ${item.val} ${item.unit}, dublul acesteia este ${doubled} ${item.unit}.`,
        sourceUrl: 'https://ro.wikipedia.org',
      });
    }
  });
}

// ---------------------------------------------------------------------------
// 5. VALIDATE THE ENTIRE CANONICAL QUESTION BANK
// ---------------------------------------------------------------------------

const allQuestions = [...choiceQuestions, ...estimationQuestions];
const categoryCounts = {};
const difficultyCounts = {};
let errors = 0;

const checkIds = new Set();
const checkFingerprints = new Set();

for (const q of allQuestions) {
  if (checkIds.has(q.id)) {
    console.error('Duplicate ID:', q.id);
    errors++;
  }
  checkIds.add(q.id);

  const fp = normalizeQuestionText(q.question);
  if (checkFingerprints.has(fp)) {
    console.error('Duplicate question text:', q.question);
    errors++;
  }
  checkFingerprints.add(fp);

  categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
  difficultyCounts[q.difficulty] = (difficultyCounts[q.difficulty] || 0) + 1;
}

if (errors > 0) {
  console.error(`Validation failed with ${errors} errors.`);
  process.exit(1);
}

// Write canonical files
const questionsDir = path.join(process.cwd(), 'data', 'questions');
fs.mkdirSync(questionsDir, { recursive: true });

fs.writeFileSync(
  path.join(questionsDir, 'choice.json'),
  JSON.stringify(choiceQuestions, null, 2),
  'utf8'
);

fs.writeFileSync(
  path.join(questionsDir, 'estimation.json'),
  JSON.stringify(estimationQuestions, null, 2),
  'utf8'
);

const manifest = {
  version: '8.0.0',
  generatedAt: new Date().toISOString(),
  totalQuestions: allQuestions.length,
  choiceCount: choiceQuestions.length,
  estimationCount: estimationQuestions.length,
  duplicateIds: 0,
  duplicateTexts: 0,
  categoryBreakdown: categoryCounts,
  difficultyBreakdown: difficultyCounts,
};

fs.writeFileSync(
  path.join(questionsDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf8'
);

// Also update data/conquiz_db.example.json with a clean template and canonical seed questions
const exampleDb = {
  users: [],
  questions: allQuestions,
  games: [],
  friends: [],
  notifications: [],
};
fs.writeFileSync(exampleDbPath, JSON.stringify(exampleDb, null, 2), 'utf8');

console.log('Canonical question bank generated & validated successfully:');
console.log(JSON.stringify(manifest, null, 2));
