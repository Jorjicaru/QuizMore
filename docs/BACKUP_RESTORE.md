# Procedura de Backup și Restaurare PostgreSQL – CONQUIZ V9.1

În **CONQUIZ V9.1**, **PostgreSQL** este sursa unică de adevăr în producție pentru utilizatori, întrebări, meciuri, rezultate pe jucător (`game_player_results`), prieteni, notificări, loguri de audit și snapshot-uri ale camerelor active.

---

## 1. Realizarea unui Backup PostgreSQL (`scripts/backup_postgres.sh`)

Scriptul `scripts/backup_postgres.sh` extrage un dump SQL complet (`pg_dump --clean --if-exists --no-owner --no-privileges`), îl comprimă cu `gzip -9` și verifică integritatea arhivei rezultate (`gzip -t`).

### Rulare manuală:
```bash
./scripts/backup_postgres.sh
```

Fișierul rezultat este salvat în `./backups/conquiz_pg_<TIMESTAMP>.sql.gz`. Dacă nici containerul `conquiz-postgres` nu este pornit și nici variabila `DATABASE_URL` nu este definită, scriptul se oprește imediat cu cod de eroare (`exit 1`).

### Programare automată (Cron zilnic la 03:30 UTC):
```cron
30 3 * * * cd /opt/conquiz && ./scripts/backup_postgres.sh >> /var/log/conquiz_backup.log 2>&1
```

---

## 2. Restaurarea unui Backup PostgreSQL (`scripts/restore_postgres.sh`)

Scriptul `scripts/restore_postgres.sh` validează integritatea arhivei `.sql.gz` și o restaurează cu `psql -v ON_ERROR_STOP=1`.

### A. Restaurare într-o bază de date separată de verificare (Recomandat înainte de producție)

Pentru a testa un backup fără a suprascrie baza de date activă:

```bash
# 1. Creează baza de date temporară de verificare în containerul PostgreSQL
docker exec -i conquiz-postgres psql -U conquiz_user -d postgres -c "DROP DATABASE IF EXISTS conquiz_restore_verify; CREATE DATABASE conquiz_restore_verify;"

# 2. Restaurează arhiva de backup în baza de verificare
./scripts/restore_postgres.sh ./backups/conquiz_pg_20261110T120000Z.sql.gz conquiz_restore_verify

# 3. Verifică numărul de utilizatori, întrebări și meciuri restaurate
docker exec -i conquiz-postgres psql -U conquiz_user -d conquiz_restore_verify -c "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM questions) AS questions, (SELECT COUNT(*) FROM games) AS games, (SELECT COUNT(*) FROM game_player_results) AS results;"
```

### B. Restaurare în baza de date principală de producție

```bash
# 1. Oprește temporar containerul aplicației pentru a închide conexiunile active
docker compose stop app

# 2. Rulează restaurarea în baza principală
./scripts/restore_postgres.sh ./backups/conquiz_pg_20261110T120000Z.sql.gz

# 3. Repornește aplicația
docker compose start app
```

---

## 3. Comportamentul la Oprire Controlată vs. Oprire Brutală și Ce Permite Backup-ul

### A. Ce se păstrează 100% în timp real (Zero pierderi chiar și la oprire brutală `SIGKILL` / pană de curent):
Toate mutațiile critice sunt confirmate cu `COMMIT` în PostgreSQL **înainte** ca serverul să trimită răspunsul HTTP de succes către client:
- **Conturi de utilizatori, parole și `token_version`** (`users`)
- **Statistici de profil și rating** (`users.profile_json`)
- **Tokenuri de resetare a parolei consumate/invalidate** (`password_reset_tokens`)
- **Banca de întrebări și modificările editoriale din panoul Admin** (`questions`)
- **Meciurile finalizate și rezultatele per jucător** (`games` și `game_player_results`)
- **Cererile de prietenie și notificările** (`friends` și `notifications`)

### B. Camerele Multiplayer Active în Desfășurare (`active_game_snapshots`):
1. **La oprire controlată (`SIGTERM` / `SIGINT`, ex. `docker compose stop` sau `docker compose restart`)**:
   - Handler-ul `gracefulShutdown` din `server.ts` salvează imediat în PostgreSQL (`active_game_snapshots`) starea exactă a tuturor camerelor active (`phase !== 'finished'`), împreună cu marca temporală `snapshotSavedAtMs`.
   - Nu se pierd mutări din camerele active. La repornire, `restoreGamesFromSnapshots` restaurează camerele fără duplicate și recalculează strict timpul rămas din timerul întrebării sau al selecției de teritoriu (nu acordă secunde suplimentare din cauza restartului).
2. **La oprire brutală (`SIGKILL` / `kill -9` / cădere de tensiune a hostului)**:
   - Serverul rulează în fundal un snapshot periodic neblocant în PostgreSQL la fiecare `ACTIVE_ROOM_SNAPSHOT_INTERVAL_MS` (implicit **15 secunde**) exclusiv pentru camerele active (`phase !== 'finished'`). Camerele terminate sunt șterse automat din `active_game_snapshots`.
   - În cazul unei opriri brutale, camerele active sunt recuperate la starea ultimului snapshot periodic salvat în PostgreSQL: se pot pierde cel mult acțiunile din cameră (răspunsuri la întrebarea în curs sau selecții de teritoriu) efectuate în ultimele **0–15 secunde** de dinaintea căderii brutale.
3. **Ce permite efectiv arhiva de backup (`pg_dump` / `scripts/backup_postgres.sh`)**:
   - Un fișier `.sql.gz` generat de `scripts/backup_postgres.sh` reprezintă o imagine consistentă (*point-in-time snapshot*) a întregii baze PostgreSQL din momentul rulării `pg_dump`.
   - Restaurarea unui backup cu `scripts/restore_postgres.sh` readuce toate tabelele (`users`, `password_reset_tokens`, `questions`, `games`, `game_player_results`, `friends`, `notifications`, `active_game_snapshots`) exact la starea din momentul acelui backup. Orice date scrise după momentul realizării arhivei `.sql.gz` nu sunt incluse în acel fișier de backup.
