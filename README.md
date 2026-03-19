# LE CueSheet

Bozza operativa SaaS per sostituire il flusso XLSX con:

- versioning eventi
- persistenza locale
- aggiornamento realtime multi-operatore
- import da file `.xlsx`

## Stack

- Frontend: Vite + React + Socket.IO client
- Backend: Node.js + Express + Socket.IO + XLSX

## Quick start

```bash
npm install
npm run dev
```

App frontend: `http://localhost:5173`  
API backend: `http://localhost:8080`

## Funzionalita bozza

- Import automatico del file xlsx presente in root alla prima esecuzione.
- Dashboard con tabella cue editabile.
- CRUD eventi cue (`add/update/delete`).
- Log versioni per audit trail.
- Sync realtime via websocket.

## API principali

- `GET /api/cuesheet`
- `POST /api/cuesheet/import-default`
- `POST /api/cuesheet/import-xlsx`
- `POST /api/events`
- `PATCH /api/events/:id`
- `DELETE /api/events/:id`
- `GET /api/versions?limit=100`
