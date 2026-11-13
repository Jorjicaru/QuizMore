const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Always rebuild baseline from archive_v91_original.json first so audit is 100% deterministic
execFileSync(process.execPath, [path.join(__dirname, 'build_and_validate_questions.cjs')], {
  stdio: 'pipe',
});

function normalizeQuestionText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const choicePath = path.join(process.cwd(), 'data', 'questions', 'choice.json');
const estimationPath = path.join(process.cwd(), 'data', 'questions', 'estimation.json');
const reportPath = path.join(process.cwd(), 'data', 'questions', 'audit_report_v95.json');
const manifestPath = path.join(process.cwd(), 'data', 'questions', 'manifest.json');

const choiceList = JSON.parse(fs.readFileSync(choicePath, 'utf8'));
const estimationList = JSON.parse(fs.readFileSync(estimationPath, 'utf8'));

// Restore the approved, diverse legacy questions selected by the V9.2 curation.
// These IDs are intentionally fixed so the curation script is deterministic.
const RESTORED_CHOICE_IDS = new Set(["chem_group_ag","chem_group_al","chem_group_ar","chem_group_au","chem_group_br","chem_group_ca","chem_group_cl","chem_group_co","chem_group_cr","chem_group_f","chem_group_fe","chem_group_hg","chem_group_k","chem_group_kr","chem_group_mg","chem_group_mn","chem_group_na","chem_group_ne","chem_group_p","chem_group_pb","chem_group_pt","chem_group_s","chem_group_si","chem_group_u","chem_group_w","chem_group_zn","chem_mass_choice_ag","chem_mass_choice_al","chem_mass_choice_ar","chem_mass_choice_au","chem_mass_choice_br","chem_mass_choice_ca","chem_mass_choice_cl","chem_mass_choice_cr","chem_mass_choice_cu","chem_mass_choice_f","chem_mass_choice_hg","chem_mass_choice_k","chem_mass_choice_mg","chem_mass_choice_mn","chem_mass_choice_na","chem_mass_choice_ne","chem_mass_choice_ni","chem_mass_choice_pb","chem_mass_choice_pt","chem_mass_choice_s","chem_mass_choice_si","chem_mass_choice_u","chem_mass_choice_w","chem_mass_choice_zn","chem_sym_ar","chem_sym_br","chem_sym_co","chem_sym_f","chem_sym_kr","chem_sym_mn","chem_sym_ne","chem_sym_ni","chem_sym_p","chem_sym_pt","chem_sym_sn","chem_sym_ti","chem_sym_u","chem_sym_zn","chem_z_to_name_al","chem_z_to_name_au","chem_z_to_name_br","chem_z_to_name_ca","chem_z_to_name_cl","chem_z_to_name_co","chem_z_to_name_f","chem_z_to_name_fe","chem_z_to_name_hg","chem_z_to_name_k","chem_z_to_name_kr","chem_z_to_name_mg","chem_z_to_name_ne","chem_z_to_name_p","chem_z_to_name_pb","chem_z_to_name_pt","chem_z_to_name_s","chem_z_to_name_sn","chem_z_to_name_ti","chem_z_to_name_u","chem_z_to_name_w","chem_z_to_name_zn","est_sport_metric_1","est_sport_metric_10","est_sport_metric_13","est_sport_metric_14","est_sport_metric_17","est_sport_metric_20","est_tech_metric_13","est_tech_metric_15","extra_arta_ch_val_2","extra_biologie_ch_val_11","extra_biologie_ch_val_17","extra_biologie_ch_val_18","extra_biologie_ch_val_19","extra_biologie_ch_val_7","extra_biologie_ch_val_8","extra_cultura_generala_ch_val_13","extra_cultura_generala_ch_val_15","extra_cultura_generala_ch_val_16","extra_cultura_generala_ch_val_17","extra_cultura_generala_ch_val_19","extra_cultura_generala_ch_val_20","extra_literatura_ch_val_1","extra_literatura_ch_val_24","extra_muzica_ch_val_10","extra_muzica_ch_val_24","extra_muzica_ch_val_6","extra_muzica_ch_val_7","extra_muzica_ch_val_9","extra_sport_ch_val_1","extra_sport_ch_val_10","extra_sport_ch_val_14","extra_sport_ch_val_15","extra_sport_ch_val_16","extra_sport_ch_val_17","extra_sport_ch_val_18","extra_sport_ch_val_19","extra_sport_ch_val_2","extra_sport_ch_val_24","extra_sport_ch_val_25","extra_sport_ch_val_6","extra_sport_ch_val_7","extra_sport_ch_val_8","extra_sport_ch_val_9","geo_world_curr_albania","geo_world_curr_argentina","geo_world_curr_australia","geo_world_curr_bosnia_si_hertegovina","geo_world_curr_brazilia","geo_world_curr_canada","geo_world_curr_chile","geo_world_curr_cipru","geo_world_curr_columbia","geo_world_curr_egipt","geo_world_curr_estonia","geo_world_curr_filipine","geo_world_curr_indonezia","geo_world_curr_kenya","geo_world_curr_letonia","geo_world_curr_lituania","geo_world_curr_luxemburg","geo_world_curr_macedonia_de_nord","geo_world_curr_maroc","geo_world_curr_mexic","geo_world_curr_muntenegru","geo_world_curr_nigeria","geo_world_curr_noua_zeelanda","geo_world_curr_peru","geo_world_curr_statele_unite_ale_americii","hist_place_choice_13","hist_place_choice_14","hist_place_choice_15","hist_place_choice_17","hist_place_choice_20","hist_place_choice_21","hist_place_choice_23","hist_place_choice_31","hist_place_choice_32","hist_place_choice_37","hist_place_choice_38","hist_place_choice_39","hist_place_choice_41","hist_place_choice_43","hist_place_choice_44","hist_place_choice_45","hist_place_choice_53","hist_place_choice_54","sport_host_18","chem_group_ni","chem_group_ti","chem_mass_choice_co","chem_mass_choice_fe","chem_mass_choice_ti","chem_sym_cr","chem_sym_si","chem_z_to_name_cr","chem_z_to_name_mn","chem_z_to_name_na","est_cult_year_21","extra_arta_est_val_12","extra_cultura_generala_ch_val_11","extra_literatura_ch_subj_21","extra_literatura_est_val_12","hist_yr_choice_15","hist_yr_choice_16","hist_yr_choice_17","hist_yr_choice_18","hist_yr_choice_20","hist_yr_choice_22","hist_yr_choice_23","hist_yr_choice_24","hist_yr_choice_25","hist_yr_choice_26","hist_yr_choice_27","hist_yr_choice_28","hist_yr_choice_30","hist_yr_choice_31","hist_yr_choice_33","hist_yr_choice_34","hist_yr_choice_35","hist_yr_choice_36","hist_yr_choice_37","hist_yr_choice_38","hist_yr_choice_39","hist_yr_choice_40","hist_yr_choice_42","hist_yr_choice_43","hist_yr_choice_44","hist_yr_choice_45","hist_yr_choice_46","hist_yr_choice_47","hist_yr_choice_48","hist_yr_choice_49","hist_yr_choice_50","hist_yr_choice_51","hist_yr_choice_52","hist_yr_choice_53","hist_yr_choice_54","hist_yr_choice_55","hist_yr_choice_56","sport_host_16","sport_host_17","sport_host_19","chem_group_b","chem_group_be","chem_group_c","chem_group_li","chem_group_n","chem_group_o","chem_mass_choice_b","chem_mass_choice_be","chem_mass_choice_c","chem_mass_choice_li","chem_mass_choice_n","chem_mass_choice_o","chem_sym_b","chem_sym_be","chem_z_to_name_b","chem_z_to_name_be","chem_z_to_name_c","chem_z_to_name_n","chem_z_to_name_o","extra_biologie_ch_comp_3_s2","geo_feat_massif_1","geo_feat_massif_14","geo_feat_massif_17","geo_feat_massif_18","geo_feat_massif_2","geo_feat_massif_20","geo_feat_massif_21","geo_feat_massif_22","geo_feat_massif_23","geo_feat_massif_24","geo_feat_massif_25","geo_feat_massif_26","geo_feat_massif_3","geo_feat_massif_5","geo_feat_massif_7","geo_feat_massif_9","geo_ro_seat_cs","geo_ro_seat_cv","geo_ro_seat_db","geo_ro_seat_gj","geo_ro_seat_hr","geo_ro_seat_if","geo_ro_seat_il","geo_ro_seat_mh","geo_ro_seat_ot","geo_ro_seat_sj","geo_ro_seat_tr","geo_ro_seat_vn","geo_world_cap_albania","geo_world_cap_argentina","geo_world_cap_australia","geo_world_cap_austria","geo_world_cap_belgia","geo_world_cap_bosnia_si_hertegovina","geo_world_cap_brazilia","geo_world_cap_bulgaria","geo_world_cap_canada","geo_world_cap_cehia","geo_world_cap_chile","geo_world_cap_china","geo_world_cap_cipru","geo_world_cap_columbia","geo_world_cap_coreea_de_sud","geo_world_cap_croatia","geo_world_cap_danemarca","geo_world_cap_egipt","geo_world_cap_elvetia","geo_world_cap_estonia","geo_world_cap_filipine","geo_world_cap_finlanda","geo_world_cap_franta","geo_world_cap_germania","geo_world_cap_grecia","geo_world_cap_india","geo_world_cap_indonezia","geo_world_cap_irlanda","geo_world_cap_islanda","geo_world_cap_italia","geo_world_cap_kenya","geo_world_cap_letonia","geo_world_cap_lituania","geo_world_cap_macedonia_de_nord","geo_world_cap_maroc","geo_world_cap_muntenegru","geo_world_cap_nigeria","geo_world_cap_norvegia","geo_world_cap_noua_zeelanda","geo_world_cap_olanda","geo_world_cap_peru","geo_world_cap_polonia","geo_world_cap_portugalia","geo_world_cap_regatul_unit","geo_world_cap_republica_moldova","geo_world_cap_romania","geo_world_cap_serbia","geo_world_cap_slovacia","geo_world_cap_slovenia","geo_world_cap_spania","geo_world_cap_statele_unite_ale_americii","geo_world_cap_suedia","geo_world_cap_thailanda","geo_world_cap_turcia","geo_world_cap_ucraina","geo_world_cap_ungaria","geo_world_cap_vietnam","geo_world_cont_albania","geo_world_cont_argentina","geo_world_cont_austria","geo_world_cont_belgia","geo_world_cont_bulgaria","geo_world_cont_canada","geo_world_cont_cehia","geo_world_cont_chile","geo_world_cont_china","geo_world_cont_columbia","geo_world_cont_coreea_de_sud","geo_world_cont_croatia","geo_world_cont_egipt","geo_world_cont_elvetia","geo_world_cont_estonia","geo_world_cont_filipine","geo_world_cont_finlanda","geo_world_cont_franta","geo_world_cont_germania","geo_world_cont_grecia","geo_world_cont_india","geo_world_cont_indonezia","geo_world_cont_irlanda","geo_world_cont_islanda","geo_world_cont_italia","geo_world_cont_letonia","geo_world_cont_lituania","geo_world_cont_luxemburg","geo_world_cont_macedonia_de_nord","geo_world_cont_maroc","geo_world_cont_mexic","geo_world_cont_muntenegru","geo_world_cont_nigeria","geo_world_cont_norvegia","geo_world_cont_noua_zeelanda","geo_world_cont_peru","geo_world_cont_polonia","geo_world_cont_portugalia","geo_world_cont_regatul_unit","geo_world_cont_romania","geo_world_cont_serbia","geo_world_cont_slovacia","geo_world_cont_slovenia","geo_world_cont_suedia","geo_world_cont_thailanda","geo_world_cont_turcia","geo_world_cont_ucraina","geo_world_state_japonia","geo_ro_code_bn","geo_ro_code_br","geo_ro_code_bt","geo_ro_code_bv","geo_ro_code_bz","geo_ro_code_cj","geo_ro_code_cl","geo_ro_code_cs","geo_ro_code_ct","geo_ro_code_cv","geo_ro_code_db","geo_ro_code_dj","geo_ro_code_gj","geo_ro_code_gl","geo_ro_code_gr","geo_ro_code_hd","geo_ro_code_hr","geo_ro_code_if","geo_ro_code_il","geo_ro_code_is","geo_ro_code_mh","geo_ro_code_mm","geo_ro_code_ms","geo_ro_code_nt","geo_ro_code_ot","geo_ro_code_ph","geo_ro_code_sb","geo_ro_code_sj","geo_ro_code_sm","geo_ro_code_sv","geo_ro_code_tl","geo_ro_code_tm","geo_ro_code_tr","geo_ro_code_vl","geo_ro_code_vn","geo_ro_code_vs","geo_ro_region_bn","geo_ro_region_br","geo_ro_region_bt","geo_ro_region_bv","geo_ro_region_bz","geo_ro_region_cj","geo_ro_region_cl","geo_ro_region_cs","geo_ro_region_ct","geo_ro_region_cv","geo_ro_region_db","geo_ro_region_dj","geo_ro_region_gj","geo_ro_region_gl","geo_ro_region_gr","geo_ro_region_hd","geo_ro_region_hr","geo_ro_region_if","geo_ro_region_il","geo_ro_region_is","geo_ro_region_mh","geo_ro_region_ms","geo_ro_region_nt","geo_ro_region_ot","geo_ro_region_ph","geo_ro_region_sb","geo_ro_region_sj","geo_ro_region_sm","geo_ro_region_sv","geo_ro_region_tl","geo_ro_region_tm","geo_ro_region_tr","geo_ro_region_vl","geo_ro_region_vn","geo_ro_region_vs","geo_ro_river_br","geo_ro_river_bt","geo_ro_river_cj","geo_ro_river_cl","geo_ro_river_cs","geo_ro_river_ct","geo_ro_river_cv","geo_ro_river_db","geo_ro_river_dj","geo_ro_river_gj","geo_ro_river_gl","geo_ro_river_gr","geo_ro_river_hd","geo_ro_river_hr","geo_ro_river_if","geo_ro_river_is","geo_ro_river_mh","geo_ro_river_mm","geo_ro_river_nt","geo_ro_river_sb","geo_ro_river_sm","geo_ro_river_tl","geo_ro_river_tm","geo_ro_river_tr","geo_ro_river_vl","geo_ro_river_vn","geo_ro_river_vs","chem_group_i","chem_mass_choice_sn","chem_name_ca","chem_sym_al","chem_sym_cl","chem_sym_cu","chem_sym_hg","chem_sym_i","chem_sym_k","chem_sym_mg","chem_sym_n","chem_sym_na","chem_group_sn","chem_mass_choice_i","chem_z_to_name_xe","chem_group_xe","chem_mass_choice_xe"]);
const RESTORED_ESTIMATION_IDS = new Set(["est_tech_yr_13","est_tech_yr_14","est_tech_yr_15","est_sport_yr_1","est_sport_yr_10","est_sport_yr_11","est_sport_yr_13","est_sport_yr_14","est_sport_yr_15","est_sport_yr_16","est_sport_yr_17","est_sport_yr_18","est_sport_yr_19","est_sport_yr_2","est_sport_yr_20","est_sport_yr_4","est_sport_yr_5","est_sport_yr_6","est_sport_yr_7","est_sport_yr_8","est_sport_yr_9","est_sport_metric_11","est_sport_metric_16","est_sport_metric_3","est_sport_metric_4","est_sport_metric_5","est_sport_metric_6","est_sport_metric_7","est_sport_metric_8","est_tech_yr_1","est_tech_yr_10","est_tech_yr_11","est_tech_yr_12","est_tech_yr_16","est_tech_yr_17","est_tech_yr_18","est_tech_yr_19","est_tech_yr_2","est_tech_yr_20","est_tech_yr_3","est_tech_yr_4","est_tech_yr_5","est_tech_yr_6","est_tech_yr_8","est_tech_yr_9","est_sport_metric_12","est_sport_metric_15","est_sport_metric_9","est_tech_metric_1","est_tech_metric_10","est_tech_metric_11","est_tech_metric_12","est_tech_metric_2","est_tech_metric_3","est_tech_metric_4","est_tech_metric_6","est_tech_metric_7","est_tech_metric_8","est_tech_metric_9","est_geo_feat_10","est_geo_feat_11","est_geo_feat_12","est_geo_feat_13","est_geo_feat_14","est_geo_feat_15","est_geo_feat_17","est_geo_feat_18","est_geo_feat_19","est_geo_feat_20","est_geo_feat_21","est_geo_feat_3","est_geo_feat_6","est_geo_feat_9","est_tech_metric_16","est_tech_metric_17","est_geo_feat_30","est_geo_feat_31","est_geo_feat_32","est_geo_feat_34","est_geo_feat_35","est_geo_feat_36","est_geo_feat_37","est_geo_ro_sum_area_ab_ar","est_geo_ro_sum_area_ab_bt","est_geo_ro_sum_area_ab_cl","est_geo_ro_sum_area_ab_dj","est_geo_ro_sum_area_ab_hd","est_geo_ro_sum_area_ab_mh"]);
const GENERAL_KNOWLEDGE_NUMERIC_REPLACEMENTS = [{"id":"est_geo_area_db","category":"cultura_generala","difficulty":"usor","type":"estimation","question":"Câți membri avea formația Beatles în componența clasică?","targetNumber":4,"unit":"","explanation":"Componența clasică avea patru membri.","sourceUrl":"https://academic.oup.com/reference/62400/reference-article-abstract/555408789","sourceTitle":"The Beatles — Oxford Reference","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_beatles_four","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_zip_dj","category":"literatura","difficulty":"usor","type":"estimation","question":"Câte cărți cuprinde seria principală Harry Potter?","targetNumber":7,"unit":"","explanation":"Seria principală este alcătuită din șapte cărți.","sourceUrl":"https://www.bloomsbury.com/uk/discover/harry-potter/resources/series-overview/","sourceTitle":"Harry Potter series overview — Bloomsbury","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_potter_seven","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_area_gl","category":"cultura_generala","difficulty":"usor","type":"estimation","question":"Câte inele sunt în simbolul olimpic?","targetNumber":5,"unit":"","explanation":"Simbolul olimpic este format din cinci inele întrețesute.","sourceUrl":"https://www.olympics.com/ioc/olympic-rings","sourceTitle":"Olympic Rings — IOC","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_olympic_rings_five","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_pop_il","category":"geografie","difficulty":"usor","type":"estimation","question":"Câte planete are Sistemul Solar?","targetNumber":8,"unit":"","explanation":"NASA enumeră opt planete în Sistemul Solar.","sourceUrl":"https://science.nasa.gov/solar-system/planets/","sourceTitle":"About the Planets — NASA","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_planets_eight","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_zip_il","category":"cultura_generala","difficulty":"usor","type":"estimation","question":"Câte piese are fiecare jucător la începutul unei partide de șah?","targetNumber":16,"unit":"","explanation":"La început, fiecare jucător are șaisprezece piese.","sourceUrl":"https://handbook.fide.com/chapter/e012023","sourceTitle":"Laws of Chess — FIDE","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_chess_sixteen","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_area_is","category":"sport","difficulty":"usor","type":"estimation","question":"Câți jucători are o echipă de fotbal pe teren?","targetNumber":11,"unit":"","explanation":"O echipă poate avea cel mult unsprezece jucători pe teren.","sourceUrl":"https://theifab.com/laws/latest/the-players/","sourceTitle":"Law 3: The Players — IFAB","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_football_eleven","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_pop_is","category":"cultura_generala","difficulty":"usor","type":"estimation","question":"Câte cărți are un pachet standard de joc?","targetNumber":52,"unit":"","explanation":"Pachetul standard are cincizeci și două de cărți.","sourceUrl":"https://en.wikipedia.org/wiki/Standard_52-card_deck","sourceTitle":"Standard 52-card deck — Wikipedia","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_deck_fifty_two","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_zip_is","category":"cultura_generala","difficulty":"usor","type":"estimation","question":"Câte suite are un pachet standard de cărți?","targetNumber":4,"unit":"","explanation":"Pachetul standard are patru suite.","sourceUrl":"https://en.wikipedia.org/wiki/Standard_52-card_deck","sourceTitle":"Standard 52-card deck — Wikipedia","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_card_suits_four","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_area_if","category":"cultura_generala","difficulty":"usor","type":"estimation","question":"Câte muze sunt în mitologia greacă tradițională?","targetNumber":9,"unit":"","explanation":"Tradiția greacă a consacrat numărul de nouă muze.","sourceUrl":"https://www.theoi.com/Ouranios/Mousai.html","sourceTitle":"Muses — Theoi Project","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_muses_nine","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_pop_if","category":"geografie","difficulty":"usor","type":"estimation","question":"Câte planete pitice recunoaște oficial NASA în Sistemul Solar?","targetNumber":5,"unit":"","explanation":"NASA enumeră cinci planete pitice recunoscute oficial.","sourceUrl":"https://science.nasa.gov/solar-system/planets/","sourceTitle":"About the Planets — NASA","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_dwarf_planets_five","reviewStatus":"approved","verified":true,"isDisabled":false},{"id":"est_geo_zip_if","category":"cultura_generala","difficulty":"usor","type":"estimation","question":"Câte luni are anul calendaristic obișnuit?","targetNumber":12,"unit":"","explanation":"Calendarul gregorian are douăsprezece luni.","sourceUrl":"https://www.britannica.com/science/Gregorian-calendar","sourceTitle":"Gregorian calendar — Encyclopaedia Britannica","sourceCheckedAt":"2026-11-13","factKey":"fact_est_v92_calendar_twelve","reviewStatus":"approved","verified":true,"isDisabled":false}];


