# Real-time Collaborative Whiteboard

A multi-user whiteboard with real-time synchronization, drawing tools, and persistence. Built on **Yjs** for conflict-free replication (CRDTs) and **Socket.io** for low-latency communication, with a **Next.js** frontend rendered on **Konva**.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://real-time-collaborative-whiteboard.vercel.app)
![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)
![Yjs](https://img.shields.io/badge/Yjs-13-orange.svg)

![Real-time Collaborative Whiteboard](screenshot.png)

---

## Features

### 🎨 Drawing & Editing
- **Seven tools** — Rectangle, Circle, Line, Arrow, Text, Image, and freehand Path, plus an Eraser
- **Full styling controls** — stroke color/width, fill color, opacity, rotation, and z-order
- **Inline text editing** — edit text shapes directly on the canvas via an overlay
- **Undo / Redo** — powered by Yjs's `Y.UndoManager`, consistent across all connected users
- **Select & transform** — move, resize, and restyle any shape

### ⚡ Real-Time Collaboration
- **Conflict-free synchronization** — shapes live in a Yjs CRDT document, so every client converges to the same state without a central authority
- **Live cursors** — every participant's cursor (name + color) streams in real time
- **Users panel** — see who's in the room and their assigned color
- **Viewport sync** — pan/zoom state can be shared so collaborators see the same area
- **Connection status** — live connected/offline indicator in the toolbar
- **Ambient particle overlay** — subtle canvas effect for visual polish

### 🗄️ Persistence
- **Periodic snapshots** — each room's Yjs document is persisted to the database every 30 seconds, so boards survive restarts
- **Dual database adapters** — Neon PostgreSQL in production, SQLite for zero-config local development (via Prisma)
- **Rich shape model** — geometry, styling, z-index, and creator stored for every shape

### 🏗️ Production-Ready Architecture
- **Typed end-to-end API** — tRPC v11 + superjson + zod for type-safe room and shape operations
- **Scalable WebSocket layer** — Socket.io with an optional Redis pub/sub adapter for horizontal scaling
- **Deployable** — Render blueprint for the real-time server, Vercel for the Next.js frontend

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| Canvas | Konva / react-konva |
| Real-time sync | Yjs (CRDT) with binary updates over Socket.io |
| Typed API | tRPC v11, superjson, zod |
| Persistence | Prisma 7 + Neon PostgreSQL (prod) / SQLite (dev) |
| Scaling | Socket.io Redis pub/sub adapter (ioredis) |
| Styling | Tailwind CSS 4 |

---

## Quick Start

### Prerequisites
- Node.js 18+ (Node 20 recommended)
- A PostgreSQL database — [Neon](https://neon.tech) is free and works out of the box (optional for local dev; SQLite is used by default)

### 1. Clone & install

```bash
git clone https://github.com/venom20021/real_time_collaborative_whiteboard.git
cd real_time_collaborative_whiteboard
npm install   # postinstall runs `prisma generate`
```

### 2. Configure the database

By default the app uses a local SQLite file (`file:./dev.db`) — nothing to configure.

For a shared Postgres database (recommended for multi-instance deploys), create a `.env` file:

```bash
# PostgreSQL (Neon) — the app auto-detects and switches to the Neon adapter
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

Then push the schema:

```bash
npm run db:push    # or npm run db:migrate
```

### 3. Start the real-time server

```bash
npm run server     # Socket.io + Yjs server on http://localhost:3001 (tsx watch)
```

### 4. Start the frontend

```bash
npm run dev        # Next.js app on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000), create or join a room, and open it in a second tab to see real-time collaboration in action.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Socket.io / Yjs server port |
| `DATABASE_URL` | `file:./dev.db` | Prisma connection string (PostgreSQL/Neon or SQLite) |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated list of allowed frontend origins |
| `REDIS_URL` | — | Enables the Socket.io Redis pub/sub adapter for horizontal scaling |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3001` | WebSocket URL the frontend connects to |

---

## Deployment

### Real-time server → Render
The repo ships a [`render.yaml`](render.yaml) blueprint (Node 20) that starts the Socket.io server with `npx tsx server/index.ts`. Set `DATABASE_URL`, `CORS_ORIGIN`, and optionally `REDIS_URL` as environment variables.

### Frontend → Vercel
The Next.js app deploys to Vercel with zero config ([`vercel.json`](vercel.json)). Point `NEXT_PUBLIC_WS_URL` at your Render server's URL.

---

## Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router (page, TRPCProvider, /api/trpc route)
│   ├── components/Whiteboard/  # WhiteboardCanvas, Toolbar, CursorOverlay, UsersPanel, ShapeRenderer, TextEditOverlay, ParticleOverlay
│   ├── hooks/useWhiteboard.ts  # Yjs doc, undo manager, cursor + shape sync
│   ├── lib/                    # socket.io client, prisma client, id helpers
│   ├── trpc/                   # tRPC router (rooms, shapes), server + client setup
│   └── types/shared.ts         # Shared Shape / Cursor / Tool types
├── server/
│   ├── index.ts                # HTTP server, Redis adapter, Y.Doc store, persistence
│   └── db.ts                   # Prisma client (Neon / SQLite adapters)
├── prisma/
│   └── schema.prisma           # User, Room, RoomParticipant, Shape models
├── render.yaml                 # Render blueprint for the real-time server
└── vercel.json                 # Vercel config for the frontend
```

---

## How It Works

1. **Joining a room** — the frontend calls tRPC (`room.join`) and opens a Socket.io connection.
2. **CRDT document** — each room maps to a Yjs `Y.Doc` on the server; all shapes live in a `Y.Map` named `shapes`.
3. **Sync** — Yjs updates are binary-encoded and exchanged over the WebSocket; Yjs's CRDT algorithm guarantees every client converges to the same state, even with concurrent edits from multiple users.
4. **Presence** — cursor positions, user names, and colors are broadcast through Socket.io, independent of the document state.
5. **Persistence** — the server snapshots each room's document to the database every 30 seconds, so boards survive restarts.
6. **Scaling** — with `REDIS_URL` set, Socket.io uses a Redis pub/sub adapter so multiple server instances share rooms and events.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js frontend |
| `npm run server` | Start the real-time server with hot reload |
| `npm run server:start` | Start the real-time server (no watch) |
| `npm run build` / `start` | Production build / start the frontend |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Run a dev migration |
| `npm run db:push` | Push the schema to the database |
| `npm run db:studio` | Open Prisma Studio |

---

## Acknowledgments

- [Yjs](https://yjs.dev) — CRDT-based real-time collaboration
- [Socket.io](https://socket.io) — WebSocket transport and scaling
- [Konva](https://konvajs.org) — HTML5 canvas rendering
- [tRPC](https://trpc.io) — End-to-end typesafe APIs
- [Prisma](https://prisma.io) — Database access and migrations
