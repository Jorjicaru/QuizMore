CONQUIZ – README + MASTER TODO PENTRU AI CODING AGENT
====================================================
Versiune document: 1.1 – include istoricul remedierilor aplicate în copia auditată
Data: 08.11.2026
Proiect: CONQUIZ – Trivia Strategy România
Scop: audit, corectare, completare și testare a proiectului EXISTENT.

IMPORTANT: Acest document este destinat AI-ului care are deja proiectul CONQUIZ deschis în Google AI Studio sau care primește arhiva proiectului. Nu este o cerință de a crea altă aplicație de la zero.

======================================================================
0. INSTRUCȚIUNI OBLIGATORII PENTRU AI-UL CARE VA LUCRA LA PROIECT
======================================================================

Vei acționa ca un programator senior care continuă un proiect existent. Ai permisiunea să inspectezi, să modifici și să testezi fișierele proiectului.

Nu te limita la a explica ce ar trebui făcut. Modifică efectiv codul, datele și interfața, apoi rulează verificările disponibile.

Înainte de orice modificare:
1. Citește integral acest fișier.
2. Inspectează proiectul curent din workspace, nu presupune că este identic cu o arhivă mai veche.
3. Identifică diferențele dintre codul curent și situația descrisă în acest document.
4. Creează un checkpoint / backup al stării actuale.
5. Păstrează funcționalitățile care sunt deja corecte.
6. Nu șterge și nu rescrie module întregi doar pentru că este mai comod. Repară logic și incremental.
7. Nu crea un al doilea proiect CONQUIZ și nu muta aplicația într-o arhitectură nouă fără motiv tehnic demonstrat.
8. Nu modifica identitatea vizuală generală fără să fie necesar pentru rezolvarea problemelor.
9. Nu introduce magazin, monede, niveluri, XP, misiuni sau progresie cosmetică.
10. Nu declara o funcționalitate terminată numai pentru că există un buton sau un ecran. Trebuie să funcționeze de la client până la backend.

Lucrează în ordinea priorităților din acest document. La finalul fiecărei etape:
- rulează build și typecheck;
- rulează testele;
- verifică erorile din consolă;
- notează exact ce ai schimbat;
- nu trece la etapa următoare dacă ai introdus erori în etapa curentă.

Dacă o regulă este ambiguă, nu inventa o mecanică nouă. Păstrează comportamentul deja aprobat și marchează problema pentru decizie. Nu modifica regulile de joc doar pentru a simplifica implementarea.

======================================================================
1. OBIECTIVUL PRODUSULUI
======================================================================

CONQUIZ este un joc multiplayer de cultură generală și strategie, inspirat de mecanicile jocului ConQUIZtador. Elementul central este o hartă reală a României, împărțită în teritorii de joc. Jucătorii își aleg baze, cuceresc teritorii neutre, împart teritoriile rămase prin întrebări de estimare și apoi se atacă reciproc.

Jocul nu trebuie să devină un simplu quiz cu scor. Fiecare răspuns trebuie să aibă un efect clar asupra hărții și asupra proprietății teritoriilor.

Prioritățile produsului sunt:
- mecanici de joc corecte și previzibile;
- hartă geografică reală a României;
- întrebări numeroase, corecte, predominant medii și grele;
- runde și faze ușor de urmărit;
- timer stabil, fluid și sincronizat;
- multiplayer corect, fără trișare sau desincronizare;
- interfață utilizabilă pe desktop și telefon;
- cameră privată cu selecție de categorii;
- posibilitatea de a juca împotriva AI-ului;
- autentificare guest sau cont clasic cu email și parolă.

Nu sunt priorități: magazin, monede, niveluri, XP, cosmetice cumpărabile, recompense zilnice sau alte mecanici de monetizare/progresie.

======================================================================
2. REFERINȚA DE JOC ȘI DIFERENȚA FAȚĂ DE REGULILE PERSONALIZATE
======================================================================

Folosește jocul ConQUIZtador2 ca referință de experiență: hartă, teritorii, răspunsuri grilă și numerice, atac, apărare, capitală/cetate și decizii tactice.

Surse publice de referință:
- https://www.conquiztador2.ro/
- https://www.conquiztador2.ro/moduri-de-joc
- https://conquiztador.online/about/?language=ro
- https://geo-spatial.org/descarcare/date/administrative-boundaries/

Pe site-ul actual ConQUIZtador2, partidele oficiale sunt prezentate ca având trei jucători. Pagina de moduri diferențiază Războiul clasic și Blitzkrieg; Blitzkrieg este prezentat cu 15 teritorii, trei runde și maximum 12 ture de război. Întrebările grilă sunt descrise cu 12 secunde, iar cele numerice cu 10 secunde.

ATENȚIE: proiectul CONQUIZ are reguli personalizate aprobate de utilizator. Nu înlocui aceste reguli cu toate regulile, modurile, sistemele de rank, shop sau cosmetice ale jocului de referință. Referința oficială este pentru înțelegerea buclei de joc, nu pentru a copia toate funcționalitățile.

Regula personalizată a proiectului are prioritate:
- suport pentru 2–10 participanți, nu doar 3;
- alegerea bazelor este o etapă inițială separată;
- după alegerea bazelor există exact trei faze: Cucerire, Împărțire/Alocare, Război;
- punctajele sunt 1000 / 200 / 300 / 400 conform secțiunii 4;
- nu există shop, bani, niveluri sau XP;
- jucătorii trebuie să poată selecta manual teritoriile;
- harta trebuie să aibă teritorii în număr adaptat la numărul participanților.

Nu copia logo-ul, imaginile, codul, întrebările sau materialele protejate ale jocului original. Păstrează identitatea originală CONQUIZ. Capturile atașate în proiect sunt referințe vizuale pentru layout și atmosferă.

======================================================================
3. STAREA PROIECTULUI ANALIZAT – PUNCT DE PORNIRE
======================================================================

Arhiva auditată la 08.11.2026 conținea aproximativ următoarea structură:

Frontend:
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Lucide React
- Socket.IO Client

Backend:
- Node.js
- Express
- Socket.IO
- TypeScript / tsx
- JWT
- bcryptjs

Persistență:
- momentan JSON în data/conquiz_db.json;
- datele utilizatorilor, întrebărilor și istoricului sunt administrate în server/db.ts;
- starea meciurilor active este păstrată în memoria GameManager, nu într-o bază de date durabilă.

Fișiere importante identificate:
- package.json
- server.ts
- server/auth.ts
- server/db.ts
- server/gameEngine.ts
- server/questionsData.ts
- server/romaniaMapData.ts
- server/socketHandler.ts
- server/routes/authRoutes.ts
- server/routes/questionRoutes.ts
- server/routes/gameRoutes.ts
- server/routes/socialRoutes.ts
- server/routes/adminRoutes.ts
- src/App.tsx
- src/types/game.ts
- src/game/rules.ts
- src/game/rules.test.ts
- src/services/api.ts
- src/services/socket.ts
- src/components/GameHUD.tsx
- src/components/GameOverModal.tsx
- src/components/Navbar.tsx
- src/components/QuestionModal.tsx
- src/components/RomaniaMap.tsx
- src/components/RoundTracker.tsx
- src/views/AuthView.tsx
- src/views/DashboardView.tsx
- src/views/GameView.tsx
- src/views/LobbyView.tsx
- src/views/LeaderboardView.tsx
- src/views/FriendsView.tsx
- src/views/ProfileView.tsx
- src/views/AdminView.tsx
- src/views/SettingsView.tsx

Capturi de referință incluse în arhivă:
- public/assets/aistudio/image_b5a87907.png – referință pentru harta de joc, teritorii colorate, medalioane/baze, săgeată și hașură;
- public/assets/aistudio/image_866cb06b.png – referință pentru bara de runde;
- în .aistudio/artifacts/... există și capturi pentru dashboard, lobby, întrebare și mobil.

Situația măsurată în copia auditată:
- baza persistentă avea 100 întrebări: 62 grilă și 38 numerice;
- distribuția dificultății: 23 ușoare, 60 medii, 17 grele;
- nu au fost găsite ID-uri duplicate sau texte duplicate la verificarea automată descrisă în raport;
- harta din server/romaniaMapData.ts folosește poligoane scrise manual și este schematică, nu geografic corectă;
- seturile de teritorii din copia auditată: 10 pentru 2 jucători, 15 pentru 3, 25 pentru 4–5, 29 pentru 6–10;
- calculateConquestRounds folosește în prezent o formulă cu limită minimă 4 și maximă 5;
- faza de război este configurată pentru 6 runde;
- build-ul complet și typecheck-ul nu au fost confirmate în mediul auditului, deoarece dependențele nu erau instalate.

Nu considera toate aceste date automat adevărate pentru workspace-ul curent. Verifică fișierele actuale și actualizează inventarul înainte de a modifica ceva.

======================================================================
3A. CE A FOST MODIFICAT DE CHATGPT ÎN COPIA LOCALĂ AUDITATĂ
======================================================================

IMPORTANT – DISTINCȚIE ÎNTRE ORIGINAL ȘI COPIA CORECTATĂ

ChatGPT a primit arhiva exportată din Google AI Studio, a extras-o, a
analizat codul și a aplicat remedierile de mai jos NUMAI în copia locală
de lucru. A creat arhiva separată `conquiz-fixed-2026-11-08.zip`.

Proiectul original din Google AI Studio NU a fost modificat direct prin
browser. Dacă workspace-ul din AI Studio nu a fost actualizat manual,
el poate conține în continuare defectele originale.

DACĂ PRIMEȘTI ATÂT ACEST TXT, CÂT ȘI ARHIVA CORECTATĂ:
1. Inspectează mai întâi workspace-ul curent.
2. Inspectează arhiva `conquiz-fixed-2026-11-08.zip` ca referință pentru
   remedierile aplicate de ChatGPT.
3. Compară fișier cu fișier; nu suprascrie orbește proiectul curent cu
   arhiva mai veche.
4. Păstrează schimbările mai noi sau corecte din workspace.
5. Integrează numai remedierile care lipsesc.
6. Nu aplica de două ori aceeași migrare, seed sau eliminare.
7. După integrare, rulează din nou verificările și actualizează auditul
   pe baza stării REALE a proiectului curent.

DACĂ PRIMEȘTI NUMAI ACEST TXT:
Tratează secțiunea următoare ca istoric și listă de cerințe. Nu presupune
că remedierile ChatGPT există deja în workspace; verifică-le și
implementează-le numai dacă lipsesc.