// ============================================================================
// 1. CURATED NUMERIC TIEBREAK QUESTIONS (estimation.json) - 120 QUESTIONS
// Accessible general knowledge integers (years, everyday counts, famous landmarks)
// Zero math formulas, zero polygon diagonals, zero area sums, zero obscure metrics
// ============================================================================
const NEW_ESTIMATION_TIEBREAKS = [
  { q: 'Câte județe are România în prezent, fără municipiul București?', t: 41, u: 'județe', fk: 'fact_est_ro_counties_41', url: 'https://ro.wikipedia.org/wiki/Jude%C8%9Bele_Rom%C3%A2niei', title: 'Județele României — Wikipedia', exp: 'România este împărțită administrativ în 41 de județe plus municipiul București.' },
  { q: 'Câte sectoare administrative are municipiul București?', t: 6, u: 'sectoare', fk: 'fact_est_buc_sectors_6', url: 'https://ro.wikipedia.org/wiki/Sectoarele_Bucure%C8%99tiului', title: 'Sectoarele Bucureștiului — Wikipedia', exp: 'Municipiul București este împărțit în 6 sectoare administrative.' },
  { q: 'Câte brațe principale formează fluviul Dunărea la vărsare?', t: 3, u: 'brațe', fk: 'fact_est_danube_branches_3', url: 'https://ro.wikipedia.org/wiki/Delta_Dun%C4%83rii', title: 'Delta Dunării — Wikipedia', exp: 'Dunărea se varsă în Marea Neagră prin trei brațe: Chilia, Sulina și Sfântu Gheorghe.' },
  { q: 'Prin câte capitale de stat din Europa trece Dunărea?', t: 4, u: 'capitale', fk: 'fact_est_danube_capitals_4', url: 'https://ro.wikipedia.org/wiki/Dun%C4%83rea', title: 'Fluviul Dunărea — Wikipedia', exp: 'Dunărea străbate patru capitale europene: Viena, Bratislava, Budapesta și Belgrad.' },
  { q: 'Prin câte țări europene curge fluviul Dunărea?', t: 10, u: 'țări', fk: 'fact_est_danube_countries_10', url: 'https://ro.wikipedia.org/wiki/Dun%C4%83rea', title: 'Fluviul Dunărea — Wikipedia', exp: 'Dunărea traversează sau mărginește 10 state europene de la izvor la vărsare.' },
  { q: 'Cu câte state vecine are România graniță?', t: 5, u: 'state', fk: 'fact_est_ro_neighbors_5', url: 'https://ro.wikipedia.org/wiki/Geografia_Rom%C3%A2niei', title: 'Geografia României — Wikipedia', exp: 'România se învecinează cu 5 state: Republica Moldova, Ucraina, Ungaria, Serbia și Bulgaria.' },
  { q: 'Câte continente există pe Pământ în modelul geografic clasic?', t: 7, u: 'continente', fk: 'fact_est_earth_continents_7', url: 'https://ro.wikipedia.org/wiki/Continent', title: 'Continent — Wikipedia', exp: 'Cele 7 continente sunt Europa, Asia, Africa, America de Nord, America de Sud, Australia și Antarctica.' },
  { q: 'Câte oceane planetare sunt recunoscute pe Glob?', t: 5, u: 'oceane', fk: 'fact_est_earth_oceans_5', url: 'https://ro.wikipedia.org/wiki/Oceanul_Planetar', title: 'Oceanul Planetar — Wikipedia', exp: 'Cele 5 oceane sunt Pacific, Atlantic, Indian, Arctic și Austral (Sudic).' },
  { q: 'Câte state membre are în prezent Uniunea Europeană?', t: 27, u: 'state', fk: 'fact_est_eu_members_27', url: 'https://ro.wikipedia.org/wiki/Statele_membre_ale_Uniunii_Europene', title: 'Statele membre ale Uniunii Europene — Wikipedia', exp: 'Uniunea Europeană numără în prezent 27 de state membre.' },
  { q: 'Câte state federale compun Statele Unite ale Americii?', t: 50, u: 'state', fk: 'fact_est_usa_states_50', url: 'https://ro.wikipedia.org/wiki/Statele_componente_ale_Statelor_Unite_ale_Americii', title: 'Statele componente ale SUA — Wikipedia', exp: 'Statele Unite ale Americii sunt alcătuite din 50 de state federale.' },
  { q: 'Câte stele aurii se află pe drapelul Uniunii Europene?', t: 12, u: 'stele', fk: 'fact_est_eu_flag_stars_12', url: 'https://ro.wikipedia.org/wiki/Drapelul_Europei', title: 'Drapelul Europei — Wikipedia', exp: 'Drapelul european are un cerc format din 12 stele aurii pe fond albastru.' },
  { q: 'Câte planete are Sistemul nostru Solar?', t: 8, u: 'planete', fk: 'fact_est_solar_planets_8', url: 'https://ro.wikipedia.org/wiki/Sistemul_solar', title: 'Sistemul solar — Wikipedia', exp: 'Sistemul Solar are 8 planete recunoscute de Uniunea Astronomică Internațională.' },
  { q: 'Câte zile are un an bisect în calendarul gregorian?', t: 366, u: 'zile', fk: 'fact_est_leap_year_366', url: 'https://ro.wikipedia.org/wiki/An_bisect', title: 'An bisect — Wikipedia', exp: 'Un an bisect are 366 de zile, luna februarie având 29 de zile.' },
  { q: 'Câte zile are un an calendaristic obișnuit (nebisect)?', t: 365, u: 'zile', fk: 'fact_est_common_year_365', url: 'https://ro.wikipedia.org/wiki/An_comun', title: 'An comun — Wikipedia', exp: 'Un an comun are 365 de zile.' },
  { q: 'Câte săptămâni complete sunt într-un an calendaristic?', t: 52, u: 'săptămâni', fk: 'fact_est_weeks_year_52', url: 'https://ro.wikipedia.org/wiki/S%C4%83pt%C4%83m%C3%A2n%C4%83', title: 'Săptămână — Wikipedia', exp: 'Un an calendaristic cuprinde 52 de săptămâni complete.' },
  { q: 'Câte litere conține alfabetul limbii române?', t: 31, u: 'litere', fk: 'fact_est_ro_alphabet_31', url: 'https://ro.wikipedia.org/wiki/Alfabetul_limbii_rom%C3%A2ne', title: 'Alfabetul limbii române — Wikipedia', exp: 'Alfabetul actual al limbii române are 31 de litere.' },
  { q: 'Câte erau în mod tradițional Minunile Lumii Antice?', t: 7, u: 'minuni', fk: 'fact_est_ancient_wonders_7', url: 'https://ro.wikipedia.org/wiki/%C8%98apte_minuni_ale_lumii_antice', title: 'Șapte minuni ale lumii antice — Wikipedia', exp: 'Antichitatea a consacrat lista celor 7 minuni ale lumii.' },
  { q: 'Câte carate are aurul pur în bijuterie?', t: 24, u: 'carate', fk: 'fact_est_pure_gold_24', url: 'https://ro.wikipedia.org/wiki/Carat_(puritate)', title: 'Carat (puritate) — Wikipedia', exp: 'Aurul fin (999,9‰) are puritatea maximă de 24 de carate.' },
  { q: 'Câte oase are în total scheletul unui om adult?', t: 206, u: 'oase', fk: 'fact_est_human_bones_206', url: 'https://ro.wikipedia.org/wiki/Scheletul_uman', title: 'Scheletul uman — Wikipedia', exp: 'Scheletul unui om adult este compus în mod normal din 206 oase.' },
  { q: 'Câți dinți permanenți are dantura completă a unui adult?', t: 32, u: 'dinți', fk: 'fact_est_adult_teeth_32', url: 'https://ro.wikipedia.org/wiki/Dinte', title: 'Dinte — Wikipedia', exp: 'Dentiția permanentă completă a adultului numără 32 de dinți.' },
  { q: 'Câți dinți de lapte are în total un copil?', t: 20, u: 'dinți', fk: 'fact_est_milk_teeth_20', url: 'https://ro.wikipedia.org/wiki/Dinte_temporar', title: 'Dinte temporar — Wikipedia', exp: 'Dentiția temporară a copilului cuprinde 20 de dinți de lapte.' },
  { q: 'Câte camere are inima omului?', t: 4, u: 'camere', fk: 'fact_est_heart_chambers_4', url: 'https://ro.wikipedia.org/wiki/Inim%C4%83', title: 'Inimă — Wikipedia', exp: 'Inima umană are 4 camere: două atrii și două ventricule.' },
  { q: 'Câte coaste are în mod normal cutia toracică umană?', t: 24, u: 'coaste', fk: 'fact_est_human_ribs_24', url: 'https://ro.wikipedia.org/wiki/Coast%C4%83_(anatomie)', title: 'Coastă (anatomie) — Wikipedia', exp: 'Omul are în mod normal 12 perechi de coaste, adică 24 în total.' },
  { q: 'Câți cromozomi are în mod normal o celulă somatică umană?', t: 46, u: 'cromozomi', fk: 'fact_est_human_chromosomes_46', url: 'https://ro.wikipedia.org/wiki/Cromozom', title: 'Cromozom — Wikipedia', exp: 'Celulele somatice umane au 23 de perechi, adică 46 de cromozomi.' },
  { q: 'Câte picioare are un păianjen?', t: 8, u: 'picioare', fk: 'fact_est_spider_legs_8', url: 'https://ro.wikipedia.org/wiki/P%C4%83ianjen', title: 'Păianjen — Wikipedia', exp: 'Toate arahnidele, inclusiv păianjenii, au 8 picioare articulate.' },
  { q: 'Câte picioare are o insectă adultă, precum albina?', t: 6, u: 'picioare', fk: 'fact_est_insect_legs_6', url: 'https://ro.wikipedia.org/wiki/Insecte', title: 'Insecte — Wikipedia', exp: 'Insectele adulte se caracterizează prin 3 perechi de picioare (6 în total).' },
  { q: 'Câte brațe cu ventuze are o caracatiță?', t: 8, u: 'brațe', fk: 'fact_est_octopus_arms_8', url: 'https://ro.wikipedia.org/wiki/Caracati%C8%9B%C4%83', title: 'Caracatiță — Wikipedia', exp: 'Caracatița are 8 brațe musculoase prevăzute cu ventuze.' },
  { q: 'Câte inimi are o caracatiță?', t: 3, u: 'inimi', fk: 'fact_est_octopus_hearts_3', url: 'https://ro.wikipedia.org/wiki/Caracati%C8%9B%C4%83', title: 'Caracatiță — Wikipedia', exp: 'Caracatița are 3 inimi: una sistemică și două branhiale.' },
  { q: 'Câte clape are în total un pian modern de concert?', t: 88, u: 'clape', fk: 'fact_est_piano_keys_88', url: 'https://ro.wikipedia.org/wiki/Pian', title: 'Pian — Wikipedia', exp: 'Un pian standard modern are 88 de clape (52 albe și 36 negre).' },
  { q: 'Câte simfonii a finalizat compozitorul Ludwig van Beethoven?', t: 9, u: 'simfonii', fk: 'fact_est_beethoven_sym_9', url: 'https://ro.wikipedia.org/wiki/Ludwig_van_Beethoven', title: 'Ludwig van Beethoven — Wikipedia', exp: 'Beethoven a compus 9 simfonii celebre, ultima incluzând Oda Bucuriei.' },
  { q: 'Câte corzi are în mod standard o chitară clasică?', t: 6, u: 'corzi', fk: 'fact_est_guitar_strings_6', url: 'https://ro.wikipedia.org/wiki/Chitar%C4%83', title: 'Chitară — Wikipedia', exp: 'O chitară clasică sau acustică obișnuită are 6 corzi.' },
  { q: 'Câte corzi are o vioară clasică?', t: 4, u: 'corzi', fk: 'fact_est_violin_strings_4', url: 'https://ro.wikipedia.org/wiki/Vioar%C4%83', title: 'Vioară — Wikipedia', exp: 'Vioara are 4 corzi acordate în cvinte perfecte (Sol, Re, La, Mi).' },
  { q: 'Din câte linii paralele este format portativul muzical?', t: 5, u: 'linii', fk: 'fact_est_musical_staff_5', url: 'https://ro.wikipedia.org/wiki/Portativ', title: 'Portativ — Wikipedia', exp: 'Portativul muzical clasic este alcătuit din 5 linii orizontale și 4 spații.' },
  { q: 'Câte concerte pentru vioară compun „Anotimpurile” lui Vivaldi?', t: 4, u: 'concerte', fk: 'fact_est_vivaldi_seasons_4', url: 'https://ro.wikipedia.org/wiki/Anotimpurile_(Vivaldi)', title: 'Anotimpurile (Vivaldi) — Wikipedia', exp: 'Lucrarea cuprinde 4 concerte dedicate primăverii, verii, toamnei și iernii.' },
  { q: 'Câte Rapsodii Române a compus George Enescu?', t: 2, u: 'rapsodii', fk: 'fact_est_enescu_rhapsodies_2', url: 'https://ro.wikipedia.org/wiki/Rapsodiile_rom%C3%A2ne_(Enescu)', title: 'Rapsodiile române (Enescu) — Wikipedia', exp: 'George Enescu a compus două Rapsodii Române, reunite în Op. 11.' },
  { q: 'Câte scaune în formă de clepsidră înconjoară Masa Tăcerii?', t: 12, u: 'scaune', fk: 'fact_est_masa_tacerii_12', url: 'https://ro.wikipedia.org/wiki/Masa_T%C4%83cerii', title: 'Masa Tăcerii — Wikipedia', exp: 'În jurul Mesei Tăcerii de la Târgu Jiu sunt amplasate 12 scaune-clepsidră.' },
  { q: 'Câte strofe are poemul „Luceafărul” scris de Mihai Eminescu?', t: 98, u: 'strofe', fk: 'fact_est_luceafarul_stanzas_98', url: 'https://ro.wikipedia.org/wiki/Luceaf%C4%83rul_(poem)', title: 'Luceafărul (poem) — Wikipedia', exp: 'Poemul „Luceafărul” are 98 de catrene.' },
  { q: 'Câte versuri are în mod clasic un sonet?', t: 14, u: 'versuri', fk: 'fact_est_sonnet_lines_14', url: 'https://ro.wikipedia.org/wiki/Sonet', title: 'Sonet — Wikipedia', exp: 'Sonetul clasic este o poezie cu formă fixă alcătuită din 14 versuri.' },
  { q: 'Câte povestiri cuprinde volumul „Hanu Ancuței” de Sadoveanu?', t: 9, u: 'povestiri', fk: 'fact_est_hanu_ancutei_9', url: 'https://ro.wikipedia.org/wiki/Hanu-Ancu%C8%9Bei', title: 'Hanu-Ancuței — Wikipedia', exp: 'Volumul „Hanu Ancuței” reunește 9 povestiri spuse de călători la han.' },
  { q: 'Câte premii Oscar a câștigat filmul „Titanic” din 1997?', t: 11, u: 'premii', fk: 'fact_est_titanic_oscars_11', url: 'https://ro.wikipedia.org/wiki/Titanic_(film_din_1997)', title: 'Titanic (film din 1997) — Wikipedia', exp: 'Filmul „Titanic”, regizat de James Cameron, a câștigat 11 premii Oscar.' },
  { q: 'Câți pitici o găzduiesc pe Albă ca Zăpada în basmul clasic?', t: 7, u: 'pitici', fk: 'fact_est_snow_white_dwarfs_7', url: 'https://ro.wikipedia.org/wiki/Alb%C4%83_ca_Z%C4%83pada', title: 'Albă ca Zăpada — Wikipedia', exp: 'În basmul Fraților Grimm, Albă ca Zăpada locuiește în căsuța celor 7 pitici.' },
  { q: 'Câte munci legendare a îndeplinit eroul mitologic Hercule?', t: 12, u: 'munci', fk: 'fact_est_hercules_labors_12', url: 'https://ro.wikipedia.org/wiki/Muncile_lui_Hercule', title: 'Muncile lui Hercule — Wikipedia', exp: 'Mitologia greacă descrie cele 12 munci ale lui Heracle (Hercule).' },
  { q: 'Câți mușchetari dau titlul celebrului roman al lui Dumas?', t: 3, u: 'mușchetari', fk: 'fact_est_three_musketeers_3', url: 'https://ro.wikipedia.org/wiki/Cei_trei_mu%C8%99chetari', title: 'Cei trei mușchetari — Wikipedia', exp: 'Romanul „Cei trei mușchetari” îi urmărește pe Athos, Porthos și Aramis alături de d’Artagnan.' },
  { q: 'Câți jucători are pe teren o echipă de fotbal la start?', t: 11, u: 'jucători', fk: 'fact_est_football_players_11', url: 'https://ro.wikipedia.org/wiki/Fotbal', title: 'Fotbal — Wikipedia', exp: 'O echipă de fotbal începe meciul cu 11 jucători pe teren, inclusiv portarul.' },
  { q: 'Câte minute durează timpul regulamentar al unui meci de fotbal?', t: 90, u: 'minute', fk: 'fact_est_football_minutes_90', url: 'https://ro.wikipedia.org/wiki/Fotbal', title: 'Fotbal — Wikipedia', exp: 'Timpul regulamentar la fotbal este de 90 de minute (două reprize a câte 45 de minute).' },
  { q: 'La câți metri de poartă se află punctul de penalty în fotbal?', t: 11, u: 'metri', fk: 'fact_est_penalty_spot_11', url: 'https://ro.wikipedia.org/wiki/Lovitur%C4%83_de_la_11_metri', title: 'Lovitură de la 11 metri — Wikipedia', exp: 'Punctul de pedeapsă în fotbal se află la 11 metri de linia porții.' },
  { q: 'Câte penalty-uri a apărat Duckadam în finala de la Sevilla?', t: 4, u: 'penalty-uri', fk: 'fact_est_duckadam_penalties_4', url: 'https://ro.wikipedia.org/wiki/Helmuth_Duckadam', title: 'Helmuth Duckadam — Wikipedia', exp: 'Helmuth Duckadam a apărat 4 lovituri consecutive de departajare în finala din 1986.' },
  { q: 'Câte note de 10 a primit Nadia Comăneci la Montreal în 1976?', t: 7, u: 'note', fk: 'fact_est_nadia_tens_7', url: 'https://ro.wikipedia.org/wiki/Nadia_Com%C4%83neci', title: 'Nadia Comăneci — Wikipedia', exp: 'Nadia Comăneci a obținut 7 note perfecte de 10 la Jocurile Olimpice de la Montreal.' },
  { q: 'Câte cercuri întrețesute se află pe drapelul Jocurilor Olimpice?', t: 5, u: 'cercuri', fk: 'fact_est_olympic_rings_5', url: 'https://ro.wikipedia.org/wiki/Simbolurile_olimpice', title: 'Simbolurile olimpice — Wikipedia', exp: 'Simbolul olimpic este alcătuit din 5 cercuri întrețesute.' },
  { q: 'Câte turnee de Grand Slam se dispută anual în tenis?', t: 4, u: 'turnee', fk: 'fact_est_grand_slam_4', url: 'https://ro.wikipedia.org/wiki/Grand_Slam_(tenis)', title: 'Grand Slam (tenis) — Wikipedia', exp: 'Cele 4 turnee sunt Australian Open, Roland Garros, Wimbledon și US Open.' },
  { q: 'Câți kilometri măsoară rotunjit proba olimpică de maraton?', t: 42, u: 'kilometri', fk: 'fact_est_marathon_km_42', url: 'https://ro.wikipedia.org/wiki/Maraton', title: 'Maraton — Wikipedia', exp: 'Distanța oficială a maratonului este de 42,195 km (rotunjit 42 km).' },
  { q: 'Câți metri lungime are un bazin olimpic de înot?', t: 50, u: 'metri', fk: 'fact_est_olympic_pool_50', url: 'https://ro.wikipedia.org/wiki/Bazin_olimpic', title: 'Bazin olimpic — Wikipedia', exp: 'Un bazin olimpic standard are lungimea de 50 de metri.' },
  { q: 'Din câte sferturi este alcătuit un meci de baschet?', t: 4, u: 'sferturi', fk: 'fact_est_basketball_quarters_4', url: 'https://ro.wikipedia.org/wiki/Baschet', title: 'Baschet — Wikipedia', exp: 'Un meci regulamentar de baschet este împărțit în 4 sferturi.' },
  { q: 'Câți jucători dintr-o echipă de baschet sunt simultan pe teren?', t: 5, u: 'jucători', fk: 'fact_est_basketball_players_5', url: 'https://ro.wikipedia.org/wiki/Baschet', title: 'Baschet — Wikipedia', exp: 'În baschet, fiecare echipă are 5 jucători pe teren în timpul jocului.' },
  { q: 'Câte minute durează timpul regulamentar al unui meci de handbal?', t: 60, u: 'minute', fk: 'fact_est_handball_minutes_60', url: 'https://ro.wikipedia.org/wiki/Handbal', title: 'Handbal — Wikipedia', exp: 'O partidă de handbal la seniori durează 60 de minute (două reprize de 30 de minute).' },
  { q: 'Câți jucători are pe teren o echipă de handbal (cu portar)?', t: 7, u: 'jucători', fk: 'fact_est_handball_players_7', url: 'https://ro.wikipedia.org/wiki/Handbal', title: 'Handbal — Wikipedia', exp: 'O echipă de handbal are pe teren 6 jucători de câmp și un portar (7 în total).' },
  { q: 'Câți voleibaliști are pe teren o echipă în timpul meciului?', t: 6, u: 'jucători', fk: 'fact_est_volleyball_players_6', url: 'https://ro.wikipedia.org/wiki/Volei', title: 'Volei — Wikipedia', exp: 'La volei pe sală, fiecare echipă are 6 jucători pe teren.' },
  { q: 'Câte minute durează timpul regulamentar al unui meci de rugby?', t: 80, u: 'minute', fk: 'fact_est_rugby_minutes_80', url: 'https://ro.wikipedia.org/wiki/Rugby_Union', title: 'Rugby Union — Wikipedia', exp: 'O partidă de rugby în XV durează 80 de minute (două reprize de 40 de minute).' },
  { q: 'Câte pătrate (albe și negre) are în total o tablă de șah?', t: 64, u: 'pătrate', fk: 'fact_est_chess_squares_64', url: 'https://ro.wikipedia.org/wiki/Tabl%C4%83_de_%C8%99ah', title: 'Tablă de șah — Wikipedia', exp: 'Tabla de șah are 8×8 = 64 de câmpuri alternative albe și negre.' },
  { q: 'Câte piese are în total un set de șah la începutul partidei?', t: 32, u: 'piese', fk: 'fact_est_chess_pieces_32', url: 'https://ro.wikipedia.org/wiki/Pies%C4%83_de_%C8%99ah', title: 'Piesă de șah — Wikipedia', exp: 'La începutul partidei sunt 32 de piese pe tablă (câte 16 pentru fiecare jucător).' },
  { q: 'Câți pioni are un singur jucător la începutul partidei de șah?', t: 8, u: 'pioni', fk: 'fact_est_chess_pawns_8', url: 'https://ro.wikipedia.org/wiki/Pion_(%C8%99ah)', title: 'Pion (șah) — Wikipedia', exp: 'Fiecare jucător începe partida de șah cu un șir de 8 pioni.' },
  { q: 'Câte probe individuale cuprinde concursul masculin de decatlon?', t: 10, u: 'probe', fk: 'fact_est_decathlon_events_10', url: 'https://ro.wikipedia.org/wiki/Decatlon', title: 'Decatlon — Wikipedia', exp: 'Decatlonul atletic este alcătuit din 10 probe desfășurate pe parcursul a două zile.' },
  { q: 'Câte titluri mondiale a câștigat naționala masculină de handbal a României?', t: 4, u: 'titluri', fk: 'fact_est_ro_handball_titles_4', url: 'https://ro.wikipedia.org/wiki/Echipa_na%C8%9Bional%C4%83_de_handbal_masculin_a_Rom%C3%A2niei', title: 'Echipa națională de handbal masculin a României — Wikipedia', exp: 'România a cucerit 4 titluri mondiale la handbal masculin (1961, 1964, 1970, 1974).' },
  { q: 'Câte medalii olimpice de aur a câștigat Elisabeta Lipă în carieră?', t: 5, u: 'medalii', fk: 'fact_est_lipa_gold_5', url: 'https://ro.wikipedia.org/wiki/Elisabeta_Lip%C4%83', title: 'Elisabeta Lipă — Wikipedia', exp: 'Canotoarea Elisabeta Lipă a cucerit 5 medalii olimpice de aur.' },
  { q: 'Câte medalii olimpice de aur a cucerit canotorul Ivan Patzaichin?', t: 4, u: 'medalii', fk: 'fact_est_patzaichin_gold_4', url: 'https://ro.wikipedia.org/wiki/Ivan_Patzaichin', title: 'Ivan Patzaichin — Wikipedia', exp: 'Ivan Patzaichin a câștigat 4 medalii olimpice de aur și 3 de argint.' },
  { q: 'De câte ori a fost aleasă Cristina Neagu cea mai bună handbalistă a lumii?', t: 4, u: 'trofee', fk: 'fact_est_neagu_ihf_4', url: 'https://ro.wikipedia.org/wiki/Cristina_Neagu', title: 'Cristina Neagu — Wikipedia', exp: 'Cristina Neagu a primit de 4 ori trofeul IHF pentru cea mai bună jucătoare a lumii.' },
  { q: 'Câte elemente chimice sunt recunoscute în Tabelul Periodic?', t: 118, u: 'elemente', fk: 'fact_est_periodic_elements_118', url: 'https://ro.wikipedia.org/wiki/Tabelul_periodic_al_elementelor', title: 'Tabelul periodic al elementelor — Wikipedia', exp: 'Tabelul periodic actual conține 118 elemente chimice confirmate.' },
  { q: 'La câte grade Celsius fierbe apa la presiune atmosferică normală?', t: 100, u: 'grade', fk: 'fact_est_water_boiling_100', url: 'https://ro.wikipedia.org/wiki/Punct_de_fierbere', title: 'Punct de fierbere — Wikipedia', exp: 'Apa pură fierbe la 100 °C la presiunea atmosferică standard.' },
  { q: 'Câți metri altitudine are Vârful Moldoveanu din Munții Făgăraș?', t: 2544, u: 'metri', fk: 'fact_est_moldoveanu_2544', url: 'https://ro.wikipedia.org/wiki/V%C3%A2rful_Moldoveanu', title: 'Vârful Moldoveanu — Wikipedia', exp: 'Vârful Moldoveanu este cel mai înalt din România, având 2.544 m.' },
  { q: 'Câți metri altitudine are Vârful Omu din Munții Bucegi?', t: 2505, u: 'metri', fk: 'fact_est_varful_omu_2505', url: 'https://ro.wikipedia.org/wiki/V%C3%A2rful_Omu,_Mun%C8%9Bii_Bucegi', title: 'Vârful Omu (Munții Bucegi) — Wikipedia', exp: 'Vârful Omu din Masivul Bucegi are altitudinea de 2.505 m.' },
  { q: 'Câți metri altitudine are Vârful Everest din Himalaya?', t: 8848, u: 'metri', fk: 'fact_est_everest_8848', url: 'https://ro.wikipedia.org/wiki/Everest', title: 'Vârful Everest — Wikipedia', exp: 'Everestul este cel mai înalt vârf de pe Pământ, cu 8.848 m.' },
  { q: 'Câți metri altitudine are vârful Mont Blanc din Munții Alpi?', t: 4808, u: 'metri', fk: 'fact_est_mont_blanc_4808', url: 'https://ro.wikipedia.org/wiki/Mont_Blanc', title: 'Mont Blanc — Wikipedia', exp: 'Mont Blanc este cel mai înalt vârf din Alpi, având aproximativ 4.808 m.' },
  { q: 'Câți kilometri măsoară sectorul românesc al fluviului Dunărea?', t: 1075, u: 'kilometri', fk: 'fact_est_danube_ro_1075', url: 'https://ro.wikipedia.org/wiki/Dun%C4%83rea', title: 'Fluviul Dunărea — Wikipedia', exp: 'Pe teritoriul României, între Baziaș și Sulina, Dunărea măsoară 1.075 km.' },
  { q: 'Câți kilometri are în total fluviul Dunărea de la izvor la vărsare?', t: 2860, u: 'kilometri', fk: 'fact_est_danube_total_2860', url: 'https://ro.wikipedia.org/wiki/Dun%C4%83rea', title: 'Fluviul Dunărea — Wikipedia', exp: 'Lungimea totală a fluviului Dunărea este de aproximativ 2.860 km.' },
  { q: 'Câți metri înălțime are Barajul Vidraru de pe râul Argeș?', t: 166, u: 'metri', fk: 'fact_est_vidraru_height_166', url: 'https://ro.wikipedia.org/wiki/Barajul_Vidraru', title: 'Barajul Vidraru — Wikipedia', exp: 'Barajul în arc de la Vidraru are o înălțime de 166 de metri.' },
  { q: 'În ce an s-a încheiat al doilea război daco-roman purtat de Traian?', t: 106, u: 'an', fk: 'fact_est_yr_dacia_106', url: 'https://ro.wikipedia.org/wiki/R%C4%83zboaiele_daco-romane', title: 'Războaiele daco-romane — Wikipedia', exp: 'Al doilea război daco-roman s-a încheiat în anul 106 d.Hr.' },
  { q: 'În ce an a avut loc Bătălia de la Posada câștigată de Basarab I?', t: 1330, u: 'an', fk: 'fact_est_yr_posada_1330', url: 'https://ro.wikipedia.org/wiki/B%C4%83t%C4%83lia_de_la_Posada', title: 'Bătălia de la Posada — Wikipedia', exp: 'Bătălia de la Posada a avut loc în toamna anului 1330.' },
  { q: 'În ce an a început domnia lui Mircea cel Bătrân în Țara Românească?', t: 1386, u: 'an', fk: 'fact_est_yr_mircea_1386', url: 'https://ro.wikipedia.org/wiki/Mircea_cel_B%C4%83tr%C3%A2n', title: 'Mircea cel Bătrân — Wikipedia', exp: 'Mircea cel Bătrân a urcat pe tronul Țării Românești în anul 1386.' },
  { q: 'În ce an a căzut Constantinopolul sub asediul lui Mahomed al II-lea?', t: 1453, u: 'an', fk: 'fact_est_yr_constantinopol_1453', url: 'https://ro.wikipedia.org/wiki/C%C4%83derea_Constantinopolului', title: 'Căderea Constantinopolului — Wikipedia', exp: 'Constantinopolul a fost cucerit de otomani la 29 mai 1453.' },
  { q: 'În ce an a început lunga domnie a lui Ștefan cel Mare în Moldova?', t: 1457, u: 'an', fk: 'fact_est_yr_stefan_start_1457', url: 'https://ro.wikipedia.org/wiki/%C8%98tefan_cel_Mare', title: 'Ștefan cel Mare — Wikipedia', exp: 'Ștefan cel Mare a urcat pe tronul Moldovei în aprilie 1457.' },
  { q: 'În ce an apare prima atestare documentară a cetății București?', t: 1459, u: 'an', fk: 'fact_est_yr_bucuresti_1459', url: 'https://ro.wikipedia.org/wiki/Istoria_Bucure%C8%99tiului', title: 'Istoria Bucureștiului — Wikipedia', exp: 'Bucureștiul este atestat documentar la 20 septembrie 1459 într-un hrisov al lui Vlad Țepeș.' },
  { q: 'În ce an a câștigat Ștefan cel Mare Bătălia de la Vaslui?', t: 1475, u: 'an', fk: 'fact_est_yr_vaslui_1475', url: 'https://ro.wikipedia.org/wiki/B%C4%83t%C4%83lia_de_la_Vaslui', title: 'Bătălia de la Vaslui — Wikipedia', exp: 'Victoria de la Podul Înalt (Vaslui) a avut loc la 10 ianuarie 1475.' },
  { q: 'În ce an a fost ridicată Mănăstirea Voroneț de Ștefan cel Mare?', t: 1488, u: 'an', fk: 'fact_est_yr_voronet_1488', url: 'https://ro.wikipedia.org/wiki/M%C4%83n%C4%83stirea_Vorone%C8%9B', title: 'Mănăstirea Voroneț — Wikipedia', exp: 'Mănăstirea Voroneț a fost ctitorită în anul 1488 în doar trei luni și trei săptămâni.' },
  { q: 'În ce an a ajuns Cristofor Columb pentru prima dată în America?', t: 1492, u: 'an', fk: 'fact_est_yr_columb_1492', url: 'https://ro.wikipedia.org/wiki/Cristofor_Columb', title: 'Cristofor Columb — Wikipedia', exp: 'Cristofor Columb a debarcat în Lumea Nouă la 12 octombrie 1492.' },
  { q: 'În ce an s-a încheiat domnia lui Ștefan cel Mare în Moldova?', t: 1504, u: 'an', fk: 'fact_est_yr_stefan_end_1504', url: 'https://ro.wikipedia.org/wiki/%C8%98tefan_cel_Mare', title: 'Ștefan cel Mare — Wikipedia', exp: 'Ștefan cel Mare a trecut la cele veșnice la 2 iulie 1504.' },
  { q: 'În ce an a fost scrisă Scrisoarea lui Neacșu din Câmpulung?', t: 1521, u: 'an', fk: 'fact_est_yr_neacsu_1521', url: 'https://ro.wikipedia.org/wiki/Scrisoarea_lui_Neac%C8%99u', title: 'Scrisoarea lui Neacșu — Wikipedia', exp: 'Scrisoarea lui Neacșu datează din vara anului 1521.' },
  { q: 'În ce an a avut loc Bătălia de la Călugăreni condusă de Mihai Viteazul?', t: 1595, u: 'an', fk: 'fact_est_yr_calugareni_1595', url: 'https://ro.wikipedia.org/wiki/B%C4%83t%C4%83lia_de_la_C%C4%83lug%C4%83reni', title: 'Bătălia de la Călugăreni — Wikipedia', exp: 'Bătălia de la Călugăreni s-a desfășurat în august 1595.' },
  { q: 'În ce an a realizat Mihai Viteazul prima unire la Alba Iulia?', t: 1600, u: 'an', fk: 'fact_est_yr_mihai_unire_1600', url: 'https://ro.wikipedia.org/wiki/Mihai_Viteazul', title: 'Mihai Viteazul — Wikipedia', exp: 'În mai 1600, Mihai Viteazul a unit sub sceptrul său cele trei țări române.' },
  { q: 'În ce an a fost adoptată Declarația de Independență a SUA?', t: 1776, u: 'an', fk: 'fact_est_yr_usa_indep_1776', url: 'https://ro.wikipedia.org/wiki/Declara%C8%9Bia_de_independen%C8%9B%C4%83_a_Statelor_Unite_ale_Americii', title: 'Declarația de independență a SUA — Wikipedia', exp: 'Declarația de Independență a Statelor Unite a fost adoptată la 4 iulie 1776.' },
  { q: 'În ce an a izbucnit Revoluția Franceză odată cu căderea Bastiliei?', t: 1789, u: 'an', fk: 'fact_est_yr_french_rev_1789', url: 'https://ro.wikipedia.org/wiki/Revolu%C8%9Bia_Francez%C4%83', title: 'Revoluția Franceză — Wikipedia', exp: 'Căderea Bastiliei la 14 iulie 1789 a marcat începutul Revoluției Franceze.' },
  { q: 'În ce an a fost înfrânt Napoleon Bonaparte în Bătălia de la Waterloo?', t: 1815, u: 'an', fk: 'fact_est_yr_waterloo_1815', url: 'https://ro.wikipedia.org/wiki/B%C4%83t%C4%83lia_de_la_Waterloo', title: 'Bătălia de la Waterloo — Wikipedia', exp: 'Bătălia de la Waterloo a avut loc la 18 iunie 1815.' },
  { q: 'În ce an a condus Tudor Vladimirescu revoluția pandurilor?', t: 1821, u: 'an', fk: 'fact_est_yr_tudor_1821', url: 'https://ro.wikipedia.org/wiki/Revolu%C8%9Bia_de_la_1821', title: 'Revoluția de la 1821 — Wikipedia', exp: 'Mișcarea condusă de Tudor Vladimirescu a avut loc în anul 1821.' },
  { q: 'În ce an a brevetat Petrache Poenaru primul stilou cu rezervor?', t: 1827, u: 'an', fk: 'fact_est_yr_poenaru_1827', url: 'https://ro.wikipedia.org/wiki/Petrache_Poenaru', title: 'Petrache Poenaru — Wikipedia', exp: 'Petrache Poenaru a obținut brevetul francez pentru stilou în mai 1827.' },
  { q: 'În ce an a avut loc Revoluția pașoptistă în Țările Române?', t: 1848, u: 'an', fk: 'fact_est_yr_pasopt_1848', url: 'https://ro.wikipedia.org/wiki/Revolu%C8%9Bia_Rom%C3%A2n%C4%83_din_1848', title: 'Revoluția Română din 1848 — Wikipedia', exp: 'Revoluția pașoptistă s-a desfășurat în anul 1848.' },
  { q: 'În ce an s-a născut poetul național Mihai Eminescu?', t: 1850, u: 'an', fk: 'fact_est_yr_eminescu_1850', url: 'https://ro.wikipedia.org/wiki/Mihai_Eminescu', title: 'Mihai Eminescu — Wikipedia', exp: 'Mihai Eminescu s-a născut la 15 ianuarie 1850.' },
  { q: 'În ce an s-a înfăptuit Unirea Principatelor sub Alexandru Ioan Cuza?', t: 1859, u: 'an', fk: 'fact_est_yr_mica_unire_1859', url: 'https://ro.wikipedia.org/wiki/Unirea_Principatelor_Rom%C3%A2ne', title: 'Unirea Principatelor Române — Wikipedia', exp: 'Unirea Moldovei cu Țara Românească s-a realizat la 24 ianuarie 1859.' },
  { q: 'În ce an a început domnia lui Carol I în România?', t: 1866, u: 'an', fk: 'fact_est_yr_carol_1866', url: 'https://ro.wikipedia.org/wiki/Carol_I_al_Rom%C3%A2niei', title: 'Carol I al României — Wikipedia', exp: 'Carol I a depus jurământul ca domnitor al României la 10 mai 1866.' },
  { q: 'În ce an și-a proclamat România Independența de Stat la 9 Mai?', t: 1877, u: 'an', fk: 'fact_est_yr_indep_1877', url: 'https://ro.wikipedia.org/wiki/R%C4%83zboiul_de_Independen%C8%9B%C4%83_al_Rom%C3%A2niei', title: 'Războiul de Independență al României — Wikipedia', exp: 'Independența de Stat a României a fost proclamată la 9 mai 1877.' },
  { q: 'În ce an a fost proclamat oficial Regatul României sub Carol I?', t: 1881, u: 'an', fk: 'fact_est_yr_regat_1881', url: 'https://ro.wikipedia.org/wiki/Regatul_Rom%C3%A2niei', title: 'Regatul României — Wikipedia', exp: 'România a devenit regat în anul 1881.' },
  { q: 'În ce an a fost inaugurat Castelul Peleș din Sinaia?', t: 1883, u: 'an', fk: 'fact_est_yr_peles_1883', url: 'https://ro.wikipedia.org/wiki/Castelul_Pele%C8%99', title: 'Castelul Peleș — Wikipedia', exp: 'Castelul Peleș a fost inaugurat oficial în octombrie 1883.' },
  { q: 'În ce an a fost inaugurat Ateneul Român din București?', t: 1888, u: 'an', fk: 'fact_est_yr_ateneu_1888', url: 'https://ro.wikipedia.org/wiki/Ateneul_Rom%C3%A2n', title: 'Ateneul Român — Wikipedia', exp: 'Palatul Ateneului Român a fost inaugurat în februarie 1888.' },
  { q: 'În ce an a fost inaugurat Turnul Eiffel din Paris?', t: 1889, u: 'an', fk: 'fact_est_yr_eiffel_1889', url: 'https://ro.wikipedia.org/wiki/Turnul_Eiffel', title: 'Turnul Eiffel — Wikipedia', exp: 'Turnul Eiffel a fost inaugurat pentru Expoziția Universală din 1889.' },
  { q: 'În ce an a fost inaugurat podul lui Anghel Saligny de la Cernavodă?', t: 1895, u: 'an', fk: 'fact_est_yr_cernavoda_1895', url: 'https://ro.wikipedia.org/wiki/Podul_Regele_Carol_I', title: 'Podul Regele Carol I — Wikipedia', exp: 'Podul peste Dunăre de la Cernavodă a fost inaugurat în septembrie 1895.' },
  { q: 'În ce an s-au desfășurat primele Jocuri Olimpice moderne la Atena?', t: 1896, u: 'an', fk: 'fact_est_yr_olympics_1896', url: 'https://ro.wikipedia.org/wiki/Jocurile_Olimpice_de_var%C4%83_din_1896', title: 'Jocurile Olimpice de vară din 1896 — Wikipedia', exp: 'Prima ediție a Jocurilor Olimpice moderne a avut loc la Atena în 1896.' },
  { q: 'În ce an au fost decernate pentru prima dată Premiile Nobel?', t: 1901, u: 'an', fk: 'fact_est_yr_nobel_1901', url: 'https://ro.wikipedia.org/wiki/Premiul_Nobel', title: 'Premiul Nobel — Wikipedia', exp: 'Primele Premii Nobel au fost acordate la 10 decembrie 1901.' },
  { q: 'În ce an a realizat Traian Vuia primul zbor autopropulsat lângă Paris?', t: 1906, u: 'an', fk: 'fact_est_yr_vuia_1906', url: 'https://ro.wikipedia.org/wiki/Traian_Vuia', title: 'Traian Vuia — Wikipedia', exp: 'Traian Vuia a zburat la Montesson la 18 martie 1906.' },
  { q: 'În ce an s-a scufundat pachebotul Titanic în Oceanul Atlantic?', t: 1912, u: 'an', fk: 'fact_est_yr_titanic_1912', url: 'https://ro.wikipedia.org/wiki/RMS_Titanic', title: 'RMS Titanic — Wikipedia', exp: 'Titanicul s-a scufundat în noaptea de 14 spre 15 aprilie 1912.' },
  { q: 'În ce an a izbucnit Primul Război Mondial în Europa?', t: 1914, u: 'an', fk: 'fact_est_yr_ww1_start_1914', url: 'https://ro.wikipedia.org/wiki/Primul_R%C4%83zboi_Mondial', title: 'Primul Război Mondial — Wikipedia', exp: 'Primul Război Mondial a izbucnit în vara anului 1914.' },
  { q: 'În ce an a intrat România în Primul Război Mondial?', t: 1916, u: 'an', fk: 'fact_est_yr_ro_ww1_1916', url: 'https://ro.wikipedia.org/wiki/Participarea_Rom%C3%A2niei_la_Primul_R%C4%83zboi_Mondial', title: 'Participarea României la Primul Război Mondial — Wikipedia', exp: 'România a intrat în Primul Război Mondial în august 1916.' },
  { q: 'În ce an s-a înfăptuit Marea Unire proclamată la Alba Iulia?', t: 1918, u: 'an', fk: 'fact_est_yr_marea_unire_1918', url: 'https://ro.wikipedia.org/wiki/Marea_Unire', title: 'Marea Unire — Wikipedia', exp: 'Marea Unire a fost încununată la Alba Iulia la 1 decembrie 1918.' },
  { q: 'În ce an au fost încoronați Ferdinand și Maria la Alba Iulia?', t: 1922, u: 'an', fk: 'fact_est_yr_incoronare_1922', url: 'https://ro.wikipedia.org/wiki/%C3%8Encoronarea_regelui_Ferdinand_%C8%99i_a_reginei_Maria', title: 'Încoronarea de la Alba Iulia — Wikipedia', exp: 'Încoronarea regelui Ferdinand și a reginei Maria a avut loc la 15 octombrie 1922.' },
  { q: 'În ce an a avut loc primul Campionat Mondial de Fotbal în Uruguay?', t: 1930, u: 'an', fk: 'fact_est_yr_first_wc_1930', url: 'https://ro.wikipedia.org/wiki/Campionatul_Mondial_de_Fotbal_1930', title: 'Campionatul Mondial de Fotbal 1930 — Wikipedia', exp: 'Prima Cupă Mondială FIFA s-a desfășurat în Uruguay în anul 1930.' },
  { q: 'În ce an a fost inaugurat Ansamblul lui Brâncuși la Târgu Jiu?', t: 1938, u: 'an', fk: 'fact_est_yr_brancusi_1938', url: 'https://ro.wikipedia.org/wiki/Ansamblul_monumental_Calea_Eroilor_de_la_T%C3%A2rgu_Jiu', title: 'Ansamblul monumental de la Târgu Jiu — Wikipedia', exp: 'Ansamblul lui Constantin Brâncuși a fost inaugurat în octombrie 1938.' },
  { q: 'În ce an a început Al Doilea Război Mondial în Europa?', t: 1939, u: 'an', fk: 'fact_est_yr_ww2_start_1939', url: 'https://ro.wikipedia.org/wiki/Al_Doilea_R%C4%83zboi_Mondial', title: 'Al Doilea Război Mondial — Wikipedia', exp: 'Al Doilea Război Mondial a început la 1 septembrie 1939.' },
  { q: 'În ce an s-a încheiat Al Doilea Război Mondial?', t: 1945, u: 'an', fk: 'fact_est_yr_ww2_end_1945', url: 'https://ro.wikipedia.org/wiki/Al_Doilea_R%C4%83zboi_Mondial', title: 'Al Doilea Război Mondial — Wikipedia', exp: 'Al Doilea Război Mondial s-a încheiat în anul 1945.' },
  { q: 'În ce an a pășit Neil Armstrong pe Lună în misiunea Apollo 11?', t: 1969, u: 'an', fk: 'fact_est_yr_apollo11_1969', url: 'https://ro.wikipedia.org/wiki/Apollo_11', title: 'Apollo 11 — Wikipedia', exp: 'Neil Armstrong a pășit pe Lună la 20 iulie 1969.' },
  { q: 'În ce an a avut premiera primul film din seria „Războiul Stelelor”?', t: 1977, u: 'an', fk: 'fact_est_yr_star_wars_1977', url: 'https://ro.wikipedia.org/wiki/R%C4%83zboiul_stelelor_-_Episodul_IV:_O_nou%C4%83_speran%C8%9B%C4%83', title: 'Războiul stelelor (1977) — Wikipedia', exp: 'Primul film Star Wars a fost lansat în mai 1977.' },
  { q: 'În ce an a zburat cosmonautul Dumitru Prunariu în spațiul cosmic?', t: 1981, u: 'an', fk: 'fact_est_yr_prunariu_1981', url: 'https://ro.wikipedia.org/wiki/Dumitru_Prunariu', title: 'Dumitru Prunariu — Wikipedia', exp: 'Dumitru Prunariu a zburat în cosmos în mai 1981 la bordul Soiuz 40.' },
  { q: 'În ce an a cucerit Steaua București Cupa Campionilor la Sevilla?', t: 1986, u: 'an', fk: 'fact_est_yr_steaua_1986', url: 'https://ro.wikipedia.org/wiki/Finala_Cupei_Campionilor_Europeni_1986', title: 'Finala Cupei Campionilor Europeni 1986 — Wikipedia', exp: 'Steaua București a câștigat trofeul la 7 mai 1986, la Sevilla.' },
  { q: 'În ce an a avut loc căderea regimului comunist în România?', t: 1989, u: 'an', fk: 'fact_est_yr_rev_ro_1989', url: 'https://ro.wikipedia.org/wiki/Revolu%C8%9Bia_Rom%C3%A2n%C4%83_din_1989', title: 'Revoluția Română din 1989 — Wikipedia', exp: 'Revoluția anticomunistă din România a avut loc în decembrie 1989.' },
  { q: 'În ce an a jucat România sfertul de finală la Mondialul din SUA?', t: 1994, u: 'an', fk: 'fact_est_yr_wc_usa_1994', url: 'https://ro.wikipedia.org/wiki/Campionatul_Mondial_de_Fotbal_1994', title: 'Campionatul Mondial de Fotbal 1994 — Wikipedia', exp: 'Generația de Aur a ajuns în sferturile Cupei Mondiale în vara anului 1994.' },
  { q: 'În ce an a fost fondată compania Google de Larry Page și Sergey Brin?', t: 1998, u: 'an', fk: 'fact_est_yr_google_1998', url: 'https://ro.wikipedia.org/wiki/Google', title: 'Google — Wikipedia', exp: 'Compania Google a fost fondată în septembrie 1998.' },
  { q: 'În ce an a aderat România oficial la alianța NATO?', t: 2004, u: 'an', fk: 'fact_est_yr_ro_nato_2004', url: 'https://ro.wikipedia.org/wiki/Rela%C8%9Biile_dintre_Rom%C3%A2nia_%C8%99i_NATO', title: 'Relațiile dintre România și NATO — Wikipedia', exp: 'România a devenit membru cu drepturi depline al NATO în martie 2004.' },
  { q: 'În ce an a aderat România la Uniunea Europeană?', t: 2007, u: 'an', fk: 'fact_est_yr_ro_eu_2007', url: 'https://ro.wikipedia.org/wiki/Aderarea_Rom%C3%A2niei_la_Uniunea_European%C4%83', title: 'Aderarea României la Uniunea Europeană — Wikipedia', exp: 'România a aderat la Uniunea Europeană la 1 ianuarie 2007.' },
  { q: 'În ce an a prezentat Steve Jobs primul telefon iPhone?', t: 2007, u: 'an', fk: 'fact_est_yr_iphone_2007', url: 'https://ro.wikipedia.org/wiki/IPhone_(prima_genera%C8%9Bie)', title: 'iPhone (prima generație) — Wikipedia', exp: 'Primul model iPhone a fost prezentat și lansat în anul 2007.' },
  { q: 'În ce an a câștigat Simona Halep trofeul de la Roland Garros?', t: 2018, u: 'an', fk: 'fact_est_yr_halep_rg_2018', url: 'https://ro.wikipedia.org/wiki/Simona_Halep', title: 'Simona Halep — Wikipedia', exp: 'Simona Halep a câștigat primul său titlu de Grand Slam la Paris în 2018.' },
  { q: 'În ce an a câștigat Simona Halep trofeul de la Wimbledon?', t: 2019, u: 'an', fk: 'fact_est_yr_halep_wimb_2019', url: 'https://ro.wikipedia.org/wiki/Simona_Halep', title: 'Simona Halep — Wikipedia', exp: 'Simona Halep a cucerit trofeul de la Wimbledon în iulie 2019.' },
  { q: 'În ce an a cucerit Argentina lui Messi Cupa Mondială din Qatar?', t: 2022, u: 'an', fk: 'fact_est_yr_wc_qatar_2022', url: 'https://ro.wikipedia.org/wiki/Campionatul_Mondial_de_Fotbal_2022', title: 'Campionatul Mondial de Fotbal 2022 — Wikipedia', exp: 'Cupa Mondială FIFA din Qatar s-a disputat în noiembrie–decembrie 2022.' },
  { q: 'În ce an a devenit David Popovici campion olimpic la Paris?', t: 2024, u: 'an', fk: 'fact_est_yr_popovici_paris_2024', url: 'https://ro.wikipedia.org/wiki/David_Popovici', title: 'David Popovici — Wikipedia', exp: 'David Popovici a câștigat aurul olimpic la 200 m liber la Paris în 2024.' },
  { q: 'Câte coarde are o harpă mare de concert modernă?', t: 47, u: 'coarde', fk: 'fact_est_harp_strings_47', url: 'https://ro.wikipedia.org/wiki/Harp%C4%83', title: 'Harpă — Wikipedia', exp: 'O harpă modernă de orchestră cu pedale are în mod standard 47 de coarde.' },
  { q: 'Câte cărți de joc are un pachet clasic standard (fără jokeri)?', t: 52, u: 'cărți', fk: 'fact_est_playing_cards_52', url: 'https://ro.wikipedia.org/wiki/C%C4%83r%C8%9Bi_de_joc', title: 'Cărți de joc — Wikipedia', exp: 'Un pachet clasic francez conține 52 de cărți împărțite în 4 culori.' },
  { q: 'Câte fețe pătrate are un cub (sau un zar obișnuit)?', t: 6, u: 'fețe', fk: 'fact_est_cube_faces_6', url: 'https://ro.wikipedia.org/wiki/Cub', title: 'Cub — Wikipedia', exp: 'Un cub are 6 fețe pătrate congruente.' },
  { q: 'Câte puncte sunt în total pe toate fețele unui zar standard?', t: 21, u: 'puncte', fk: 'fact_est_dice_dots_21', url: 'https://ro.wikipedia.org/wiki/Zar', title: 'Zar — Wikipedia', exp: 'Suma numerelor de la 1 la 6 de pe fețele unui zar este 21.' },
  { q: 'Câte bile colorate și numerotate se folosesc la biliardul clasic?', t: 15, u: 'bile', fk: 'fact_est_pool_balls_15', url: 'https://ro.wikipedia.org/wiki/Biliard', title: 'Biliard — Wikipedia', exp: 'La biliardul american se folosesc 15 bile numerotate plus bila albă.' },
  { q: 'Câte popice sunt așezate în triunghi la începutul jocului de bowling?', t: 10, u: 'popice', fk: 'fact_est_bowling_pins_10', url: 'https://ro.wikipedia.org/wiki/Bowling', title: 'Bowling — Wikipedia', exp: 'Jocul standard de bowling (ten-pin) folosește 10 popice.' },
  { q: 'Câte zodii există în zodiacul european tradițional?', t: 12, u: 'zodii', fk: 'fact_est_zodiac_signs_12', url: 'https://ro.wikipedia.org/wiki/Zodiac', title: 'Zodiac — Wikipedia', exp: 'Zodiacul tradițional este împărțit în 12 semne zodiacale.' },
  { q: 'Câte culori principale sunt distinse tradițional în curcubeu?', t: 7, u: 'culori', fk: 'fact_est_rainbow_colors_7', url: 'https://ro.wikipedia.org/wiki/Curcubeu', title: 'Curcubeu — Wikipedia', exp: 'Spectrul curcubeului este împărțit tradițional în 7 culori (ROGVAIV).' },
  { q: 'Câte porți monumentale are Cetatea Alba Carolina din Alba Iulia?', t: 7, u: 'porți', fk: 'fact_est_alba_carolina_gates_7', url: 'https://ro.wikipedia.org/wiki/Cetatea_Alba_Carolina', title: 'Cetatea Alba Carolina — Wikipedia', exp: 'Fortificația bastionară de la Alba Iulia a avut 7 porți monumentale.' },
  { q: 'Câte bastioane avea inițial Cetatea de tip Vauban din Alba Iulia?', t: 7, u: 'bastioane', fk: 'fact_est_alba_bastions_7', url: 'https://ro.wikipedia.org/wiki/Cetatea_Alba_Carolina', title: 'Cetatea Alba Carolina — Wikipedia', exp: 'Cetatea Alba Carolina are 7 bastioane dispuse în formă de stea.' },
  { q: 'În ce an a fost lansat filmul „Avatar” regizat de James Cameron?', t: 2009, u: 'an', fk: 'fact_est_yr_avatar_2009', url: 'https://ro.wikipedia.org/wiki/Avatar_(film_din_2009)', title: 'Avatar (film din 2009) — Wikipedia', exp: 'Filmul SF „Avatar” a avut premiera mondială în decembrie 2009.' },
];

