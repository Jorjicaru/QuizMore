# Changelog – CONQUIZ

## [9.1.0] – 2026-11-10 (Audit Final, PostgreSQL Primar, Bun Docker & Publicare Porkbun + Nginx Proxy Manager)

### Securitate & Variabile de Mediu (P0)
- Adăugat modulul `server/envSecurity.ts` care blochează pornirea în producție dacă `JWT_SECRET`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD` sau `APP_URL` sunt nesetate, prea scurte sau conțin valori demonstrative/placeholder în română sau engleză (inclusiv `.env.example` nemodificat).
- Reparate verificările din `server/auth.ts` și `server/db.ts` astfel încât `addConfiguredAdmin` nu mai este apelat în interiorul blocului `try/catch` de parsare JSON și nu mai blochează mediul de dezvoltare/preview.
- Eliminat `CLOUDFLARE_TUNNEL_TOKEN` și toate valorile demonstrative din `.env.example`.

### Docker, Bun & CI/CD (P0 / P1)
- Standardizat `Dockerfile` multi-stage pe `oven/bun:1.2-alpine` și `bun.lock` (`bun install --frozen-lockfile`), rulat sub utilizatorul non-root `bun`, fără `package-lock.json` și fără instalări improvizate cu `tsx`.
- Actualizat `.github/workflows/ci.yml` cu versiune Bun fixată (`1.2.4`), `bun install --frozen-lockfile`, validarea băncii de întrebări, lint, teste automate, build Vite și verificarea construirii imaginii Docker (`docker build`).

### Publicare cu Porkbun + Nginx Proxy Manager (P0)
- Eliminat serviciul `cloudflared` din `docker-compose.yml`.
- Configurat `docker-compose.yml` pentru conectarea la Nginx Proxy Manager prin rețea Docker externă comună (`NPM_NETWORK_NAME`) sau prin port legat pe IP-ul LAN al VM-ului (`APP_BIND_IP`), păstrând PostgreSQL complet izolat în rețeaua internă `conquiz_internal` (fără portul `5432` expus).
- Adăugat ghidul complet `docs/DEPLOY_PROXMOX_NPM_PORKBUN.md`.

### PostgreSQL ca Sursă Principală & Recuperare Camere Active (P0 / P1)
- Extins `server/postgresRepo.ts` și `server/db.ts` astfel încât PostgreSQL este sursa unică de adevăr în producție pentru utilizatori, întrebări, meciuri, `game_player_results`, prieteni, notificări, loguri de audit și `active_game_snapshots`.
- Implementate tranzacții SQL atomice (`withPostgresTransaction`) pentru salvarea meciurilor (`games` + `game_player_results`) și pentru cererile de prietenie cu notificare.
- Actualizat `scripts/migrate_json_to_postgres.ts` pentru migrare 100% idempotentă (inclusiv întrebările custom și `game_player_results`).
- Implementată restaurarea camerelor multiplayer active la repornirea serverului (`restoreGamesFromSnapshots` în `server/gameEngine.ts` și `server.ts`).
- Actualizate scripturile `scripts/backup_postgres.sh` și `scripts/restore_postgres.sh` exclusiv pentru PostgreSQL, cu verificarea integrității arhivei și suport pentru restaurare într-o bază separată de verificare.

### Banca de Întrebări V9.1 (P1)
- Orice întrebare nouă fără `reviewStatus` explicit primește implicit statutul `draft`, iar `server/gameEngine.ts` selectează în meciuri exclusiv întrebări cu `reviewStatus === 'approved'`.
- Atribuite `1.365` URL-uri sursă specifice pe subiect (`sourceUrl` și `sourceTitle` dedicate fiecărei entități), eliminând URL-urile generice pe categorie.
- Unificat `factKey` între cele `660` de perechi `choice` și `estimation` bazate pe același fapt și eliminate indiciile din paranteze care puteau divulga răspunsul altor întrebări.
- Echilibrată distribuția pe cele 14 categorii astfel încât nicio categorie să nu depășească pragul de `12,5%` (maxim `11,34%` pentru `geografie`).