CE A FOST MODIFICAT ÎN COPIA CORECTATĂ

A. Securitate și autentificare
- Handshake-ul Socket.IO verifică JWT-ul.
- Identitatea, username-ul, avatarul și rolul sunt rezolvate pe server,
  nu acceptate ca adevăr din payloadul trimis de browser.
- Răspunsul corect, valoarea numerică și explicația întrebării nu mai
  sunt incluse în snapshotul transmis clientului înainte de rezolvare.
- Endpointurile administrative pentru întrebări sunt protejate prin
  autentificare și rol de administrator.
- Au fost eliminate credențialele demo implicite.
- Au fost introduse verificări pentru secretul JWT și parola inițială
  a administratorului.

B. Lobby și motorul meciului
- Intrarea jucătorilor și modificările lobby-ului sunt permise numai
  înainte de pornirea meciului.
- Creatorul camerei este singurul care poate porni jocul și administra
  boții.
- Pornirea este refuzată dacă nu există minimum doi participanți, dacă
  oamenii nu sunt Ready sau dacă domeniile selectate nu au întrebări
  suficiente pentru tipurile necesare.
- Selecțiile invalide nu mai trebuie să anuleze timerul activ.
- A fost adăugată verificarea fezabilității alegerii bazelor pentru a
  evita o alegere automată imposibilă sau o buclă fără sfârșit.
- Răspunsurile trimise după deadline sunt respinse.
- Lipsa răspunsului este tratată ca NO_RESPONSE, nu ca numărul zero.
- În alocare, câștigătorul întrebării numerice selectează manual
  teritoriul neutru, în loc să primească unul arbitrar.
- Inputul numeric acceptă valori finite negative și zecimale.
- Întrebările nu se repetă în aceeași partidă.
- Timerul serverului este autoritatea; interfața desenează progresul
  folosind deadline-ul primit.
- În duel numeric fără răspuns din partea ambilor jucători, apărătorul
  păstrează teritoriul fără bonus defensiv.

C. Punctaj și hartă
- Au fost menținute/centralizate punctajele: bază 1000, cucerire 200,
  alocare 300, teritoriu cucerit în război 400 și bonus defensiv 100.
- Punctajele teritoriilor neutre nu mai sunt afișate la selectare sau
  hașurare; devin vizibile numai după atribuirea regiunii.
- A fost legat în HUD timerul de selecție pentru bază, teritoriu,
  ținta de atac și alegerea regiunii după câștigarea alocării.
- Au fost adăugate verificări pentru transferul teritoriilor la
  eliminare și proprietarul unic al unei regiuni.

D. Curățarea shopului și progresiei
- Au fost eliminate din copia corectată componentele și rutele asociate
  shopului, monedelor, misiunilor și realizărilor cosmetice.
- Tipurile de profil și metodele persistente au fost curățate de
  câmpurile level/xp/coins asociate progresiei eliminate.
- La citirea unei baze vechi sunt curățate câmpurile legacy asociate
  shopului și progresiei.
- Profilul, statisticile și istoricul real de meci trebuie păstrate.

E. Baza de întrebări
- Baza JSON și seed-urile din cod aveau ID-uri comune care reprezentau
  întrebări diferite. Seed-urile noi au primit prefixul `seed2_`, astfel
  încât să nu suprascrie întrebările deja salvate.
- Baza măsurată după migrarea copiei corectate conținea 100 întrebări:
  62 grilă și 38 numerice.
- Validarea importului/editării verifică tipul, categoria, dificultatea,
  cele patru variante distincte și indexul răspunsului corect; pentru
  numeric verifică valoarea finită.
- Importul este limitat la 1000 întrebări pe lot și respinge duplicatele
  exacte din aceeași categorie și același tip.
- A fost prevăzut un URL HTTPS pentru sursa întrebării.
- Au fost corectate unele formulări și răspunsuri cu probleme factuale
  sau ambiguități în seed și în baza persistentă.

FIȘIERE / ZONE PRINCIPALE ATINSE ÎN COPIA CORECTATĂ
- server/auth.ts
- server/db.ts
- server/gameEngine.ts
- server/questionsData.ts
- server/socketHandler.ts
- server/routes/questionRoutes.ts
- server/routes/adminRoutes.ts
- src/game/rules.ts
- src/game/rules.test.ts
- src/types/game.ts
- src/components/QuestionModal.tsx
- src/components/GameHUD.tsx
- src/components/RomaniaMap.tsx
- src/components/RoundTracker.tsx
- src/views/DashboardView.tsx
- src/views/LobbyView.tsx
- src/views/AuthView.tsx
- src/services/api.ts
- src/services/socket.ts
- data/conquiz_db.json

Aceasta este lista zonelor principale modificate/verificate; nu înseamnă
că fiecare fișier a fost rescris integral. Compară arhiva pentru diff-ul
real și verifică din nou workspace-ul curent.

TESTELE EFECTUATE PE COPIA CORECTATĂ
- 36 fișiere TypeScript/TSX parsate prin transpilerul TypeScript:
  zero erori de sintaxă detectate.
- 12 teste unitare existente pentru regulile jocului au trecut.
- Auditul celor 100 de întrebări: zero ID-uri duplicate, zero duplicate
  de text în aceeași categorie/tip și zero formate invalide detectate.
- Integritatea arhivei ZIP a fost verificată.

LIMITĂRI CARE NU AU FOST REZOLVATE
- Harta rămâne schematică, cu poligoane scrise manual; nu a fost
  înlocuită cu geometrie oficială GeoJSON.
- Banca are 100 întrebări, nu 5000 sau 25000. Nu inventa numere și nu
  considera cerința de volum rezolvată.
- Build-ul Vite și typecheck-ul complet nu au fost confirmate deoarece
  în mediul auditului lipseau dependențele `vite` și `vite/client`.
- Nu a fost executată o partidă multiplayer end-to-end cu trei clienți
  reali. Cele 12 teste trecute sunt teste unitare, nu test Socket.IO.
- Harta nu a fost validată vizual în browser după modificări.
- Persistența rămâne JSON, iar starea meciurilor active este în memoria
  procesului; PostgreSQL și reluarea după restart sunt lucrări separate.

Nu afirma că aceste limitări sunt rezolvate doar pentru că există cod
sau teste unitare. Confirmă-le prin verificări reale.

======================================================================
4. REGULILE DE JOC – SPECIFICAȚIA CARE TREBUIE RESPECTATĂ
======================================================================

4.1. Participanți și numărul de teritorii

Jocul trebuie să suporte 2–10 participanți în total, inclusiv boții AI.

Distribuția actuală propusă și folosită în copia auditată este:

2 jucători  -> 10 teritorii
3 jucători  -> 15 teritorii
4 jucători  -> 25 teritorii
5 jucători  -> 25 teritorii
6 jucători  -> 29 teritorii
7 jucători  -> 29 teritorii
8 jucători  -> 29 teritorii
9 jucători  -> 29 teritorii
10 jucători -> 29 teritorii

Păstrează această distribuție până când este demonstrat prin testare că o altă distribuție ar fi mai potrivită. Nu permite ca numărul de teritorii din UI să fie diferit de cel creat în backend.

Numărul trebuie calculat după numărul REAL de participanți înscriși în meci la apăsarea butonului Start, nu după numărul maxim de locuri disponibile în cameră.

Implicit, camera nouă și modul AI ar trebui să pornească de la 3 participanți în total (un om + doi adversari/boți), dar utilizatorul poate schimba numărul între 2 și 10. Nu configura numărul de runde manual.

4.2. Punctaj fix

Valorile sunt centralizate într-o singură configurație folosită de backend și testată:

- bază/cetate principală: 1000 puncte;
- teritoriu cucerit în Faza I: 200 puncte;
- teritoriu obținut în Faza II: 300 puncte;
- teritoriu normal cucerit în Război: 400 puncte;
- bonus defensiv: 100 puncte, conform regulii aflate deja în proiect; păstrează-l separat de valoarea teritoriului și nu îl dubla.

Nu scrie valorile separat în componente diferite. Nu permite clientului să trimită scorul. Serverul calculează și validează toate punctele.

La pierderea unui teritoriu, proprietarul anterior pierde exact valoarea actuală a acelui teritoriu și bonusul defensiv asociat acelei regiuni, dacă există. Noul proprietar primește valoarea stabilită pentru tipul cuceririi.

4.3. Etapele complete ale partidei

Fluxul complet este:

A. Pregătire cameră / lobby
B. Alegerea bazelor (etapă preliminară, nu una dintre cele trei faze)
C. FAZA I – CUCERIRE
D. FAZA II – ÎMPĂRȚIRE / ALOCARE, doar dacă au rămas teritorii neutre
E. FAZA III – RĂZBOI
F. Finalul partidei și clasamentul final

Nu permite atacuri între jucători înainte de Faza III.

4.4. Alegerea bazelor

- Ordinea de alegere se stabilește aleatoriu la începutul meciului.
- Fiecare participant alege pe rând o regiune liberă.
- Fiecare bază valorează 1000 puncte.
- Fiecare bază începe cu trei turnuri intacte.
- Două baze nu pot fi vecine directe.
- În plus, vecinii direcți ai unei baze alese devin indisponibili pentru alegerea altor baze. Ei NU sunt blocați pentru tot jocul; pot fi cuceriți în Faza I.
- Regula trebuie verificată în graful geografic de vecinătate, nu după coordonatele desenului.
- Înainte de începerea meciului, serverul trebuie să verifice că harta permite amplasarea legală a tuturor bazelor. Dacă nu, nu porni meciul și explică problema.
- Timer selecție bază: 15 secunde.
- Dacă jucătorul nu alege în timp, serverul selectează automat o bază validă, dar numai din lista pozițiilor care lasă suficiente opțiuni legale pentru jucătorii rămași.
- Dacă nu există o alegere validă, nu intra în buclă infinită. Oprește pregătirea și raportează că distribuția hărții nu permite așezarea tuturor bazelor.
- După atribuire, baza primește culoarea jucătorului, simbol de cetate, trei turnuri și numele jucătorului. Punctajul 1000 devine vizibil deoarece teritoriul este deja ocupat.

4.5. FAZA I – CUCERIRE

Obiectiv: ocuparea teritoriilor neutre prin răspunsuri la întrebări. În această fază nu se atacă niciun jucător și nu se pot selecta teritorii deja ocupate.