// ============================================================================
// 2. CURATED GENERAL-KNOWLEDGE MULTIPLE-CHOICE QUESTIONS (255 QUESTIONS)
// Strictly 4..14 words, <= 95 chars, 4 options <= 36 chars / <= 5 words,
// zero answer keyword leaks in prompt, unique factKeys.
// ============================================================================
const NEW_CURATED_CHOICE = [
  // --- CINEMATOGRAFIE & PERSONAJE ---
  { cat: 'cinematografie', q: 'Ce actor îl interpretează pe Jack Sparrow în „Pirații din Caraibe”?', opts: ['Johnny Depp', 'Orlando Bloom', 'Brad Pitt', 'Tom Cruise'], ans: 0, fk: 'fact_film_jack_sparrow', url: 'https://ro.wikipedia.org/wiki/Jack_Sparrow', title: 'Jack Sparrow — Wikipedia' },
  { cat: 'cinematografie', q: 'Cum se numește școala de magie din seria „Harry Potter”?', opts: ['Hogwarts', 'Narnia', 'Mordor', 'Wakanda'], ans: 0, fk: 'fact_film_hogwarts', url: 'https://ro.wikipedia.org/wiki/Hogwarts', title: 'Hogwarts — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actor joacă rolul lui Tony Stark (Iron Man) în filmele Marvel?', opts: ['Robert Downey Jr.', 'Chris Evans', 'Chris Hemsworth', 'Mark Ruffalo'], ans: 0, fk: 'fact_film_iron_man_actor', url: 'https://ro.wikipedia.org/wiki/Robert_Downey,_Jr.', title: 'Robert Downey Jr. — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce personaj din „Războiul Stelelor” rostește replica „Eu sunt tatăl tău”?', opts: ['Darth Vader', 'Obi-Wan Kenobi', 'Yoda', 'Han Solo'], ans: 0, fk: 'fact_film_darth_vader_quote', url: 'https://ro.wikipedia.org/wiki/Darth_Vader', title: 'Darth Vader — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actor l-a interpretat pe Jack Dawson în filmul „Titanic”?', opts: ['Leonardo DiCaprio', 'Matt Damon', 'Keanu Reeves', 'Christian Bale'], ans: 0, fk: 'fact_film_titanic_dicaprio', url: 'https://ro.wikipedia.org/wiki/Leonardo_DiCaprio', title: 'Leonardo DiCaprio — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actriță a jucat rolul lui Rose în filmul „Titanic”?', opts: ['Kate Winslet', 'Julia Roberts', 'Nicole Kidman', 'Sandra Bullock'], ans: 0, fk: 'fact_film_titanic_winslet', url: 'https://ro.wikipedia.org/wiki/Kate_Winslet', title: 'Kate Winslet — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actor îl interpretează pe Neo în trilogia „Matrix”?', opts: ['Keanu Reeves', 'Laurence Fishburne', 'Hugo Weaving', 'Will Smith'], ans: 0, fk: 'fact_film_matrix_neo', url: 'https://ro.wikipedia.org/wiki/Matrix', title: 'Matrix — Wikipedia' },
  { cat: 'cinematografie', q: 'Cine a regizat trilogia cinematografică „Stăpânul Inelelor”?', opts: ['Peter Jackson', 'Ridley Scott', 'George Lucas', 'Tim Burton'], ans: 0, fk: 'fact_film_lotr_director', url: 'https://ro.wikipedia.org/wiki/Peter_Jackson', title: 'Peter Jackson — Wikipedia' },
  { cat: 'cinematografie', q: 'În ce țară au fost filmate peisajele din trilogia „Stăpânul Inelelor”?', opts: ['Noua Zeelandă', 'Islanda', 'Scoția', 'Canada'], ans: 0, fk: 'fact_film_lotr_new_zealand', url: 'https://ro.wikipedia.org/wiki/St%C4%83p%C3%A2nul_inelelor_(serie_de_filme)', title: 'Stăpânul inelelor (serie de filme) — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actor interpretează rolul generalului Maximus în filmul „Gladiatorul”?', opts: ['Russell Crowe', 'Joaquin Phoenix', 'Gerard Butler', 'Mel Gibson'], ans: 0, fk: 'fact_film_gladiator_crowe', url: 'https://ro.wikipedia.org/wiki/Gladiatorul_(film_din_2000)', title: 'Gladiatorul (film din 2000) — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce cod numeric poartă celebrul agent secret britanic James Bond?', opts: ['007', '001', '009', '101'], ans: 0, fk: 'fact_film_james_bond_007', url: 'https://ro.wikipedia.org/wiki/James_Bond', title: 'James Bond — Wikipedia' },
  { cat: 'cinematografie', q: 'Cum se numește leul protagonist din filmul animat „Regele Leu”?', opts: ['Simba', 'Mufasa', 'Scar', 'Timon'], ans: 0, fk: 'fact_film_lion_king_simba', url: 'https://ro.wikipedia.org/wiki/Regele_Leu', title: 'Regele Leu — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce pește-clovn este căutat de tatăl său în animația Pixar din 2003?', opts: ['Nemo', 'Dory', 'Marlin', 'Flounder'], ans: 0, fk: 'fact_film_finding_nemo', url: 'https://ro.wikipedia.org/wiki/%C3%8En_c%C4%83utarea_lui_Nemo', title: 'În căutarea lui Nemo — Wikipedia' },
  { cat: 'cinematografie', q: 'Cum se numește omul de zăpadă vorbitor din filmul „Regatul de gheață”?', opts: ['Olaf', 'Sven', 'Kristoff', 'Baymax'], ans: 0, fk: 'fact_film_frozen_olaf', url: 'https://ro.wikipedia.org/wiki/Regatul_de_ghea%C8%9B%C4%83_(film)', title: 'Regatul de gheață — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce jucărie de cowboy este personajul principal în seria „Toy Story”?', opts: ['Șeriful Woody', 'Buzz Lightyear', 'Domnul Cartof', 'Rex'], ans: 0, fk: 'fact_film_toy_story_woody', url: 'https://ro.wikipedia.org/wiki/Povestea_juc%C4%83riilor', title: 'Povestea jucăriilor — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce căpcăun verde trăiește într-o mlaștină alături de Măgăruș în seria animată?', opts: ['Shrek', 'Hulk', 'Grinch', 'Sulley'], ans: 0, fk: 'fact_film_shrek', url: 'https://ro.wikipedia.org/wiki/Shrek', title: 'Shrek — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actor l-a interpretat pe Vito Corleone în primul film „Nașul”?', opts: ['Marlon Brando', 'Al Pacino', 'Robert De Niro', 'Joe Pesci'], ans: 0, fk: 'fact_film_godfather_brando', url: 'https://ro.wikipedia.org/wiki/Marlon_Brando', title: 'Marlon Brando — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actor a jucat rolul lui Forrest Gump în filmul din 1994?', opts: ['Tom Hanks', 'Robin Williams', 'Kevin Costner', 'Harrison Ford'], ans: 0, fk: 'fact_film_forrest_gump_hanks', url: 'https://ro.wikipedia.org/wiki/Forrest_Gump', title: 'Forrest Gump — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actor îl interpretează pe arheologul aventurier Indiana Jones?', opts: ['Harrison Ford', 'Sean Connery', 'Michael Douglas', 'Nicolas Cage'], ans: 0, fk: 'fact_film_indiana_jones_ford', url: 'https://ro.wikipedia.org/wiki/Indiana_Jones', title: 'Indiana Jones — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce regizor a realizat filmele „Jurassic Park” și „E.T. Extraterestrul”?', opts: ['Steven Spielberg', 'Martin Scorsese', 'David Fincher', 'Denis Villeneuve'], ans: 0, fk: 'fact_film_spielberg_jurassic', url: 'https://ro.wikipedia.org/wiki/Jurassic_Park_(film)', title: 'Jurassic Park — Wikipedia' },
  { cat: 'cinematografie', q: 'În ce oraș fictiv își desfășoară acțiunea supereroul Batman?', opts: ['Gotham City', 'Metropolis', 'Central City', 'Star City'], ans: 0, fk: 'fact_film_batman_gotham', url: 'https://ro.wikipedia.org/wiki/Batman', title: 'Batman — Wikipedia' },
  { cat: 'cinematografie', q: 'De pe ce planetă fictivă provine supereroul Superman?', opts: ['Krypton', 'Vulcan', 'Tatooine', 'Asgard'], ans: 0, fk: 'fact_film_superman_krypton', url: 'https://ro.wikipedia.org/wiki/Superman', title: 'Superman — Wikipedia' },
  { cat: 'cinematografie', q: 'Cum se numește luna locuită de populația Na’vi în filmul „Avatar”?', opts: ['Pandora', 'Arrakis', 'Endor', 'Naboo'], ans: 0, fk: 'fact_film_avatar_pandora', url: 'https://ro.wikipedia.org/wiki/Avatar_(film_din_2009)', title: 'Avatar (film din 2009) — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce mare actor al filmului mut a creat personajul „Micul vagabond”?', opts: ['Charlie Chaplin', 'Buster Keaton', 'Harold Lloyd', 'Stan Laurel'], ans: 0, fk: 'fact_film_chaplin_tramp', url: 'https://ro.wikipedia.org/wiki/Charlie_Chaplin', title: 'Charlie Chaplin — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce trofeu în formă de frunză se acordă la Festivalul de la Cannes?', opts: ['Palme d’Or', 'Ursul de Aur', 'Leul de Aur', 'Globul de Aur'], ans: 0, fk: 'fact_film_cannes_palme_dor', url: 'https://ro.wikipedia.org/wiki/Palme_d%27Or', title: 'Palme d’Or — Wikipedia' },
  { cat: 'cinematografie', q: 'În ce oraș italian are loc cel mai vechi festival de film din lume?', opts: ['Veneția', 'Roma', 'Milano', 'Torino'], ans: 0, fk: 'fact_film_venice_festival', url: 'https://ro.wikipedia.org/wiki/Festivalul_Interna%C8%9Bional_de_Film_de_la_Vene%C8%9Bia', title: 'Festivalul de Film de la Veneția — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce regizor și actor român a creat personajul comisarului Moldovan?', opts: ['Sergiu Nicolaescu', 'Ilarion Ciobanu', 'Mircea Drăgan', 'Gheorghe Dinică'], ans: 0, fk: 'fact_film_comisarul_moldovan', url: 'https://ro.wikipedia.org/wiki/Sergiu_Nicolaescu', title: 'Sergiu Nicolaescu — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce îndrăgit actor român l-a interpretat pe Mărgelatu în seria de aventuri?', opts: ['Florin Piersic', 'Ovidiu Iuliu Moldovan', 'Mircea Albulescu', 'Ion Besoiu'], ans: 0, fk: 'fact_film_margelatu_piersic', url: 'https://ro.wikipedia.org/wiki/Florin_Piersic', title: 'Florin Piersic — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce personaj popular oltenesc a fost creat și interpretat de Amza Pellea?', opts: ['Nea Mărin', 'Păcală', 'Mitică', 'Bică'], ans: 0, fk: 'fact_film_nea_marin_pellea', url: 'https://ro.wikipedia.org/wiki/Nea_M%C4%83rin_miliardar', title: 'Nea Mărin miliardar — Wikipedia' },
  { cat: 'cinematografie', q: 'În ce serie de comedie românească joacă Toma Caragiu și Jean Constantin?', opts: ['Brigada Diverse', 'Liceenii', 'Pistruiatul', 'BD la munte'], ans: 0, fk: 'fact_film_brigada_diverse', url: 'https://ro.wikipedia.org/wiki/Brigada_Diverse_%C3%AEn_alert%C4%83!', title: 'Brigada Diverse în alertă! — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actriță a interpretat rolul Danei în filmul românesc „Liceenii”?', opts: ['Oana Sârbu', 'Tamara Buciuceanu', 'Stela Popescu', 'Draga Olteanu'], ans: 0, fk: 'fact_film_liceenii_oana_sarbu', url: 'https://ro.wikipedia.org/wiki/Liceenii', title: 'Liceenii — Wikipedia' },
  { cat: 'cinematografie', q: 'Cum se numește goleta cu care călătoresc eroii serialului „Toate pânzele sus”?', opts: ['Speranța', 'Libertatea', 'Marea Neagră', 'Albatrosul'], ans: 0, fk: 'fact_film_toate_panzele_speranta', url: 'https://ro.wikipedia.org/wiki/Toate_p%C3%A2nzele_sus_(film)', title: 'Toate pânzele sus (film) — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce film sud-coreean a câștigat în 2020 Premiul Oscar pentru cel mai bun film?', opts: ['Parazit', 'Oldboy', 'Trenul spre Busan', 'Minari'], ans: 0, fk: 'fact_film_parasite_oscar', url: 'https://ro.wikipedia.org/wiki/Parazit_(film)', title: 'Parazit (film) — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce actor l-a interpretat pe Joker în filmul „Cavalerul negru” al lui Nolan?', opts: ['Heath Ledger', 'Jared Leto', 'Jack Nicholson', 'Cesar Romero'], ans: 0, fk: 'fact_film_dark_knight_ledger', url: 'https://ro.wikipedia.org/wiki/Cavalerul_negru_(film)', title: 'Cavalerul negru — Wikipedia' },
  { cat: 'cinematografie', q: 'Ce film regizat de Ridley Scott începe pe nava comercială „Nostromo”?', opts: ['Alien', 'Blade Runner', 'Marțianul', 'Prometheus'], ans: 0, fk: 'fact_film_alien_nostromo', url: 'https://ro.wikipedia.org/wiki/Alien_(film)', title: 'Alien (film) — Wikipedia' },

  // --- MUZICĂ & INSTRUMENTE ---
  { cat: 'muzica', q: 'Cine a fost legendarul solist vocal al trupei rock britanice Queen?', opts: ['Freddie Mercury', 'Mick Jagger', 'David Bowie', 'Elton John'], ans: 0, fk: 'fact_muz_queen_mercury', url: 'https://ro.wikipedia.org/wiki/Freddie_Mercury', title: 'Freddie Mercury — Wikipedia' },
  { cat: 'muzica', q: 'Din ce oraș englez provine celebra formație The Beatles?', opts: ['Liverpool', 'Manchester', 'Londra', 'Birmingham'], ans: 0, fk: 'fact_muz_beatles_liverpool', url: 'https://ro.wikipedia.org/wiki/The_Beatles', title: 'The Beatles — Wikipedia' },
  { cat: 'muzica', q: 'Ce artist supranumit „Regele Muzicii Pop” a lansat albumul „Thriller”?', opts: ['Michael Jackson', 'Prince', 'Stevie Wonder', 'Lionel Richie'], ans: 0, fk: 'fact_muz_mj_thriller', url: 'https://ro.wikipedia.org/wiki/Michael_Jackson', title: 'Michael Jackson — Wikipedia' },
  { cat: 'muzica', q: 'Ce cântăreț american a fost supranumit „Regele Rock and Roll-ului”?', opts: ['Elvis Presley', 'Chuck Berry', 'Johnny Cash', 'Buddy Holly'], ans: 0, fk: 'fact_muz_elvis_king', url: 'https://ro.wikipedia.org/wiki/Elvis_Presley', title: 'Elvis Presley — Wikipedia' },
  { cat: 'muzica', q: 'Din ce țară provine celebra formație pop ABBA, câștigătoare la Eurovision?', opts: ['Suedia', 'Norvegia', 'Danemarca', 'Olanda'], ans: 0, fk: 'fact_muz_abba_sweden', url: 'https://ro.wikipedia.org/wiki/ABBA', title: 'ABBA — Wikipedia' },
  { cat: 'muzica', q: 'Ce legendară formație rock românească a fost fondată și condusă de Nicu Covaci?', opts: ['Phoenix', 'Iris', 'Compact', 'Holograf'], ans: 0, fk: 'fact_muz_phoenix_covaci', url: 'https://ro.wikipedia.org/wiki/Transsylvania_Phoenix', title: 'Transsylvania Phoenix — Wikipedia' },
  { cat: 'muzica', q: 'La ce instrument popular românesc a devenit faimos în lume Gheorghe Zamfir?', opts: ['Nai', 'Cobză', 'Țambal', 'Bucium'], ans: 0, fk: 'fact_muz_zamfir_nai', url: 'https://ro.wikipedia.org/wiki/Gheorghe_Zamfir', title: 'Gheorghe Zamfir — Wikipedia' },
  { cat: 'muzica', q: 'Ce mare cântăreață română a fost supranumită „Pasărea măiastră”?', opts: ['Maria Tănase', 'Ioana Radu', 'Maria Lătărețu', 'Ileana Sărăroiu'], ans: 0, fk: 'fact_muz_maria_tanase', url: 'https://ro.wikipedia.org/wiki/Maria_T%C4%83nase', title: 'Maria Tănase — Wikipedia' },
  { cat: 'muzica', q: 'Ce mare soprană română din Brăila a cântat la premiera operei „Tosca”?', opts: ['Hariclea Darclée', 'Virginia Zeani', 'Angela Gheorghiu', 'Ileana Cotrubaș'], ans: 0, fk: 'fact_muz_hariclea_darclee', url: 'https://ro.wikipedia.org/wiki/Hariclea_Darcl%C3%A9e', title: 'Hariclea Darclée — Wikipedia' },
  { cat: 'muzica', q: 'Ce mare dirijor român a condus celebrele concerte ale Filarmonicii din München?', opts: ['Sergiu Celibidache', 'Constantin Silvestri', 'Ionel Perlea', 'Horia Andreescu'], ans: 0, fk: 'fact_muz_sergiu_celibidache', url: 'https://ro.wikipedia.org/wiki/Sergiu_Celibidache', title: 'Sergiu Celibidache — Wikipedia' },
  { cat: 'muzica', q: 'Ce lutier italian din Cremona a creat cele mai prețioase viori din istorie?', opts: ['Antonio Stradivari', 'Andrea Amati', 'Giuseppe Guarneri', 'Niccolò Paganini'], ans: 0, fk: 'fact_muz_stradivari_violins', url: 'https://ro.wikipedia.org/wiki/Antonio_Stradivari', title: 'Antonio Stradivari — Wikipedia' },
  { cat: 'muzica', q: 'Ce instrument de suflat din alamă este asociat cu muzica lui Louis Armstrong?', opts: ['Trompeta', 'Trombonul', 'Clarinetul', 'Flautul'], ans: 0, fk: 'fact_muz_armstrong_trumpet', url: 'https://ro.wikipedia.org/wiki/Louis_Armstrong', title: 'Louis Armstrong — Wikipedia' },
  { cat: 'muzica', q: 'În ce oraș american își are originile muzica jazz, la începutul secolului XX?', opts: ['New Orleans', 'Chicago', 'Seattle', 'Boston'], ans: 0, fk: 'fact_muz_jazz_new_orleans', url: 'https://ro.wikipedia.org/wiki/Jazz', title: 'Jazz — Wikipedia' },
  { cat: 'muzica', q: 'Din ce țară sud-americană provine dansul și stilul muzical tango?', opts: ['Argentina', 'Brazilia', 'Columbia', 'Peru'], ans: 0, fk: 'fact_muz_tango_argentina', url: 'https://ro.wikipedia.org/wiki/Tango', title: 'Tango — Wikipedia' },
  { cat: 'muzica', q: 'În ce oraș austriac are loc tradiționalul Concert de Anul Nou al Filarmonicii?', opts: ['Viena', 'Salzburg', 'Graz', 'Innsbruck'], ans: 0, fk: 'fact_muz_vienna_new_year', url: 'https://ro.wikipedia.org/wiki/Concertul_de_Anul_Nou_de_la_Viena', title: 'Concertul de Anul Nou de la Viena — Wikipedia' },
  { cat: 'muzica', q: 'Ce compozitor austriac a fost supranumit „Regele valsului”?', opts: ['Johann Strauss-fiul', 'Franz Schubert', 'Joseph Haydn', 'Gustav Mahler'], ans: 0, fk: 'fact_muz_strauss_blue_danube', url: 'https://ro.wikipedia.org/wiki/Johann_Strauss_(fiul)', title: 'Johann Strauss (fiul) — Wikipedia' },
  { cat: 'muzica', q: 'În ce oraș italian se află celebrul teatru de operă „La Scala”?', opts: ['Milano', 'Roma', 'Napoli', 'Verona'], ans: 0, fk: 'fact_muz_la_scala_milano', url: 'https://ro.wikipedia.org/wiki/Teatro_alla_Scala', title: 'Teatro alla Scala — Wikipedia' },
  { cat: 'muzica', q: 'Ce simbol muzical se așază la începutul portativului pentru notele viorii?', opts: ['Cheia Sol', 'Cheia Fa', 'Cheia Do', 'Bemolul'], ans: 0, fk: 'fact_muz_cheia_sol', url: 'https://ro.wikipedia.org/wiki/Cheie_(muzic%C4%83)', title: 'Cheie (muzică) — Wikipedia' },
  { cat: 'muzica', q: 'Ce termen italian din muzică indică interpretarea cu intensitate foarte scăzută?', opts: ['Piano', 'Forte', 'Allegro', 'Presto'], ans: 0, fk: 'fact_muz_term_piano', url: 'https://ro.wikipedia.org/wiki/Dinamic%C4%83_(muzic%C4%83)', title: 'Dinamică (muzică) — Wikipedia' },
  { cat: 'muzica', q: 'Ce baghetă prevăzută cu păr de cal se folosește pentru a cânta la vioară?', opts: ['Arcuș', 'Plectru', 'Ancie', 'Surdină'], ans: 0, fk: 'fact_muz_arcus_vioara', url: 'https://ro.wikipedia.org/wiki/Arcu%C8%99', title: 'Arcuș — Wikipedia' },
  { cat: 'muzica', q: 'Cine a compus muzica pe versurile imnului național „Deșteaptă-te, române!”?', opts: ['Anton Pann', 'Gavriil Musicescu', 'Eduard Caudella', 'D. G. Kiriac'], ans: 0, fk: 'fact_muz_anton_pann_imn', url: 'https://ro.wikipedia.org/wiki/De%C8%99teapt%C4%83-te,_rom%C3%A2ne!', title: 'Deșteaptă-te, române! — Wikipedia' },
  { cat: 'muzica', q: 'Cine a scris versurile imnului național al României, „Deșteaptă-te, române!”?', opts: ['Andrei Mureșanu', 'Vasile Alecsandri', 'George Coșbuc', 'Octavian Goga'], ans: 0, fk: 'fact_muz_andrei_muresanu_imn', url: 'https://ro.wikipedia.org/wiki/Andrei_Mure%C8%99anu', title: 'Andrei Mureșanu — Wikipedia' },
  { cat: 'muzica', q: 'Ce compozitor a scris muzica pentru „Hora Unirii” pe versurile lui Alecsandri?', opts: ['Alexandru Flechtenmacher', 'Ciprian Porumbescu', 'Eduard Caudella', 'Ion Ivanovici'], ans: 0, fk: 'fact_muz_hora_unirii_flechtenmacher', url: 'https://ro.wikipedia.org/wiki/Hora_Unirii', title: 'Hora Unirii — Wikipedia' },
  { cat: 'muzica', q: 'Ce compozitor român a creat celebrul vals „Valurile Dunării”?', opts: ['Iosif Ivanovici', 'Grigoraș Dinicu', 'George Stephănescu', 'Tiberiu Brediceanu'], ans: 0, fk: 'fact_muz_valurile_dunarii', url: 'https://ro.wikipedia.org/wiki/Iosif_Ivanovici', title: 'Iosif Ivanovici — Wikipedia' },
  { cat: 'muzica', q: 'Ce virtuoz violonist român a compus faimoasa piesă „Hora staccato”?', opts: ['Grigoraș Dinicu', 'Ion Voicu', 'Ștefan Ruha', 'Alexandru Tomescu'], ans: 0, fk: 'fact_muz_hora_staccato_dinicu', url: 'https://ro.wikipedia.org/wiki/Grigora%C8%99_Dinicu', title: 'Grigoraș Dinicu — Wikipedia' },

  // --- SPORT & JOCURI OLIMPICE ---
  { cat: 'sport', q: 'Ce țară deține recordul de trofee la Campionatul Mondial de Fotbal?', opts: ['Brazilia', 'Germania', 'Italia', 'Argentina'], ans: 0, fk: 'fact_sport_brazil_5_wc', url: 'https://ro.wikipedia.org/wiki/Echipa_na%C8%9Bional%C4%83_de_fotbal_a_Braziliei', title: 'Echipa națională de fotbal a Braziliei — Wikipedia' },
  { cat: 'sport', q: 'Ce club european deține recordul de trofee în Liga Campionilor UEFA?', opts: ['Real Madrid', 'AC Milan', 'Bayern München', 'FC Liverpool'], ans: 0, fk: 'fact_sport_real_madrid_ucl', url: 'https://ro.wikipedia.org/wiki/Real_Madrid_CF', title: 'Real Madrid CF — Wikipedia' },
  { cat: 'sport', q: 'Cum a fost supranumit marele fotbalist român Gheorghe Hagi în presa sportivă?', opts: ['Maradona din Carpați', 'Prințul din Trivale', 'Cobra', 'Magicianul'], ans: 0, fk: 'fact_sport_hagi_maradona_carpati', url: 'https://ro.wikipedia.org/wiki/Gheorghe_Hagi', title: 'Gheorghe Hagi — Wikipedia' },
  { cat: 'sport', q: 'În ce oraș din Argeș s-a format și a debutat marele fotbalist Nicolae Dobrin?', opts: ['Pitești', 'Craiova', 'Ploiești', 'Târgoviște'], ans: 0, fk: 'fact_sport_dobrin_pitesti', url: 'https://ro.wikipedia.org/wiki/Nicolae_Dobrin', title: 'Nicolae Dobrin — Wikipedia' },
  { cat: 'sport', q: 'Ce mare fotbalist român a fost liderul echipei „Craiova Maxima” în anii ’80?', opts: ['Ilie Balaci', 'Helmuth Duckadam', 'Marius Lăcătuș', 'Dan Petrescu'], ans: 0, fk: 'fact_sport_ilie_balaci_craiova', url: 'https://ro.wikipedia.org/wiki/Ilie_Balaci', title: 'Ilie Balaci — Wikipedia' },
  { cat: 'sport', q: 'Ce fotbalist român a câștigat Cupa Campionilor cu două cluburi diferite?', opts: ['Miodrag Belodedici', 'Cristian Chivu', 'Gheorghe Popescu', 'Adrian Mutu'], ans: 0, fk: 'fact_sport_belodedici_two_cups', url: 'https://ro.wikipedia.org/wiki/Miodrag_Belodedici', title: 'Miodrag Belodedici — Wikipedia' },
  { cat: 'sport', q: 'Pe ce tip de suprafață se joacă turneul de tenis de la Wimbledon?', opts: ['Iarbă', 'Zgură', 'Hard (ciment)', 'Carpetă'], ans: 0, fk: 'fact_sport_wimbledon_grass', url: 'https://ro.wikipedia.org/wiki/Turneul_de_tenis_de_la_Wimbledon', title: 'Turneul de tenis de la Wimbledon — Wikipedia' },
  { cat: 'sport', q: 'Ce tenismen spaniol a câștigat de 14 ori turneul de la Roland Garros?', opts: ['Rafael Nadal', 'Carlos Alcaraz', 'Roger Federer', 'Novak Djokovic'], ans: 0, fk: 'fact_sport_nadal_rg', url: 'https://ro.wikipedia.org/wiki/Rafael_Nadal', title: 'Rafael Nadal — Wikipedia' },
  { cat: 'sport', q: 'Ce înotător american deține recordul absolut de medalii olimpice de aur?', opts: ['Michael Phelps', 'Mark Spitz', 'Ian Thorpe', 'Ryan Lochte'], ans: 0, fk: 'fact_sport_phelps_23_gold', url: 'https://ro.wikipedia.org/wiki/Michael_Phelps', title: 'Michael Phelps — Wikipedia' },
  { cat: 'sport', q: 'Din ce țară caraibiană provine legendarul sprinter Usain Bolt?', opts: ['Jamaica', 'Cuba', 'Bahamas', 'Trinidad și Tobago'], ans: 0, fk: 'fact_sport_usain_bolt_jamaica', url: 'https://ro.wikipedia.org/wiki/Usain_Bolt', title: 'Usain Bolt — Wikipedia' },
  { cat: 'sport', q: 'La ce echipă din NBA a scris istorie legendarul baschetbalist Michael Jordan?', opts: ['Chicago Bulls', 'Los Angeles Lakers', 'Boston Celtics', 'Miami Heat'], ans: 0, fk: 'fact_sport_jordan_bulls', url: 'https://ro.wikipedia.org/wiki/Michael_Jordan', title: 'Michael Jordan — Wikipedia' },
  { cat: 'sport', q: 'Ce mare pugilist român a devenit campion mondial WBA la semiușoară în 2002?', opts: ['Leonard Doroftei', 'Lucian Bute', 'Francisc Vaștag', 'Mihai Leu'], ans: 0, fk: 'fact_sport_doroftei_box', url: 'https://ro.wikipedia.org/wiki/Leonard_Doroftei', title: 'Leonard Doroftei — Wikipedia' },
  { cat: 'sport', q: 'Ce pugilist a cucerit la Melbourne singurul aur olimpic la box al României?', opts: ['Nicolae Linca', 'Mircea Dobrescu', 'Ion Monea', 'Dorel Simion'], ans: 0, fk: 'fact_sport_nicolae_linca_box', url: 'https://ro.wikipedia.org/wiki/Nicolae_Linca', title: 'Nicolae Linca — Wikipedia' },
  { cat: 'sport', q: 'La ce aparat a primit Nadia Comăneci prima notă de 10 la Montreal?', opts: ['Paralele inegale', 'Bârnă', 'Sol', 'Sărituri'], ans: 0, fk: 'fact_sport_nadia_uneven_bars', url: 'https://ro.wikipedia.org/wiki/Nadia_Com%C4%83neci', title: 'Nadia Comăneci — Wikipedia' },
  { cat: 'sport', q: 'Ce gimnast român este cunoscut pentru exercițiile de excepție la cal cu mânere?', opts: ['Marius Urzică', 'Marian Drăgulescu', 'Dan Grecu', 'Ioan Suciu'], ans: 0, fk: 'fact_sport_marius_urzica_pommel', url: 'https://ro.wikipedia.org/wiki/Marius_Urzic%C4%83', title: 'Marius Urzică — Wikipedia' },
  { cat: 'sport', q: 'Ce gimnast român a devenit primul campion mondial la inele din istoria României?', opts: ['Dan Grecu', 'Kurt Szilier', 'Aurel Vernescu', 'Cristian Gațu'], ans: 0, fk: 'fact_sport_dan_grecu_rings', url: 'https://ro.wikipedia.org/wiki/Dan_Grecu', title: 'Dan Grecu — Wikipedia' },
  { cat: 'sport', q: 'Ce mare handbalist român a marcat 11 goluri în finala mondială din 1974?', opts: ['Ștefan Birtalan', 'Gheorghe Gruia', 'Cristian Gațu', 'Vasile Stângă'], ans: 0, fk: 'fact_sport_birtalan_handball', url: 'https://ro.wikipedia.org/wiki/%C8%98tefan_Birtalan', title: 'Ștefan Birtalan — Wikipedia' },
  { cat: 'sport', q: 'Ce scrimeră română a câștigat titlul olimpic la spadă individual și pe echipe?', opts: ['Ana Maria Popescu', 'Laura Badea', 'Mihai Covaliu', 'Reka Szabo'], ans: 0, fk: 'fact_sport_ana_maria_branza', url: 'https://ro.wikipedia.org/wiki/Ana_Maria_Popescu', title: 'Ana Maria Popescu — Wikipedia' },
  { cat: 'sport', q: 'Ce scrimeră română a cucerit aurul olimpic la floretă în 1996, la Atlanta?', opts: ['Laura Badea', 'Ecaterina Stahl', 'Olga Orban', 'Roxana Scarlat'], ans: 0, fk: 'fact_sport_laura_badea_atlanta', url: 'https://ro.wikipedia.org/wiki/Laura_Badea', title: 'Laura Badea — Wikipedia' },
  { cat: 'sport', q: 'Ce judoka română a câștigat aurul olimpic la Beijing în anul 2008?', opts: ['Alina Dumitru', 'Corina Căprioriu', 'Andreea Chițu', 'Simona Richter'], ans: 0, fk: 'fact_sport_alina_dumitru_judo', url: 'https://ro.wikipedia.org/wiki/Alina_Dumitru', title: 'Alina Dumitru — Wikipedia' },
  { cat: 'sport', q: 'Cum se numește celebra cursă anuală de ciclism pe etape desfășurată în Franța?', opts: ['Turul Franței', 'Giro d’Italia', 'Vuelta a España', 'Paris-Roubaix'], ans: 0, fk: 'fact_sport_tour_de_france', url: 'https://ro.wikipedia.org/wiki/Turul_Fran%C8%9Bei', title: 'Turul Franței — Wikipedia' },
  { cat: 'sport', q: 'Ce culoare are tricoul purtat de liderul clasamentului general în Turul Franței?', opts: ['Galben', 'Roz', 'Roșu', 'Verde'], ans: 0, fk: 'fact_sport_yellow_jersey_tdf', url: 'https://ro.wikipedia.org/wiki/Tricoul_galben', title: 'Tricoul galben — Wikipedia' },
  { cat: 'sport', q: 'În ce sport pe gheață se folosesc pietre de granit șlefuite și mături speciale?', opts: ['Curling', 'Hochei pe gheață', 'Bob', 'Sanie'], ans: 0, fk: 'fact_sport_curling_stones', url: 'https://ro.wikipedia.org/wiki/Curling', title: 'Curling — Wikipedia' },
  { cat: 'sport', q: 'Ce piesă de șah se deplasează în formă de „L” pe tablă?', opts: ['Calul', 'Nebunul', 'Turnul', 'Pionul'], ans: 0, fk: 'fact_sport_chess_knight_move', url: 'https://ro.wikipedia.org/wiki/Cal_(%C8%99ah)', title: 'Cal (șah) — Wikipedia' },
  { cat: 'sport', q: 'Care este cea mai puternică piesă de pe tabla de șah ca mobilitate?', opts: ['Dama (Regina)', 'Turnul (Tura)', 'Nebunul', 'Calul'], ans: 0, fk: 'fact_sport_chess_queen', url: 'https://ro.wikipedia.org/wiki/Dam%C4%83_(%C8%99ah)', title: 'Damă (șah) — Wikipedia' },

  // --- ANIMALE, PLANTE & BIOLOGIE ACCESIBILĂ ---
  { cat: 'biologie', q: 'Care este cel mai mare animal care a trăit vreodată pe planeta Pământ?', opts: ['Balena albastră', 'Elefantul african', 'Cașalotul', 'Rechinul-balenă'], ans: 0, fk: 'fact_bio_blue_whale_largest', url: 'https://ro.wikipedia.org/wiki/Balen%C4%83_albastr%C4%83', title: 'Balenă albastră — Wikipedia' },
  { cat: 'biologie', q: 'Care este cel mai rapid animal terestru pe distanțe scurte?', opts: ['Ghepardul', 'Leul', 'Antilopa', 'Struțul'], ans: 0, fk: 'fact_bio_cheetah_fastest', url: 'https://ro.wikipedia.org/wiki/Ghepard', title: 'Ghepard — Wikipedia' },
  { cat: 'biologie', q: 'Care este cea mai mare pasăre actuală de pe Pământ, care nu poate zbura?', opts: ['Struțul', 'Pinguinul imperial', 'Condorul', 'Albatrosul'], ans: 0, fk: 'fact_bio_ostrich_largest_bird', url: 'https://ro.wikipedia.org/wiki/Stru%C8%9B', title: 'Struț — Wikipedia' },
  { cat: 'biologie', q: 'Ce pasăre de talie foarte mică poate zbura pe loc și chiar înapoi?', opts: ['Pasărea colibri', 'Rândunica', 'Privighetoarea', 'Pițigoiul'], ans: 0, fk: 'fact_bio_hummingbird_hover', url: 'https://ro.wikipedia.org/wiki/Colibri', title: 'Colibri — Wikipedia' },
  { cat: 'biologie', q: 'Ce pasăre mare cu cioc cu pungă este simbolul Rezervației Delta Dunării?', opts: ['Pelicanul', 'Flamingo', 'Lebăda neagră', 'Cormoranul'], ans: 0, fk: 'fact_bio_pelican_delta', url: 'https://ro.wikipedia.org/wiki/Pelican_comun', title: 'Pelican comun — Wikipedia' },
  { cat: 'biologie', q: 'Ce mamifer erbivor de munte, ocrotit prin lege, este o emblemă a Carpaților?', opts: ['Capra neagră', 'Muflonul', 'Marmota', 'Elanul'], ans: 0, fk: 'fact_bio_capra_neagra_carpati', url: 'https://ro.wikipedia.org/wiki/Capr%C4%83_neagr%C4%83', title: 'Capră neagră — Wikipedia' },
  { cat: 'biologie', q: 'Ce mare mamifer erbivor european a fost reintrodus în rezervațiile din România?', opts: ['Zimbrul', 'Bizonul american', 'Bivolul african', 'Iacul'], ans: 0, fk: 'fact_bio_zimbru_romania', url: 'https://ro.wikipedia.org/wiki/Zimbru', title: 'Zimbru — Wikipedia' },
  { cat: 'biologie', q: 'Ce plantă rară de stâncă este ocrotită ca monument al naturii în Carpați?', opts: ['Floarea-de-colț', 'Ghiocelul', 'Păpădia', 'Măceșul'], ans: 0, fk: 'fact_bio_floarea_de_colt', url: 'https://ro.wikipedia.org/wiki/Floare_de_col%C8%9B', title: 'Floare de colț — Wikipedia' },
  { cat: 'biologie', q: 'Care sunt singurele mamifere capabile de zbor activ susținut?', opts: ['Liliecii', 'Veverițele', 'Aricii', 'Cârtițele'], ans: 0, fk: 'fact_bio_bats_flying_mammals', url: 'https://ro.wikipedia.org/wiki/Liliac', title: 'Liliac — Wikipedia' },
  { cat: 'biologie', q: 'Cu frunzele cărui arbore se hrănește aproape exclusiv marsupialul Koala?', opts: ['Eucaliptul', 'Stejarul', 'Bradul', 'Arțarul'], ans: 0, fk: 'fact_bio_koala_eucalyptus', url: 'https://ro.wikipedia.org/wiki/Koala', title: 'Koala — Wikipedia' },
  { cat: 'biologie', q: 'Cum se numește procesul prin care plantele verzi produc oxigen la lumină?', opts: ['Fotosinteză', 'Evaporare', 'Fermentație', 'Polenizare'], ans: 0, fk: 'fact_bio_photosynthesis', url: 'https://ro.wikipedia.org/wiki/Fotosintez%C4%83', title: 'Fotosinteză — Wikipedia' },
  { cat: 'biologie', q: 'Ce pigment oferă culoarea verde frunzelor plantelor?', opts: ['Clorofila', 'Carotenul', 'Melanina', 'Hemoglobina'], ans: 0, fk: 'fact_bio_chlorophyll_green', url: 'https://ro.wikipedia.org/wiki/Clorofil%C4%83', title: 'Clorofilă — Wikipedia' },
  { cat: 'biologie', q: 'Ce substanță nutritivă se sintetizează în piele sub acțiunea razelor solare?', opts: ['Vitamina D', 'Calciul', 'Fierul', 'Insulina'], ans: 0, fk: 'fact_bio_vitamin_d_sun', url: 'https://ro.wikipedia.org/wiki/Vitamina_D', title: 'Vitamina D — Wikipedia' },
  { cat: 'biologie', q: 'Care este cel mai mare organ intern solid din corpul uman?', opts: ['Ficatul', 'Splina', 'Pancreasul', 'Stomacul'], ans: 0, fk: 'fact_bio_liver_largest_internal', url: 'https://ro.wikipedia.org/wiki/Ficat', title: 'Ficat — Wikipedia' },
  { cat: 'biologie', q: 'Ce organ pereche din corpul uman are rolul de a filtra sângele?', opts: ['Rinichii', 'Plămânii', 'Glandele tiroide', 'Amigdalele'], ans: 0, fk: 'fact_bio_kidneys_filter', url: 'https://ro.wikipedia.org/wiki/Rinichi', title: 'Rinichi — Wikipedia' },
  { cat: 'biologie', q: 'Care este cel mai lung și mai puternic os din scheletul uman?', opts: ['Femurul', 'Tibia', 'Humerusul', 'Radiusul'], ans: 0, fk: 'fact_bio_femur_longest_bone', url: 'https://ro.wikipedia.org/wiki/Femur', title: 'Femur — Wikipedia' },
  { cat: 'biologie', q: 'Ce hormon secretat de pancreas reglează nivelul glicemiei în sânge?', opts: ['Insulina', 'Adrenalina', 'Melatonina', 'Tiroxina'], ans: 0, fk: 'fact_bio_insulin_pancreas', url: 'https://ro.wikipedia.org/wiki/Insulin%C4%83', title: 'Insulină — Wikipedia' },
  { cat: 'biologie', q: 'Cum se numește transformarea omizii în fluture?', opts: ['Metamorfoză', 'Hibernare', 'Fotosinteză', 'Simbioză'], ans: 0, fk: 'fact_bio_metamorphosis_butterfly', url: 'https://ro.wikipedia.org/wiki/Metamorfoz%C4%83_(biologie)', title: 'Metamorfoză (biologie) — Wikipedia' },
  { cat: 'biologie', q: 'În ce regiune polară trăiesc în sălbăticie pinguinii imperiali?', opts: ['Antarctica (Polul Sud)', 'Arctica (Polul Nord)', 'Groenlanda', 'Islanda'], ans: 0, fk: 'fact_bio_penguins_antarctica', url: 'https://ro.wikipedia.org/wiki/Pinguin_imperial', title: 'Pinguin imperial — Wikipedia' },
  { cat: 'biologie', q: 'În ce regiune polară trăiește ursul polar în mediul său natural?', opts: ['Arctica (Emisfera Nordică)', 'Antarctica', 'Patagonia', 'Tasmania'], ans: 0, fk: 'fact_bio_polar_bear_arctic', url: 'https://ro.wikipedia.org/wiki/Urs_polar', title: 'Urs polar — Wikipedia' },
  { cat: 'biologie', q: 'Ce organ de simț al omului conține retina, irisul și cristalinul?', opts: ['Ochiul', 'Urechea', 'Nasul', 'Limba'], ans: 0, fk: 'fact_bio_eye_retina_iris', url: 'https://ro.wikipedia.org/wiki/Ochi', title: 'Ochi — Wikipedia' },

  // --- FIZICĂ, CHIMIE & ASTRONOMIE DE CULTURĂ GENERALĂ ---
  { cat: 'fizica', q: 'Care este planeta din Sistemul Solar situată cel mai aproape de Soare?', opts: ['Mercur', 'Venus', 'Marte', 'Jupiter'], ans: 0, fk: 'fact_astro_mercury_closest', url: 'https://ro.wikipedia.org/wiki/Mercur_(planet%C4%83)', title: 'Mercur (planetă) — Wikipedia' },
  { cat: 'fizica', q: 'Ce planetă din Sistemul Solar este supranumită „Planeta Roșie”?', opts: ['Marte', 'Jupiter', 'Saturn', 'Uranus'], ans: 0, fk: 'fact_astro_mars_red_planet', url: 'https://ro.wikipedia.org/wiki/Marte_(planet%C4%83)', title: 'Marte (planetă) — Wikipedia' },
  { cat: 'fizica', q: 'Care este cea mai mare planetă din Sistemul nostru Solar?', opts: ['Jupiter', 'Saturn', 'Neptun', 'Pământ'], ans: 0, fk: 'fact_astro_jupiter_largest', url: 'https://ro.wikipedia.org/wiki/Jupiter', title: 'Jupiter — Wikipedia' },
  { cat: 'fizica', q: 'Ce planetă este celebră pentru sistemul său spectaculos și vizibil de inele?', opts: ['Saturn', 'Marte', 'Mercur', 'Venus'], ans: 0, fk: 'fact_astro_saturn_rings', url: 'https://ro.wikipedia.org/wiki/Saturn', title: 'Saturn — Wikipedia' },
  { cat: 'fizica', q: 'Cum se numește galaxia în formă de spirală din care face parte Sistemul Solar?', opts: ['Calea Lactee', 'Andromeda', 'Centaurus A', 'Sombrero'], ans: 0, fk: 'fact_astro_milky_way', url: 'https://ro.wikipedia.org/wiki/Calea_Lactee', title: 'Calea Lactee — Wikipedia' },
  { cat: 'fizica', q: 'Cum se numește satelitul natural al planetei Pământ?', opts: ['Luna', 'Titan', 'Europa', 'Phobos'], ans: 0, fk: 'fact_astro_earth_moon', url: 'https://ro.wikipedia.org/wiki/Luna', title: 'Luna — Wikipedia' },
  { cat: 'fizica', q: 'Ce instrument clasic cu ac magnetic este folosit pentru orientare după punctele cardinale?', opts: ['Busola', 'Termometrul', 'Cronometrul', 'Microscopul'], ans: 0, fk: 'fact_fiz_compass_magnetic', url: 'https://ro.wikipedia.org/wiki/Busol%C4%83', title: 'Busolă — Wikipedia' },
  { cat: 'fizica', q: 'Ce savant antic grec din Siracuza este asociat cu exclamarea „Evrika!”?', opts: ['Arhimede', 'Pitagora', 'Euclid', 'Hipocrate'], ans: 0, fk: 'fact_fiz_archimedes_eureka', url: 'https://ro.wikipedia.org/wiki/Arhimede', title: 'Arhimede — Wikipedia' },
  { cat: 'fizica', q: 'Ce astronom renascentist a perfecționat luneta astronomică și a observat sateliții lui Jupiter?', opts: ['Galileo Galilei', 'Johannes Kepler', 'Giordano Bruno', 'Tycho Brahe'], ans: 0, fk: 'fact_fiz_galileo_telescope', url: 'https://ro.wikipedia.org/wiki/Galileo_Galilei', title: 'Galileo Galilei — Wikipedia' },
  { cat: 'fizica', q: 'Ce savantă născută în Polonia a primit două Premii Nobel pentru studiul radioactivității?', opts: ['Marie Curie', 'Rosalind Franklin', 'Lise Meitner', 'Dorothy Hodgkin'], ans: 0, fk: 'fact_fiz_marie_curie_nobel', url: 'https://ro.wikipedia.org/wiki/Marie_Curie', title: 'Marie Curie — Wikipedia' },
  { cat: 'fizica', q: 'Cu ce aparat se măsoară temperatura aerului sau a unui corp?', opts: ['Termometrul', 'Barometrul', 'Vitezometrul', 'Ampermetrul'], ans: 0, fk: 'fact_fiz_thermometer', url: 'https://ro.wikipedia.org/wiki/Termometru', title: 'Termometru — Wikipedia' },
  { cat: 'fizica', q: 'Ce fenomen acustic puternic însoțește descărcarea electrică a fulgerului în timpul furtunii?', opts: ['Tunetul', 'Curcubeul', 'Mirajul', 'Bruma'], ans: 0, fk: 'fact_fiz_thunder_lightning', url: 'https://ro.wikipedia.org/wiki/Tunet', title: 'Tunet — Wikipedia' },
  { cat: 'fizica', q: 'Cum se numește instrumentul optic folosit la observarea corpurilor microscopice?', opts: ['Microscopul', 'Telescopul', 'Periscopul', 'Binoclul'], ans: 0, fk: 'fact_fiz_microscope_optic', url: 'https://ro.wikipedia.org/wiki/Microscop', title: 'Microscop — Wikipedia' },
  { cat: 'fizica', q: 'Cum se numește trecerea apei din stare lichidă în stare solidă (gheață)?', opts: ['Înghețare (solidificare)', 'Condensare', 'Sublimare', 'Fierbere'], ans: 0, fk: 'fact_fiz_freezing_water', url: 'https://ro.wikipedia.org/wiki/Solidificare', title: 'Solidificare — Wikipedia' },
  { cat: 'fizica', q: 'În ce unitate uzuală se măsoară frecvența undelor radio sau a sunetului?', opts: ['Hertz (Hz)', 'Watt (W)', 'Volt (V)', 'Newton (N)'], ans: 0, fk: 'fact_fiz_hertz_frequency', url: 'https://ro.wikipedia.org/wiki/Hertz', title: 'Hertz — Wikipedia' },
  { cat: 'fizica', q: 'În ce unitate se exprimă tensiunea electrică a prizelor casnice (ex. 230 V)?', opts: ['Volt', 'Ohm', 'Joule', 'Pascal'], ans: 0, fk: 'fact_fiz_volt_tension', url: 'https://ro.wikipedia.org/wiki/Volt', title: 'Volt — Wikipedia' },
  { cat: 'chimie', q: 'Care este formula chimică bine-cunoscută a apei?', opts: ['H2O', 'CO2', 'NaCl', 'O2'], ans: 0, fk: 'fact_chem_water_h2o', url: 'https://ro.wikipedia.org/wiki/Ap%C4%83', title: 'Apă — Wikipedia' },
  { cat: 'chimie', q: 'Ce gaz din atmosferă este cel mai abundent (aproximativ 78% din aerul uscat)?', opts: ['Azotul', 'Oxigenul', 'Hidrogenul', 'Heliul'], ans: 0, fk: 'fact_chem_nitrogen_air', url: 'https://ro.wikipedia.org/wiki/Atmosfera_P%C4%83m%C3%A2ntului', title: 'Atmosfera Pământului — Wikipedia' },
  { cat: 'chimie', q: 'Ce gaz este eliberat de oameni prin expirație și absorbit de plante?', opts: ['Dioxidul de carbon', 'Heliul', 'Neonul', 'Azotul lichid'], ans: 0, fk: 'fact_chem_co2_respiration', url: 'https://ro.wikipedia.org/wiki/Dioxid_de_carbon', title: 'Dioxid de carbon — Wikipedia' },
  { cat: 'chimie', q: 'Cum este cunoscută în viața de zi cu zi clorura de sodiu (NaCl)?', opts: ['Sarea de bucătărie', 'Zahărul', 'Oțetul', 'Varul stins'], ans: 0, fk: 'fact_chem_table_salt_nacl', url: 'https://ro.wikipedia.org/wiki/Clorur%C4%83_de_sodiu', title: 'Clorură de sodiu — Wikipedia' },
  { cat: 'chimie', q: 'Ce metal este lichid la temperatura camerei și a fost folosit în termometre?', opts: ['Mercurul', 'Fierul', 'Cuprul', 'Aluminiul'], ans: 0, fk: 'fact_chem_mercury_liquid', url: 'https://ro.wikipedia.org/wiki/Mercur_(element)', title: 'Mercur (element) — Wikipedia' },
  { cat: 'chimie', q: 'Din ce element chimic sunt alcătuite atât diamantul, cât și grafitul?', opts: ['Carbon', 'Siliciu', 'Calciu', 'Magneziu'], ans: 0, fk: 'fact_chem_diamond_graphite_carbon', url: 'https://ro.wikipedia.org/wiki/Diamant', title: 'Diamant — Wikipedia' },
  { cat: 'chimie', q: 'Ce aliaj metalic tradițional se obține prin combinarea cuprului cu staniul (cositorul)?', opts: ['Bronzul', 'Oțelul', 'Fonta', 'Duraluminiul'], ans: 0, fk: 'fact_chem_bronze_copper_tin', url: 'https://ro.wikipedia.org/wiki/Bronz', title: 'Bronz — Wikipedia' },
  { cat: 'chimie', q: 'Ce gaz ușor și neinflamabil se folosește pentru umplerea baloanelor care plutesc?', opts: ['Heliul', 'Oxigenul', 'Clorul', 'Argonul'], ans: 0, fk: 'fact_chem_helium_balloons', url: 'https://ro.wikipedia.org/wiki/Heliu', title: 'Heliu — Wikipedia' },
  { cat: 'chimie', q: 'Ce metal roșiatic este utilizat pe scară largă la fabricarea cablurilor electrice?', opts: ['Cuprul', 'Plumbul', 'Zincul', 'Titanul'], ans: 0, fk: 'fact_chem_copper_wires', url: 'https://ro.wikipedia.org/wiki/Cupru', title: 'Cupru — Wikipedia' },
  { cat: 'chimie', q: 'Cum se numește corodarea fierului în prezența apei și a aerului?', opts: ['Ruginire', 'Topire', 'Cristalizare', 'Distilare'], ans: 0, fk: 'fact_chem_rusting_iron', url: 'https://ro.wikipedia.org/wiki/Rugin%C4%83', title: 'Rugină — Wikipedia' },
  { cat: 'chimie', q: 'Ce acid organic slab dă gustul acru specific oțetului alimentar?', opts: ['Acidul acetic', 'Acidul citric', 'Acidul lactic', 'Acidul sulfuric'], ans: 0, fk: 'fact_chem_acetic_acid_vinegar', url: 'https://ro.wikipedia.org/wiki/O%C8%9Bet', title: 'Oțet — Wikipedia' },
  { cat: 'chimie', q: 'Ce metal ușor și inoxidabil este folosit la fabricarea foliilor alimentare și a dozelor?', opts: ['Aluminiul', 'Plumbul', 'Nichelul', 'Cromul'], ans: 0, fk: 'fact_chem_aluminum_foil', url: 'https://ro.wikipedia.org/wiki/Aluminiu', title: 'Aluminiu — Wikipedia' },

  // --- INVENȚII, TEHNOLOGIE & INFORMATICĂ UZUALĂ ---
  { cat: 'tehnologie', q: 'Ce meșter german din secolul al XV-lea a inventat tiparul european cu litere mobile?', opts: ['Johannes Gutenberg', 'James Watt', 'Louis Braille', 'Alfred Nobel'], ans: 0, fk: 'fact_tech_gutenberg_press', url: 'https://ro.wikipedia.org/wiki/Johannes_Gutenberg', title: 'Johannes Gutenberg — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce pionier român al aviației a construit în 1911 primul avion militar al României?', opts: ['Aurel Vlaicu', 'Elie Carafoli', 'Hermann Oberth', 'Radu Manicatide'], ans: 0, fk: 'fact_tech_aurel_vlaicu', url: 'https://ro.wikipedia.org/wiki/Aurel_Vlaicu', title: 'Aurel Vlaicu — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce mare inginer român a proiectat complexul de poduri dunărene de la Cernavodă?', opts: ['Anghel Saligny', 'Ion Ionescu', 'Elie Radu', 'Emil Prager'], ans: 0, fk: 'fact_tech_anghel_saligny_bridge', url: 'https://ro.wikipedia.org/wiki/Anghel_Saligny', title: 'Anghel Saligny — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce mare gerontolog român a creat tratamentul „Gerovital H3” și Institutul de Geriatrie?', opts: ['Ana Aslan', 'Victor Babeș', 'Ioan Cantacuzino', 'Carol Davila'], ans: 0, fk: 'fact_tech_ana_aslan_gerovital', url: 'https://ro.wikipedia.org/wiki/Ana_Aslan', title: 'Ana Aslan — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce medic și bacteriolog român a dat numele celebrului Institut de Seruri și Vaccinuri?', opts: ['Ioan Cantacuzino', 'Nicolae Minovici', 'Constantin Parhon', 'Gheorghe Marinescu'], ans: 0, fk: 'fact_tech_ioan_cantacuzino', url: 'https://ro.wikipedia.org/wiki/Ioan_Cantacuzino', title: 'Ioan Cantacuzino — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce fizician și inventator de origine sârbă a dezvoltat sistemul de curent alternativ?', opts: ['Nikola Tesla', 'Guglielmo Marconi', 'Samuel Morse', 'Michael Faraday'], ans: 0, fk: 'fact_tech_nikola_tesla_ac', url: 'https://ro.wikipedia.org/wiki/Nikola_Tesla', title: 'Nikola Tesla — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce chimist și industriaș suedez a inventat dinamita în anul 1867?', opts: ['Alfred Nobel', 'Anders Celsius', 'Carl Linnaeus', 'Jöns Berzelius'], ans: 0, fk: 'fact_tech_alfred_nobel_dynamite', url: 'https://ro.wikipedia.org/wiki/Alfred_Nobel', title: 'Alfred Nobel — Wikipedia' },
  { cat: 'tehnologie', q: 'Cine a realizat în 1903 primul zbor controlat cu un avion cu motor?', opts: ['Frații Wright', 'Frații Montgolfier', 'Frații Lumière', 'Frații Grimm'], ans: 0, fk: 'fact_tech_wright_brothers', url: 'https://ro.wikipedia.org/wiki/Fra%C8%9Bii_Wright', title: 'Frații Wright — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce inventator american a creat alfabetul din puncte și linii folosit în telegrafie?', opts: ['Samuel Morse', 'Robert Fulton', 'Eli Whitney', 'Henry Ford'], ans: 0, fk: 'fact_tech_samuel_morse_code', url: 'https://ro.wikipedia.org/wiki/Samuel_Morse', title: 'Samuel Morse — Wikipedia' },
  { cat: 'tehnologie', q: 'Cine a inventat alfabetul tactil cu puncte în relief pentru nevăzători?', opts: ['Louis Braille', 'Louis Pasteur', 'Blaise Pascal', 'Denis Papin'], ans: 0, fk: 'fact_tech_louis_braille', url: 'https://ro.wikipedia.org/wiki/Louis_Braille', title: 'Louis Braille — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce savant francez a descoperit vaccinul antirabic și procesul de pasteurizare?', opts: ['Louis Pasteur', 'Antoine Lavoisier', 'André-Marie Ampère', 'Pierre Curie'], ans: 0, fk: 'fact_tech_louis_pasteur', url: 'https://ro.wikipedia.org/wiki/Louis_Pasteur', title: 'Louis Pasteur — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce inginer scoțian a perfecționat motorul cu abur, declanșând Revoluția Industrială?', opts: ['James Watt', 'George Stephenson', 'Rudolf Diesel', 'Karl Benz'], ans: 0, fk: 'fact_tech_james_watt_steam', url: 'https://ro.wikipedia.org/wiki/James_Watt', title: 'James Watt — Wikipedia' },
  { cat: 'tehnologie', q: 'Ce industriaș american a introdus banda rulantă la asamblarea automobilului „Model T”?', opts: ['Henry Ford', 'Enzo Ferrari', 'Ferdinand Porsche', 'Louis Renault'], ans: 0, fk: 'fact_tech_henry_ford_model_t', url: 'https://ro.wikipedia.org/wiki/Henry_Ford', title: 'Henry Ford — Wikipedia' },
  { cat: 'tehnologie', q: 'Cum se numește șoseaua montană spectaculoasă care traversează Munții Făgăraș (DN7C)?', opts: ['Transfăgărășan', 'Transrarău', 'Transbucegi', 'Pasul Tihuța'], ans: 0, fk: 'fact_tech_transfagarasan_dn7c', url: 'https://ro.wikipedia.org/wiki/Transf%C4%83g%C4%83r%C4%83%C8%99an', title: 'Transfăgărășan — Wikipedia' },
  { cat: 'informatica', q: 'Ce înseamnă abrevierea „WWW” de la începutul adreselor paginilor de internet?', opts: ['World Wide Web', 'World Web Window', 'Wide Wireless Web', 'Web World Network'], ans: 0, fk: 'fact_it_www_meaning', url: 'https://ro.wikipedia.org/wiki/World_Wide_Web', title: 'World Wide Web — Wikipedia' },
  { cat: 'informatica', q: 'Care este componenta centrală a unui calculator, supranumită „creierul” acestuia?', opts: ['Procesorul (CPU)', 'Placa de sunet', 'Sursa de alimentare', 'Carcasa'], ans: 0, fk: 'fact_it_cpu_processor', url: 'https://ro.wikipedia.org/wiki/Unitate_central%C4%83_de_prelucrare', title: 'Unitate centrală de prelucrare — Wikipedia' },
  { cat: 'informatica', q: 'Ce combinație standard de taste este folosită pe computer pentru comanda „Copiază” (Copy)?', opts: ['Ctrl + C', 'Ctrl + V', 'Ctrl + Z', 'Alt + F4'], ans: 0, fk: 'fact_it_ctrl_c_copy', url: 'https://ro.wikipedia.org/wiki/Tast%C4%83_de_comand%C4%83_rapid%C4%83', title: 'Tastă de comandă rapidă — Wikipedia' },
  { cat: 'informatica', q: 'Ce combinație de taste este folosită pentru a lipi (Paste) un text copiat?', opts: ['Ctrl + V', 'Ctrl + X', 'Ctrl + P', 'Ctrl + S'], ans: 0, fk: 'fact_it_ctrl_v_paste', url: 'https://ro.wikipedia.org/wiki/Tast%C4%83_de_comand%C4%83_rapid%C4%83', title: 'Tastă de comandă rapidă — Wikipedia' },
  { cat: 'informatica', q: 'Ce componentă stochează temporar datele active și se golește la oprirea PC-ului?', opts: ['RAM-ul', 'Hard disk-ul', 'CD-ROM-ul', 'Stick-ul USB'], ans: 0, fk: 'fact_it_ram_memory', url: 'https://ro.wikipedia.org/wiki/Memorie_cu_acces_aleator', title: 'Memorie cu acces aleator — Wikipedia' },
  { cat: 'informatica', q: 'Ce simbol grafic este prezent obligatoriu în orice adresă de e-mail?', opts: ['@ (arond)', '# (diez)', '$ (dolar)', '& (ampersand)'], ans: 0, fk: 'fact_it_email_at_symbol', url: 'https://ro.wikipedia.org/wiki/Po%C8%99t%C4%83_electronic%C4%83', title: 'Poștă electronică — Wikipedia' },
  { cat: 'informatica', q: 'Cum se numește animalul-mascotă al sistemului de operare Linux?', opts: ['Pinguinul Tux', 'Vulpea roșie', 'Elefantul albastru', 'Balena'], ans: 0, fk: 'fact_it_linux_tux_penguin', url: 'https://ro.wikipedia.org/wiki/Tux', title: 'Tux — Wikipedia' },
  { cat: 'informatica', q: 'Ce matematician britanic a jucat un rol decisiv în decriptarea mașinii „Enigma”?', opts: ['Alan Turing', 'Charles Babbage', 'John von Neumann', 'George Boole'], ans: 0, fk: 'fact_it_alan_turing_enigma', url: 'https://ro.wikipedia.org/wiki/Alan_Turing', title: 'Alan Turing — Wikipedia' },
  { cat: 'informatica', q: 'Ce extensie de fișier este specifică documentelor portabile create de compania Adobe?', opts: ['.pdf', '.mp3', '.jpg', '.exe'], ans: 0, fk: 'fact_it_pdf_extension', url: 'https://ro.wikipedia.org/wiki/Portable_Document_Format', title: 'Portable Document Format — Wikipedia' },
  { cat: 'informatica', q: 'Ce tehnologie fără fir pe distanță scurtă poartă numele unui rege viking danez?', opts: ['Bluetooth', 'Ethernet', 'Infraroșu', 'Fibra optică'], ans: 0, fk: 'fact_it_bluetooth_viking', url: 'https://ro.wikipedia.org/wiki/Bluetooth', title: 'Bluetooth — Wikipedia' },

  // --- GEOGRAFIE ACCESIBILĂ (FĂRĂ SERII REPETITIVE) ---
  { cat: 'geografie', q: 'În ce mare se varsă fluviul Dunărea prin cele trei brațe ale sale?', opts: ['Marea Neagră', 'Marea Mediterană', 'Marea Baltică', 'Marea Nordului'], ans: 0, fk: 'fact_geo_danube_black_sea', url: 'https://ro.wikipedia.org/wiki/Dun%C4%83rea', title: 'Fluviul Dunărea — Wikipedia' },
  { cat: 'geografie', q: 'Din ce munți din Germania izvorăște fluviul Dunărea?', opts: ['Munții Pădurea Neagră', 'Munții Alpi', 'Munții Tatra', 'Munții Pirinei'], ans: 0, fk: 'fact_geo_danube_source_black_forest', url: 'https://ro.wikipedia.org/wiki/Dun%C4%83rea', title: 'Fluviul Dunărea — Wikipedia' },
  { cat: 'geografie', q: 'Care este cel mai mare și mai adânc ocean de pe planeta Pământ?', opts: ['Oceanul Pacific', 'Oceanul Atlantic', 'Oceanul Indian', 'Oceanul Arctic'], ans: 0, fk: 'fact_geo_pacific_largest_ocean', url: 'https://ro.wikipedia.org/wiki/Oceanul_Pacific', title: 'Oceanul Pacific — Wikipedia' },
  { cat: 'geografie', q: 'Care este cel mai mare deșert cald de pe suprafața Pământului?', opts: ['Deșertul Sahara', 'Deșertul Gobi', 'Deșertul Kalahari', 'Deșertul Atacama'], ans: 0, fk: 'fact_geo_sahara_desert', url: 'https://ro.wikipedia.org/wiki/Sahara', title: 'Deșertul Sahara — Wikipedia' },
  { cat: 'geografie', q: 'Ce fluviu din America de Sud are cel mai mare debit din lume?', opts: ['Amazonul', 'Nilul', 'Mississippi', 'Yangtze'], ans: 0, fk: 'fact_geo_amazon_river', url: 'https://ro.wikipedia.org/wiki/Fluviul_Amazon', title: 'Fluviul Amazon — Wikipedia' },
  { cat: 'geografie', q: 'Prin ce țară din nord-estul Africii curge fluviul Nil înainte de vărsarea în Mediterană?', opts: ['Egipt', 'Maroc', 'Nigeria', 'Africa de Sud'], ans: 0, fk: 'fact_geo_nile_egypt', url: 'https://ro.wikipedia.org/wiki/Nil', title: 'Nil — Wikipedia' },
  { cat: 'geografie', q: 'Cum se numește cel mai mare lac glaciar din România, situat în Munții Retezat?', opts: ['Lacul Bucura', 'Lacul Bâlea', 'Lacul Sfânta Ana', 'Lacul Vidraru'], ans: 0, fk: 'fact_geo_lacul_bucura', url: 'https://ro.wikipedia.org/wiki/Lacul_Bucura', title: 'Lacul Bucura — Wikipedia' },
  { cat: 'geografie', q: 'Cum se numește singurul lac de origine vulcanică din România?', opts: ['Lacul Sfânta Ana', 'Lacul Roșu', 'Lacul Razim', 'Lacul Techirghiol'], ans: 0, fk: 'fact_geo_lacul_sfanta_ana', url: 'https://ro.wikipedia.org/wiki/Lacul_Sf%C3%A2nta_Ana', title: 'Lacul Sfânta Ana — Wikipedia' },
  { cat: 'geografie', q: 'În ce masiv montan se află celebrele formațiuni stâncoase „Babele” și „Sfinxul”?', opts: ['Munții Bucegi', 'Munții Făgăraș', 'Munții Apuseni', 'Munții Ceahlău'], ans: 0, fk: 'fact_geo_babele_sfinxul_bucegi', url: 'https://ro.wikipedia.org/wiki/Sfinxul_din_Bucegi', title: 'Sfinxul din Bucegi — Wikipedia' },
  { cat: 'geografie', q: 'În ce munți din România se află celebra Peșteră cu ghețar de la Scărișoara?', opts: ['Munții Apuseni', 'Munții Rodnei', 'Munții Parâng', 'Munții Măcinului'], ans: 0, fk: 'fact_geo_scarisoara_apuseni', url: 'https://ro.wikipedia.org/wiki/Pe%C8%99tera_Sc%C4%83ri%C8%99oara', title: 'Peștera Scărișoara — Wikipedia' },
  { cat: 'geografie', q: 'Care sunt cei mai vechi munți din România, formați în orogeneza hercinică?', opts: ['Munții Măcinului', 'Munții Făgăraș', 'Munții Retezat', 'Munții Calimani'], ans: 0, fk: 'fact_geo_muntii_macinului_oldest', url: 'https://ro.wikipedia.org/wiki/Mun%C8%9Bii_M%C4%83cinului', title: 'Munții Măcinului — Wikipedia' },
  { cat: 'geografie', q: 'Ce râu formează granița de est a României cu Republica Moldova?', opts: ['Prutul', 'Siretul', 'Oltul', 'Mureșul'], ans: 0, fk: 'fact_geo_prut_border_moldova', url: 'https://ro.wikipedia.org/wiki/R%C3%A2ul_Prut', title: 'Râul Prut — Wikipedia' },
  { cat: 'geografie', q: 'Ce râu traversează capitala României, București?', opts: ['Dâmbovița', 'Prahova', 'Jiu', 'Someș'], ans: 0, fk: 'fact_geo_dambovita_bucuresti', url: 'https://ro.wikipedia.org/wiki/R%C3%A2ul_D%C3%A2mbovi%C8%9Ba', title: 'Râul Dâmbovița — Wikipedia' },
  { cat: 'geografie', q: 'În ce județ se află celebrul Castel Bran, situat lângă culoarul Rucăr-Bran?', opts: ['Brașov', 'Sibiu', 'Prahova', 'Argeș'], ans: 0, fk: 'fact_geo_castelul_bran', url: 'https://ro.wikipedia.org/wiki/Castelul_Bran', title: 'Castelul Bran — Wikipedia' },
  { cat: 'geografie', q: 'Al cărei familii nobiliare este faimosul castel gotic din municipiul Hunedoara?', opts: ['Corvinilor (Huniade)', 'Cantacuzino', 'Sturdza', 'Brukenthal'], ans: 0, fk: 'fact_geo_castelul_corvinilor', url: 'https://ro.wikipedia.org/wiki/Castelul_Corvinilor', title: 'Castelul Corvinilor — Wikipedia' },
  { cat: 'geografie', q: 'În ce localitate din Maramureș se află vestitul „Cimitir Vesel”?', opts: ['Săpânța', 'Borșa', 'Vișeu de Sus', 'Cavnic'], ans: 0, fk: 'fact_geo_cimitirul_vesel_sapanta', url: 'https://ro.wikipedia.org/wiki/Cimitirul_Vesel_din_S%C4%83p%C3%A2n%C8%9Ba', title: 'Cimitirul Vesel din Săpânța — Wikipedia' },
  { cat: 'geografie', q: 'Ce strâmtoare maritimă desparte sudul Spaniei de nordul Marocului?', opts: ['Gibraltar', 'Bosfor', 'Bering', 'Dardanele'], ans: 0, fk: 'fact_geo_gibraltar_strait', url: 'https://ro.wikipedia.org/wiki/Str%C3%A2mtoarea_Gibraltar', title: 'Strâmtoarea Gibraltar — Wikipedia' },
  { cat: 'geografie', q: 'Ce canal maritim artificial din Egipt leagă Marea Mediterană de Marea Roșie?', opts: ['Canalul Suez', 'Canalul Panama', 'Canalul Corint', 'Canalul Kiel'], ans: 0, fk: 'fact_geo_suez_canal', url: 'https://ro.wikipedia.org/wiki/Canalul_Suez', title: 'Canalul Suez — Wikipedia' },
  { cat: 'geografie', q: 'Care este cel mai mic stat independent din lume ca suprafață și populație?', opts: ['Vatican', 'Monaco', 'San Marino', 'Malta'], ans: 0, fk: 'fact_geo_vatican_smallest', url: 'https://ro.wikipedia.org/wiki/Vatican', title: 'Vatican — Wikipedia' },
  { cat: 'geografie', q: 'Care este țara supranumită „Țara Soarelui Răsare”?', opts: ['Japonia', 'Coreea de Sud', 'Thailanda', 'Filipine'], ans: 0, fk: 'fact_geo_japan_rising_sun', url: 'https://ro.wikipedia.org/wiki/Japonia', title: 'Japonia — Wikipedia' },
  { cat: 'geografie', q: 'Cum se numește vulcanul sacru care este cel mai înalt vârf din Japonia?', opts: ['Fuji', 'Etna', 'Vezuviu', 'Kilimanjaro'], ans: 0, fk: 'fact_geo_mount_fuji', url: 'https://ro.wikipedia.org/wiki/Muntele_Fuji', title: 'Muntele Fuji — Wikipedia' },
  { cat: 'geografie', q: 'Care este cel mai înalt masiv din Grecia, considerat în mitologie lăcașul zeilor?', opts: ['Olimp', 'Parnas', 'Athos', 'Pind'], ans: 0, fk: 'fact_geo_mount_olympus', url: 'https://ro.wikipedia.org/wiki/Muntele_Olimp', title: 'Muntele Olimp — Wikipedia' },

  // --- ISTORIE ACCESIBILĂ ---
  { cat: 'istorie', q: 'Care a fost capitala Regatului Dac în timpul regelui Decebal?', opts: ['Sarmizegetusa Regia', 'Tomis', 'Histria', 'Apulum'], ans: 0, fk: 'fact_hist_sarmizegetusa_regia', url: 'https://ro.wikipedia.org/wiki/Sarmizegetusa_Regia', title: 'Sarmizegetusa Regia — Wikipedia' },
  { cat: 'istorie', q: 'Ce rege dac a realizat în antichitate prima unificare a triburilor geto-dace?', opts: ['Burebista', 'Dromihete', 'Scorilo', 'Cotiso'], ans: 0, fk: 'fact_hist_burebista_dacia', url: 'https://ro.wikipedia.org/wiki/Burebista', title: 'Burebista — Wikipedia' },
  { cat: 'istorie', q: 'Ce arhitect antic a proiectat podul lui Traian peste Dunăre la Drobeta?', opts: ['Apolodor din Damasc', 'Vitruviu', 'Fidias', 'Imhotep'], ans: 0, fk: 'fact_hist_apolodor_damasc', url: 'https://ro.wikipedia.org/wiki/Apolodor_din_Damasc', title: 'Apolodor din Damasc — Wikipedia' },
  { cat: 'istorie', q: 'Cum se numește monumentul triumfal roman din județul Constanța ridicat de Traian?', opts: ['Tropaeum Traiani (Adamclisi)', 'Columna lui Traian', 'Arcul lui Constantin', 'Mausoleul de la Mărășești'], ans: 0, fk: 'fact_hist_adamclisi_tropaeum', url: 'https://ro.wikipedia.org/wiki/Tropaeum_Traiani', title: 'Tropaeum Traiani — Wikipedia' },
  { cat: 'istorie', q: 'Ce domnitor al Țării Românești a ctitorit Mănăstirea Cozia pe malul Oltului?', opts: ['Mircea cel Bătrân', 'Neagoe Basarab', 'Matei Basarab', 'Radu cel Mare'], ans: 0, fk: 'fact_hist_mircea_cozia', url: 'https://ro.wikipedia.org/wiki/M%C4%83n%C4%83stirea_Cozia', title: 'Mănăstirea Cozia — Wikipedia' },
  { cat: 'istorie', q: 'În ce mănăstire ctitorită de el este înmormântat domnitorul Ștefan cel Mare?', opts: ['Mănăstirea Putna', 'Mănăstirea Voroneț', 'Mănăstirea Neamț', 'Mănăstirea Sucevița'], ans: 0, fk: 'fact_hist_stefan_putna', url: 'https://ro.wikipedia.org/wiki/M%C4%83n%C4%83stirea_Putna', title: 'Mănăstirea Putna — Wikipedia' },
  { cat: 'istorie', q: 'Ce domnitor cărturar al Moldovei a scris lucrarea „Descriptio Moldaviae”?', opts: ['Dimitrie Cantemir', 'Vasile Lupu', 'Petru Rareș', 'Alexandru cel Bun'], ans: 0, fk: 'fact_hist_dimitrie_cantemir', url: 'https://ro.wikipedia.org/wiki/Dimitrie_Cantemir', title: 'Dimitrie Cantemir — Wikipedia' },
  { cat: 'istorie', q: 'Ce domnitor muntean a ridicat Palatul Mogoșoaia și Mănăstirea Hurezi?', opts: ['Constantin Brâncoveanu', 'Șerban Cantacuzino', 'Grigore Ghica', 'Nicolae Mavrocordat'], ans: 0, fk: 'fact_hist_constantin_brancoveanu', url: 'https://ro.wikipedia.org/wiki/Constantin_Br%C3%A2ncoveanu', title: 'Constantin Brâncoveanu — Wikipedia' },
  { cat: 'istorie', q: 'Cum a fost supranumit Avram Iancu, liderul românilor transilvăneni la 1848?', opts: ['Crăișorul Munților', 'Leul de la Șișești', 'Domnul Unirii', 'Eroul de la Călugăreni'], ans: 0, fk: 'fact_hist_avram_iancu_craisor', url: 'https://ro.wikipedia.org/wiki/Avram_Iancu', title: 'Avram Iancu — Wikipedia' },
  { cat: 'istorie', q: 'Ce suverană a României a fost supranumită „Mama răniților” în Primul Război Mondial?', opts: ['Regina Maria', 'Regina Elisabeta', 'Regina Elena', 'Principesa Ileana'], ans: 0, fk: 'fact_hist_regina_maria_mama_ranitilor', url: 'https://ro.wikipedia.org/wiki/Maria_a_Rom%C3%A2niei', title: 'Maria a României — Wikipedia' },
  { cat: 'istorie', q: 'Cu ce pseudonim literar a semnat Regina Elisabeta a României, soția lui Carol I?', opts: ['Carmen Sylva', 'Hortensia Papadat', 'Otilia Cazimir', 'Smaranda'], ans: 0, fk: 'fact_hist_carmen_sylva', url: 'https://ro.wikipedia.org/wiki/Elisabeta_a_Rom%C3%A2niei', title: 'Elisabeta a României — Wikipedia' },
  { cat: 'istorie', q: 'Ce tânără eroină a căzut în luptele de pe Jiu în Primul Război Mondial?', opts: ['Ecaterina Teodoroiu', 'Ana Ipătescu', 'Elena Cuza', 'Smaranda Brăescu'], ans: 0, fk: 'fact_hist_ecaterina_teodoroiu', url: 'https://ro.wikipedia.org/wiki/Ecaterina_Teodoroiu', title: 'Ecaterina Teodoroiu — Wikipedia' },
  { cat: 'istorie', q: 'Ce mare diplomat român a fost președinte al Adunării Societății Națiunilor la Geneva?', opts: ['Nicolae Titulescu', 'Take Ionescu', 'Iuliu Maniu', 'Ion Mihalache'], ans: 0, fk: 'fact_hist_nicolae_titulescu', url: 'https://ro.wikipedia.org/wiki/Nicolae_Titulescu', title: 'Nicolae Titulescu — Wikipedia' },
  { cat: 'istorie', q: 'Ce mare istoric român a scris monumentala sinteză „Istoria românilor” în zece volume?', opts: ['Nicolae Iorga', 'A. D. Xenopol', 'Vasile Pârvan', 'Constantin C. Giurescu'], ans: 0, fk: 'fact_hist_nicolae_iorga', url: 'https://ro.wikipedia.org/wiki/Nicolae_Iorga', title: 'Nicolae Iorga — Wikipedia' },
  { cat: 'istorie', q: 'În ce oraș din Vrancea se află Mausoleul Eroilor din Primul Război Mondial?', opts: ['Mărășești', 'Adjud', 'Odobești', 'Panciu'], ans: 0, fk: 'fact_hist_mausoleul_marasesti', url: 'https://ro.wikipedia.org/wiki/Mausoleul_de_la_M%C4%83r%C4%83%C8%99e%C8%99ti', title: 'Mausoleul de la Mărășești — Wikipedia' },
  { cat: 'istorie', q: 'Cum erau numiți conducătorii supremi ai Egiptului Antic, considerați fii ai zeilor?', opts: ['Faraoni', 'Cezari', 'Consuli', 'Arhonți'], ans: 0, fk: 'fact_hist_pharaohs_egypt', url: 'https://ro.wikipedia.org/wiki/Faraon', title: 'Faraon — Wikipedia' },
  { cat: 'istorie', q: 'Al cărui tânăr faraon egiptean este celebrul mormânt descoperit intact de Howard Carter?', opts: ['Tutankhamon', 'Ramses al II-lea', 'Keops', 'Akhenaton'], ans: 0, fk: 'fact_hist_tutankhamun_tomb', url: 'https://ro.wikipedia.org/wiki/Tutankhamon', title: 'Tutankhamon — Wikipedia' },
  { cat: 'istorie', q: 'Ce faimoasă regină a Egiptului antic a fost aliată cu Iulius Cezar?', opts: ['Cleopatra', 'Nefertiti', 'Hatșepsut', 'Zenobia'], ans: 0, fk: 'fact_hist_cleopatra_egypt', url: 'https://ro.wikipedia.org/wiki/Cleopatra', title: 'Cleopatra — Wikipedia' },
  { cat: 'istorie', q: 'Ce rege al Macedoniei antice a creat un imperiu întins până în India?', opts: ['Alexandru cel Mare', 'Filip al II-lea', 'Leonidas', 'Pericle'], ans: 0, fk: 'fact_hist_alexander_the_great', url: 'https://ro.wikipedia.org/wiki/Alexandru_cel_Mare', title: 'Alexandru cel Mare — Wikipedia' },
  { cat: 'istorie', q: 'Conform legendei, care sunt cei doi frați gemeni care au întemeiat cetatea Romei?', opts: ['Romulus și Remus', 'Castor și Pollux', 'Hector și Paris', 'Aeneas și Ascanius'], ans: 0, fk: 'fact_hist_romulus_remus', url: 'https://ro.wikipedia.org/wiki/Romulus_%C8%99i_Remus', title: 'Romulus și Remus — Wikipedia' },
  { cat: 'istorie', q: 'Ce general cartaginez a traversat Munții Alpi cu elefanți pentru a ataca Roma?', opts: ['Hannibal', 'Scipio Africanul', 'Spartacus', 'Pyrrhus'], ans: 0, fk: 'fact_hist_hannibal_elephants', url: 'https://ro.wikipedia.org/wiki/Hannibal', title: 'Hannibal — Wikipedia' },
  { cat: 'istorie', q: 'Ce eroină franceză supranumită „Fecioara din Orléans” a condus armata Franței?', opts: ['Ioana d’Arc', 'Maria Antoaneta', 'Ecaterina de Medici', 'Charlotte Corday'], ans: 0, fk: 'fact_hist_joan_of_arc', url: 'https://ro.wikipedia.org/wiki/Ioana_d%27Arc', title: 'Ioana d’Arc — Wikipedia' },
  { cat: 'istorie', q: 'Ce navigator portughez a condus prima expediție care a înconjurat Pământul pe mare?', opts: ['Fernando Magellan', 'Vasco da Gama', 'Marco Polo', 'James Cook'], ans: 0, fk: 'fact_hist_magellan_circumnavigation', url: 'https://ro.wikipedia.org/wiki/Fernando_Magellan', title: 'Fernando Magellan — Wikipedia' },
  { cat: 'istorie', q: 'Cine a fost primul președinte din istoria Statelor Unite ale Americii?', opts: ['George Washington', 'Abraham Lincoln', 'Thomas Jefferson', 'Benjamin Franklin'], ans: 0, fk: 'fact_hist_george_washington_first', url: 'https://ro.wikipedia.org/wiki/George_Washington', title: 'George Washington — Wikipedia' },
  { cat: 'istorie', q: 'Ce președinte american a abolit sclavia în SUA în timpul Războiului Civil?', opts: ['Abraham Lincoln', 'Theodore Roosevelt', 'Woodrow Wilson', 'John F. Kennedy'], ans: 0, fk: 'fact_hist_abraham_lincoln', url: 'https://ro.wikipedia.org/wiki/Abraham_Lincoln', title: 'Abraham Lincoln — Wikipedia' },

  // --- LITERATURĂ, BASME & MITOLOGIE ---
  { cat: 'literatura', q: 'Cum se numește băiatul din Humulești în opera „Amintiri din copilărie”?', opts: ['Nică', 'Harap-Alb', 'Păcală', 'Prâslea'], ans: 0, fk: 'fact_lit_nica_humulesti', url: 'https://ro.wikipedia.org/wiki/Amintiri_din_copil%C4%83rie', title: 'Amintiri din copilărie — Wikipedia' },
  { cat: 'literatura', q: 'Ce personaj negativ îl păcălește pe fiul craiului la fântână în „Povestea lui Harap-Alb”?', opts: ['Spânul', 'Zmeul', 'Căpcăunul', 'Muma Pădurii'], ans: 0, fk: 'fact_lit_harap_alb_spanul', url: 'https://ro.wikipedia.org/wiki/Povestea_lui_Harap-Alb', title: 'Povestea lui Harap-Alb — Wikipedia' },
  { cat: 'literatura', q: 'Cum se numește eroina care își caută soțul dispărut în romanul „Baltagul” de Sadoveanu?', opts: ['Vitoria Lipan', 'Mara', 'Otilia Mărculescu', 'Ana'], ans: 0, fk: 'fact_lit_vitoria_lipan', url: 'https://ro.wikipedia.org/wiki/Baltagul', title: 'Baltagul — Wikipedia' },
  { cat: 'literatura', q: 'Ce personaj din comedia „O scrisoare pierdută” rostește replica „Ai puțintică răbdare”?', opts: ['Zaharia Trahanache', 'Nae Cațavencu', 'Ghiță Pristanda', 'Agamemnon Dandanache'], ans: 0, fk: 'fact_lit_trahanache_rabdare', url: 'https://ro.wikipedia.org/wiki/O_scrisoare_pierdut%C4%83', title: 'O scrisoare pierdută — Wikipedia' },
  { cat: 'literatura', q: 'Ce scriitor român a cules basmul „Tinerețe fără bătrânețe și viață fără de moarte”?', opts: ['Petre Ispirescu', 'Ioan Slavici', 'Emil Gârleanu', 'Ion Agârbiceanu'], ans: 0, fk: 'fact_lit_petre_ispirescu', url: 'https://ro.wikipedia.org/wiki/Petre_Ispirescu', title: 'Petre Ispirescu — Wikipedia' },
  { cat: 'literatura', q: 'Ce scriitoare britanică a creat celebra serie de romane „Harry Potter”?', opts: ['J. K. Rowling', 'Agatha Christie', 'Jane Austen', 'Virginia Woolf'], ans: 0, fk: 'fact_lit_jk_rowling_hp', url: 'https://ro.wikipedia.org/wiki/J._K._Rowling', title: 'J. K. Rowling — Wikipedia' },
  { cat: 'literatura', q: 'Ce scriitor scoțian a creat personajul celebrului detectiv Sherlock Holmes?', opts: ['Arthur Conan Doyle', 'Ian Fleming', 'Charles Dickens', 'Oscar Wilde'], ans: 0, fk: 'fact_lit_conan_doyle_holmes', url: 'https://ro.wikipedia.org/wiki/Sherlock_Holmes', title: 'Sherlock Holmes — Wikipedia' },
  { cat: 'literatura', q: 'Cum se numește medicul și prietenul nedespărțit al detectivului Sherlock Holmes?', opts: ['Doctorul Watson', 'Hercule Poirot', 'Inspectorul Lestrade', 'Profesorul Moriarty'], ans: 0, fk: 'fact_lit_dr_watson_holmes', url: 'https://ro.wikipedia.org/wiki/Doctorul_Watson', title: 'Doctorul Watson — Wikipedia' },
  { cat: 'literatura', q: 'Ce celebră autoare de romane polițiste i-a creat pe Hercule Poirot și Miss Marple?', opts: ['Agatha Christie', 'Mary Shelley', 'Emily Brontë', 'George Eliot'], ans: 0, fk: 'fact_lit_agatha_christie_poirot', url: 'https://ro.wikipedia.org/wiki/Agatha_Christie', title: 'Agatha Christie — Wikipedia' },
  { cat: 'literatura', q: 'Ce scriitor francez a scris romanul „Ocolul Pământului în 80 de zile”?', opts: ['Jules Verne', 'Alexandre Dumas', 'Honoré de Balzac', 'Gustave Flaubert'], ans: 0, fk: 'fact_lit_jules_verne', url: 'https://ro.wikipedia.org/wiki/Jules_Verne', title: 'Jules Verne — Wikipedia' },
  { cat: 'literatura', q: 'Ce scriitor irlandez este autorul celebrului roman „Dracula”, inspirat de Transilvania?', opts: ['Bram Stoker', 'James Joyce', 'Jonathan Swift', 'Samuel Beckett'], ans: 0, fk: 'fact_lit_bram_stoker_dracula', url: 'https://ro.wikipedia.org/wiki/Bram_Stoker', title: 'Bram Stoker — Wikipedia' },
  { cat: 'literatura', q: 'Ce povestitor danez a scris basmele „Mica sirenă”, „Rățușca cea urâtă” și „Crăiasa zăpezii”?', opts: ['Hans Christian Andersen', 'Carlo Collodi', 'Charles Perrault', 'Jean de La Fontaine'], ans: 0, fk: 'fact_lit_hc_andersen', url: 'https://ro.wikipedia.org/wiki/Hans_Christian_Andersen', title: 'Hans Christian Andersen — Wikipedia' },
  { cat: 'literatura', q: 'Ce păpușă de lemn creată de Geppetto are nasul care crește când minte?', opts: ['Pinocchio', 'Gulliver', 'Peter Pan', 'Aladdin'], ans: 0, fk: 'fact_lit_pinocchio_geppetto', url: 'https://ro.wikipedia.org/wiki/Pinocchio', title: 'Pinocchio — Wikipedia' },
  { cat: 'literatura', q: 'În ce oraș italian se petrece tragedia „Romeo și Julieta” de William Shakespeare?', opts: ['Verona', 'Veneția', 'Florența', 'Napoli'], ans: 0, fk: 'fact_lit_romeo_juliet_verona', url: 'https://ro.wikipedia.org/wiki/Romeo_%C8%99i_Julieta', title: 'Romeo și Julieta — Wikipedia' },
  { cat: 'literatura', q: 'Cum se numește scutierul credincios al cavalerului rătăcitor Don Quijote?', opts: ['Sancho Panza', 'Rocinante', 'Dulcineea', 'D’Artagnan'], ans: 0, fk: 'fact_lit_sancho_panza', url: 'https://ro.wikipedia.org/wiki/Sancho_Panza', title: 'Sancho Panza — Wikipedia' },
  { cat: 'literatura', q: 'Ce vicleană schemă au folosit grecii antici pentru a pătrunde în cetatea Troia?', opts: ['Calul troian din lemn', 'Un tunel pe sub mare', 'Corăbii zburătoare', 'Scuturi invizibile'], ans: 0, fk: 'fact_lit_trojan_horse', url: 'https://ro.wikipedia.org/wiki/Calul_troian', title: 'Calul troian — Wikipedia' },

  // --- ARTĂ, MONUMENTE & ARHITECTURĂ ---
  { cat: 'arta', q: 'Cine a pictat celebrul portret renascentist „Mona Lisa” (Gioconda)?', opts: ['Leonardo da Vinci', 'Rafael Sanzio', 'Tiziano', 'Sandro Botticelli'], ans: 0, fk: 'fact_art_mona_lisa_davinci', url: 'https://ro.wikipedia.org/wiki/Gioconda', title: 'Gioconda — Wikipedia' },
  { cat: 'arta', q: 'În ce mare muzeu din Paris este expus tabloul „Mona Lisa” (Gioconda)?', opts: ['Muzeul Luvru', 'Muzeul Prado', 'Galeria Uffizi', 'British Museum'], ans: 0, fk: 'fact_art_louvre_paris', url: 'https://ro.wikipedia.org/wiki/Muzeul_Luvru', title: 'Muzeul Luvru — Wikipedia' },
  { cat: 'arta', q: 'Ce mare pictor român este renumit pentru tablourile „Car cu boi” și „Țărăncuță”?', opts: ['Nicolae Grigorescu', 'Ion Andreescu', 'Theodor Aman', 'Nicolae Tonitza'], ans: 0, fk: 'fact_art_grigorescu_car_cu_boi', url: 'https://ro.wikipedia.org/wiki/Nicolae_Grigorescu', title: 'Nicolae Grigorescu — Wikipedia' },
  { cat: 'arta', q: 'Ce sculptură celebră a lui Constantin Brâncuși reprezintă o pasăre stilizată în zbor?', opts: ['Măiastra', 'Sărutul', 'Rugăciunea', 'Cumințenia Pământului'], ans: 0, fk: 'fact_art_brancusi_maiastra', url: 'https://ro.wikipedia.org/wiki/M%C4%83iastra_(Br%C3%A2ncu%C8%99i)', title: 'Măiastra (Brâncuși) — Wikipedia' },
  { cat: 'arta', q: 'În ce sat din județul Gorj s-a născut marele sculptor Constantin Brâncuși?', opts: ['Hobița', 'Tismana', 'Polovragi', 'Novaci'], ans: 0, fk: 'fact_art_brancusi_hobita', url: 'https://ro.wikipedia.org/wiki/Constantin_Br%C3%A2ncu%C8%99i', title: 'Constantin Brâncuși — Wikipedia' },
  { cat: 'arta', q: 'Ce mănăstire din Bucovina este celebră în lume pentru nuanța ei de albastru?', opts: ['Mănăstirea Voroneț', 'Mănăstirea Humor', 'Mănăstirea Moldovița', 'Mănăstirea Arbore'], ans: 0, fk: 'fact_art_albastru_de_voronet', url: 'https://ro.wikipedia.org/wiki/M%C4%83n%C4%83stirea_Vorone%C8%9B', title: 'Mănăstirea Voroneț — Wikipedia' },
  { cat: 'arta', q: 'Ce amfiteatru antic uriaș este cel mai cunoscut simbol arhitectural al orașului Roma?', opts: ['Colosseumul', 'Parthenonul', 'Alhambra', 'Sagrada Família'], ans: 0, fk: 'fact_art_colosseum_rome', url: 'https://ro.wikipedia.org/wiki/Colosseum', title: 'Colosseum — Wikipedia' },
  { cat: 'arta', q: 'În ce oraș din Spania se află celebra catedrală neterminată „Sagrada Família”?', opts: ['Barcelona', 'Madrid', 'Sevilla', 'Valencia'], ans: 0, fk: 'fact_art_sagrada_familia_barcelona', url: 'https://ro.wikipedia.org/wiki/Sagrada_Fam%C3%ADlia', title: 'Sagrada Família — Wikipedia' },
  { cat: 'arta', q: 'Ce arhitect catalan a proiectat catedrala „Sagrada Família” și Parcul Güell din Barcelona?', opts: ['Antoni Gaudí', 'Santiago Calatrava', 'Le Corbusier', 'Gustave Eiffel'], ans: 0, fk: 'fact_art_antoni_gaudi', url: 'https://ro.wikipedia.org/wiki/Antoni_Gaud%C3%AD', title: 'Antoni Gaudí — Wikipedia' },
  { cat: 'arta', q: 'În ce oraș italian se află celebrul Turn Înclinat?', opts: ['Pisa', 'Bologna', 'Siena', 'Padova'], ans: 0, fk: 'fact_art_leaning_tower_pisa', url: 'https://ro.wikipedia.org/wiki/Turnul_%C3%AEnclinat_din_Pisa', title: 'Turnul înclinat din Pisa — Wikipedia' },
  { cat: 'arta', q: 'În ce țară asiatică se află mausoleul din marmură albă „Taj Mahal”?', opts: ['India', 'Iran', 'Thailanda', 'Indonezia'], ans: 0, fk: 'fact_art_taj_mahal_india', url: 'https://ro.wikipedia.org/wiki/Taj_Mahal', title: 'Taj Mahal — Wikipedia' },
  { cat: 'arta', q: 'Ce statuetă neolitică din teracotă descoperită la Cernavodă înfățișează un bărbat pe gânduri?', opts: ['Gânditorul', 'Hora de la Frumușica', 'Coiful de aur', 'Columna'], ans: 0, fk: 'fact_art_ganditorul_hamangia', url: 'https://ro.wikipedia.org/wiki/G%C3%A2nditorul_de_la_Hamangia', title: 'Gânditorul de la Hamangia — Wikipedia' },
  { cat: 'arta', q: 'Cum este supranumit tezaurul gotic din aur descoperit la Pietroasele, în Buzău?', opts: ['Cloșca cu puii de aur', 'Coiful de la Coțofenești', 'Brățările dacice', 'Tezaurul de la Hinova'], ans: 0, fk: 'fact_art_closca_cu_puii_de_aur', url: 'https://ro.wikipedia.org/wiki/Tezaurul_de_la_Pietroasele', title: 'Tezaurul de la Pietroasele — Wikipedia' },
  { cat: 'arta', q: 'În ce oraș din România se află celebrul „Palat al Culturii” în stil neogotic?', opts: ['Iași', 'Craiova', 'Galați', 'Constanța'], ans: 0, fk: 'fact_art_palatul_culturii_iasi', url: 'https://ro.wikipedia.org/wiki/Palatul_Culturii_din_Ia%C8%99i', title: 'Palatul Culturii din Iași — Wikipedia' },
  { cat: 'arta', q: 'Ce clădire istorică în stil Art Nouveau este simbolul falezei din Constanța?', opts: ['Cazinoul', 'Castelul Peleș', 'Palatul Mogoșoaia', 'Turnul Chindiei'], ans: 0, fk: 'fact_art_cazinoul_constanta', url: 'https://ro.wikipedia.org/wiki/Cazinoul_din_Constan%C8%9Ba', title: 'Cazinoul din Constanța — Wikipedia' },

  // --- CULTURĂ GENERALĂ, MITOLOGIE, TRADIȚII & VIAȚĂ COTIDIANĂ ---
  { cat: 'cultura_generala', q: 'Care sunt cele trei culori ale drapelului național al României, de la lance?', opts: ['Albastru, galben, roșu', 'Roșu, galben, albastru', 'Albastru, alb, roșu', 'Verde, galben, roșu'], ans: 0, fk: 'fact_cg_tricolor_romania', url: 'https://ro.wikipedia.org/wiki/Drapelul_Rom%C3%A2niei', title: 'Drapelul României — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce dată este sărbătorită Ziua Națională a României?', opts: ['1 Decembrie', '24 Ianuarie', '9 Mai', '15 Ianuarie'], ans: 0, fk: 'fact_cg_ziua_nationala_1_dec', url: 'https://ro.wikipedia.org/wiki/Ziua_Na%C8%9Bional%C4%83_a_Rom%C3%A2niei', title: 'Ziua Națională a României — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce tradiție românească cu șnur alb-roșu se sărbătorește în fiecare an la 1 Martie?', opts: ['Mărțișorul', 'Sânzienele', 'Dragobetele', 'Ignatul'], ans: 0, fk: 'fact_cg_martisor_1_martie', url: 'https://ro.wikipedia.org/wiki/M%C4%83r%C8%9Bi%C8%99or', title: 'Mărțișor — Wikipedia' },
  { cat: 'cultura_generala', q: 'Cum se numește sărbătoarea tradițională a iubirii la români, celebrată pe 24 februarie?', opts: ['Dragobetele', 'Rusalii', 'Floriile', 'Ajunul'], ans: 0, fk: 'fact_cg_dragobete_24_feb', url: 'https://ro.wikipedia.org/wiki/Dragobete', title: 'Dragobete — Wikipedia' },
  { cat: 'cultura_generala', q: 'Cum se numește bluza tradițională românească brodată, inclusă în patrimoniul UNESCO?', opts: ['Ia românească', 'Marama', 'Cojocul', 'Opinca'], ans: 0, fk: 'fact_cg_ia_romaneasca_unesco', url: 'https://ro.wikipedia.org/wiki/Ie_(vestimenta%C8%9Bie)', title: 'Ie (vestimentație) — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce dans ritualic românesc bărbătesc de Rusalii este inclus în patrimoniul UNESCO?', opts: ['Călușul', 'Perinița', 'Ciuleandra', 'Alunelul'], ans: 0, fk: 'fact_cg_calusul_unesco', url: 'https://ro.wikipedia.org/wiki/C%C4%83lu%C8%99arii', title: 'Călușarii — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce localitate din județul Vâlcea se produce faimoasa ceramică tradițională UNESCO?', opts: ['Horezu', 'Marginea', 'Corund', 'Baia Mare'], ans: 0, fk: 'fact_cg_ceramica_horezu', url: 'https://ro.wikipedia.org/wiki/Ceramica_de_Horezu', title: 'Ceramica de Horezu — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce localitate din județul Suceava se realizează celebra ceramică neagră?', opts: ['Marginea', 'Rădăuți', 'Vama', 'Gura Humorului'], ans: 0, fk: 'fact_cg_ceramica_neagra_marginea', url: 'https://ro.wikipedia.org/wiki/Ceramic%C4%83_neagr%C4%83_de_Marginea', title: 'Ceramică neagră de Marginea — Wikipedia' },
  { cat: 'cultura_generala', q: 'Din ce cereală măcinată se prepară tradiționala mămăligă românească?', opts: ['Porumb (mălai)', 'Grâu', 'Secară', 'Orz'], ans: 0, fk: 'fact_cg_mamaliga_porumb', url: 'https://ro.wikipedia.org/wiki/M%C4%83m%C4%83lig%C4%83', title: 'Mămăligă — Wikipedia' },
  { cat: 'cultura_generala', q: 'Din ce țară își au originea preparatele culinare pizza și pastele?', opts: ['Italia', 'Franța', 'Spania', 'Grecia'], ans: 0, fk: 'fact_cg_pizza_italy', url: 'https://ro.wikipedia.org/wiki/Pizza', title: 'Pizza — Wikipedia' },
  { cat: 'cultura_generala', q: 'Din ce țară asiatică provine preparatul tradițional „sushi”?', opts: ['Japonia', 'China', 'India', 'Vietnam'], ans: 0, fk: 'fact_cg_sushi_japan', url: 'https://ro.wikipedia.org/wiki/Sushi', title: 'Sushi — Wikipedia' },
  { cat: 'cultura_generala', q: 'Cine era zeul suprem al cerului și al fulgerului în mitologia greacă?', opts: ['Zeus', 'Poseidon', 'Hades', 'Apollo'], ans: 0, fk: 'fact_cg_zeus_greek_myth', url: 'https://ro.wikipedia.org/wiki/Zeus', title: 'Zeus — Wikipedia' },
  { cat: 'cultura_generala', q: 'Cine era zeul mărilor și al oceanelor în mitologia greacă, purtător al tridentului?', opts: ['Poseidon', 'Ares', 'Hermes', 'Hefaistos'], ans: 0, fk: 'fact_cg_poseidon_sea_god', url: 'https://ro.wikipedia.org/wiki/Poseidon', title: 'Poseidon — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce zeiță greacă a înțelepciunii a dat numele capitalei Greciei?', opts: ['Atena', 'Afrodita', 'Hera', 'Artemis'], ans: 0, fk: 'fact_cg_athena_wisdom', url: 'https://ro.wikipedia.org/wiki/Atena_(mitologie)', title: 'Atena (mitologie) — Wikipedia' },
  { cat: 'cultura_generala', q: 'Cine era zeul suprem al dacilor în antichitate?', opts: ['Zamolxis', 'Jupiter', 'Ra', 'Odin'], ans: 0, fk: 'fact_cg_zamolxis_dacians', url: 'https://ro.wikipedia.org/wiki/Zamolxis', title: 'Zamolxis — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce pasăre legendară din mitologie renăștea din propria-i cenușă?', opts: ['Pasărea Phoenix', 'Grifonul', 'Pegas', 'Sfinxul'], ans: 0, fk: 'fact_cg_phoenix_ash', url: 'https://ro.wikipedia.org/wiki/Pas%C4%83rea_Phoenix', title: 'Pasărea Phoenix — Wikipedia' },
  { cat: 'cultura_generala', q: 'Cum se numea calul înaripat din mitologia greacă?', opts: ['Pegas', 'Centaurul', 'Minotaurul', 'Cerberul'], ans: 0, fk: 'fact_cg_pegasus_winged_horse', url: 'https://ro.wikipedia.org/wiki/Pegas_(mitologie)', title: 'Pegas (mitologie) — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce culoare se obține prin amestecarea culorilor galben și albastru în pictură?', opts: ['Verde', 'Violet', 'Portocaliu', 'Roz'], ans: 0, fk: 'fact_cg_mix_yellow_blue_green', url: 'https://ro.wikipedia.org/wiki/Verde', title: 'Verde — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce direcție cardinală răsare Soarele în fiecare dimineață?', opts: ['Est (Răsărit)', 'Vest (Apus)', 'Nord (Miazănoapte)', 'Sud (Miazăzi)'], ans: 0, fk: 'fact_cg_sun_rises_east', url: 'https://ro.wikipedia.org/wiki/Est', title: 'Est — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce piatră prețioasă de culoare verde intens este extrem de apreciată în bijuterie?', opts: ['Smaraldul', 'Rubinul', 'Safirul', 'Ametistul'], ans: 0, fk: 'fact_cg_emerald_green_gem', url: 'https://ro.wikipedia.org/wiki/Smarald', title: 'Smarald — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce piatră prețioasă de culoare roșu intens este foarte valoroasă în bijuterie?', opts: ['Rubinul', 'Safirul', 'Topazul', 'Perla'], ans: 0, fk: 'fact_cg_ruby_red_gem', url: 'https://ro.wikipedia.org/wiki/Rubin', title: 'Rubin — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce băutură caldă foarte populară se prepară din boabe prăjite și măcinate?', opts: ['Cafeaua', 'Ceaiul verde', 'Cidrul', 'Mustul'], ans: 0, fk: 'fact_cg_coffee_beans', url: 'https://ro.wikipedia.org/wiki/Cafea', title: 'Cafea — Wikipedia' },
  { cat: 'cultura_generala', q: 'Din boabele cărui arbore tropical se fabrică ciocolata?', opts: ['Arborele de cacao', 'Arborele de cafea', 'Cocotierul', 'Vanilia'], ans: 0, fk: 'fact_cg_chocolate_cocoa', url: 'https://ro.wikipedia.org/wiki/Ciocolat%C4%83', title: 'Ciocolată — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce fibră textilă prețioasă este produsă de coconul viermelui Bombix mori?', opts: ['Mătasea', 'Bumbacul', 'Inul', 'Cânepa'], ans: 0, fk: 'fact_cg_silkworm_silk', url: 'https://ro.wikipedia.org/wiki/Vierme_de_m%C4%83tase', title: 'Vierme de mătase — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce joc tradițional de societate folosește două zaruri și 30 de puluri?', opts: ['Table (Backgammon)', 'Domino', 'Go', 'Remi'], ans: 0, fk: 'fact_cg_backgammon_table', url: 'https://ro.wikipedia.org/wiki/Table_(joc)', title: 'Table (joc) — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce anotimp are loc solstițiul cu cea mai lungă zi din an?', opts: ['Vara (în iunie)', 'Iarna (în decembrie)', 'Primăvara', 'Toamna'], ans: 0, fk: 'fact_cg_summer_solstice', url: 'https://ro.wikipedia.org/wiki/Solsti%C8%9Biu', title: 'Solstițiu — Wikipedia' },
  { cat: 'cultura_generala', q: 'Cum se numește fenomenul astronomic în care Luna acoperă temporar discul Soarelui?', opts: ['Eclipsă de Soare', 'Eclipsă de Lună', 'Solstițiu', 'Echinocțiu'], ans: 0, fk: 'fact_cg_solar_eclipse', url: 'https://ro.wikipedia.org/wiki/Eclips%C4%83_de_Soare', title: 'Eclipsă de Soare — Wikipedia' },
  { cat: 'cultura_generala', q: 'Ce arbore cu flori parfumate l-a inspirat pe Mihai Eminescu la Iași?', opts: ['Teiul', 'Stejarul', 'Mesteacănul', 'Salcia'], ans: 0, fk: 'fact_cg_teiul_eminescu', url: 'https://ro.wikipedia.org/wiki/Teiul_lui_Eminescu', title: 'Teiul lui Eminescu — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce parc din Iași se află celebrul Tei al lui Mihai Eminescu?', opts: ['Parcul Copou', 'Parcul Cișmigiu', 'Parcul Herăstrău', 'Parcul Romanescu'], ans: 0, fk: 'fact_cg_parcul_copou_iasi', url: 'https://ro.wikipedia.org/wiki/Gr%C4%83dina_Copou', title: 'Grădina Copou — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce oraș din Oltenia se află celebrul Parc Nicolae Romanescu?', opts: ['Craiova', 'Târgu Jiu', 'Slatina', 'Râmnicu Vâlcea'], ans: 0, fk: 'fact_cg_parcul_romanescu_craiova', url: 'https://ro.wikipedia.org/wiki/Parcul_Nicolae_Romanescu_din_Craiova', title: 'Parcul Nicolae Romanescu — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce oraș din România se află celebra „Biserica Neagră” în stil gotic?', opts: ['Brașov', 'Sibiu', 'Cluj-Napoca', 'Alba Iulia'], ans: 0, fk: 'fact_cg_biserica_neagra_brasov', url: 'https://ro.wikipedia.org/wiki/Biserica_Neagr%C4%83', title: 'Biserica Neagră — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce cetate medievală din Transilvania se află celebrul Turn cu Ceas?', opts: ['Sighișoara', 'Făgăraș', 'Rupea', 'Râșnov'], ans: 0, fk: 'fact_cg_turnul_cu_ceas_sighisoara', url: 'https://ro.wikipedia.org/wiki/Turnul_cu_Ceas_din_Sighi%C8%99oara', title: 'Turnul cu Ceas din Sighișoara — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce veche capitală a Țării Românești se află istoricul Turn al Chindiei?', opts: ['Târgoviște', 'Curtea de Argeș', 'Câmpulung', 'Buzău'], ans: 0, fk: 'fact_cg_turnul_chindiei_targoviste', url: 'https://ro.wikipedia.org/wiki/Turnul_Chindiei', title: 'Turnul Chindiei — Wikipedia' },
  { cat: 'cultura_generala', q: 'În ce munți se află salba de cetăți dacice incluse în Patrimoniul UNESCO?', opts: ['Munții Orăștiei', 'Munții Măcinului', 'Munții Harghita', 'Munții Gutâi'], ans: 0, fk: 'fact_cg_cetatile_dacice_orastie', url: 'https://ro.wikipedia.org/wiki/Cet%C4%83%C8%9Bi_dacice_din_Mun%C8%9Bii_Or%C4%83%C8%99tiei', title: 'Cetăți dacice din Munții Orăștiei — Wikipedia' },
  { cat: 'cultura_generala', q: 'Care este cea mai veche colonie grecească antică de pe țărmul dobrogean?', opts: ['Histria', 'Potaissa', 'Apulum', 'Napoca'], ans: 0, fk: 'fact_cg_cetatea_histria', url: 'https://ro.wikipedia.org/wiki/Histria_(cetate)', title: 'Histria (cetate) — Wikipedia' },
];

