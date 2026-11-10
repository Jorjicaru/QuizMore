# 💾 CONQUIZ – Proceduri de Backup și Restaurare (PostgreSQL & JSON)

Acest document descrie procedurile operaționale pentru salvarea și restaurarea datelor în producție.

---

## 1. Backup Manual sau Programat (`scripts/backup_postgres.sh`)

Scriptul `scripts/backup_postgres.sh` creează o arhivă comprimată `.sql.gz` din containerul PostgreSQL (`conquiz-postgres`) și, dacă există, o copie `.json.gz` a fișierului `data/conquiz_db.json`.

### Rulare Manuală:
```bash
chmod +x scripts/backup_postgres.sh scripts/restore_postgres.sh
./scripts/backup_postgres.sh
```
Fișierele sunt salvate în directorul `./backups/` (ex. `backups/conquiz_pg_20261110T014500Z.sql.gz`), iar backup-urile mai vechi de `14` zile (`RETENTION_DAYS=14`) sunt șterse automat.

### Programare Automată prin Cron (Zilnic la 03:30 UTC):
```bash
crontab -e
```
Adăugați linia:
```cron
30 3 * * * cd /home/ubuntu/conquiz && ./scripts/backup_postgres.sh >> /var/log/conquiz_backup.log 2>&1
```

---

## 2. Restaurarea Bazei de Date (`scripts/restore_postgres.sh`)

Pentru a restaura baza de date PostgreSQL dintr-o arhivă `.sql.gz`:

```bash
./scripts/restore_postgres.sh ./backups/conquiz_pg_20261110T014500Z.sql.gz
```

După restaurarea bazei de date, reporniți containerul aplicației pentru a reîncărca memoria cache din PostgreSQL:
```bash
docker compose restart app
```

---

## 3. Snapshot-uri la Nivel de VM Proxmox

Pe lângă backup-ul SQL zilnic, se recomandă configurarea **Proxmox Backup Server (PBS)** sau a unui job **VZDUMP** săptămânal pentru VM-ul gazdă în modul `snapshot` cu `qemu-guest-agent` activat.
