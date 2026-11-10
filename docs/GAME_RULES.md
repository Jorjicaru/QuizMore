# ⚔️ CONQUIZ – Regulile Oficiale ale Jocului

Acest document descrie regulile canonice implementate în motorul autoritativ al jocului (`server/gameEngine.ts` și `src/game/rules.ts`).

---

## 1. Harta României și Preseturile de Jucători (2–10 Jucători)

La pornirea meciului (`startGame`), harta se configurează automat pe baza numărului **real** de jucători prezenți în cameră (`players.length`), înghețând presetul pentru toată partida:

| Jucători în Meci | Teritorii pe Hartă | Județe Acoperite | Runde în Faza de Război |
| :---: | :---: | :---: | :---: |
| **2** | 10 teritorii | 42 județe (dizolvate) | 4 runde |
| **3** | 15 teritorii | 42 județe (dizolvate) | 4 runde |
| **4** | 20 teritorii | 42 județe (dizolvate) | 4 runde |
| **5** | 23 teritorii | 42 județe (dizolvate) | 5 runde |
| **6** | 26 teritorii | 42 județe (dizolvate) | 5 runde |
| **7** | 29 teritorii | 42 județe (dizolvate) | 5 runde |
| **8** | 32 teritorii | 42 județe (dizolvate) | 6 runde |
| **9** | 35 teritorii | 42 județe (dizolvate) | 6 runde |
| **10** | 38 teritorii | 42 județe (dizolvate) | 6 runde |

---

## 2. Faza 1: Alegerea Bazei (`base_selection`)

1. Fiecare jucător își alege pe rând un teritoriu neutru drept **Cetate de Bază**.
2. **Restricție de ne-adiacență**: Nicio bază nu poate fi aleasă pe un teritoriu direct învecinat cu o bază deja ocupată, atâta timp cât există o configurație validă care permite tuturor jucătorilor rămași să își plaseze bazele (`canCompleteBaseSelection`).
3. Fiecare Cetate de Bază valorează **1.000 puncte** și începe cu **3 turnuri de apărare** (`castleTowers = 3`).

---

## 3. Faza 2: Expansiune / Cucerire (`conquest`)

Obiectivul fazei de Cucerire este ocuparea tuturor teritoriilor neutre de pe hartă.

### 3.1. Runda de Cucerire cu Întrebare Grilă (`choice`)
1. La începutul fiecărei runde de cucerire se afișează o **întrebare cu 4 variante de răspuns** (`choice`) tuturor jucătorilor activi simultan.
2. Fiecare jucător poate trimite **un singur răspuns** (blocat imediat după trimitere).
3. Jucătorii care răspund **corect** primesc dreptul de a alege **câte 2 teritorii neutre** (sau câte mai sunt disponibile), în ordinea vitezei de răspuns (`submitTime`).
4. Fiecare teritoriu neutru cucerit valorează **300 puncte**.
5. **Adiacență obligatorie**: Un jucător trebuie să aleagă un teritoriu neutru direct învecinat cu imperiul său; doar dacă nu mai există niciun teritoriu neutru adiacent, poate alege orice teritoriu neutru liber de pe hartă.

### 3.2. Departajarea Numerică pentru Teritoriile Neutre Rămase (`conquest_tiebreak`)
Dacă după rundele principale de cucerire mai rămân teritorii neutre:
1. Pentru fiecare teritoriu neutru rămas se pune o **întrebare numerică (`estimation`)** la care răspund toți jucătorii simultan.
2. Câștigă jucătorul cu răspunsul **cel mai apropiat** de valoarea exactă (`|answer - targetNumber|`).
3. În caz de egalitate la diferență, câștigă jucătorul care a trimis răspunsul **mai rapid** (`submitTime`).
4. **Politică anti-blocaj (V9.0)**: Dacă niciun jucător nu trimite răspuns (`NO_RESPONSE`), întrebarea numerică se repetă de cel mult **2 ori** pentru acel teritoriu; dacă nici după a doua reîncercare nu răspunde nimeni, teritoriul este atribuit determinist jucătorului vecin cu cel mai mic scor pentru a garanta avansarea partidei.