// ============================================================================
// 3. EXECUTE AUDIT & CURATION ACROSS ALL 6,241 CANONICAL RECORDS
// ============================================================================

const initialActiveChoice = choiceList.filter((q) => q.reviewStatus === 'approved' && !q.isDisabled);
const initialActiveEst = estimationList.filter((q) => q.reviewStatus === 'approved' && !q.isDisabled);

const auditStats = {
  totalCanonicalRecords: choiceList.length + estimationList.length,
  choiceRecordsTotal: choiceList.length,
  estimationRecordsTotal: estimationList.length,
  previouslyActiveChoice: initialActiveChoice.length,
  previouslyActiveEstimation: initialActiveEst.length,
  previouslyActiveTotal: initialActiveChoice.length + initialActiveEst.length,
  keptChoice: 0,
  disabledFromPreviousActiveChoice: 0,
  replacedChoiceWithNewCurated: 0,
  finalActiveChoice: 0,
  keptEstimation: 0,
  disabledFromPreviousActiveEstimation: 0,
  replacedEstimationWithNewCurated: 0,
  finalActiveEstimation: 0,
  finalActiveTotal: 0,
  disabledReasonsBreakdown: {
    template_chemistry_academic: 0,
    template_county_series: 0,
    template_world_series: 0,
    duplicate_fact_or_reversal: 0,
    obscure_or_formula_choice: 0,
    estimation_county_area_sum: 0,
    estimation_obscure_peaks_rivers: 0,
    estimation_robotic_sport_templates: 0,
    estimation_robotic_tech_http_tcp: 0,
    estimation_math_conversion_or_duplicate: 0,
  },
  disabledExamples: [],
  keptExamples: [],
  newlyAddedExamples: [],
};

