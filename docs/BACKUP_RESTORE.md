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
