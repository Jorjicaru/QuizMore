# CONQUIZ V9.1 – Cucerește România prin Cunoaștere

Joc de strategie și cultură generală multiplayer în timp real pe harta celor 41 de județe ale României.

---

## 1. Noutăți și Arhitectură V9.1 (Producție & Dezvoltare)

- **Securitate Strictă a Variabilelor de Mediu (`server/envSecurity.ts`)**: În producție (`NODE_ENV=production`), aplicația refuză pornirea dacă `JWT_SECRET`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `DATABASE_URL` sau `APP_URL` lipsesc, sunt prea scurte sau conțin valori demonstrative/placeholder (inclusiv pornirea directă cu `.env.example` nemodificat).
- **Pornire Automată în Development / Google AI Studio Preview**: Când `DATABASE_URL` nu este definit sau aplicația rulează în modul development / Google AI Studio Preview, serverul pornește direct folosind fallback-ul JSON local (`data/conquiz_db.json`), fără a necesita o conexiune activă la PostgreSQL.
- **PostgreSQL ca Sursă Principală a Datelor în Producție (`server/postgresRepo.ts`, `server/db.ts`)**: În producție pe Proxmox Docker Compose (serviciul `db` în rețeaua izolată `conquiz_internal`), toate citirile și scrierile pentru utilizatori, întrebări, meciuri, rezultate pe jucător (`game_player_results`), prieteni, notificări și snapshot-uri ale camerelor active se execută direct în PostgreSQL, folosind tranzacții SQL atomice.
- **Recuperarea Camerelor Multiplayer Active (`restoreGamesFromSnapshots`)**: La repornirea serverului în producție, camerele active salvate în `active_game_snapshots` sunt restaurate automat în memorie împreună cu timerele aferente fazei curente.
- **Docker Multi-Stage Standardizat pe Bun (`Dockerfile`)**: Imagine de producție bazată pe `oven/bun:1.2-alpine` și `bun.lock` (`bun install --frozen-lockfile`), rulată sub utilizator non-root (`bun`), pe portul intern `PORT=3000`.
- **Integrare cu Nginx Proxy Manager prin Rețeaua Externă `mediastack_default` (`docker-compose.yml`)**:
  - Fără Cloudflare Tunnel (`cloudflared`) și fără `CLOUDFLARE_TUNNEL_TOKEN`.
  - Portul `3000` al aplicației **nu** este publicat pe host.
  - Serviciul `app` (`hostname: conquiz-app`) este conectat la rețeaua internă `conquiz_internal` și la rețeaua externă existentă `mediastack_default` (unde rulează containerul `nginx-proxy-manager`).
  - Serviciul PostgreSQL (`db`) este conectat **exclusiv** la `conquiz_internal`, fără acces din `mediastack_default` și fără porturi expuse pe host.
  - În Nginx Proxy Manager, Proxy Host-ul direcționează traficul către `http://conquiz-app:3000` cu **Websockets Support** activat și certificat TLS **Let's Encrypt**.
- **Bancă de Întrebări V9.1 (`6.241` întrebări aprobate)**:
  - `3.324` întrebări grilă (`choice`) și `2.917` întrebări de estimare (`estimation`).
  - `14` categorii echilibrate (nicio categorie nu depășește `12,5%`; cea mai mare categorie are `11,34%`).
  - `5.064` chei `factKey` unice, cu `660` perechi `choice`/`estimation` care împart același `factKey` pentru a preveni scurgerea răspunsurilor în același meci.
  - Orice întrebare nouă fără statut explicit intră ca `draft` și nu poate apărea în meciurile oficiale până la aprobarea explicită cu sursă specifică.

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

# Rulare suită completă de teste (unitare, PostgreSQL, migrare, backup/restore, Socket.IO)
bun test

# Build frontend pentru producție
bun run build

# Validare configurație Docker Compose
docker compose config

# Pornire stivă de producție Docker (doar conquiz-postgres și conquiz-app, fără a atinge restul homelab-ului)
docker compose up -d --build
```

---

## 4. Documentație Tehnică Detaliată

- [Ghid Deployment Proxmox + Porkbun DNS + Nginx Proxy Manager (`mediastack_default`)](docs/DEPLOY_PROXMOX_NPM_PORKBUN.md)
- [Arhitectura Sistemului și Schema PostgreSQL](docs/ARCHITECTURE.md)
- [Banca de Întrebări și Guvernanță Editorială](docs/QUESTION_BANK.md)
- [Procedura de Backup și Restaurare PostgreSQL](docs/BACKUP_RESTORE.md)
- [Regulile Jocului și Punctajul Oficial](docs/GAME_RULES.md)