const activeFactKeys = new Set();
const activePrompts = new Set();

// --- STEP A: Process estimation.json (120 active tiebreak questions) ---
const existingActiveEstByPrompt = new Map();
for (const q of initialActiveEst) {
  existingActiveEstByPrompt.set(normalizeQuestionText(q.question), q.id);
}

for (const q of initialActiveEst) {
  if (q.id.startsWith('est_geo_ro_sum_area_')) {
    auditStats.disabledReasonsBreakdown.estimation_county_area_sum++;
    if (auditStats.disabledExamples.length < 15) {
      auditStats.disabledExamples.push({ id: q.id, reason: 'estimation_county_area_sum', question: q.question });
    }
  } else if (q.id.startsWith('est_geo_feat_')) {
    auditStats.disabledReasonsBreakdown.estimation_obscure_peaks_rivers++;
    if (auditStats.disabledExamples.length < 15) {
      auditStats.disabledExamples.push({ id: q.id, reason: 'estimation_obscure_peaks_rivers', question: q.question });
    }
  } else if (q.id.startsWith('est_sport_')) {
    auditStats.disabledReasonsBreakdown.estimation_robotic_sport_templates++;
    if (auditStats.disabledExamples.length < 15) {
      auditStats.disabledExamples.push({ id: q.id, reason: 'estimation_robotic_sport_templates', question: q.question });
    }
  } else if (q.id.startsWith('est_tech_')) {
    auditStats.disabledReasonsBreakdown.estimation_robotic_tech_http_tcp++;
    if (auditStats.disabledExamples.length < 15) {
      auditStats.disabledExamples.push({ id: q.id, reason: 'estimation_robotic_tech_http_tcp', question: q.question });
    }
  }
}