Reguli:
- Fiecare jucător are o singură oportunitate de cucerire în fiecare rundă.
- Ordinea jucătorilor trebuie amestecată la fiecare rundă, nu păstrată fixă în toate rundele.
- Jucătorul activ alege MANUAL un teritoriu neutru adiacent cu cel puțin un teritoriu deținut de el.
- Nu aloca automat alt teritoriu după răspunsul corect. Se alocă exact teritoriul selectat de jucător.
- Teritoriile ocupate sunt invalide.
- Teritoriile neutre care nu sunt adiacente domeniului jucătorului sunt invalide.
- Nu permite atacuri asupra altor jucători în Faza I.
- Timer pentru selectarea teritoriului: 15 secunde.
- La expirarea timerului, serverul selectează automat un teritoriu neutru valid, apoi pornește întrebarea. Selecția automată nu acordă puncte.
- Dacă nu există niciun teritoriu neutru valid pentru jucător, tura se marchează ca sărită și jocul continuă.
- După selectare, întrebarea grilă sau numerică este prezentată jucătorului activ. La întrebarea grilă sunt 4 variante, una corectă. Pentru numeric trebuie să existe o toleranță explicită a întrebării, nu o toleranță globală inventată.
- Întrebare grilă: 12 secunde. Întrebare numerică: 10 secunde.
- Răspuns corect: teritoriul selectat devine al jucătorului și primește 200 puncte.
- Răspuns greșit sau lipsă răspuns: teritoriul rămâne neutru, nu se acordă puncte, tura se consumă.
- Răspunsurile întârziate sunt respinse de server.

Numărul rundelor în Faza I:
- Nu este setare în lobby.
- Se calculează automat înaintea începerii fazei.
- Formula propusă în proiect: ceil((numărTeritorii - numărJucători) / numărJucători), limitată la minimum 4 și maximum 5 runde.
- Pentru 3 jucători și 15 teritorii rezultă 4 runde.
- Pentru 4 jucători și 25 teritorii rezultă 5 runde.
- Pentru 5 jucători și 25 teritorii rezultă 4 runde.
- Dacă toate teritoriile sunt ocupate înainte de terminarea rundelor, încheie Faza I imediat și sari peste Faza II.
- Dacă s-au terminat rundele și mai există teritorii neutre, intră în Faza II.

4.6. FAZA II – ÎMPĂRȚIREA / ALOCAREA TERITORIILOR RĂMASE

Această fază se desfășoară numai dacă după Faza I au rămas teritorii neutre.

Diferența esențială față de Faza I:
- în Faza I, jucătorul selectează teritoriul, apoi răspunde;
- în Faza II, toți jucătorii activi răspund mai întâi la aceeași întrebare numerică, iar câștigătorul primește dreptul de a alege manual un teritoriu neutru.

Flux:
1. Serverul selectează o întrebare de tip numeric.
2. Toți jucătorii activi primesc exact aceeași întrebare în același timp.
3. Fiecare introduce un număr.
4. Serverul înregistrează fiecare răspuns și timpul real de trimitere.
5. Cel mai apropiat răspuns de valoarea corectă câștigă.
6. La diferență egală câștigă cel care a trimis primul răspunsul.
7. Câștigătorul primește 15 secunde pentru a selecta MANUAL orice teritoriu neutru rămas. Nu este necesar să fie adiacent cu domeniul lui.
8. Teritoriul selectat îi este atribuit și valorează 300 puncte.
9. Se repetă procedura pentru fiecare teritoriu neutru rămas.
10. Când nu mai există teritorii neutre, Faza II se termină și începe Faza III.

Nu acorda două teritorii pentru aceeași întrebare. Doar câștigătorul acelei întrebări are dreptul la o singură selecție.

Dacă răspunsurile sunt la aceeași distanță, compară timpul serverului. Dacă distanța și timpul sunt identice, folosește o întrebare numerică suplimentară de departajare; nu acorda două teritorii.

Dacă un jucător nu răspunde până la expirarea timpului, starea lui este NO_RESPONSE. Nu transforma lipsa răspunsului în zero și nu îl include în comparație.

Dacă toți jucătorii nu răspund:
- nu acorda teritoriu;
- nu inventa un răspuns;
- închide întrebarea și încearcă o întrebare numerică nouă;
- nu lăsa faza să se blocheze;
- pentru trei runde consecutive fără niciun răspuns, pune partida în pauză și oferă gazdei opțiunea de a relua întrebarea sau de a încheia partida. Nu atribui teritorii automat fără câștigător.

Dacă câștigătorul nu selectează un teritoriu în cele 15 secunde, serverul alege automat un teritoriu neutru rămas. Această auto-selecție se aplică doar după ce există un câștigător al întrebării.

Contorul vizual al fazei trebuie să arate:
- câte teritorii neutre mai sunt;
- câte întrebări de alocare au fost rezolvate;
- cine este câștigătorul care selectează acum;
- câte secunde mai are pentru alegere.

Nu afișa „runda X din aproximativ Y” dacă Y nu poate fi cunoscut corect. Numărul de teritorii neutre rămase este indicatorul real al progresului acestei faze.

4.7. FAZA III – RĂZBOI / ATAC

Faza începe numai când toate teritoriile au proprietar.

Setări standard ale proiectului:
- maximum 6 runde de război;
- șase runde sunt mai multe decât cele 4–5 runde de cucerire;
- fiecare jucător activ poate efectua maximum un atac pe rundă;
- jucătorii eliminați nu mai primesc ture;
- ordinea atacurilor se amestecă la începutul fiecărei runde;
- nu configura numărul rundelor în lobby.

Selectarea țintei:
- jucătorul activ poate ataca doar un teritoriu deținut de alt jucător;
- ținta trebuie să fie vecină cu cel puțin un teritoriu deținut de atacator;
- nu poate ataca propriile teritorii;
- nu poate ataca teritorii neutre;
- serverul validează adiacența pe graful geografic;
- timer selectare atac: 15 secunde;
- dacă timerul expiră, serverul selectează automat o țintă validă;
- dacă nu există ținte valide, tura este sărită fără puncte pierdute.

Duelul:
- Atacatorul și apărătorul primesc aceeași întrebare, în același timp.
- Nu le dezvălui răspunsurile celuilalt înainte de închiderea întrebării.
- Întrebarea grilă durează 12 secunde; întrebarea numerică 10 secunde.
- Răspunsul poate fi trimis o singură dată.
- Dacă ambii răspund corect la o întrebare grilă, începe o întrebare numerică de departajare, comună ambilor.
- Dacă întrebarea inițială este numerică, câștigă răspunsul cu diferența absolută cea mai mică față de valoarea corectă; la egalitate, timpul mai scurt câștigă.

Rezultate:
A. Atacator corect, apărător greșit sau fără răspuns:
- atacatorul câștigă;
- teritoriul normal trece la atacator;
- valoarea teritoriului devine 400;
- apărătorul pierde valoarea veche și bonusul defensiv al regiunii, dacă exista.

B. Atacator greșit/fără răspuns, apărător corect:
- apărătorul păstrează teritoriul;
- se acordă bonus defensiv de 100 puncte conform regulii curente din proiect;
- bonusul trebuie evidențiat separat de valoarea teritoriului și asociat regiunii apărate;
- bonusul dispare dacă teritoriul respectiv este cucerit ulterior.

C. Ambii răspund greșit sau ambii nu răspund:
- apărătorul păstrează teritoriul;
- nu se acordă bonus.

D. Ambii răspund corect la grilă:
- se pornește întrebarea numerică de departajare;
- răspunsul cel mai apropiat câștigă;
- la egalitate exactă și timp identic, apărătorul păstrează teritoriul.

E. Întrebarea numerică în duel:
- cel mai apropiat câștigă;
- răspunsul absent este exclus din comparație;
- un răspuns valid are prioritate față de lipsa răspunsului;
- la diferență egală, câștigă cel mai rapid;
- la egalitate perfectă, apărătorul păstrează teritoriul.

Regula atacării bazei:
- Fiecare jucător are o bază principală/cetate.
- Cetatea începe cu trei turnuri intacte.
- Dacă atacatorul are cel puțin un teritoriu vecin direct cu baza adversarului, poate ataca acea bază în mai multe runde, dar respectă regula de maximum un atac pe rundă.
- Dacă atacatorul NU are niciun teritoriu vecin direct cu baza adversarului, are o singură încercare asupra acelei baze pe toată durata partidei.
- O încercare la distanță se consumă numai când serverul validează atacul și pornește efectiv întrebarea, nu la un click invalid.
- Dacă vecinătatea directă se obține ulterior, aplică regula vecinului direct pentru atacurile permise în continuare; păstrează totuși istoricul încercării la distanță.
- Fiecare atac câștigat împotriva cetății distruge exact un turn.
- Cetatea nu cade după un singur atac. Sunt necesare trei atacuri câștigate pentru distrugerea tuturor turnurilor.
- Când toate cele trei turnuri sunt distruse, proprietarul cetății este eliminat.
- Toate teritoriile jucătorului eliminat, inclusiv baza, sunt transferate atacatorului.
- Păstrează numărul de teritorii și scorul corect după transfer. Nu număra baza de două ori și nu transfera aceeași regiune de două ori.
- Cetatea trebuie să arate clar trei turnuri, iar cele distruse trebuie desenate ca distruse.

ATENȚIE – PUNCTAJUL ATACULUI ASUPRA CETĂȚII:
În codul auditat, fiecare lovitură reușită asupra cetății adaugă atacatorului +400 puncte chiar dacă regiunea de bază nu a fost încă transferată. La distrugerea ultimului turn, atacatorul mai primește și valoarea bazei (1000). Verifică această regulă și fă punctajul explicit în UI și teste. Nu dubla accidental punctele. Punctajul de 400 pentru cucerirea unui teritoriu normal nu trebuie aplicat de două ori aceleiași regiuni. Dacă păstrezi 400 pentru fiecare turn doborât, definește-l separat ca bonus de asediu și explică-l în regulamentul jocului.

4.8. Sfârșitul jocului

Jocul se termină când:
- rămâne un singur jucător activ cu teritorii, ca urmare a eliminărilor; sau
- se termină cele șase runde de război; sau
- nu mai există nicio acțiune validă și motorul decide în mod determinist că partida este încheiată.

La terminarea rundelor, câștigă jucătorul eligibil cu cel mai mare scor.
Dacă există egalitate la scor, folosește o întrebare numerică de departajare între jucătorii aflați la egalitate.