---

## 4. Faza 3: Război Simultan (`war`)

După ce toate teritoriile de pe hartă au un proprietar, începe **Faza de Război Simultan**.

### 4.1. Formarea Perechilor Simultane (`buildSimultaneousWarPairings`)
- În fiecare rundă de război, motorul formează automat până la `floor(N / 2)` dueluri simultane (`Atacator` vs `Apărător`) **exclusiv între jucători care au graniță comună directă**.
- Dacă numărul de jucători este impar (sau un jucător este izolat geografic de restul perechilor disponibile), acel jucător primește statutul **BYE (În Așteptare)** pentru runda respectivă, iar rotația rolurilor previne BYE-urile consecutive.

### 4.2. Selectarea Țintelor (`selecting_targets`)
- Toți atacatorii desemnați în runda curentă își aleg simultan câte un teritoriu-țintă aparținând apărătorului lor pereche.
- **Regula Adiacenței Topologice Stricte**: Atacatorul poate viza **doar** un teritoriu al apărătorului care este direct învecinat cu cel puțin un teritoriu deținut de atacator (inclusiv Cetatea de Bază a apărătorului, doar dacă este adiacentă!).

### 4.3. Rezolvarea Bătăliilor (`choice_question` + `tiebreak_question`)
1. Toți participanții din duelurile rundei primesc simultan aceeași **întrebare grilă (`choice`)**:
   - **Atacatorul răspunde corect, Apărătorul greșește / nu răspunde** → **Atacatorul câștigă duelul**.
   - **Apărătorul răspunde corect, Atacatorul greșește / nu răspunde** → **Apărătorul câștigă duelul**.
   - **Ambii greșesc sau nu răspund** → **Apărătorul păstrează teritoriul fără bonus** (`draw_no_bonus`).
   - **Ambii răspund corect** → Duelul respectiv intră în **Departajare Numerică (`tiebreak_question`)**, unde câștigă cel mai apropiat răspuns numeric (sau cel mai rapid la diferență egală).

### 4.4. Efectele Bătăliilor și Sistemul de Punctaj (Invarianta V9.0)
La finalul rundei de război, rezultatele tuturor duelurilor se aplică atomic:
- **Victorie Apărător**: Teritoriul apărat primește un bonus defensiv de **+100 puncte** (`defensiveBonus`, plafonat la `+300` pe teritoriu).
- **Victorie Atacator asupra unui teritoriu normal**: Teritoriul trece în posesia atacatorului (împreună cu valoarea sa de `200–300 pct`).
- **Victorie Atacator asupra unei Cetăți de Bază**:
  - Dacă Cetatea are `castleTowers > 1`: Cetatea pierde **1 turn**, iar atacatorul primește permanent **+400 puncte bonus de asediu** (`attackBonusPoints`), păstrate în scorul total pe tot parcursul meciului.
  - Dacă Cetatea ajunge la **0 turnuri**: Cetatea cade! **Toate teritoriile apărătorului învins sunt absorbite de atacator**, apărătorul este eliminat (`isEliminated = true`), iar Cetatea cucerită devine teritoriu de **1.000 puncte** în imperiul atacatorului.

---

## 5. Clasamentul Final și Condiția de Victorie (`game_over`)

Partida se încheie când:
1. Toate rundele de Război s-au finalizat, **SAU**
2. Un singur jucător controlează întreaga hartă (victorie prin eliminare).

Clasamentul final ordonează jucătorii descrescător după **Scorul Total**:
$$\text{Scor Total} = \sum (\text{Puncte Teritorii} + \text{Bonus Defensiv}) + \text{Bonusuri Asediu Turnuri Cetate}$$
La egalitate de puncte, departajarea se face după numărul de teritorii deținute, apoi după numărul de răspunsuri corecte.