for (let i = 0; i < estimationList.length; i++) {
  const q = estimationList[i];
  q.reviewStatus = 'disabled';
  q.isDisabled = true;
  q.verified = false;
  if (!q.factKey) {
    q.factKey = `fact_disabled_est_${q.id}`;
  }
}

for (let i = 0; i < NEW_ESTIMATION_TIEBREAKS.length; i++) {
  const item = NEW_ESTIMATION_TIEBREAKS[i];
  const record = estimationList[i];
  const normP = normalizeQuestionText(item.q);
  const wasAlreadyActive = existingActiveEstByPrompt.has(normP);

  if (wasAlreadyActive) {
    auditStats.keptEstimation++;
  } else {
    auditStats.replacedEstimationWithNewCurated++;
  }

  record.type = 'estimation';
  record.question = item.q;
  record.targetNumber = item.t;
  record.unit = item.u;
  record.explanation = item.exp;
  record.factKey = item.fk;
  record.sourceUrl = item.url;
  record.sourceTitle = item.title;
  record.sourceCheckedAt = '2026-11-13';
  record.difficulty = 'mediu';
  record.reviewStatus = 'approved';
  record.isDisabled = false;
  record.verified = true;

  activeFactKeys.add(item.fk);
  activePrompts.add(normP);
}


