# Arhitectura Sistemului CONQUIZ V9.1

Acest document descrie arhitectura tehnică, fluxul de date, persistența în PostgreSQL și topologia de producție pentru **CONQUIZ V9.1 – Cucerește România prin Cunoaștere**.

---

## 1. Vedere de Ansamblu (Stack Tehnologic)

- **Runtime & Package Manager**: **Bun 1.2+** (`bun.lock` cu `bun install --frozen-lockfile`) și compatibilitate completă Node.js 22+.
- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Motion, Lucide React, Socket.IO Client, Web Audio API sintetizat nativ, PWA (`manifest.webmanifest` + Service Worker `sw.js`).
- **Backend**: Express + HTTP Server + Socket.IO (WebSocket + fallback polling), securizat cu Helmet, CORS strict pe `APP_URL`, Rate Limiting și validare strictă a variabilelor de mediu la pornire (`server/envSecurity.ts`).
- **Persistență Principală (Producție)**: **PostgreSQL 16** (`server/postgresRepo.ts` + `db/migrations/001_init.sql`) ca sursă unică de adevăr (cu fallback local pe `data/conquiz_db.json` exclusiv în dezvoltare când `DATABASE_URL` nu este setat).
- **Publicare & Reverse Proxy**: **Porkbun DNS** (înregistrare `A` pe IPv4 public) + **Nginx Proxy Manager** (terminare TLS Let's Encrypt și suport WebSocket activat).

---

## 2. Schema Bazei de Date PostgreSQL (`db/migrations/001_init.sql`)

Toate tabelele din PostgreSQL sunt create și migrate automat la inițializare și corespund 1:1 cu metodele din `server/postgresRepo.ts`:

| Tabel SQL | Rol și Coloane Principale |
| :--- | :--- |
| `users` | Conturi jucători și administratori (`id`, `username`, `email`, `password_hash`, `role`, `is_banned`, `avatar`, `bio`, `titles`, `active_title`, `favorite_county`, `stats` JSONB, `achievements` JSONB, `match_history` JSONB, `created_at`). |
| `questions` | Banca de întrebări canonică și întrebările create din panoul Admin (`id`, `type`, `category`, `difficulty`, `question`, `options` JSONB, `correct_answer_index`, `target_number`, `unit`, `explanation`, `tags` JSONB, `verified`, `review_status` cu `DEFAULT 'draft'`, `fact_key`, `source_url`, `source_title`, `source_checked_at`, `author_id`, `updated_at`). |
| `games` | Meciurile finalizate (`id`, `room_code`, `mode`, `winner_id`, `winner_name`, `duration_seconds`, `total_rounds`, `created_at`). |
| `game_player_results` | Rezultatele individuale ale participanților din fiecare meci (`id`, `game_id`, `user_id`, `username`, `is_bot`, `final_rank`, `final_score`, `counties_count`, `correct_answers`, `total_answers`) cu constrângere de unicitate `CONSTRAINT uq_game_player_result UNIQUE (game_id, user_id)`. |
| `friends` | Relațiile de prietenie și cererile în așteptare (`id`, `sender_id`, `receiver_id`, `status`, `created_at`) cu `UNIQUE (sender_id, receiver_id)`. |
| `notifications` | Notificări în timp real și persistente pentru jucători (`id`, `user_id`, `type`, `title`, `message`, `data` JSONB, `read`, `created_at`). |
| `admin_audit_logs` | Jurnalul de audit al acțiunilor administrative (`id`, `admin_id`, `admin_username`, `action`, `target_id`, `details` JSONB, `created_at`). |
| `active_game_snapshots` | Snapshot-urile camerelor multiplayer active (`room_code`, `phase`, `state` JSONB, `updated_at`) utilizate pentru restaurarea camerelor la repornirea serverului (`restoreGamesFromSnapshots`). |

---

## 3. Tranzacții SQL și Integritatea Datelor

- **Salvare Meci Finalizat (`insertGameToPostgres`)**: Rulează într-o tranzacție SQL (`BEGIN` ... `COMMIT` / `ROLLBACK` prin `withPostgresTransaction`) care inserează înregistrarea în `games` și toate rândurile aferente în `game_player_results` folosind `ON CONFLICT (game_id, user_id) DO UPDATE`.
- **Cereri de Prietenie + Notificări (`createFriendRequestWithNotificationToPostgres`)**: Rulează atomic într-o singură tranzacție SQL astfel încât cererea din `friends` și notificarea din `notifications` sunt persistate împreună.
- **Migrare Idempotentă (`scripts/migrate_json_to_postgres.ts`)**: Importă utilizatorii, toate întrebările (inclusiv întrebările custom din JSON), meciurile, `game_player_results`, prietenii și notificările fără a crea duplicate la rulări repetate.

---

## 4. Recuperarea Camerelor Active la Restart (`active_game_snapshots`)

- La fiecare schimbare de stare a unei camere multiplayer, `saveGameSnapshot` salvează starea serializată în tabelul PostgreSQL `active_game_snapshots`.
- La oprirea unei camere sau la finalizarea meciului (`gameover`), snapshot-ul este șters din `active_game_snapshots`.
- La pornirea serverului (`server.ts`), după `await db.init()`, se apelează `restoreGamesFromSnapshots(io, snapshots)`, care reconstruiește camerele active, reconectează jucătorii prin tokenul de sesiune și repornește timerele pentru faza curentă.
