# 🧠 CONQUIZ – Arhitectura și Standardul Băncii Canonice de Întrebări (V9.0)

Acest document descrie structura, regulile editoriale, mecanismul de deduplicare factuală (`factKey`) și scripturile de validare ale băncii de întrebări CONQUIZ.

---

## 1. Structura Fișierelor Canonice

Banca de întrebări este stocată în format JSON canonic în directorul `data/questions/`:
- `data/questions/choice.json` — Întrebări cu 4 variante de răspuns (`3.269` întrebări aprobate).
- `data/questions/estimation.json` — Întrebări de estimare numerică (`2.947` întrebări aprobate).
- `data/questions/manifest.json` — Metadate agregate, statistici pe categorii/dificultăți și număr de `factKey`-uri unice (`6.216` întrebări aprobate, `5.673` `factKey`-uri distincte).

---

## 2. Schema Unei Întrebări (V9.0)

Fiecare întrebare din bancă respectă interfața `Question` din `src/types/game.ts`:

```json
{
  "id": "ch_istorie_0001",
  "category": "istorie",
  "difficulty": "mediu",
  "type": "choice",
  "question": "În ce an a avut loc Marea Unire proclamată la Alba Iulia?",
  "options": ["1918", "1859", "1877", "1920"],
  "correctAnswerIndex": 0,
  "explanation": "Marea Unire a fost proclamată la Alba Iulia pe 1 decembrie 1918.",
  "factKey": "fact:istorie:marea_unire_alba_iulia_1918",
  "reviewStatus": "approved",
  "verified": true,
  "sourceUrl": "https://ro.wikipedia.org/wiki/Marea_Unire",
  "sourceTitle": "Wikipedia (RO) – Marea Unire",
  "sourceCheckedAt": "2026-11-10T00:00:00.000Z",
  "tags": ["istorie", "choice", "mediu", "v9_curated"]
}
```

### Câmpuri Obligatorii V9.0:
1. **`reviewStatus`**: `'draft' | 'approved' | 'rejected' | 'disabled'`. Motorul de joc extrage **exclusiv** întrebări cu `reviewStatus === 'approved'` și `isDisabled !== true`.
2. **`factKey`**: Identificator canonic al faptului verificat (ex. `fact:chimie:element_numar_atomic_79`). Dacă același concept există atât ca întrebare grilă (`choice`), cât și ca întrebare numerică (`estimation`), ambele partajează același `factKey`, iar motorul de joc **interzice** extragerea a două întrebări cu același `factKey` în aceeași partidă.
3. **`sourceUrl` & `sourceTitle`**: URL specific către pagina enciclopedică / articolul de referință (URL-urile generice de tip homepage precum `https://ro.wikipedia.org` sunt interzise de validator).
4. **`sourceCheckedAt`**: Data ISO-8601 a ultimei verificări editoriale.

---

## 3. Echilibrarea celor 14 Categorii

Banca V9.0 este echilibrată pe toate cele 14 categorii, astfel încât nicio categorie nu depășește pragul maxim de **12.5%** din totalul băncii, și fiecare categorie dispune de suficiente întrebări `choice` și `estimation` pentru un meci complet de 10 jucători chiar și atunci când este selectată o singură categorie:

| Categorie | Întrebări `choice` | Întrebări `estimation` | Total | Pondere (%) |
| :--- | :---: | :---: | :---: | :---: |
| `geografie` | 406 | 360 | 766 | 12.3% |
| `istorie` | 362 | 169 | 531 | 8.5% |
| `chimie` | 238 | 228 | 466 | 7.5% |
| `cultura_generala` | 290 | 172 | 462 | 7.4% |
| `sport` | 247 | 190 | 437 | 7.0% |
| `biologie` | 234 | 197 | 431 | 6.9% |
| `matematica` | 212 | 212 | 424 | 6.8% |
| `fizica` | 222 | 198 | 420 | 6.8% |
| `literatura` | 215 | 193 | 408 | 6.6% |
| `arta` | 184 | 197 | 381 | 6.1% |
| `muzica` | 176 | 203 | 379 | 6.1% |
| `cinematografie` | 175 | 203 | 378 | 6.1% |
| `tehnologie` | 158 | 213 | 371 | 6.0% |
| `informatica` | 150 | 212 | 362 | 5.8% |
| **TOTAL** | **3.269** | **2.947** | **6.216** | **100.0%** |

---

## 4. Validare Automată (`npm run validate:questions`)

Scriptul `scripts/validate_question_bank.cjs` verifică automat:
- Prezența și validitatea JSON a fișierelor `choice.json`, `estimation.json`, `manifest.json` și `data/conquiz_db.example.json` (inclusiv `users: {}`).
- Unicitatea tuturor `id`-urilor și a textelor normalizate (0 duplicate).
- Prezența `reviewStatus === 'approved'`, `factKey`, `sourceUrl` specific (non-homepage), `sourceTitle` și `sourceCheckedAt`.
- Echilibrul pe categorii (`<= 12.5%` per categorie) și bugetul minim per categorie (`>= 96 choice` și `>= 89 estimation`).