// Replace the remaining formula/measurement tiebreaks with concise general-knowledge facts.
for (const replacement of GENERAL_KNOWLEDGE_NUMERIC_REPLACEMENTS) {
  const record = estimationList.find((q) => q.id === replacement.id);
  if (!record) throw new Error(`Missing numeric replacement record: ${replacement.id}`);
  activeFactKeys.delete(record.factKey);
  activePrompts.delete(normalizeQuestionText(record.question));
  Object.assign(record, replacement);
  activeFactKeys.add(record.factKey);
  activePrompts.add(normalizeQuestionText(record.question));
}

// Restore approved legacy numeric questions without overlapping the curated set.
for (const id of RESTORED_ESTIMATION_IDS) {
  const record = estimationList.find((q) => q.id === id);
  if (!record) throw new Error(`Missing approved numeric record: ${id}`);
  const factKey = record.factKey || `fact_est_${record.id}`;
  const prompt = normalizeQuestionText(record.question);
  if (activeFactKeys.has(factKey) || activePrompts.has(prompt)) {
    throw new Error(`Duplicate active numeric question while restoring ${id}`);
  }
  record.factKey = factKey;
  record.reviewStatus = 'approved';
  record.isDisabled = false;
  record.verified = true;
  activeFactKeys.add(factKey);
  activePrompts.add(prompt);
}
auditStats.restoredApprovedEstimation = RESTORED_ESTIMATION_IDS.size;
auditStats.replacedMetricEstimationWithGeneralKnowledge = GENERAL_KNOWLEDGE_NUMERIC_REPLACEMENTS.length;