Ecranul final trebuie să afișeze:
- câștigătorul;
- clasamentul tuturor participanților;
- punctajul final;
- numărul de teritorii;
- răspunsurile corecte și greșite;
- atacuri câștigate;
- apărări reușite;
- turnurile distruse;
- durata partidei;
- harta finală cu toate teritoriile colorate.

======================================================================
5. HARTA ROMÂNIEI – PRIORITATE FOARTE MARE
======================================================================

Problema actuală:
server/romaniaMapData.ts conține coordonate și poligoane introduse manual. Harta este schematică și nu respectă suficient forma reală a României sau a județelor. Normalizarea vecinătăților din cod nu transformă poligoanele desenate manual în date geografice reale.

Cerința:
Înlocuiește harta manual desenată cu date GeoJSON reale ale județelor României.

Sursă recomandată:
https://geo-spatial.org/descarcare/date/administrative-boundaries/

Pe pagina respectivă există stratul „Județe, România (poligon)”, cod `ro_admin_county_polygon`, descris ca set de limite oficiale ale județelor, procesat pe baza datelor publice ANCPI. Pagina menționează că versiunea curentă reflectă organizarea administrativ-teritorială din 2025. Descarcă formatul GeoJSON sau GeoPackage și verifică metadatele/licența înainte de includerea fișierului în proiect.

Nu folosi stratul UAT dacă există deja stratul de județe. Pentru joc, pornește de la poligoanele județelor.

Implementare:
1. Descarcă și păstrează fișierul sursă în directorul proiectului, de exemplu `data/geo/romania-counties.geojson`.
2. Adaugă o notă cu sursa, data descărcării, versiunea și condițiile de utilizare/atribuire.
3. Verifică proiecția coordonatelor și transformă datele într-o proiecție adecvată pentru desenarea SVG.
4. Nu modifica arbitrar conturul României.
5. Folosește toate județele și Bucureștiul conform setului de date.
6. Construiește teritorii de joc prin gruparea unor județe adiacente.
7. Fiecare teritoriu de joc trebuie să fie compact geografic și conectat topologic; nu grupa două județe neadiacente în același teritoriu.
8. Grupurile trebuie să acopere întreaga țară exact o dată: fără județe omise, fără suprapuneri și fără goluri.
9. Pentru 3 jucători trebuie să rezulte exact 15 teritorii, pentru 2 jucători 10, pentru 4–5 jucători 25, iar pentru 6–10 jucători 29.
10. Dacă un grup conține mai multe județe, unește geometria lor într-un multipolygon valid pentru teritoriul de joc. Păstrează granițele interne ale județelor numai dacă sunt utile vizual; granițele teritoriale de joc trebuie să fie clar mai vizibile.
11. Calculează punctul pentru etichetă cu point-on-surface sau metodă echivalentă care garantează că textul rămâne în interiorul poligonului.
12. Generează automat vectorul de vecinătate din geometrie. Două teritorii sunt vecine numai dacă împart o porțiune reală de frontieră; simpla atingere într-un singur punct nu trebuie să creeze vecinătate.
13. Vecinătățile trebuie să fie simetrice: dacă A este vecin cu B, B este vecin cu A.
14. Nu hardcoda separat vecinătățile în frontend și backend. Generează datele o singură dată și folosește-le în motorul jocului.
15. Adaugă teste pentru conectivitatea fiecărui teritoriu, acoperirea completă a județelor, absența suprapunerilor și consistența grafului.

Design vizual conform capturii `image_b5a87907.png`:
- hartă centrală, cu silueta reală a României;
- fundal cald, discret, cu aspect de pergament/relief;
- teritorii cu contururi vizibile;
- culori diferite pentru fiecare jucător;
- cetate/medalion pentru baza fiecărui jucător;
- trei turnuri distincte pe fiecare bază;
- hașură pentru teritoriul selectat;
- săgeată albastră de selecție/atac;
- etichetele să fie lizibile, fără suprapunere excesivă;
- nu deforma România pentru a încăpea etichetele. Mută etichetele în interior sau folosește callout-uri.

Punctaje pe hartă:
- NU afișa punctaje pe teritoriile neutre.
- Nici când un teritoriu neutru este selectat și hașurat nu afișa punctajul.
- După răspuns corect și atribuirea proprietății, afișează punctajul real al acelui teritoriu.
- La schimbarea proprietarului, actualizează punctajul și culoarea imediat.
- Nu afișa un punctaj temporar înainte de rezolvarea întrebării.

Mobile:
- harta trebuie să poată fi mărită și deplasată;
- zonele trebuie să rămână apăsabile;
- păstrează aspectul real, nu folosi o imagine statică în locul hărții interactive;
- butoanele și etichetele nu trebuie să blocheze selecția poligoanelor.

======================================================================
6. SISTEMUL DE ÎNTREBĂRI – CALITATE ȘI VOLUM
======================================================================

Starea măsurată în copia auditată era de numai 100 întrebări: 62 grilă și 38 numerice. Acest număr este insuficient pentru partide repetate, mai ales dacă nu permitem repetarea în timpul aceluiași meci.

Obiectiv:
- minimum 5.000 de întrebări verificate pentru prima versiune consistentă;
- arhitectură care poate crește la 25.000+ întrebări;
- întrebări în limba română, cu diacritice;
- majoritatea întrebărilor de nivel mediu și greu, dar accesibile unui jucător obișnuit cu o cultură generală bună.

Distribuție recomandată:
- aproximativ 10% ușoare;
- aproximativ 55% medii;
- aproximativ 35% grele.

Nu face întrebările grele prin formulare încâlcită. Ele trebuie să testeze cunoștințe reale, nu capacitatea de a interpreta un enunț confuz.

Categorii disponibile în proiect:
- istorie;
- geografie;
- biologie;
- fizică;
- chimie;
- matematică;
- literatură;
- artă;
- sport;
- muzică;
- cinematografie;
- cultură generală;
- tehnologie;
- informatică.

Poți adăuga categorii numai dacă sunt utile și sunt implementate consecvent în tipuri, backend, admin și frontend. Camera trebuie să permită gazdei să selecteze una sau mai multe categorii. Dacă nu selectează nimic, folosește toate categoriile active.

6.1. Format întrebare grilă

Fiecare întrebare trebuie să conțină:
- ID unic;
- tip `choice`;
- categorie;
- dificultate;
- text clar;
- exact patru variante;
- exact un răspuns corect;
- explicație scurtă și utilă;
- URL sursă verificabil;
- data verificării;
- stare editorială (draft / verified / disabled, sau echivalent).

Variantele trebuie să fie plauzibile și similare ca lungime. Nu folosi o variantă evident mult mai lungă decât celelalte, fiindcă poate dezvălui răspunsul.

Nu permite variante duplicate. Nu permite două răspunsuri corecte. Nu permite răspunsuri dependente de interpretări.

Amestecă ordinea variantelor la fiecare utilizare, dar trimite aceeași ordine tuturor participanților din aceeași confruntare. Indexul răspunsului corect trebuie recalculat după amestecare.

Nu trimite cheia corectă în payload-ul clientului înainte de rezolvarea întrebării.

6.2. Format întrebare numerică

Fiecare întrebare trebuie să conțină:
- ID unic;
- tip `estimation`;
- categorie;
- dificultate;
- text clar;
- `targetNumber` numeric și finit;
- unitate (ani, km, metri, kg, grade etc.), dacă există;
- explicație;
- sursă verificabilă;
- data verificării;
- toleranță pentru întrebările folosite la cucerire, dacă sunt acceptate acolo.

Acceptă numere negative și zecimale. Acceptă separator zecimal punct sau virgulă. Nu interpreta separatorul de mii în mod ambiguu.

Tastatura numerică trebuie să accepte:
- cifre 0–9;
- semnul minus;
- separator zecimal;
- ștergerea ultimului caracter;
- resetarea întregului input;
- trimitere.

Trebuie să funcționeze atât tastatura virtuală, cât și tastatura fizică. Nu trimite automat zero când câmpul este gol.

În Faza II și în departajările numerice, câștigă răspunsul cu distanța absolută minimă față de valoarea corectă.

În Faza I, dacă folosești o întrebare numerică pentru un singur jucător, nu folosi formula globală arbitrară de 15% din valoare. Adaugă o toleranță definită pentru fiecare întrebare (toleranță absolută și/sau procentuală) sau folosește numai întrebări grilă pentru cucerire. Varianta aleasă trebuie să fie consecventă și testată.

6.3. Verificarea factuală

Nu genera întrebări în masă și nu le considera automat corecte.

Pentru fiecare întrebare:
- verifică răspunsul dintr-o sursă de încredere;
- păstrează URL-ul sursei;
- păstrează data verificării;
- pentru informații care se pot schimba, menționează anul de referință în întrebare;
- evită statistici volatile fără dată;
- evită subiectele cu răspunsuri disputate dacă întrebarea nu precizează perspectiva;
- evită date istorice/științifice imprecise;
- evită ambiguitatea gramaticală;
- evită traducerile literale ciudate.

Întrebările cu status `draft` sau `disabled` nu trebuie selectate în joc. Doar întrebările verificate pot fi folosite pentru meciuri.

6.4. Duplicări și distribuție

- Nu repeta aceeași întrebare în aceeași partidă.
- Nu introduce duplicate identice cu ID-uri diferite.
- Normalizează textul pentru verificarea duplicatelor (diacritice, spații, semne de punctuație și majuscule).
- Verifică duplicatele și prin similaritate semantică atunci când este posibil.
- Distribuie întrebările echilibrat pe categorii și dificultăți.
- Evită să apară 5 întrebări la rând din aceeași subcategorie dacă există alte întrebări disponibile.
- Nu epuiza toate întrebările numerice la începutul unui meci.
- Păstrează un istoric `usedQuestionIds` pentru fiecare meci.
- Nu declara că există 5.000 sau 25.000 de întrebări dacă numărul măsurat nu confirmă acest lucru.

6.5. Epuizarea întrebărilor

Înainte de începerea meciului, verifică dacă setul de categorii ales are suficiente întrebări grilă și numerice pentru toate fazele. Dacă nu, avertizează gazda înainte să pornească.

Dacă o categorie are prea puține întrebări numerice pentru alocare/departajare, nu lăsa meciul să se oprească în mijlocul jocului cu un mesaj generic. Oferă o soluție controlată: avertizare înainte de Start, selectarea automată a altor categorii numai cu aprobarea gazdei sau oprirea curată a pregătirii.

Nu repeta întrebări în aceeași partidă doar pentru a ascunde o bancă insuficientă.

