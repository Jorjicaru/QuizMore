# 🏗️ CONQUIZ – Arhitectura Tehnică a Sistemului (V9.0)

Acest document descrie arhitectura full-stack a aplicației **CONQUIZ**, fluxul de date în timp real și mecanismele de reziliență în producție.

---

## 1. Vedere de Ansamblu

```
[ Browser / PWA Client (React 19 + Tailwind CSS + Socket.IO Client) ]
                         │
                         ▼  HTTPS + WSS (WebSocket)
        [ Cloudflare Edge / Cloudflare Tunnel (cloudflared) ]
                         │
                         ▼  Rețea Internă Docker (http://app:3000)
[ Node.js / Express + Socket.IO Server (server.ts + server/gameEngine.ts) ]
           │                                         │
           ▼                                         ▼
[ PostgreSQL 16 (server/postgresRepo.ts) ]   [ JSON Snapshot (data/conquiz_db.json) ]
```

---

## 2. Componente Backend (`server/`)

1. **`server.ts` (Entrypoint HTTP & WebSocket)**:
   - Inițializează Express, rutele REST (`/api/*`), endpoint-urile de sănătate (`GET /healthz`, `GET /readyz`), limitarea ratei de cereri pe `/api/auth/login` și `/api/auth/register`, și serverul Socket.IO.
   - Gestionează oprirea grațioasă (`SIGTERM` / `SIGINT`), salvând starea bazei de date și închizând conexiunile PostgreSQL și camerele active.
2. **`server/gameEngine.ts` (`GameManager`)**:
   - Motor autoritativ în memorie pentru toate camerele de joc active (`rooms`).
   - Gestionează timer-ele pe server, selecția echilibrată a întrebărilor fără repetare de `id` sau `factKey`, logica boților AI și aplicarea atomică a bătăliilor din faza de Război Simultan.
3. **`server/socketHandler.ts`**:
   - Autentifică conexiunile WebSocket prin JWT (`socket.handshake.auth.token`).
   - Răspunde la `time_sync_request` pentru calibrarea ceasului client-server.
   - Validează `questionInstanceId` la `submit_answer` pentru a preveni răspunsurile întârziate de la întrebări anterioare (`STALE_INSTANCE`).
4. **`server/db.ts` & `server/postgresRepo.ts`**:
   - Strat de persistență hibrid: citește/actualizează rapid în memorie, salvează atomic pe disc în `data/conquiz_db.json` și sincronizează asincron (write-behind) în tabelele relaționale PostgreSQL (`users`, `friendships`, `friend_requests`, `match_history`, `questions`, `question_reports`) când `DATABASE_URL` este configurat.

---

## 3. Componente Frontend (`src/`)

- **`src/App.tsx`**: Gestionează sesiunea JWT, navigarea între vizualizări și garda strictă de autentificare (când utilizatorul nu este autentificat, doar fluxul de autentificare și controlul sunetului sunt accesibile).
- **`src/views/GameView.tsx`**: Layout adaptiv fără scroll pe desktop (`100dvh`) și stivuit ergonomic pe mobil, coordonând `GameHUD`, `RoundTracker`, `PlayerSidebar`, `RomaniaMap` și `QuestionModal`.
- **`src/components/RomaniaMap.tsx`**: Randare SVG vectorială a celor 9 preseturi dizolvate ale României cu zoom/pan (`Fit to Screen` implicit), medalioane de cetate cu turnuri și indicatori vizuali pentru țintele legale de atac.
- **`src/services/socket.ts`**: Client Socket.IO cu calibrare automată a offsetului de ceas (`computeClockOffsetSample` / `selectBestClockOffset`) pe baza celui mai mic RTT din 3 probe.
