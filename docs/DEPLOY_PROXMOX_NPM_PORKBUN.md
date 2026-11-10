# Ghid Complet de Deployment CONQUIZ V9.1 pe Proxmox + Porkbun DNS + Nginx Proxy Manager (`mediastack_default`)

Acest ghid descrie arhitectura finală de producție **CONQUIZ V9.1** pe serverul Docker / Proxmox al homelab-ului, integrată cu containerul existent **`nginx-proxy-manager`** din rețeaua Docker **`mediastack_default`**.

> **Regulă de izolare a homelab-ului:** Stiva CONQUIZ pornește exclusiv containerele proprii (`conquiz-postgres` și `conquiz-app`). **Nu modifica și nu reporni** containerele existente din homelab (`nginx-proxy-manager`, `Jellyfin`, `Frigate`, `qBittorrent` sau alte servicii).

---

## 1. Arhitectura de Rețea și Securitate

```
Internet (Jucători)
   │
   ▼  DNS A Record (Porkbun): conquiz.<domeniul-tau> -> IPv4 Public
Router / Firewall Edge
   │  Port Forwarding EXCLUSIV 80/TCP și 443/TCP
   ▼
Container existent: nginx-proxy-manager
   │  (aflat în rețeaua Docker externă `mediastack_default`)
   │  Terminare TLS (Let's Encrypt) + Websockets Support: ON
   │
   ▼  Rețea Docker externă comună: `mediastack_default`
Container aplicație: conquiz-app (http://conquiz-app:3000)
   │  - PORT intern: 3000 (NICIUN port publicat pe host!)
   │  - Conectat la `mediastack_default` și `conquiz_internal`
   │
   ▼  Rețea Docker internă izolată: `conquiz_internal` (internal: true)
Container bază de date: conquiz-postgres (serviciul `db`, port intern 5432)
   - Conectat EXCLUSIV la `conquiz_internal`
   - NICIUN acces din `mediastack_default`
   - NICIUN port expus pe host (5432 nu este publicat)
```

### Reguli stricte de expunere:
- **Portul `3000/TCP`** al aplicației **nu** este publicat pe hostul Docker (`docker-compose.yml` nu conține secțiunea `ports:` la serviciul `app`). Comunicarea dintre `nginx-proxy-manager` și `conquiz-app` are loc exclusiv în interiorul rețelei Docker `mediastack_default`.
- **Portul `5432/TCP`** al PostgreSQL (`db`) este izolat în `conquiz_internal` și nu poate fi accesat nici din internet, nici din LAN, nici din alte containere aflate în `mediastack_default`.
- **Porturile de administrare** (`81` NPM Admin, `22` SSH, `8006` Proxmox VE) nu se expun niciodată în internet.

---

## 2. Verificarea Rețelei Externe `mediastack_default` (Fără Modificarea Containerelor Existente)

Înainte de lansarea stivei CONQUIZ pe hostul Docker, verifică existența rețelei `mediastack_default` și prezența containerului `nginx-proxy-manager` în aceasta:

```bash
# 1. Verifică existența rețelei externe mediastack_default
docker network inspect mediastack_default --format '{{.Name}}: OK'

# 2. Confirmă că nginx-proxy-manager este atașat la mediastack_default
docker inspect nginx-proxy-manager --format '{{json .NetworkSettings.Networks}}' | grep mediastack_default
```

---

## 3. Configurarea DNS la Porkbun și Port Forwarding

1. **Porkbun DNS**:
   - În panoul DNS al domeniului tău de pe **Porkbun**, adaugă o înregistrare de tip **A**:
     - **Host:** `conquiz` (pentru `conquiz.domeniul-tau.ro`)
     - **Answer / Value:** `<IP-ul tău public IPv4>`
     - **TTL:** `600`
2. **Router Port Forwarding**:
   - **WAN `80/TCP`** $\rightarrow$ IP-ul hostului Docker (`nginx-proxy-manager`), portul **`80`**
   - **WAN `443/TCP`** $\rightarrow$ IP-ul hostului Docker (`nginx-proxy-manager`), portul **`443`**

---

## 4. Configurarea Fișierului `.env` pentru Producție

În directorul proiectului CONQUIZ de pe serverul Docker:

```bash
cp .env.example .env
chmod 600 .env
```

Generează secrete criptografice unice:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "ADMIN_PASSWORD=$(openssl rand -base64 24)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
```

Completează fișierul `.env` (notă: hostname-ul serviciului PostgreSQL din `docker-compose.yml` este **`db`**):

```dotenv
NODE_ENV=production
PORT=3000
APP_URL=https://conquiz.domeniul-tau.ro

JWT_SECRET=<secret_hex_64_caractere>
ADMIN_EMAIL=admin@domeniul-tau.ro
ADMIN_USERNAME=MareleVoievod
ADMIN_PASSWORD=<parola_admin_minim_16_caractere>

POSTGRES_DB=conquiz
POSTGRES_USER=conquiz_user
POSTGRES_PASSWORD=<parola_postgres_minim_16_caractere>
DATABASE_URL=postgresql://conquiz_user:<parola_postgres_minim_16_caractere>@db:5432/conquiz

GEMINI_API_KEY=
```

---

## 5. Validarea și Pornirea Stivei CONQUIZ

Validează fișierul `docker-compose.yml` și pornește doar serviciile CONQUIZ (`db` și `app`):

```bash
# 1. Validează sintaxa și rezoluția variabilelor Docker Compose
docker compose config

# 2. Construiește imaginea Bun multi-stage și pornește containerele CONQUIZ
docker compose up -d --build

# 3. Verifică starea containerelor conquiz-postgres și conquiz-app
docker compose ps
```

---

## 6. Configurarea Proxy Host în Nginx Proxy Manager (`nginx-proxy-manager`)

1. Deschide interfața de administrare **Nginx Proxy Manager**.
2. Navighează la **Hosts** $\rightarrow$ **Proxy Hosts** $\rightarrow$ **Add Proxy Host**.
3. În tab-ul **Details**:
   - **Domain Names:** `conquiz.domeniul-tau.ro`
   - **Scheme:** `http`
   - **Forward Hostname / IP:** `conquiz-app`
   - **Forward Port:** `3000`
   - **Cache Assets:** `OFF`
   - **Block Common Exploits:** `ON`
   - **Websockets Support:** **`ON`** *(Obligatoriu pentru conexiunile în timp real `Socket.IO`)*
4. În tab-ul **SSL**:
   - **SSL Certificate:** **Request a new SSL Certificate** (Let's Encrypt)
   - **Force SSL:** **`ON`**
   - **HTTP/2 Support:** **`ON`**
   - **HSTS Enabled:** **`ON`**
   - **Email Address for Let's Encrypt:** adresa ta de email
   - Bifează **I Agree to the Let's Encrypt Terms of Service**
5. Apasă **Save**.

---

## 7. Verificarea Post-Deployment

```bash
# Verifică din interiorul containerului nginx-proxy-manager că poate rezolva și accesa conquiz-app:3000
docker exec nginx-proxy-manager wget -qO- http://conquiz-app:3000/healthz

# Verifică prin domeniul public HTTPS
curl -fsSL https://conquiz.domeniul-tau.ro/healthz
curl -fsSL https://conquiz.domeniul-tau.ro/readyz
```