6.6. Panou de administrare

Adminul trebuie să poată:
- lista și căuta întrebările;
- filtra după categorie, tip, dificultate și status;
- adăuga/editare/dezactiva întrebări;
- importa JSON/CSV;
- vedea erorile de validare înainte de import;
- vedea întrebările duplicate;
- marca o întrebare ca verificată numai după verificarea sursei;
- exporta banca de întrebări;
- raporta o întrebare ca suspectă/incorectă și a o dezactiva.

Importul trebuie să valideze fiecare rând. Un lot invalid nu trebuie să corupă baza existentă. Raportează numărul de înregistrări importate, respinse, duplicate și motivul respingerii.

======================================================================
7. TIMER, RĂSPUNSURI ȘI SINCRONIZARE
======================================================================

Durate fixe, nedisponibile ca setare în lobby:
- selectare bază: 15 secunde;
- selectare teritoriu în Cucerire: 15 secunde;
- selectare țintă de atac: 15 secunde;
- selectare teritoriu după câștigarea alocării: 15 secunde;
- întrebare grilă: 12 secunde;
- întrebare numerică: 10 secunde.

Serverul este singura autoritate asupra timpului.

Fiecare întrebare/acțiune trebuie să aibă un ID unic, `startedAt` și `deadline` / `expiresAt`.

Clientul doar animă timpul rămas pe baza deadline-ului primit de la server. Nu lăsa fiecare client să își creeze propriul timer cu durata completă, fiindcă ar exista decalaje.

Bara de timp trebuie să scadă fluid, ideal cu requestAnimationFrame sau cu animație CSS bazată pe deadline. Nu actualiza întreaga stare React la fiecare 30 ms doar pentru animație dacă se poate evita. Timerul numeric poate afișa secundele rămase, dar bara vizuală trebuie să fie continuă și netedă.

Reguli răspuns:
- un singur răspuns per jucător per întrebare;
- răspunsurile primite după deadline sunt respinse;
- răspunsurile pentru altă întrebare sau alt meci sunt respinse;
- lipsa răspunsului este o stare distinctă `NO_RESPONSE`;
- `NO_RESPONSE` nu trebuie convertit în numărul 0;
- nu permite modificarea răspunsului după trimitere;
- serverul verifică cine are dreptul să răspundă în contextul curent.

Închiderea anticipată:
- în cucerire, întrebarea poate fi rezolvată imediat după răspunsul jucătorului activ;
- în război, trebuie așteptate răspunsurile ambilor participanți sau timeout-ul;
- în alocare, trebuie așteptate răspunsurile tuturor jucătorilor activi sau timeout-ul;
- nu închide întrebarea după primul răspuns dacă mai există participanți care trebuie să răspundă;
- când toți participanții necesari au răspuns, oprește timerul și rezolvă imediat.

Pentru reconectare:
- nu reseta timerul;
- nu porni întrebarea de la zero;
- trimite clientului starea curentă și deadline-ul existent;
- păstrează răspunsul deja trimis de jucător;
- o deconectare nu trebuie să transforme răspunsul în răspuns corect sau să acorde puncte.

Verifică separat conexiunea de dezvoltare Vite HMR și conexiunea Socket.IO a jocului. Mesajul observat anterior `WebSocket closed without opened` provenea de la `/@vite/client` și nu dovedește singur că Socket.IO multiplayer este defect.

======================================================================
8. INTERFAȚĂ ȘI FLUXUL MENIULUI
======================================================================

8.1. Meniul principal

Nu vreau un buton generic „Joacă acum” care să bage automat utilizatorul într-un meci public aleatoriu.

Păstrează:
- creare cameră;
- intrare într-o cameră cu cod;
- lista camerelor publice, dacă aceasta este funcțională;
- joc contra AI printr-un ecran/modal de configurare;
- profil/statistici și clasament numai dacă valorile sunt reale.

Modul AI poate rămâne. Nu îl transforma într-un matchmaking public instant. Setarea implicită recomandată pentru AI este 2 boți (3 participanți în total), dar utilizatorul poate schimba numărul de boți.

8.2. Crearea camerei

Gazda poate seta:
- numărul total de participanți (2–10);
- categoriile din care vor veni întrebările;
- publică/privată, dacă sunt păstrate ambele variante.

Gazda NU trebuie să poată seta:
- numărul de runde;
- numărul fazelor;
- punctajele;
- timer-ele;
- regulile de bază;
- durata războiului.

Acestea sunt aceleași în toate meciurile și sunt definite în configurația serverului.

Dacă nu sunt selectate categorii, se folosesc toate categoriile active. Nu permite o selecție care lasă banca fără întrebări numerice sau grilă suficiente.

8.3. Lobby

Afișează:
- numele camerei;
- codul de acces;
- participanții și culorile lor;
- numărul de locuri ocupate / total;
- Ready / Not Ready;
- categoriile alese;
- opțiunile de adăugare boți pentru gazdă;
- buton de Start pentru gazdă;
- chat-ul camerei, dacă este funcțional.

Nu afișa setări de runde sau timer.

Jocul începe numai când există cel puțin doi participanți și condițiile de Ready sunt îndeplinite. Botii sunt considerați gata. Doar gazda poate porni meciul.

8.4. Bara fazelor și RoundTracker

Păstrează referința vizuală din `image_866cb06b.png`: bară brună/bronz, sloturi rotunjite, marcaje colorate pentru jucători și indicator clar al rundei active.

Afișează permanent:
- Faza I – Cucerire;
- Faza II – Împărțire;
- Faza III – Război;
- faza curentă evidențiată;
- fazele terminate marcate;
- fazele viitoare dezactivate;
- runda curentă și numărul total, când numărul este fix;
- jucătorul activ;
- câte ture mai sunt pentru jucătorii activi.

Etapa de alegere a bazei trebuie afișată separat, înainte de Faza I.

În Faza II, nu folosi un număr aproximativ de runde care devine greșit dacă o întrebare nu are câștigător. Afișează numărul de teritorii neutre rămase și întrebările de alocare rezolvate.

În Faza III, arată cele 6 runde și progresul fiecărui jucător. Marchează jucătorii eliminați și nu îi mai număra în turele viitoare.

8.5. Harta

Harta este elementul central al paginii. Nu o micșora excesiv pe desktop și nu ascunde harta în spatele modalului pe tot ecranul decât dacă este necesar pe mobil.

La selecție:
- hașură vizibilă;
- săgeată/indicator albastru;
- highlight clar;
- fără punctaj pentru teritoriu neutru.

La alocare:
- culoare proprietar;
- punctaj afișat;
- animație discretă de cucerire;
- actualizare HUD în același timp pentru toți.

8.6. Modalul întrebării

Întrebare grilă:
- text lizibil;
- patru variante mari și ușor de apăsat;
- timer continuu;
- o singură selecție;
- după închidere, răspuns corect, răspunsul propriu și explicația.

Întrebare numerică:
- input numeric;
- tastatură virtuală;
- acceptare tastatură fizică;
- semn minus;
- separator zecimal punct/virgulă;
- backspace;
- reset;
- trimitere;
- unitate de măsură afișată clar.

În timpul unei întrebări de duel, ambii participanți trebuie să vadă atacatorul, apărătorul și teritoriul disputat. Nu afișa răspunsul adversarului înainte de rezolvare.

======================================================================
9. AUTENTIFICARE, GUEST ȘI SOCIAL
======================================================================

Păstrează două modalități:
- intrare ca guest fără cont;
- cont normal cu email și parolă.

Guest:
- generează un nume disponibil;
- nu crea nume duplicate în aceeași cameră;
- păstrează identitatea cât timp sesiunea este activă;
- permite reconectarea în aceeași partidă;
- nu permite manipularea identității prin payload Socket.IO.

Cont:
- email valid;
- parolă hash-uită cu bcrypt;
- token/sesiune validă;
- resetare parolă doar dacă este implementată sigur;
- rol admin verificat pe server.

În arhiva auditată, câmpul placeholder de Login menționa texte de tip `admin` sau `vlad@conquiz.ro`, deși conturile demo au fost eliminate. Corectează placeholder-ul și orice instrucțiune de autentificare care sugerează credențiale inexistente.

Nu păstra parole sau conturi demo publice.

Social:
- prietenii și cererile pot rămâne;
- invitația directă la meci trebuie să funcționeze efectiv sau să fie dezactivată clar;
- în copia analizată, acțiunea de provocare a prietenului afișa doar un alert cu textul că va fi disponibilă ulterior. Nu prezenta funcționalitatea ca terminată.

======================================================================
10. CE TREBUIE CURĂȚAT DIN SHOP / LEVEL / PROGRESIE
======================================================================

Utilizatorul nu dorește:
- shop;
- bani/monede/galbeni;
- XP;
- level;
- avataruri cumpărabile;
- rame cumpărabile;
- misiuni zilnice;
- achievements cosmetice;
- recompense legate de monetizare.

Verifică în proiectul curent și elimină resturile din:
- rute React;
- linkuri Navbar;
- pagini și componente;
- endpointuri backend;
- tipuri TypeScript;
- schema persistentă;
- seed-uri;
- modele și metode DB;
- texte și instrucțiuni din dashboard;
- obiecte de recompensă la final de joc.

Nu șterge profilul, statisticile de meci sau clasamentul dacă sunt folosite și funcționează real. Nu păstra însă indicatori falși sau cosmetici.

Ratingul/Elo poate rămâne numai dacă este calculat real. Dacă nu există calcul real, nu afișa o valoare ca și cum ar fi competitivă.

În copia auditată, DashboardView afișa un loc în clasament calculat artificial (`Loc #1` dacă ratingul depășește 1400, altfel `Loc #3`). Acest loc este fals și trebuie eliminat sau înlocuit cu poziția reală obținută din endpointul de clasament.

======================================================================
11. BUGURI / INCONSISTENȚE CONCRETE DE VERIFICAT ÎN CODUL ACTUAL
======================================================================

Această listă vine din auditul arhivei furnizate. Verifică dacă fiecare problemă există încă în workspace. Dacă a fost deja reparată ulterior, nu o reintroduce.

P0 – SECURITY / CORECTITUDINE MULTIPLAYER

