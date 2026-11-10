# 👑 CONQUIZ – România Multiplayer (Trivia & Strategie)

**CONQUIZ** este o aplicație web multiplayer în timp real (2–10 jucători) de strategie teritorială și cultură generală pe harta istorică și administrativă a României, inspirată de mecanica clasică *Triviador / ConQUIZtador*.

---

## ✨ Caracteristici Principale (V9.0 Production Release)

- **Multiplayer în Timp Real (2–10 Jucători + Boți AI)**:
  - Camere publice și private, matchmaking Elo, invitații între prieteni și boți cu 4 niveluri de dificultate (`începător`, `intermediar`, `avansat`, `maestru`).
  - Sincronizare autoritativă de ceas client-server prin RTT ping/pong (`time_sync_request`) și timer continuu (`requestAnimationFrame` + `transform: scaleX`).
- **9 Preseturi Geografice Dedicate și Dizolvate ale Hărții României**:
  - Toate cele 42 de județe ale României sunt grupate în teritorii contigue cu granițe interioare dizolvate (`@turf/turf`) și graf de vecinătate conex simetric:
    - `2p → 10 teritorii`, `3p → 15`, `4p → 20`, `5p → 23`, `6p → 26`, `7p → 29`, `8p → 32`, `9p → 35`, `10p → 38 teritorii`.
- **Cele 3 Faze Canonice ale Jocului**:
  1. **Alegerea Bazei (`base_selection`)**: Fiecare jucător își alege cetatea de bază (`1000 pct`, `3 turnuri`), fără ca două baze să fie direct învecinate.
  2. **Expansiune / Cucerire (`conquest`)**: Întrebări grilă (`choice`) și de departajare numerică (`estimation`) la care toți jucătorii răspund simultan pentru ocuparea teritoriilor neutre adiacente (`300 pct`).
  3. **Război Simultan (`war`)**: Până la `floor(N/2)` dueluri simultane pe rundă între vecini direcți, cu întrebare grilă comună și departajare numerică (`tiebreak`), apărare fortificată (`+100 pct`), asediu asupra cetăților (`+400 pct` pe turn dărâmat) și cucerire integrală la căderea ultimului turn.
- **Bancă Canonică Auditată Editorial (`6.216` Întrebări Aprobate)**:
  - `3.269` întrebări cu 4 variante (`choice`) și `2.947` întrebări numerice (`estimation`) în limba română.
  - 14 categorii echilibrate (nicio categorie nu depășește `12.5%` din bancă).
  - Fiecare întrebare are `reviewStatus: 'approved'`, `factKey` unic per concept factual (`5.673` chei distincte), `sourceUrl` specific verificabil și `sourceTitle`.
  - Non-repetiție garantată atât după `question.id`, cât și după `factKey` pe întreaga durată a unui meci.
- **Arhitectură Ready for Production (PostgreSQL + Docker + Proxmox + Cloudflare Tunnel + PWA)**:
  - Persistență hibridă: PostgreSQL 16 în producție (`DATABASE_URL`) cu fallback automat pe JSON atomic (`data/conquiz_db.json`) în development.
  - Health checks dedicate (`GET /healthz` și `GET /readyz`), oprire grațioasă (`SIGTERM`/`SIGINT`), PWA instalabil și stivă completă `docker-compose.yml` cu `cloudflared`.

---

## 🚀 Pornire Rapidă (Development Local)

### 1. Cerințe
- **Node.js 22+** sau **Bun 1.2+**

### 2. Instalare și Rulare
```bash
# Instalare dependențe
npm install
# (sau: bun install)

# Copiere variabile de mediu
cp .env.example .env

# Pornire server development (Express + Socket.IO + Vite pe portul 3000)
npm run dev
```
Aplicația va fi disponibilă la `http://localhost:3000`.

---

## 🧪 Comenzi Utile & Verificare Calitate

| Comandă | Descriere |
| :--- | :--- |
| `npm run dev` | Pornește serverul full-stack pe portul `3000` |
| `npm run build` | Construiește aplicația frontend de producție în `dist/` |
| `npm run lint` | Verifică tipurile TypeScript (`tsc --noEmit`) |
| `npm run build:questions` | Regenerează și echilibrează banca canonică de întrebări V9.0 |
| `npm run validate:questions` | Execută auditul strict V9.0 asupra băncii de întrebări și `conquiz_db.example.json` |
| `npm test` | Rulează suita completă de teste unitare și de integrare (`src/game/rules.test.ts`) |
| `npm run migrate:postgres` | Migrează idempotent datele și întrebările în PostgreSQL (`DATABASE_URL`) |

---

## 📚 Documentație Detaliată

- 📖 [Regulile Complete ale Jocului (`docs/GAME_RULES.md`)](./docs/GAME_RULES.md)
- 🧠 [Arhitectura & Standardul Băncii de Întrebări (`docs/QUESTION_BANK.md`)](./docs/QUESTION_BANK.md)
- 🏗️ [Arhitectura Tehnică & Fluxul Multiplayer (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)
- ☁️ [Ghid de Deployment pe Proxmox + Docker + Cloudflare Tunnel (`docs/DEPLOY_PROXMOX_CLOUDFLARE.md`)](./docs/DEPLOY_PROXMOX_CLOUDFLARE.md)
- 💾 [Proceduri de Backup și Restaurare (`docs/BACKUP_RESTORE.md`)](./docs/BACKUP_RESTORE.md)
- 📝 [Jurnalul Versiunilor (`CHANGELOG.md`)](./CHANGELOG.md)
