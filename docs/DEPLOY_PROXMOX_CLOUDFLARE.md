# ☁️ CONQUIZ – Ghid de Deployment pe Proxmox + Docker + Cloudflare Tunnel

Acest ghid descrie pașii completi pentru publicarea în producție a aplicației **CONQUIZ** pe un server **Proxmox VE** folosind **Docker Compose**, **PostgreSQL 16** și **Cloudflare Tunnel (`cloudflared`)**, fără a deschide niciun port public (`80`, `443`, `3000` sau `5432`) în router sau firewall.

---

## 1. Arhitectura de Deployment pe Proxmox

1. **Mașină Virtuală (VM) recomandată pe Proxmox**:
   - Sistem de operare: **Ubuntu Server 24.04 LTS** sau **Debian 12 Bookworm** (VM QEMU/KVM, nu container LXC neprivilegiat, pentru compatibilitate optimă Docker).
   - Resurse recomandate: **2–4 vCPU**, **4 GB RAM**, **32 GB SSD** (ZFS sau LVM-Thin).
2. **containere Docker (`docker-compose.yml`)**:
   - `conquiz-postgres` (`postgres:16-alpine`) — Baza de date relațională cu volum persistent `conquiz_pgdata` și inițializare automată din `db/migrations/001_init.sql`.
   - `conquiz-app` (`Dockerfile`) — Serverul Node.js + Express + Socket.IO + build-ul frontend static (`dist/`).
   - `conquiz-cloudflared` (`cloudflare/cloudflared:latest`) — Tunelul Zero-Trust care conectează aplicația la rețeaua Cloudflare.

---

## 2. Pregătirea VM-ului pe Proxmox

Conectați-vă prin SSH la VM-ul Ubuntu/Debian și instalați Docker Engine + Docker Compose plugin:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

---

## 3. Configurarea Cloudflare Tunnel (Zero-Trust Dashboard)

1. Deschideți [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels**.
2. Apăsați **Create a tunnel** → selectați **Cloudflared** → numiți tunelul `conquiz-prod`.
3. Copiați **Tunnel Token**-ul generat (`eyJhIjoi...`).
4. În tab-ul **Public Hostname**, adăugați un hostname public:
   - **Subdomain**: `conquiz` (sau lăsați gol pentru domeniul rădăcină)
   - **Domain**: `domeniu.ro`
   - **Service Type**: `HTTP`
   - **URL**: `app:3000`
5. În setările domeniului Cloudflare (**Network**), asigurați-vă că **WebSockets** este **ON** (activat implicit pentru Socket.IO).

---

## 4. Clonarea Proiectului și Configurarea `.env`

```bash
git clone https://github.com/Jorjicaru/QuizMore.git conquiz
cd conquiz
cp .env.example .env
nano .env
```

Completați valorile din `.env`:
- `APP_URL=https://conquiz.domeniu.ro`
- `JWT_SECRET=<generați cu: openssl rand -hex 32>`
- `ADMIN_PASSWORD=<parolă puternică pentru contul de administrator>`
- `POSTGRES_PASSWORD=<parolă puternică pentru baza de date>`
- `CLOUDFLARE_TUNNEL_TOKEN=<tokenul copiat din Cloudflare Zero Trust>`

---

## 5. Lansarea în Producție și Migrarea Băncii de Întrebări

```bash
# 1. Construirea și pornirea stivei în fundal
docker compose up -d --build

# 2. Verificarea stării containerelor (toate trebuie să fie Up / healthy)
docker compose ps

# 3. Verificarea endpoint-urilor de sănătate din interiorul containerului
docker compose exec app wget -qO- http://127.0.0.1:3000/healthz
docker compose exec app wget -qO- http://127.0.0.1:3000/readyz

# 4. (Opțional) Rularea explicită a scriptului de migrare JSON -> PostgreSQL
docker compose exec app npm run migrate:postgres
```

---

## 6. Actualizarea Aplicației (Zero-Data-Loss Update)

```bash
cd ~/conquiz
git pull origin main
docker compose up -d --build
```
Volumul `conquiz_pgdata` păstrează intacte conturile utilizatorilor, rating-ul Elo, prieteniile, istoricul meciurilor și banca de întrebări între actualizări.