[ ] Verifică faptul că răspunsul corect, targetNumber și explicația nu sunt trimise către clienți înainte de rezolvarea întrebării.
[ ] Verifică toate endpointurile publice de întrebări: niciun endpoint pentru user normal nu trebuie să returneze cheia răspunsului corect înainte de rezolvare.
[ ] Verifică autentificarea Socket.IO: identitatea vine din tokenul verificat pe server, nu din `data.user`, `data.username`, `data.avatar` sau alte câmpuri trimise de client.
[ ] Verifică rolurile admin numai din sesiunea verificată pe server.
[ ] Verifică faptul că un jucător nu poate trimite răspuns în numele altui jucător.
[ ] Verifică faptul că un client nu poate trimite scor, proprietar de teritoriu, fază, deadline, rundă sau răspuns corect.
[ ] Verifică rate limiting pe autentificare, creare cont, endpoints administrative și evenimente de joc sensibile.
[ ] Verifică validarea și limitarea lungimii payloadurilor Socket.IO.
[ ] Verifică CORS/allowed origins pentru producție.
[ ] Verifică secretul JWT: fără fallback implicit slab în producție.
[ ] Elimină orice cont demo sau credențială publică.

P1 – MOTORUL DE JOC

[ ] Verifică tranzițiile între `waiting`, `base_selection`, `conquest`, `allocation`, `war`, `finished`.
[ ] Nu permite pornirea jocului de două ori.
[ ] Nu permite join după start.
[ ] Nu permite add/remove bot după start.
[ ] Nu permite schimbarea Ready după start.
[ ] Nu permite unui jucător să selecteze teritoriu dacă nu este rândul lui.
[ ] Nu permite selecții invalide să reseteze sau să anuleze timerul.
[ ] Nu permite să pornească două întrebări în același timp în aceeași cameră.
[ ] Nu permite ca aceeași întrebare să fie rezolvată de două ori.
[ ] Nu permite răspunsuri după deadline.
[ ] Nu permite două răspunsuri de la același participant.
[ ] În alocare, așteaptă toți jucătorii activi, nu doar primul răspuns.
[ ] În duel, așteaptă atacatorul și apărătorul sau timeout-ul.
[ ] În cucerire, doar jucătorul activ răspunde.
[ ] În alocare, întrebarea trebuie să fie numerică.
[ ] Când toți au răspuns, întrebarea se poate închide instant; nu aștepta inutil restul timerului.
[ ] Când lipsește un răspuns, folosește `NO_RESPONSE`, nu 0.
[ ] Într-un duel numeric fără răspuns din partea ambilor, apărătorul păstrează teritoriul fără bonus.
[ ] Verifică dacă apărătorul primește +100 doar când răspunde corect, iar atacatorul greșește/lipsește; nu acorda bonus când amândoi lipsesc.
[ ] Verifică scăderea corectă a punctelor la pierderea unui teritoriu.
[ ] Verifică faptul că bonusul defensiv este legat de teritoriul apărat și se anulează numai când acea regiune este pierdută.
[ ] Verifică transferul teritoriilor la eliminarea unui jucător. Nicio regiune nu trebuie să fie pierdută, dublată sau numărată de două ori.
[ ] Verifică eliminarea numai după distrugerea celor trei turnuri ale cetății.
[ ] Verifică faptul că o bază nu poate fi capturată complet printr-o singură întrebare.
[ ] Verifică limita de o încercare la distanță asupra bazei și atacurile repetate când există vecinătate directă.
[ ] Verifică dacă încercarea la distanță este consumată doar după validarea atacului.
[ ] Verifică limita de un atac per jucător per rundă în Război.
[ ] Verifică amestecarea ordinii jucătorilor în fiecare rundă.
[ ] Verifică skip-ul jucătorilor eliminați.
[ ] Verifică situația în care un jucător nu are niciun teritoriu atacabil.
[ ] Verifică situația în care rămâne un singur jucător cu teritorii.
[ ] Verifică sfârșitul jocului după ultima rundă.

P1 – TIMER / ÎNTREBĂRI

[ ] Toate timer-ele sunt validate de server.
[ ] Clientul afișează timpul pe baza deadline-ului primit.
[ ] Bara de timp este fluidă, fără salturi vizibile.
[ ] Timerul nu se resetează la reconectare.
[ ] Timerul nu se resetează când un utilizator trimite o selecție invalidă.
[ ] Timer-ele unei camere nu afectează altă cameră.
[ ] La închiderea întrebării, toate timeout-urile și AI timers aferente sunt curățate.
[ ] La terminarea meciului, toate timer-ele camerei sunt curățate.
[ ] La ștergerea camerei, nu rămân timere orfane.
[ ] Nu afișa răspunsul corect înainte de închiderea întrebării.
[ ] Verifică întrebările duplicate și epuizarea băncii.
[ ] Înainte de Start, verifică dacă domeniile alese au întrebări suficiente din tipurile necesare.
[ ] Nu termina în mod neașteptat partida doar pentru că s-a epuizat întâmplător o categorie; previne situația la Start sau tratează controlat.

P1 – HARTĂ

[ ] Confirmă că `romaniaMapData.ts` nu mai folosește poligoanele desenate manual.
[ ] Verifică dacă geometria provine din GeoJSON județe ANCPI/geo-spatial.org.
[ ] Verifică toate seturile 10, 15, 25 și 29.
[ ] Verifică numărul exact de teritorii pentru fiecare număr de jucători.
[ ] Verifică faptul că toate județele sunt acoperite exact o dată.
[ ] Verifică fiecare teritoriu să fie compact și conectat.
[ ] Verifică relațiile de vecinătate: fără auto-vecin, fără referințe inexistente, simetrice, fără vecinătate doar prin punct.
[ ] Verifică etichetele să fie în poligon.
[ ] Verifică forma României vizual în browser la zoom normal și pe mobil.
[ ] Verifică faptul că punctajele neutrelor nu apar nici la hover, nici la selectare.
[ ] Verifică hașura, săgeata, culorile și turnurile.

P2 – INTERFAȚĂ / UX

[ ] Nu adăuga buton de matchmaking public instant „Joacă acum”.
[ ] Păstrează opțiunea configurabilă de joc contra AI.
[ ] Setează implicit 3 participanți în total pentru cameră și AI, păstrând opțiunea 2–10.
[ ] Elimină selectorul de runde din orice formular de creare cameră.
[ ] Păstrează selectorul de categorii.
[ ] Verifică dacă lista camerelor publice se actualizează; dacă nu, adaugă refresh controlat sau evenimente de actualizare.
[ ] Corectează locul fals #1/#3 de pe dashboard.
[ ] Corectează textul de Login care sugerează conturi demo inexistente.
[ ] Verifică toate butoanele și acțiunile fără funcționalitate.
[ ] În copia analizată, provocarea unui prieten afișa doar un alert. Implementează invitația reală sau dezactivează controlul și etichetează funcția ca neimplementată.
[ ] Asigură responsive pe desktop, tabletă și telefon.
[ ] Nu ascunde HUD-ul important pe mobil: fază, rundă, timer, scor și jucător activ trebuie să rămână ușor vizibile.

P2 – PERSISTENȚĂ ȘI REZULTATE

[ ] Starea meciurilor active este momentan în Map-ul din GameManager. Decide și implementează comportamentul la restart: fie persistă meciurile active, fie le marchează clar ca întrerupte și permite reluare/restart fără date corupte.
[ ] JSON DB face scrieri sincronizate în fișier. Protejează scrierile împotriva coruperii/overwrite concurent; folosește scriere atomică temporară + rename sau treci la o bază de date reală într-o etapă separată.
[ ] Verifică dacă `endGame()` apelează `db.recordGame()`. În arhiva analizată exista metoda, dar nu am identificat apel din motor. Înregistrează istoricul complet al meciului.
[ ] Actualizează statisticile reale: meciuri, victorii, înfrângeri, punctaj maxim, teritorii, răspunsuri corecte.
[ ] Ratingul Elo trebuie calculat real sau ascuns. Nu lăsa o valoare de 1200 care nu se schimbă și nu o prezenta ca rating competitiv real.
[ ] Păstrează istoricul meciurilor, inclusiv participanții, rezultatele, durata și scorul final.
[ ] Nu salva parole în clar.
[ ] Nu salva răspunsurile corecte în snapshotul clientului înainte de finalizarea întrebării.

======================================================================
12. OBSERVAȚII CONCRETE DIN FIȘIERELE ARHIVEI
======================================================================

Verifică atent următoarele zone, deoarece au apărut diferențe sau comportamente care necesită atenție:

A. server/gameEngine.ts
- Este motorul central.
- Conține `games: Map`, `questionTimers`, `selectionTimers`, `turnAdvanceTimers` și timere AI.
- Verifică să nu existe timere care supraviețuiesc după tranziții.
- Verifică toate tranzițiile și toate cazurile de răspuns absent.
- Verifică `finishForQuestionExhaustion`: o lipsă de întrebări nu trebuie să încheie surprinzător o partidă care ar fi putut fi prevenită prin validarea băncii la Start.
- Verifică `triggerNextAllocationQuestion`: contorul `round` crește la fiecare întrebare, inclusiv la retry după lipsa răspunsurilor. RoundTracker nu trebuie să prezinte această valoare ca număr fix de teritorii/rounds dacă se poate depăși.
- Verifică punctajul atacurilor asupra bazei: codul auditat adăuga +400 la fiecare turn distrus și apoi +1000 la căderea bazei. Confirmă că acesta este comportamentul dorit și că nu se numără punctele de două ori.
- Verifică faptul că player/territory counts și scores sunt recalculabile din sursa de adevăr (teritorii + bonusuri), nu doar incrementate/decrementate în moduri care pot desincroniza.

B. src/game/rules.ts
- Este sursa principală pentru reguli pure.
- Păstrează o singură implementare pentru scoring, base selection, adjacency și battle resolution.
- Asigură-te că motorul backend nu reimplementează diferit aceleași reguli.
- Testează grafuri de vecinătate incorecte și hărți la toate dimensiunile.
- Confirmă că `canCompleteBaseSelection` găsește o combinație legală de baze pentru toți jucătorii.
- Verifică limitele formulei de rundă: minimum 4, maximum 5 pentru Faza I.

C. server/romaniaMapData.ts
- În starea auditată era încă schematică, cu poligoane text scrise manual.
- Înlocuiește sursa geometrică, nu încerca să repari doar CSS-ul.
- Fă ca datele de vecinătate să fie generate pe baza geometriei.

D. server/questionsData.ts și data/conquiz_db.json
- ID-urile seed trebuie să fie stabile și să nu se ciocnească cu ID-urile custom.
- Nu suprascrie întrebările userului cu seed-uri diferite.
- Nu păstra ID comun pentru două întrebări cu text diferit.
- Nu păstra două întrebări aproape identice.
- Nu afișa întrebări `draft` sau dezactivate.
- Banca măsurată de 100 nu este suficientă; construiește pipeline de extindere și verificare.