auditStats.disabledFromPreviousActiveEstimation =
  auditStats.previouslyActiveEstimation - auditStats.keptEstimation;
auditStats.disabledReasonsBreakdown.estimation_math_conversion_or_duplicate =
  auditStats.disabledFromPreviousActiveEstimation -
  (auditStats.disabledReasonsBreakdown.estimation_county_area_sum +
    auditStats.disabledReasonsBreakdown.estimation_obscure_peaks_rivers +
    auditStats.disabledReasonsBreakdown.estimation_robotic_sport_templates +
    auditStats.disabledReasonsBreakdown.estimation_robotic_tech_http_tcp);
auditStats.finalActiveEstimation = NEW_ESTIMATION_TIEBREAKS.length + RESTORED_ESTIMATION_IDS.size;

// Collect estimation target numbers/topics so choice.json doesn't ask the same numerical fact
const estNumericFacts = new Set([
  'fact_extra_sport_1', 'fact_extra_sport_2', 'fact_extra_sport_6', 'fact_extra_sport_7',
  'fact_extra_sport_8', 'fact_extra_sport_9', 'fact_extra_sport_10', 'fact_extra_sport_14',
  'fact_extra_sport_15', 'fact_extra_sport_16', 'fact_extra_sport_17', 'fact_extra_sport_18',
  'fact_extra_sport_19', 'fact_extra_sport_25', 'fact_extra_literatura_1', 'fact_extra_literatura_24',
  'fact_extra_cultura_generala_11', 'fact_extra_cultura_generala_13', 'fact_extra_cultura_generala_14',
  'fact_extra_cultura_generala_15', 'fact_extra_cultura_generala_16', 'fact_extra_cultura_generala_17',
  'fact_extra_cultura_generala_18', 'fact_extra_cultura_generala_19', 'fact_extra_cultura_generala_20',
  'fact_extra_muzica_6', 'fact_extra_muzica_7', 'fact_extra_muzica_8', 'fact_extra_muzica_9',
  'fact_extra_muzica_10', 'fact_extra_muzica_24', 'fact_extra_arta_2', 'fact_extra_biologie_7',
  'fact_extra_biologie_8', 'fact_extra_biologie_11', 'fact_extra_biologie_17', 'fact_extra_biologie_18',
  'fact_extra_biologie_19', 'fact_sport_metric_1', 'fact_sport_metric_10', 'fact_sport_metric_17',
  'fact_sport_metric_20', 'fact_tech_metric_13', 'fact_tech_metric_14', 'fact_tech_metric_15',
  'fact_tech_metric_18', 'fact_tech_metric_20',
]);

// --- STEP B: Audit choice.json one by one ---
const goodWorldCaps = new Set([
  'geo_world_cap_fr', 'geo_world_cap_it', 'geo_world_cap_es', 'geo_world_cap_de',
  'geo_world_cap_gb', 'geo_world_cap_at', 'geo_world_cap_gr', 'geo_world_cap_tr',
  'geo_world_cap_eg', 'geo_world_cap_jp', 'geo_world_cap_cn', 'geo_world_cap_us',
  'geo_world_cap_ca', 'geo_world_cap_br', 'geo_world_cap_ar', 'geo_world_cap_au',
]);
const goodWorldCurr = new Set(['geo_world_curr_jp', 'geo_world_curr_gb', 'geo_world_curr_us', 'geo_world_curr_ch']);
const goodRoSeats = new Set(['geo_ro_seat_bh', 'geo_ro_seat_dj', 'geo_ro_seat_hd', 'geo_ro_seat_mm', 'geo_ro_seat_ph']);
const goodChemSyms = new Set(['chem_sym_o', 'chem_sym_fe', 'chem_sym_au', 'chem_sym_ag', 'chem_sym_c', 'chem_sym_h']);

const obscureChoiceIds = new Set([
  'est_cult_year_21',
  'est_tech_yr_7',
  'extra_tehnologie_ch_subj_25',
  'extra_literatura_ch_subj_21',
  'extra_literatura_ch_val_20',
  'extra_literatura_ch_val_25',
  'extra_arta_est_val_12',
  'extra_literatura_est_val_12',
  'est_sport_metric_13',
  'est_sport_metric_14',
  'extra_sport_ch_val_24',
  'geo_feat_massif_3',
  'geo_feat_massif_9',
  'geo_feat_massif_10',
  'geo_feat_massif_11',
  'geo_feat_massif_14',
  'geo_feat_massif_17',
  'geo_feat_massif_18',
  'geo_feat_massif_19',
  'geo_feat_massif_20',
  'geo_feat_massif_21',
  'geo_feat_name_9',
  'geo_feat_name_10',
  'geo_feat_name_11',
  'geo_feat_name_14',
  'geo_feat_name_17',
  'geo_feat_name_18',
  'geo_feat_name_19',
  'geo_feat_name_20',
  'geo_feat_name_21',
]);

const priorityScore = (q) => {
  if (q.id.includes('_leader_') || q.id.includes('_champ_') || q.id.includes('_creator_') || q.id.includes('_subj_') || q.id.includes('_author_')) return 0;
  if (q.id.includes('_place_') || q.id.includes('_host_') || q.id.includes('_name_')) return 1;
  return 2;
};

const sortedActiveChoice = [...initialActiveChoice].sort((a, b) => priorityScore(a) - priorityScore(b));
const keptChoiceIds = new Set();
const seenTopics = new Set();

for (const q of sortedActiveChoice) {
  if (
    q.id.startsWith('chem_z_to_') ||
    q.id.startsWith('chem_mass_choice_') ||
    q.id.startsWith('chem_group_') ||
    q.id.startsWith('chem_name_') ||
    (q.id.startsWith('chem_sym_') && !goodChemSyms.has(q.id))
  ) {
    auditStats.disabledReasonsBreakdown.template_chemistry_academic++;
    if (auditStats.disabledExamples.length < 25) {
      auditStats.disabledExamples.push({ id: q.id, reason: 'template_chemistry_academic', question: q.question });
    }
    continue;
  }

  if (
    q.id.startsWith('geo_ro_code_') ||
    q.id.startsWith('geo_ro_region_') ||
    q.id.startsWith('geo_ro_river_') ||
    q.id.startsWith('geo_ro_county_of_') ||
    (q.id.startsWith('geo_ro_seat_') && !goodRoSeats.has(q.id))
  ) {
    auditStats.disabledReasonsBreakdown.template_county_series++;
    if (auditStats.disabledExamples.length < 35) {
      auditStats.disabledExamples.push({ id: q.id, reason: 'template_county_series', question: q.question });
    }
    continue;
  }

  if (
    q.id.startsWith('geo_world_state_') ||
    q.id.startsWith('geo_world_cont_') ||
    (q.id.startsWith('geo_world_cap_') && !goodWorldCaps.has(q.id)) ||
    (q.id.startsWith('geo_world_curr_') && !goodWorldCurr.has(q.id))
  ) {
    auditStats.disabledReasonsBreakdown.template_world_series++;
    if (auditStats.disabledExamples.length < 45) {
      auditStats.disabledExamples.push({ id: q.id, reason: 'template_world_series', question: q.question });
    }
    continue;
  }

  const words = q.question.trim().split(/\s+/).filter(Boolean);
  if (
    q.id.startsWith('tech_yr_choice_') ||
    q.id.startsWith('cult_year_choice_') ||
    obscureChoiceIds.has(q.id) ||
    words.length < 4 ||
    words.length > 14 ||
    q.question.length > 95
  ) {
    auditStats.disabledReasonsBreakdown.obscure_or_formula_choice++;
    if (auditStats.disabledExamples.length < 55) {
      auditStats.disabledExamples.push({ id: q.id, reason: 'obscure_or_formula_choice', question: q.question });
    }
    continue;
  }

  if (q.id.startsWith('cult_title_') || q.id.startsWith('tech_topic_') || estNumericFacts.has(q.factKey)) {
    auditStats.disabledReasonsBreakdown.duplicate_fact_or_reversal++;
    continue;
  }

  if (q.id.startsWith('hist_yr_choice_') || q.id.startsWith('sport_yr_choice_')) {
    auditStats.disabledReasonsBreakdown.duplicate_fact_or_reversal++;
    continue;
  }

  const topicMatch = q.id.match(/^(hist|sport|tech|geo_feat)_(?:yr_choice|leader_choice|place_choice|champ|host|creator|massif|name)_(\d+)$/);
  const topicKey = topicMatch ? `${topicMatch[1]}_topic_${topicMatch[2]}` : q.factKey;

  const normP = normalizeQuestionText(q.question);
  if (seenTopics.has(topicKey) || activeFactKeys.has(q.factKey) || activePrompts.has(normP)) {
    auditStats.disabledReasonsBreakdown.duplicate_fact_or_reversal++;
    continue;
  }

  seenTopics.add(topicKey);
  activeFactKeys.add(q.factKey);
  activePrompts.add(normP);
  keptChoiceIds.add(q.id);
  auditStats.keptChoice++;
  if (auditStats.keptExamples.length < 15) {
    auditStats.keptExamples.push({ id: q.id, category: q.category, question: q.question, answer: q.options[q.correctAnswerIndex] });
  }
}

auditStats.disabledFromPreviousActiveChoice =
  auditStats.previouslyActiveChoice - auditStats.keptChoice;

const disabledSlotIndicesByCategory = {};
for (let i = 0; i < choiceList.length; i++) {
  const q = choiceList[i];
  if (keptChoiceIds.has(q.id)) {
    q.reviewStatus = 'approved';
    q.isDisabled = false;
    q.verified = true;
  } else {
    q.reviewStatus = 'disabled';
    q.isDisabled = true;
    q.verified = false;
    if (!q.factKey) {
      q.factKey = `fact_disabled_ch_${q.id}`;
    }
    if (!disabledSlotIndicesByCategory[q.category]) {
      disabledSlotIndicesByCategory[q.category] = [];
    }
    disabledSlotIndicesByCategory[q.category].push(i);
  }
}

let fallbackDisabledIndices = [];
for (let i = 0; i < choiceList.length; i++) {
  if (choiceList[i].isDisabled) fallbackDisabledIndices.push(i);
}

for (const item of NEW_CURATED_CHOICE) {
  const qText = item.q;
  const qOpts = item.opts;
  const qAns = item.ans;
  const normP = normalizeQuestionText(qText);

  if (activeFactKeys.has(item.fk) || activePrompts.has(normP)) {
    continue;
  }

  const catSlots = disabledSlotIndicesByCategory[item.cat] || [];
  let slotIdx = catSlots.shift();
  if (slotIdx === undefined) {
    slotIdx = fallbackDisabledIndices.find((idx) => choiceList[idx].isDisabled);
  }
  if (slotIdx === undefined) break;

  const target = choiceList[slotIdx];
  target.type = 'choice';
  target.question = qText;
  target.options = qOpts;
  target.correctAnswerIndex = qAns;
  target.explanation = `Răspuns corect: ${qOpts[qAns]}.`;
  target.factKey = item.fk;
  target.sourceUrl = item.url;
  target.sourceTitle = item.title;
  target.sourceCheckedAt = '2026-11-13';
  target.difficulty = 'usor';
  target.reviewStatus = 'approved';
  target.isDisabled = false;
  target.verified = true;

  activeFactKeys.add(item.fk);
  activePrompts.add(normP);
  auditStats.replacedChoiceWithNewCurated++;
  if (auditStats.newlyAddedExamples.length < 20) {
    auditStats.newlyAddedExamples.push({
      id: target.id,
      category: target.category,
      question: target.question,
      answer: target.options[target.correctAnswerIndex],
    });
  }
}

// Restore vetted, varied approved choice questions that were previously deactivated.
for (const id of RESTORED_CHOICE_IDS) {
  const record = choiceList.find((q) => q.id === id);
  if (!record) throw new Error(`Missing approved choice record: ${id}`);
  const factKey = record.factKey || `fact_choice_${record.id}`;
  const prompt = normalizeQuestionText(record.question);
  if (activeFactKeys.has(factKey) || activePrompts.has(prompt)) {
    throw new Error(`Duplicate active choice question while restoring ${id}`);
  }
  record.factKey = factKey;
  record.reviewStatus = 'approved';
  record.isDisabled = false;
  record.verified = true;
  activeFactKeys.add(factKey);
  activePrompts.add(prompt);
}
auditStats.restoredApprovedChoice = RESTORED_CHOICE_IDS.size;

auditStats.finalActiveChoice = choiceList.filter((q) => q.reviewStatus === 'approved' && !q.isDisabled).length;
auditStats.finalActiveTotal = auditStats.finalActiveChoice + auditStats.finalActiveEstimation;

fs.writeFileSync(choicePath, JSON.stringify(choiceList, null, 2), 'utf8');
fs.writeFileSync(estimationPath, JSON.stringify(estimationList, null, 2), 'utf8');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const activeQuestions = [
  ...choiceList.filter((q) => q.reviewStatus === 'approved' && !q.isDisabled),
  ...estimationList.filter((q) => q.reviewStatus === 'approved' && !q.isDisabled),
];
manifest.version = '9.5.0';
manifest.generatedAt = new Date().toISOString();
manifest.totalQuestions = choiceList.length + estimationList.length;
manifest.approvedCount = activeQuestions.length;
manifest.disabledCount = manifest.totalQuestions - activeQuestions.length;
manifest.activeChoiceCount = auditStats.finalActiveChoice;
manifest.activeEstimationCount = auditStats.finalActiveEstimation;
manifest.activeCategoryBreakdown = {};
manifest.activeDifficultyBreakdown = {};
for (const q of activeQuestions) {
  manifest.activeCategoryBreakdown[q.category] = (manifest.activeCategoryBreakdown[q.category] || 0) + 1;
  manifest.activeDifficultyBreakdown[q.difficulty] = (manifest.activeDifficultyBreakdown[q.difficulty] || 0) + 1;
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
fs.writeFileSync(reportPath, JSON.stringify(auditStats, null, 2), 'utf8');

console.log('Audit & Curation V9.5 Complete:', {
  totalCanonicalRecords: auditStats.totalCanonicalRecords,
  previouslyActiveChoice: auditStats.previouslyActiveChoice,
  keptChoice: auditStats.keptChoice,
  disabledFromPreviousActiveChoice: auditStats.disabledFromPreviousActiveChoice,
  replacedChoiceWithNewCurated: auditStats.replacedChoiceWithNewCurated,
  finalActiveChoice: auditStats.finalActiveChoice,
  previouslyActiveEstimation: auditStats.previouslyActiveEstimation,
  keptEstimation: auditStats.keptEstimation,
  disabledFromPreviousActiveEstimation: auditStats.disabledFromPreviousActiveEstimation,
  replacedEstimationWithNewCurated: auditStats.replacedEstimationWithNewCurated,
  finalActiveEstimation: auditStats.finalActiveEstimation,
  finalActiveTotal: auditStats.finalActiveTotal,
  disabledReasonsBreakdown: auditStats.disabledReasonsBreakdown,
});
