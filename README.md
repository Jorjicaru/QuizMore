# CONQUIZ V9.2 – Cucerește România prin Cunoaștere

Joc de strategie și cultură generală multiplayer în timp real pe harta celor 41 de județe ale României.

---

## 1. Noutăți și Arhitectură V9.2 (Producție & Dezvoltare)

- **Securitate Strictă a Variabilelor de Mediu (`server/envSecurity.ts`)**: În producție (`NODE_ENV=production`), aplicația refuză pornirea dacă `JWT_SECRET`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `DATABASE_URL` sau `APP_URL` lipsesc, sunt prea scurte sau conțin valori demonstrative/placeholder (inclusiv pornirea directă cu `.env.example` nemodificat).
- **Pornire Automată în Development / Google AI Studio Preview**: Când `DATABASE_URL` nu este definit sau aplicația rulează în modul development / Google AI Studio Preview, serverul pornește direct folosind fallback-ul JSON local (`data/conquiz_db.json`), fără a necesita o conexiune activă la PostgreSQL și fără erori WebSocket HMR în Preview.
- **PostgreSQL Confirmă Scrierile Înainte de Succes (`server/postgresRepo.ts`, `server/db.ts`)**:
  - Toate operațiile care modifică date (utilizatori, profiluri, parole, tokenuri de resetare, întrebări, meciuri + `game_player_results`, cereri/prietenii și notificări) sunt asincrone (`async/await`) și așteaptă confirmarea `COMMIT` de la PostgreSQL înainte de a actualiza cache-ul din memorie și înainte de a trimite răspunsul HTTP de succes către client.
  - Dacă tranzacția PostgreSQL eșuează (`ROLLBACK`), eroarea este propagată către ruta apelantă (HTTP `500`), iar cache-ul din memorie rămâne nemodificat.
- **Resetarea Parolei prin Email („Am uitat parola” – `server/emailService.ts`, `server/routes/authRoutes.ts`)**:
  - Endpoint-uri dedicate `POST /api/auth/forgot-password` și `POST /api/auth/reset-password` + formular complet în `AuthView.tsx`.
  - Generare de tokenuri criptografic sigure (`32 bytes` / `64` caractere hex), stocând **exclusiv** hash-ul `SHA-256` în tabelul PostgreSQL `password_reset_tokens`.
  - Linkul de resetare este construit **strict** din variabila `APP_URL` configurată explicit (niciodată din header-ul `Host`).
  - Tokenuri cu expirare (`PASSWORD_RESET_EXPIRY_MINUTES`, implicit 30 min), de unică folosință (`used_at`), invalidarea automată a tokenurilor anterioare nefolosite (`invalidated_at`), schimbare atomică a parolei împreună cu incrementarea `token_version` (invalidează automat sesiunile/JWT-urile emise anterior), limitare de rată (`429`) și același mesaj generic pentru adrese existente sau inexistente.
- **Recuperarea Camerelor Multiplayer Active (`restoreGamesFromSnapshots`)**:
  - Salvare periodică neblocantă (la fiecare 15s) și la oprirea controlată (`SIGTERM`/`SIGINT`) în `active_game_snapshots` doar pentru camerele active (`phase !== 'finished'`).
  - La restaurare, evită camerele duplicate și păstrează strict timpul rămas din timere (`snapshotSavedAtMs`), fără a acorda timp suplimentar din cauza restartului.
- **Migrare Bun Nativă în Imaginea de Producție (`Dockerfile`, `package.json`)**:
  - Comanda `bun run migrate:postgres` rulează direct `bun run scripts/migrate_json_to_postgres.ts`, fără a depinde de `tsx` sau de `devDependencies`.
- **Integrare cu Nginx Proxy Manager prin Rețeaua Externă `mediastack_default` (`docker-compose.yml`)**:
  - Fără Cloudflare Tunnel (`cloudflared`).
  - Portul `3000` al aplicației **nu** este publicat pe host.
  - Serviciul `app` (`hostname: conquiz-app`) este conectat la rețeaua internă `conquiz_internal` și la rețeaua externă existentă `mediastack_default`.
  - Serviciul PostgreSQL (`db`) este conectat **exclusiv** la `conquiz_internal`, fără porturi expuse pe host.
- **Bancă de Întrebări Canonică (`6.241` întrebări aprobate)**:
  - `3.324` întrebări grilă (`choice`) și `2.917` întrebări de estimare (`estimation`).

---

## 2. Configurare Rapidă și Variabile de Mediu (`.env`)

1. Copiază șablonul `.env.example` în `.env`:
   ```bash
   cp .env.example .env
   ```
2. Editează fișierul `.env` și setează parolele și secretele tale:
   - `PORT=3000` (portul intern al containerului `conquiz-app`)
   - `APP_URL`: URL-ul public HTTPS al subdomeniului (ex. `https://conquiz.domeniul-tau.ro`)
   - `JWT_SECRET`: cheie aleatorie de minimum 32 de caractere (`openssl rand -hex 32`)
   - `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`: credențialele contului de administrator (minimum 16 caractere pentru parolă în producție)
   - `POSTGRES_PASSWORD` și `DATABASE_URL`: parola și conexiunea către serviciul PostgreSQL `db` (`postgresql://conquiz_user:<PAROLA>@db:5432/conquiz`)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PASSWORD_RESET_EXPIRY_MINUTES`: configurația furnizorului SMTP pentru trimiterea emailurilor de resetare a parolei.

---

## 3. Comenzi Principale (Bun / NPM / Docker)

```bash
# Instalare dependențe cu lockfile înghețat
bun install --frozen-lockfile

# Pornire server în modul dezvoltare (folosește JSON fallback dacă DATABASE_URL lipsește)
bun run dev

# Validare bancă de întrebări canonică (6.241 întrebări)
bun run validate:questions

# Verificare tipuri TypeScript
bun run lint

# Rulare teste unitare, reguli de joc, teste simulate [SIMULAT] și Socket.IO
npm run test

# Rulare teste de integrare pe PostgreSQL REAL (necesită DATABASE_URL și POSTGRES_ENABLED=true)
POSTGRES_ENABLED=true DATABASE_URL=postgresql://conquiz_user:<PAROLA>@127.0.0.1:5432/conquiz_test npm run test:postgres

# Migrare idempotentă JSON -> PostgreSQL (rulează direct cu Bun, inclusiv în containerul de producție)
bun run migrate:postgres

# Build frontend pentru producție
bun run build

# Validare configurație Docker Compose
docker compose config

# Pornire stivă de producție Docker (doar conquiz-postgres și conquiz-app, fără a atinge restul homelab-ului)
docker compose up -d --build
```

---

## 4. Documentație Tehnică Detaliată

- [Ghid Deployment Proxmox + Porkbun DNS + SMTP + Nginx Proxy Manager (`mediastack_default`)](docs/DEPLOY_PROXMOX_NPM_PORKBUN.md)
- [Arhitectura Sistemului și Schema PostgreSQL](docs/ARCHITECTURE.md)
- [Banca de Întrebări și Guvernanță Editorială](docs/QUESTION_BANK.md)
- [Procedura de Backup, Restaurare și Snapshot Camere Active PostgreSQL](docs/BACKUP_RESTORE.md)
- [Regulile Jocului și Punctajul Oficial](docs/GAME_RULES.md)