E. src/components/QuestionModal.tsx
- Verifică input numeric pentru valori negative/zecimale.
- Verifică virgula și punctul zecimal.
- Verifică Enter/Submit.
- Verifică faptul că butonul virtual și tastatura fizică editează același state.
- Verifică resetarea inputului la o întrebare nouă.
- Verifică blocarea după submit.
- Verifică faptul că un spectator nu poate răspunde.
- Verifică că un răspuns absent nu este afișat drept 0.

F. src/components/RoundTracker.tsx și src/components/GameHUD.tsx
- RoundTracker trebuie să reflecte starea de joc, nu să calculeze independent runde aproximative.
- Pentru bază: arată câte alegeri de bază au mai rămas.
- Pentru Cucerire: arată runda și turele rămase.
- Pentru Alocare: arată întrebările rezolvate și teritoriile neutre rămase.
- Pentru Război: arată runda din 6, jucătorii care au atacat și jucătorul activ.
- HUD-ul trebuie să arate timerul de selecție când nu este întrebare activă și timerul întrebării când există întrebare activă.
- Timerul să fie fluid, iar numărul secundelor să nu pâlpâie.

G. src/components/RomaniaMap.tsx
- Verifică randarea MultiPolygon/Polygon după noua sursă GeoJSON.
- Nu mai presupune că fiecare teritoriu este un singur string SVG manual.
- Asigură selecția touch pe mobil.
- Ascunde score pentru ownerId === null.
- Afișează scor numai pentru teritorii ocupate.
- Afișează cetatea numai pe teritoriul de bază.
- Afișează turnurile distruse corect.

H. src/views/DashboardView.tsx
- Păstrează butoanele de creare cameră, intrare cu cod, AI configurabil.
- Nu adăuga buton generic de matchmaking public „Joacă acum”.
- Selectorul de categorii trebuie să fie clar.
- Default recomandat: 3 participanți total.
- Elimină locul în clasament hardcodat.
- Actualizează textul despre joc astfel încât să reflecte cele trei faze reale.

I. src/App.tsx și src/services/socket.ts
- Verifică reconnect și refresh de pagină.
- Verifică actualizarea corectă a tabului între lobby și game.
- Verifică listener cleanup pentru evenimente Socket.IO.
- Verifică să nu se atașeze listener-ele de mai multe ori.
- Verifică că identitatea curentă este cea validată de backend, nu obiectul trimis de frontend.

J. server/db.ts
- Este o persistență JSON.
- Verifică seed-urile și migrarea de câmpuri vechi.
- Nu șterge întrebările userului.
- Scrierea fișierului trebuie să fie atomică.
- Evită crearea de admin implicit cu parole publice.
- Verifică salvarea meciurilor în istoric.

K. server.ts / package.json / vite.config.ts
- Verifică portul din env (`PORT`) pentru instalarea în Docker, dacă urmează deploy.
- Verifică Vite HMR separat de WebSocket multiplayer.
- Rulează build-ul de producție, nu doar `dev`.
- Fixează warningurile Vite care pot deveni erori la versiuni viitoare, dar nu modifica configurația fără motiv.

======================================================================
13. AI-UL DIN JOC
======================================================================

Păstrează adversarii AI, dar fă-i să respecte aceleași reguli ca oamenii.

AI-ul trebuie să:
- aleagă numai baze valide;
- respecte regula teritoriilor tampon;
- cucerească numai teritorii neutre adiacente;
- participe la alocare cu un răspuns numeric;
- aleagă un teritoriu neutru doar după ce a câștigat întrebarea de alocare;
- atace numai ținte valide;
- respecte numărul maxim de atacuri per rundă;
- respecte regula de atac asupra bazei;
- nu poată modifica scorul, timerul sau starea jocului;
- răspundă prin aceeași funcție `submitAnswer` folosită de jucători.

Dificultățile pot fi:
- Începător;
- Intermediar;
- Avansat;
- Expert.

Dificultatea schimbă probabilitatea răspunsului corect și viteza de răspuns, dar nu oferă AI-ului avantaje de joc. Nu trimite cheia răspunsului către clientul uman. Logica de răspuns a botului rămâne strict pe server.

AI-ul nu trebuie să ia decizii ilegale dacă nu are teritorii valide; tura se sare.

======================================================================
14. TESTARE – ACCEPTANCE TESTS OBLIGATORII
======================================================================

Nu considera proiectul gata până când următoarele teste nu trec.

TEST 01 – CONFIGURAȚIA HĂRȚII
- 2 jucători: 10 teritorii.
- 3 jucători: 15 teritorii.
- 4 jucători: 25 teritorii.
- 5 jucători: 25 teritorii.
- 6–10 jucători: 29 teritorii.
- Nicio regiune nu lipsește și niciuna nu este duplicată.

TEST 02 – ALEGEREA BAZELOR
- Meci cu 3 jucători, 15 teritorii.
- Fiecare alege câte o bază.
- Nicio bază nu este vecină directă cu alta.
- Vecinii direcți ai unei baze nu pot fi selectați ca alte baze.
- Acei vecini pot fi cuceriți în Faza I.
- Fiecare bază are 1000 puncte și trei turnuri.
- Timeout-ul alege o bază legală.

TEST 03 – CUCERIRE CORECTĂ
- Jucătorul selectează un teritoriu neutru adiacent.
- Răspunde corect.
- Exact acel teritoriu devine al lui.
- Primește 200 puncte.
- Toți clienții văd aceeași actualizare.

TEST 04 – CUCERIRE GREȘITĂ / TIMEOUT
- Jucătorul selectează o regiune și răspunde greșit.
- Regiunea rămâne neutră.
- Nu primește puncte.
- Dacă nu răspunde, NO_RESPONSE, nu zero.
- Tura se consumă.

TEST 05 – SELECȚIE INVALIDĂ
- Jucătorul încearcă un teritoriu ocupat sau neadiacent.
- Serverul respinge selecția.
- Timerul inițial continuă, nu se resetează.
- Nu pornește întrebare.

TEST 06 – FAZA I SE TERMINĂ CORECT
- 3 jucători: 4 runde inițiale.
- 4 jucători: 5 runde inițiale.
- Dacă toate teritoriile sunt ocupate înainte de limită, faza se termină instant.
- Dacă au rămas neutre, începe Faza II.

TEST 07 – ÎMPĂRȚIRE NUMERICĂ
- Toți jucătorii activi văd aceeași întrebare numerică.
- Cel mai apropiat răspuns câștigă.
- La diferență egală, timpul mai scurt câștigă.
- Câștigătorul selectează manual orice teritoriu neutru.
- Primește 300 puncte.
- Un singur teritoriu este acordat per întrebare.
- Dacă nu răspunde nimeni, nu se acordă teritoriu.
- Dacă câștigătorul nu selectează la timp, se selectează automat o regiune neutră.

TEST 08 – TIMER / ÎNCHIDERE ANTICIPATĂ
- În duel se așteaptă ambii jucători.
- În alocare se așteaptă toți participanții activi.
- Dacă toți au răspuns, se închide instant.
- Dacă unul lipsește, se așteaptă timeout.
- Răspunsul după deadline este respins.
- După închiderea întrebării, timerul nu mai rulează.

TEST 09 – ATAC NORMAL
- A atacă o regiune adiacentă a lui B.
- Ambii primesc aceeași întrebare.
- A corect, B greșit: teritoriul trece la A și valorează 400.
- A greșit, B corect: B păstrează și primește +100 bonus defensiv.
- Ambii greșit: B păstrează fără bonus.
- Ambii corect la grilă: departajare numerică.
- Niciun răspuns: apărătorul păstrează fără bonus.

TEST 10 – ATAC ASUPRA BAZEI
- Atacatorul fără vecinătate are o singură încercare la distanță pe baza aceluiași adversar.
- Atacatorul cu vecinătate directă poate ataca baza în mai multe runde, cu maximum un atac pe rundă.
- Fiecare duel câștigat distruge un singur turn.
- După 3 turnuri distruse, apărătorul este eliminat.
- Toate teritoriile apărătorului sunt transferate exact o dată.
- Punctajul nu este dublat.

TEST 11 – RĂZBOI ȘI ELIMINARE
- 6 runde maxime.
- Un atac per jucător activ per rundă.
- Ordinea se schimbă la fiecare rundă.
- Jucătorii eliminați nu mai primesc ture.
- Dacă rămâne un singur jucător cu teritorii, jocul se termină.
- Dacă se termină cele 6 runde, câștigă punctajul cel mai mare.

TEST 12 – HARTA REALĂ
- Compară vizual forma cu harta geografică reală.
- Verifică toate județele și delimitările.
- Nu există poligoane care se suprapun.
- Nu există goluri nejustificate.
- Fiecare teritoriu de joc este conectat.
- Graful de vecinătate este simetric și valid.
- Etichetele sunt în interiorul poligoanelor.
- Harta funcționează pe mobil.

TEST 13 – ÎNTREBĂRI
- Exact 4 opțiuni pentru fiecare choice.
- Exact un răspuns corect.
- Numeric finite și unitate clară.
- Surse prezente pentru întrebările verificate.
- Fără ID-uri duplicate.
- Fără text duplicat.
- Fără opțiuni duplicate.
- Fără întrebări ambigue sau învechite.
- Fără repetare în același meci.
- Distribuție de dificultate apropiată de țintă.

TEST 14 – MULTIPLAYER REAL
- Deschide același meci în 3 browsere/sesiuni diferite.
- Toți văd aceeași fază, rundă, teritorii și scor.
- Toți văd același deadline.
- Răspunsurile nu sunt divulgate înainte de rezolvare.
- Nu se acceptă acțiuni duplicate.
- Reconnect nu resetează timerul sau întrebarea.

TEST 15 – SECURITATE
- Un client nu poate trimite userId-ul altuia și acționa în numele lui.
- Un client nu poate trimite un răspuns după închidere.
- Un client nu poate citi răspunsul corect înainte de rezolvare.
- Un user normal nu poate apela endpointuri admin.
- Un client nu poate schimba scorul, punctajul, proprietarul sau faza.

TEST 16 – BUILD ȘI DEPLOY
- `npm install` / `npm ci` se finalizează fără erori.
- `npm run lint` / typecheck trece.
- `npm run build` trece.
- serverul pornește în development.
- serverul pornește în production.
- Socket.IO funcționează în production.
- toate secretele sunt externalizate în `.env`.

