const fs = require('fs');
const path = require('path');
const { processPreset } = require('./map_builder_core.cjs');

// 1. Preset 2 Players (10 Territories)
const p2 = [
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

// 2. Preset 3 Players (15 Territories)
const p3 = [
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

// 3. Preset 4 Players (20 Territories)
const p4 = [
  { id: 'maramures_satu_mare', name: 'Maramureș & Satu Mare', shortName: 'MM-SM', region: 'Nord', counties: ['Maramures', 'Satu Mare'] },
  { id: 'bihor_salaj', name: 'Bihor & Sălaj', shortName: 'BH-SJ', region: 'Crișana', counties: ['Bihor', 'Salaj'] },
  { id: 'cluj_bistrita', name: 'Cluj & Bistrița-Năsăud', shortName: 'CJ-BN', region: 'Transilvania', counties: ['Cluj', 'Bistrita-Nasaud'] },
  { id: 'arad_timis', name: 'Arad & Timiș Nord', shortName: 'AR-TM', region: 'Banat/Crișana', counties: ['Arad', 'Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'mures_harghita', name: 'Mureș & Harghita', shortName: 'MS-HR', region: 'Transilvania', counties: ['Mures', 'Harghita'] },
  { id: 'alba_hunedoara', name: 'Alba & Hunedoara', shortName: 'AB-HD', region: 'Transilvania', counties: ['Alba', 'Hunedoara'] },
  { id: 'sibiu_brasov_covasna', name: 'Sibiu, Brașov & Covasna', shortName: 'SB-BV', region: 'Transilvania', counties: ['Sibiu', 'Brasov', 'Covasna'] },
  { id: 'suceava_botosani', name: 'Suceava & Botoșani', shortName: 'SV-BT', region: 'Bucovina', counties: ['Suceava', 'Botosani'] },
  { id: 'iasi_neamt', name: 'Iași & Neamț', shortName: 'IS-NT', region: 'Moldova', counties: ['Iasi', 'Neamt'] },
  { id: 'bacau_vaslui', name: 'Bacău & Vaslui', shortName: 'BC-VS', region: 'Moldova', counties: ['Bacau', 'Vaslui'] },
  { id: 'vrancea_galati', name: 'Vrancea & Galați', shortName: 'VN-GL', region: 'Moldova', counties: ['Vrancea', 'Galati'] },
  { id: 'mehedinti_gorj', name: 'Mehedinți & Gorj', shortName: 'MH-GJ', region: 'Oltenia', counties: ['Mehedinti', 'Gorj'] },
  { id: 'dolj_olt', name: 'Dolj & Olt', shortName: 'DJ-OT', region: 'Oltenia', counties: ['Dolj', 'Olt'] },
  { id: 'valcea_arges', name: 'Vâlcea & Argeș', shortName: 'VL-AG', region: 'Oltenia/Muntenia', counties: ['Valcea', 'Arges'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'buzau_braila', name: 'Buzău & Brăila', shortName: 'BZ-BR', region: 'Muntenia', counties: ['Buzau', 'Braila'] },
  { id: 'bucuresti_ilfov', name: 'București & Ilfov', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov'] },
  { id: 'giurgiu_teleorman', name: 'Giurgiu, Teleorman, Călărași & Ialomița', shortName: 'TR-IL', region: 'Muntenia', counties: ['Teleorman', 'Giurgiu', 'Calarasi', 'Ialomita'] },
  { id: 'dobrogea', name: 'Dobrogea (Constanța & Tulcea)', shortName: 'CT-TL', region: 'Dobrogea', counties: ['Constanta', 'Tulcea'] },
];

// 4. Preset 5 Players (23 Territories)
const p5 = [
  { id: 'satu_mare_maramures', name: 'Satu Mare & Maramureș', shortName: 'SM-MM', region: 'Nord', counties: ['Satu Mare', 'Maramures'] },
  { id: 'bistrita_nasaud', name: 'Bistrița-Năsăud', shortName: 'BN', region: 'Transilvania', counties: ['Bistrita-Nasaud'] },
  { id: 'suceava', name: 'Suceava', shortName: 'SV', region: 'Bucovina', counties: ['Suceava'] },
  { id: 'botosani_iasi', name: 'Botoșani & Iași', shortName: 'BT-IS', region: 'Moldova', counties: ['Botosani', 'Iasi'] },
  { id: 'neamt_bacau', name: 'Neamț & Bacău', shortName: 'NT-BC', region: 'Moldova', counties: ['Neamt', 'Bacau'] },
  { id: 'vaslui_galati', name: 'Vaslui & Galați', shortName: 'VS-GL', region: 'Moldova', counties: ['Vaslui', 'Galati'] },
  { id: 'vrancea_buzau', name: 'Vrancea & Buzău', shortName: 'VN-BZ', region: 'Moldova/Muntenia', counties: ['Vrancea', 'Buzau'] },
  { id: 'bihor_salaj', name: 'Bihor & Sălaj', shortName: 'BH-SJ', region: 'Crișana', counties: ['Bihor', 'Salaj'] },
  { id: 'cluj', name: 'Cluj', shortName: 'CJ', region: 'Transilvania', counties: ['Cluj'] },
  { id: 'mures', name: 'Mureș', shortName: 'MS', region: 'Transilvania', counties: ['Mures'] },
  { id: 'harghita_covasna', name: 'Harghita & Covasna', shortName: 'HR-CV', region: 'Transilvania', counties: ['Harghita', 'Covasna'] },
  { id: 'arad_timis', name: 'Arad & Timiș', shortName: 'AR-TM', region: 'Banat/Crișana', counties: ['Arad', 'Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'hunedoara_alba', name: 'Hunedoara & Alba', shortName: 'HD-AB', region: 'Transilvania', counties: ['Hunedoara', 'Alba'] },
  { id: 'sibiu_brasov', name: 'Sibiu & Brașov', shortName: 'SB-BV', region: 'Transilvania', counties: ['Sibiu', 'Brasov'] },
  { id: 'gorj_mehedinti', name: 'Gorj & Mehedinți', shortName: 'GJ-MH', region: 'Oltenia', counties: ['Gorj', 'Mehedinti'] },
  { id: 'valcea_arges', name: 'Vâlcea & Argeș', shortName: 'VL-AG', region: 'Oltenia/Muntenia', counties: ['Valcea', 'Arges'] },
  { id: 'dolj_olt', name: 'Dolj & Olt', shortName: 'DJ-OT', region: 'Oltenia', counties: ['Dolj', 'Olt'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'braila_ialomita', name: 'Brăila & Ialomița', shortName: 'BR-IL', region: 'Muntenia', counties: ['Braila', 'Ialomita'] },
  { id: 'bucuresti_ilfov', name: 'București & Ilfov', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov'] },
  { id: 'teleorman_giurgiu_calarasi', name: 'Teleorman, Giurgiu & Călărași', shortName: 'TR-CL', region: 'Muntenia', counties: ['Teleorman', 'Giurgiu', 'Calarasi'] },
  { id: 'dobrogea', name: 'Dobrogea (Constanța & Tulcea)', shortName: 'CT-TL', region: 'Dobrogea', counties: ['Constanta', 'Tulcea'] },
];

// 5. Preset 6 Players (26 Territories)
const p6 = [
  { id: 'satu_mare_maramures', name: 'Satu Mare & Maramureș', shortName: 'SM-MM', region: 'Nord', counties: ['Satu Mare', 'Maramures'] },
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
  { id: 'timis', name: 'Timiș', shortName: 'TM', region: 'Banat', counties: ['Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'alba_hunedoara', name: 'Alba & Hunedoara', shortName: 'AB-HD', region: 'Transilvania', counties: ['Alba', 'Hunedoara'] },
  { id: 'sibiu_brasov', name: 'Sibiu & Brașov', shortName: 'SB-BV', region: 'Transilvania', counties: ['Sibiu', 'Brasov'] },
  { id: 'gorj_mehedinti', name: 'Gorj & Mehedinți', shortName: 'GJ-MH', region: 'Oltenia', counties: ['Gorj', 'Mehedinti'] },
  { id: 'valcea_arges', name: 'Vâlcea & Argeș', shortName: 'VL-AG', region: 'Oltenia/Muntenia', counties: ['Valcea', 'Arges'] },
  { id: 'dolj_olt', name: 'Dolj & Olt', shortName: 'DJ-OT', region: 'Oltenia', counties: ['Dolj', 'Olt'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'buzau_braila', name: 'Buzău & Brăila', shortName: 'BZ-BR', region: 'Muntenia', counties: ['Buzau', 'Braila'] },
  { id: 'bucuresti_ilfov', name: 'București & Ilfov', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov'] },
  { id: 'giurgiu_teleorman_baragan', name: 'Muntenia Sud (Teleorman, Giurgiu, Călărași, Ialomița)', shortName: 'TR-IL', region: 'Muntenia', counties: ['Teleorman', 'Giurgiu', 'Calarasi', 'Ialomita'] },
  { id: 'dobrogea', name: 'Dobrogea (Constanța & Tulcea)', shortName: 'CT-TL', region: 'Dobrogea', counties: ['Constanta', 'Tulcea'] },
];

// 6. Preset 7 Players (29 Territories)
const p7 = [
  { id: 'satu_mare_maramures', name: 'Satu Mare & Maramureș', shortName: 'SM-MM', region: 'Nord', counties: ['Satu Mare', 'Maramures'] },
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
  { id: 'timis', name: 'Timiș', shortName: 'TM', region: 'Banat', counties: ['Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'alba_hunedoara', name: 'Alba & Hunedoara', shortName: 'AB-HD', region: 'Transilvania', counties: ['Alba', 'Hunedoara'] },
  { id: 'sibiu_brasov', name: 'Sibiu & Brașov', shortName: 'SB-BV', region: 'Transilvania', counties: ['Sibiu', 'Brasov'] },
  { id: 'gorj_mehedinti', name: 'Gorj & Mehedinți', shortName: 'GJ-MH', region: 'Oltenia', counties: ['Gorj', 'Mehedinti'] },
  { id: 'valcea_arges', name: 'Vâlcea & Argeș', shortName: 'VL-AG', region: 'Oltenia/Muntenia', counties: ['Valcea', 'Arges'] },
  { id: 'dolj_olt', name: 'Dolj & Olt', shortName: 'DJ-OT', region: 'Oltenia', counties: ['Dolj', 'Olt'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'buzau_braila', name: 'Buzău & Brăila', shortName: 'BZ-BR', region: 'Muntenia', counties: ['Buzau', 'Braila'] },
  { id: 'bucuresti_ilfov', name: 'București & Ilfov', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov'] },
  { id: 'teleorman_giurgiu', name: 'Teleorman & Giurgiu', shortName: 'TR-GR', region: 'Muntenia', counties: ['Teleorman', 'Giurgiu'] },
  { id: 'ialomita_calarasi', name: 'Ialomița & Călărași', shortName: 'IL-CL', region: 'Muntenia', counties: ['Ialomita', 'Calarasi'] },
  { id: 'dobrogea', name: 'Dobrogea (Constanța & Tulcea)', shortName: 'CT-TL', region: 'Dobrogea', counties: ['Constanta', 'Tulcea'] },
];

// 7. Preset 8 Players (32 Territories)
const p8 = [
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
  { id: 'timis', name: 'Timiș', shortName: 'TM', region: 'Banat', counties: ['Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'alba_hunedoara', name: 'Alba & Hunedoara', shortName: 'AB-HD', region: 'Transilvania', counties: ['Alba', 'Hunedoara'] },
  { id: 'sibiu', name: 'Sibiu', shortName: 'SB', region: 'Transilvania', counties: ['Sibiu'] },
  { id: 'brasov', name: 'Brașov', shortName: 'BV', region: 'Transilvania', counties: ['Brasov'] },
  { id: 'gorj_mehedinti', name: 'Gorj & Mehedinți', shortName: 'GJ-MH', region: 'Oltenia', counties: ['Gorj', 'Mehedinti'] },
  { id: 'valcea_arges', name: 'Vâlcea & Argeș', shortName: 'VL-AG', region: 'Oltenia/Muntenia', counties: ['Valcea', 'Arges'] },
  { id: 'dolj_olt', name: 'Dolj & Olt', shortName: 'DJ-OT', region: 'Oltenia', counties: ['Dolj', 'Olt'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'buzau', name: 'Buzău', shortName: 'BZ', region: 'Muntenia', counties: ['Buzau'] },
  { id: 'braila', name: 'Brăila', shortName: 'BR', region: 'Muntenia', counties: ['Braila'] },
  { id: 'bucuresti_ilfov', name: 'București & Ilfov', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov'] },
  { id: 'teleorman_giurgiu', name: 'Teleorman & Giurgiu', shortName: 'TR-GR', region: 'Muntenia', counties: ['Teleorman', 'Giurgiu'] },
  { id: 'ialomita_calarasi', name: 'Ialomița & Călărași', shortName: 'IL-CL', region: 'Muntenia', counties: ['Ialomita', 'Calarasi'] },
  { id: 'dobrogea', name: 'Dobrogea (Constanța & Tulcea)', shortName: 'CT-TL', region: 'Dobrogea', counties: ['Constanta', 'Tulcea'] },
];

// 8. Preset 9 Players (35 Territories)
const p9 = [
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
  { id: 'timis', name: 'Timiș', shortName: 'TM', region: 'Banat', counties: ['Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'hunedoara', name: 'Hunedoara', shortName: 'HD', region: 'Transilvania', counties: ['Hunedoara'] },
  { id: 'alba', name: 'Alba', shortName: 'AB', region: 'Transilvania', counties: ['Alba'] },
  { id: 'sibiu', name: 'Sibiu', shortName: 'SB', region: 'Transilvania', counties: ['Sibiu'] },
  { id: 'brasov', name: 'Brașov', shortName: 'BV', region: 'Transilvania', counties: ['Brasov'] },
  { id: 'mehedinti', name: 'Mehedinți', shortName: 'MH', region: 'Oltenia', counties: ['Mehedinti'] },
  { id: 'gorj', name: 'Gorj', shortName: 'GJ', region: 'Oltenia', counties: ['Gorj'] },
  { id: 'valcea_arges', name: 'Vâlcea & Argeș', shortName: 'VL-AG', region: 'Oltenia/Muntenia', counties: ['Valcea', 'Arges'] },
  { id: 'dolj_olt', name: 'Dolj & Olt', shortName: 'DJ-OT', region: 'Oltenia', counties: ['Dolj', 'Olt'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'buzau', name: 'Buzău', shortName: 'BZ', region: 'Muntenia', counties: ['Buzau'] },
  { id: 'braila', name: 'Brăila', shortName: 'BR', region: 'Muntenia', counties: ['Braila'] },
  { id: 'bucuresti_ilfov', name: 'București & Ilfov', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov'] },
  { id: 'teleorman_giurgiu', name: 'Teleorman & Giurgiu', shortName: 'TR-GR', region: 'Muntenia', counties: ['Teleorman', 'Giurgiu'] },
  { id: 'ialomita_calarasi', name: 'Ialomița & Călărași', shortName: 'IL-CL', region: 'Muntenia', counties: ['Ialomita', 'Calarasi'] },
  { id: 'tulcea', name: 'Tulcea', shortName: 'TL', region: 'Dobrogea', counties: ['Tulcea'] },
  { id: 'constanta', name: 'Constanța', shortName: 'CT', region: 'Dobrogea', counties: ['Constanta'] },
];

// 9. Preset 10 Players (38 Territories)
const p10 = [
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
  { id: 'timis', name: 'Timiș', shortName: 'TM', region: 'Banat', counties: ['Timis'] },
  { id: 'caras_severin', name: 'Caraș-Severin', shortName: 'CS', region: 'Banat', counties: ['Caras-Severin'] },
  { id: 'hunedoara', name: 'Hunedoara', shortName: 'HD', region: 'Transilvania', counties: ['Hunedoara'] },
  { id: 'alba', name: 'Alba', shortName: 'AB', region: 'Transilvania', counties: ['Alba'] },
  { id: 'sibiu', name: 'Sibiu', shortName: 'SB', region: 'Transilvania', counties: ['Sibiu'] },
  { id: 'brasov', name: 'Brașov', shortName: 'BV', region: 'Transilvania', counties: ['Brasov'] },
  { id: 'mehedinti', name: 'Mehedinți', shortName: 'MH', region: 'Oltenia', counties: ['Mehedinti'] },
  { id: 'gorj', name: 'Gorj', shortName: 'GJ', region: 'Oltenia', counties: ['Gorj'] },
  { id: 'valcea', name: 'Vâlcea', shortName: 'VL', region: 'Oltenia', counties: ['Valcea'] },
  { id: 'dolj', name: 'Dolj', shortName: 'DJ', region: 'Oltenia', counties: ['Dolj'] },
  { id: 'olt', name: 'Olt', shortName: 'OT', region: 'Oltenia', counties: ['Olt'] },
  { id: 'arges', name: 'Argeș', shortName: 'AG', region: 'Muntenia', counties: ['Arges'] },
  { id: 'dambovita_prahova', name: 'Dâmbovița & Prahova', shortName: 'DB-PH', region: 'Muntenia', counties: ['Dambovita', 'Prahova'] },
  { id: 'buzau', name: 'Buzău', shortName: 'BZ', region: 'Muntenia', counties: ['Buzau'] },
  { id: 'braila', name: 'Brăila', shortName: 'BR', region: 'Muntenia', counties: ['Braila'] },
  { id: 'bucuresti_ilfov', name: 'București & Ilfov', shortName: 'B-IF', region: 'Muntenia', counties: ['Bucuresti', 'Ilfov'] },
  { id: 'giurgiu', name: 'Giurgiu', shortName: 'GR', region: 'Muntenia', counties: ['Giurgiu'] },
  { id: 'teleorman', name: 'Teleorman', shortName: 'TR', region: 'Muntenia', counties: ['Teleorman'] },
  { id: 'ialomita_calarasi', name: 'Ialomița & Călărași', shortName: 'IL-CL', region: 'Muntenia', counties: ['Ialomita', 'Calarasi'] },
  { id: 'tulcea', name: 'Tulcea', shortName: 'TL', region: 'Dobrogea', counties: ['Tulcea'] },
  { id: 'constanta', name: 'Constanța', shortName: 'CT', region: 'Dobrogea', counties: ['Constanta'] },
];

const presets = [
  { playerCount: 2, target: 10, defs: p2 },
  { playerCount: 3, target: 15, defs: p3 },
  { playerCount: 4, target: 20, defs: p4 },
  { playerCount: 5, target: 23, defs: p5 },
  { playerCount: 6, target: 26, defs: p6 },
  { playerCount: 7, target: 29, defs: p7 },
  { playerCount: 8, target: 32, defs: p8 },
  { playerCount: 9, target: 35, defs: p9 },
  { playerCount: 10, target: 38, defs: p10 },
];

const mapsDir = path.join(__dirname, '../data/maps/romania');
fs.mkdirSync(mapsDir, { recursive: true });

const compiledPresets = {};
const metadata = {};

for (const p of presets) {
  console.log(`Processing preset for ${p.playerCount} players (target: ${p.target})...`);
  if (p.defs.length !== p.target) {
    throw new Error(`Preset definition length ${p.defs.length} does not match target ${p.target} for ${p.playerCount} players!`);
  }
  const processed = processPreset(p.playerCount, p.defs);
  console.log(`✓ Processed ${processed.length} territories for ${p.playerCount} players.`);

  compiledPresets[p.playerCount] = processed;
  metadata[p.playerCount] = {
    mapId: `romania-${p.playerCount}p-v3`,
    playerCount: p.playerCount,
    territoryCount: processed.length,
    version: '3.0.0',
  };

  // Write individual JSON file as specified in Section 37.2
  const jsonPath = path.join(mapsDir, `players-${p.playerCount}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    mapId: `romania-${p.playerCount}p-v3`,
    playerCount: p.playerCount,
    territoryCount: processed.length,
    version: '3.0.0',
    territories: processed,
  }, null, 2), 'utf8');
}

// Generate server/romaniaMapData.ts
const tsContent = `/**
 * Date Geografice Reale ale României – Proiectate SVG conform ANCPI / OpenStreetMap
 * Generat automat din data/geo/romania-counties.geojson cu geometrie dizolvată (dissolve/union)
 *
 * Configurație dedicată pentru FIECARE număr de jucători de la 2 la 10:
 * - 2 jucători: 10 teritorii
 * - 3 jucători: 15 teritorii
 * - 4 jucători: 20 teritorii
 * - 5 jucători: 23 teritorii
 * - 6 jucători: 26 teritorii
 * - 7 jucători: 29 teritorii
 * - 8 jucători: 32 teritorii
 * - 9 jucători: 35 teritorii
 * - 10 jucători: 38 teritorii
 */

export interface TerritoryDef {
  id: string;
  name: string;
  shortName: string;
  region: string;
  labelX: number;
  labelY: number;
  polygon: string;
  internalLinesSvg?: string;
  counties: string[];
  neighbors: string[];
}

export interface MapMetadata {
  mapId: string;
  playerCount: number;
  territoryCount: number;
  version: string;
}

export const MAP_METADATA: Record<number, MapMetadata> = ${JSON.stringify(metadata, null, 2)};

export const ROMANIA_MAP_PRESETS: Record<number, TerritoryDef[]> = ${JSON.stringify(compiledPresets, null, 2)};

export const ROMANIA_10_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[2];
export const ROMANIA_15_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[3];
export const ROMANIA_20_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[4];
export const ROMANIA_23_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[5];
export const ROMANIA_26_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[6];
export const ROMANIA_29_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[7];
export const ROMANIA_32_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[8];
export const ROMANIA_35_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[9];
export const ROMANIA_38_TERRITORIES: TerritoryDef[] = ROMANIA_MAP_PRESETS[10];

/**
 * Generează starea teritoriilor inițializată pentru un meci.
 * Folosește numărul REAL de participanți (jucători umani + roboți AI activi).
 */
export function createMapForPlayerCount(playerCount: number): Record<string, any> {
  const count = Math.max(2, Math.min(10, Math.round(playerCount || 4)));
  const defs = ROMANIA_MAP_PRESETS[count] || ROMANIA_MAP_PRESETS[4];

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
      internalLinesSvg: t.internalLinesSvg || '',
      counties: t.counties || [],
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

export function getMapMetadata(playerCount: number): MapMetadata {
  const count = Math.max(2, Math.min(10, Math.round(playerCount || 4)));
  return MAP_METADATA[count] || MAP_METADATA[4];
}
`;

fs.writeFileSync(path.join(__dirname, '../server/romaniaMapData.ts'), tsContent, 'utf8');
console.log('✓ Successfully wrote server/romaniaMapData.ts with all 9 dissolved presets!');
