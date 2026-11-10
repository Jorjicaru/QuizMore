# Banca de Întrebări CONQUIZ V9.1 – Structură, Validare și Guvernanță

Acest document descrie arhitectura băncii de întrebări enciclopedice din **CONQUIZ V9.1**, regulile de validare automată și fluxul de moderare editorială.

---

## 1. Statistici Oficiale (Manifest V9.1.0)

Banca de întrebări canonică este stocată în `data/questions/choice.json` și `data/questions/estimation.json`, având sumarul verificabil în `data/questions/manifest.json`:

- **Total întrebări canonice:** `6.241`
- **Întrebări aprobate (`reviewStatus: "approved"`):** `6.241`
- **Întrebări tip grilă (`choice`):** `3.324` (fiecare cu 4 opțiuni unice și `correctAnswerIndex` distribuit uniform `0..3`)
- **Întrebări tip estimare numerică (`estimation`):** `2.917` (fiecare cu `targetNumber` exact și unitate de măsură `unit`)
- **Chei factologice unice (`uniqueFactKeysCount`):** `5.064`
- **Grupuri `factKey` partajate între `choice` și `estimation` (`sharedChoiceEstimationFactKeys`):** `660` (prevenind apariția în același meci a două întrebări care testează același fapt sub formă de grilă și estimare)
- **URL-uri sursă specifice pe subiect (`uniqueSourceUrlsCount`):** `1.365`
- **ID-uri duplicate:** `0`
- **Texte de întrebări duplicate:** `0`

---

## 2. Distribuția Echilibrată pe cele 14 Categorii

Conform cerințelor V9.1, **nicio categorie nu depășește pragul de `12,5%`** din totalul băncii de întrebări, iar fiecare categorie are minimum `320` de întrebări verificate:

| Categorie | Număr Întrebări | Pondere din Total (`6.241`) | Respectă Pragul `<= 12,5%` |
| :--- | :---: | :---: | :---: |
| `geografie` | 708 | 11,34% | DA |
| `istorie` | 639 | 10,24% | DA |
| `fizica` | 504 | 8,08% | DA |
| `literatura` | 490 | 7,85% | DA |
| `sport` | 457 | 7,32% | DA |
| `tehnologie` | 404 | 6,47% | DA |
| `informatica` | 403 | 6,46% | DA |
| `muzica` | 402 | 6,44% | DA |
| `cinematografie` | 396 | 6,35% | DA |
| `cultura_generala` | 395 | 6,33% | DA |
| `arta` | 385 | 6,17% | DA |
| `matematica` | 370 | 5,93% | DA |
| `biologie` | 367 | 5,88% | DA |
| `chimie` | 321 | 5,14% | DA |

---

## 3. Reguli de Guvernanță și Moderare (`reviewStatus` & `factKey`)

1. **Statut implicit `draft`**:
   - Orice întrebare nouă creată prin API (`POST /api/questions`), importată în `server/db.ts` sau adăugată fără `reviewStatus` explicit primește automat statutul **`draft`** (`verified: false`).
   - Nicio întrebare nu devine `approved` în mod implicit și nu i se inventează automat `sourceUrl` sau `sourceCheckedAt`.
2. **Filtru strict în meciurile oficiale (`server/gameEngine.ts`)**:
   - Motorul de joc selectează exclusiv întrebări care au simultan `reviewStatus === 'approved'` și `verified !== false`.
   - Întrebările cu statut `draft`, `rejected` sau `disabled` sunt complet excluse din meciuri.
3. **Deduplicare pe `factKey` în cadrul aceluiași meci**:
   - Fiecare cameră de joc menține atât `usedChoiceQuestionIds` / `usedEstimationQuestionIds`, cât și `usedFactKeys: Set<string>`.
   - Întrebările `choice` și `estimation` construite pe același fapt istoric, geografic, științific sau cultural împart același `factKey` (ex. `fact_hist_year_1`, `fact_chem_z_au`, `fact_geo_feat_val_1`), astfel încât o întrebare din timpul meciului nu poate divulga răspunsul unei alte întrebări din același meci.

---

## 4. Comenzi de Regenerare și Validare

```bash
# Construiește și validează banca de întrebări canonică
bun run build:questions

# Rulează validatorul strict V9.1 (verifică reviewStatus, factKey, surse și pragul <= 12.5%)
bun run validate:questions
```