======================================================================
15. PERSISTENȚĂ, DEPLOY ȘI PREGĂTIRE PENTRU PROXMOX
======================================================================

Aplicația va fi găzduită ulterior pe Proxmox într-o VM separată, prin Docker. Nu transforma acum proiectul într-o soluție de producție completă dacă asta blochează remedierea jocului, dar pregătește-l corect.

Cerințe:
- citește portul din `process.env.PORT`, cu fallback local la 3000;
- folosește build Vite pentru frontend în producție;
- servește frontend-ul prin Express sau reverse proxy;
- Socket.IO trebuie să funcționeze prin WebSocket și polling fallback;
- clientul nu trebuie să se conecteze la `localhost` hardcodat;
- folosește URL relativ pentru API și aceeași origine pentru Socket.IO, dacă arhitectura permite;
- nu expune PostgreSQL/JSON intern public;
- păstrează secretele în environment variables;
- include `.env.example` fără valori secrete;
- include health endpoint;
- include logging de erori;
- include procedură de backup pentru date.

În momentul de față persistenta este JSON, iar meciurile active sunt în RAM. Înainte de o lansare publică serioasă, migrează datele într-o bază relațională (de exemplu PostgreSQL) sau implementează un mecanism de persistență sigur și atomic. Nu pretinde că JSON + memorie oferă durabilitate de producție.

Dacă serverul se restartează în timpul unei partide, nu lăsa utilizatorii într-o cameră fantomă. Fie reîncarcă starea sigur din storage, fie marchează partida ca întreruptă și informează participanții.

======================================================================
16. ORDINEA DE IMPLEMENTARE RECOMANDATĂ
======================================================================

ETAPA 0 – INSPECȚIE ȘI BACKUP
[ ] Citește întreg proiectul.
[ ] Compară cu această listă.
[ ] Creează checkpoint.
[ ] Raportează diferențele înainte de schimbări majore.

ETAPA 1 – STABILIZAREA MOTORULUI ȘI SECURITĂȚII
[ ] Corectează validarea de stări și acțiuni.
[ ] Protejează snapshotul și API-ul întrebărilor.
[ ] Verifică autentificarea Socket.IO.
[ ] Corectează timeout-urile și răspunsurile întârziate.
[ ] Corectează închiderea după răspunsul tuturor.
[ ] Corectează calculul scorurilor și transferul teritoriilor.
[ ] Testează baza, cucerirea, alocarea, atacul și eliminarea.

ETAPA 2 – RUNDE ȘI HUD
[ ] Leagă RoundTracker direct de starea reală a motorului.
[ ] Afișează fazele și rundele corecte.
[ ] Afișează teritoriile neutre rămase în Faza II.
[ ] Adaugă timer pentru fiecare acțiune de selecție.
[ ] Fă bara de timp fluidă.
[ ] Testează toate tranzițiile de fază.

ETAPA 3 – HARTA GEOGRAFICĂ REALĂ
[ ] Descarcă GeoJSON județe bazat pe ANCPI.
[ ] Construiește grupurile 10/15/25/29 teritorii.
[ ] Unește geometria județelor în teritorii de joc.
[ ] Generează graful real de vecinătate.
[ ] Înlocuiește harta manuală în componentă.
[ ] Verifică desktop și mobil.

ETAPA 4 – BANCA DE ÎNTREBĂRI
[ ] Verifică toate cele 100 întrebări existente.
[ ] Corectează/elimină întrebări greșite sau ambigue.
[ ] Adaugă surse și date de verificare.
[ ] Adaugă status editorial.
[ ] Implementează validare și import controlat.
[ ] Extinde banca în loturi verificate.
[ ] Măsoară numărul real, distribuția pe categorii și dificultate.

ETAPA 5 – MENIU, LOBBY ȘI PROFIL
[ ] Elimină orice buton generic Joacă acum / public instant dacă există.
[ ] Păstrează AI configurabil.
[ ] Default 3 jucători total, opțiune 2–10.
[ ] Păstrează selectorul de categorii.
[ ] Nu permite setarea rundelor, punctelor sau timerelor în lobby.
[ ] Elimină valori hardcodate din dashboard.
[ ] Repară sau dezactivează funcții sociale incomplete.
[ ] Curăță complet shop/coins/level/xp.

ETAPA 6 – PERSISTENȚĂ ȘI STATISTICI
[ ] Înregistrează fiecare meci în istoric.
[ ] Actualizează statisticile reale.
[ ] Implementează rating real sau elimină ratingul fals.
[ ] Protejează scrierea bazei JSON sau migrează PostgreSQL.
[ ] Definește ce se întâmplă la restart.

ETAPA 7 – TESTARE FINALĂ
[ ] Toate testele unitare trec.
[ ] Teste de integrare Socket.IO trec.
[ ] Build și typecheck trec.
[ ] Trei jucători termină un meci complet fără buguri.
[ ] Patru jucători termină un meci complet fără buguri.
[ ] Testează și o partidă cu AI.
[ ] Testează și de pe telefon.
[ ] Scrie un raport final cu funcții complete și limitări.

======================================================================
17. CRITERII DE ACCEPTARE – CÂND PUTEM SPUNE CĂ JOCUL ESTE FUNCȚIONAL
======================================================================

Nu declara proiectul complet până când toate condițiile de mai jos sunt adevărate:

1. Se poate crea o cameră cu categorii selectate și fără setări de runde/timer/scor.
2. Se poate intra ca guest sau cu cont.
3. Se poate juca împotriva boților AI.
4. Se poate juca între cel puțin trei clienți reali.
5. Harta României este geografic corectă și folosește date județene reale.
6. Numărul de teritorii corespunde numărului de participanți.
7. Bazele nu sunt vecine directe, iar vecinii lor sunt interziși doar la alegerea bazei.
8. Faza I funcționează fără atacuri și acordă 200 puncte doar la răspuns corect.
9. Faza II funcționează cu răspuns numeric comun și selecție manuală a câștigătorului, acordând 300 puncte.
10. Faza III permite doar atacuri valide, acordă 400 puncte pentru teritorii normale cucerite și gestionează apărarea/cetățile corect.
11. Cetățile au trei turnuri, iar eliminarea transferă corect teritoriile.
12. Bara de faze și runde arată progresul real.
13. Toate acțiunile au timer și expirarea nu acceptă răspunsuri.
14. Întrebările nu divulgă răspunsul corect înainte de rezolvare.
15. Banca de întrebări este suficient de mare și întrebările sunt verificate, nu doar generate.
16. Nu există monede, shop, XP sau niveluri.
17. Build-ul și testele trec.
18. Nu există erori critice în consola browserului sau logurile serverului.

======================================================================
18. CE TREBUIE SĂ LIVREZI LA FINAL
======================================================================

După implementare, oferă un raport structurat cu:

A. Fișiere modificate
- listă cu fiecare fișier și motivul modificării.

B. Funcționalități reparate
- securitate;
- engine;
- faze;
- timer;
- mapă;
- întrebări;
- lobby;
- autentificare;
- persistență.

C. Teste
- comanda executată;
- numărul de teste;
- rezultate;
- orice test care nu a putut fi executat și de ce.

D. Banca de întrebări
- numărul real total;
- numărul grilă;
- numărul numeric;
- categorii;
- dificultăți;
- întrebări fără surse / nevalidate.

E. Harta
- sursa datelor;
- versiunea;
- numărul de teritorii per număr de jucători;
- teste de vecinătate;
- orice limitare.

F. Limitări rămase
- nu ascunde funcționalități incomplete;
- nu spune „totul funcționează” dacă nu ai rulat testele;
- nu raporta numere inventate.

G. Instrucțiuni pentru utilizator
- cum pornește local;
- cum testează un meci cu 3 jucători;
- cum testează un meci cu 4 jucători;
- cum exportă proiectul pentru backup.

======================================================================
19. PROMPT FINAL PENTRU AI-UL DIN GOOGLE AI STUDIO
======================================================================

Citește integral fișierul CONQUIZ_README_TODO_PENTRU_AI.txt și tratează-l ca specificația principală pentru următoarea iterație a proiectului.

Lucrează direct în proiectul CONQUIZ existent. Nu crea alt proiect și nu reconstrui aplicația de la zero. Înainte de a modifica, inspectează toate fișierele relevante și compară codul actual cu cerințele. Creează un checkpoint. Dacă primești și arhiva `conquiz-fixed-2026-11-08.zip`, compar-o cu workspace-ul și integrează numai remedierile din secțiunea 3A care lipsesc; nu suprascrie schimbările mai noi și nu importa arhiva fără analiză.

Respectă ordinea etapelor din document. Începe cu problemele P0 de securitate și corectitudine multiplayer, continuă cu motorul de joc și tranzițiile dintre faze, apoi HUD/timer, harta geografică, întrebările, UI și persistența.

Nu modifica regulile personalizate ale utilizatorului. Nu introduce shop, monede, niveluri, XP, cosmetice sau progresie. Nu introduce un buton generic de matchmaking public instant. Păstrează modul AI configurabil și camerele private cu selectarea categoriilor.

Nu înlocui harta cu o imagine statică și nu mai folosi poligoanele manual desenate. Construiește harta din geometria reală GeoJSON a județelor României, pe baza stratului ANCPI publicat prin geo-spatial.org, și agregă județele în 10/15/25/29 teritorii compacte și conectate.

Nu inventa întrebări sau rezultate ale testelor. Extinde banca numai cu întrebări care au surse și răspunsuri verificabile. Ținta este o bancă mare, începând cu minimum 5.000 de întrebări verificate și cu structură care poate crește la 25.000+. Dacă nu poți furniza toate întrebările în această sesiune, construiește sistemul de import/validare și raportează exact câte întrebări verificate există.

După fiecare etapă rulează typecheck, teste și build. Testează apoi o partidă completă cu trei clienți și una cu patru participanți, inclusiv boți AI. Verifică sincronizarea hărții, răspunsurilor, timerelor, punctajului și eliminărilor.

Nu considera implementarea completă dacă există faze care nu se pot termina, scoruri incorecte, întrebări care dezvăluie răspunsul, hărți false sau butoane fără acțiune.

La final, livrează lista fișierelor modificate, testele executate, rezultatele exacte și lista limitărilor rămase. Fă modificările efectiv, nu te opri la un plan.

======================================================================
SFÂRȘIT DOCUMENT
======================================================================
