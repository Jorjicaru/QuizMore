# 📝 CHANGELOG – CONQUIZ România Multiplayer

## [9.0.0] – 2026-11-10 (Finalizare Completă & Pregătire Publicare Producție)

### Adăugat
- **Persistență PostgreSQL 16 + Migrare Idempotentă**:
  - Schemă SQL completă (`db/migrations/001_init.sql`) pentru `users`, `friendships`, `friend_requests`, `match_history`, `questions` și `question_reports`.
  - Repository PostgreSQL (`server/postgresRepo.ts`) cu sincronizare write-behind din `server/db.ts` și script de migrare `scripts/migrate_json_to_postgres.ts` (`npm run migrate:postgres`).
- **Audit Editorial Complet al Băncii de Întrebări (`6.216` Întrebări Aprobate)**:
  - Câmpuri noi pe fiecare întrebare: `factKey`, `reviewStatus: 'approved'`, `sourceUrl` specific (non-homepage), `sourceTitle` și `sourceCheckedAt`.
  - Rebalansarea celor 14 categorii astfel încât nicio categorie nu depășește `12.5%` (`geografie` redusă de la `47.7%` la `12.3%`).
  - `5.673` `factKey`-uri distincte pentru prevenirea repetiției aceluiași concept între întrebările grilă și cele numerice.
- **Infrastructură de Producție (Docker + Proxmox + Cloudflare Tunnel + PWA)**:
  - `Dockerfile` multi-stage cu utilizator non-root (`node`) și `HEALTHCHECK`.
  - `docker-compose.yml` cu `db` (`postgres:16-alpine`), `app` și `cloudflared` (fără porturi expuse public pe host).
  - Endpoint-uri de sănătate `GET /healthz` și `GET /readyz`, rate limiting pe autentificare și graceful shutdown (`SIGTERM`/`SIGINT`).
  - Suport complet PWA (`public/manifest.json`, `public/sw.js`, `public/icon.svg`, buton de instalare în `Navbar`).
  - Documentație completă în `README.md` și `docs/*`.

### Reparate
- **GitHub Actions CI (`.github/workflows/ci.yml`)**: Aliniat pe `oven-sh/setup-bun@v2` și `bun install --frozen-lockfile` în concordanță cu `bun.lock` din repository.
- **Păstrarea Bonusului de +400 Puncte la Lovirea Turnurilor Cetății**: Adăugat câmpul `attackBonusPoints` pe `Player` și inclus în `recalculatePlayerScores(game)`, prevenind suprascrierea bonusului la finalul rundei de război.
- **Politică Anti-Blocaj la Alocarea Teritoriilor Neutre**: Adăugat prag maxim de 2 reîncercări (`allocationNoResponseRetries`) urmat de alocare deterministă dacă niciun jucător nu răspunde.
- **Normalizare `users` în Baza de Date (`Database.normalizeUsersMap`)**: Convertirea sigură a `users: []` în obiect `{}` la încărcarea JSON și corectarea `data/conquiz_db.example.json`.

---

## [8.0.0] – 2026-11-09
- Bancă canonică inițială (>5.000 întrebări), sincronizare ceas client-server prin RTT și protecție `questionInstanceId`.
