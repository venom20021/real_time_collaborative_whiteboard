import "dotenv/config";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import * as Y from "yjs";
import { prisma } from "./db.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";

const PORT = parseInt(process.env.PORT || "3001", 10);

// ---- HTTP + Socket.io Server ----
function parseCorsOrigins(raw: string | undefined): string | string[] {
  if (!raw) return "http://localhost:3000";
  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

const httpServer = http.createServer((req, res) => {
  // Health check endpoint for Render
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// ---- Redis Pub/Sub Adapter (for horizontal scaling) ----
if (process.env.REDIS_URL) {
  try {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();

    io.adapter(createAdapter(pubClient, subClient));
    console.log(`[redis] Redis pub/sub adapter enabled`);

    pubClient.on("error", (err) => console.error("[redis] Pub error:", err));
    subClient.on("error", (err) => console.error("[redis] Sub error:", err));
  } catch (err) {
    console.warn("[redis] Failed to initialize Redis adapter, running without scaling:", err);
  }
} else {
  console.log("[redis] No REDIS_URL set — running in single-instance mode");
}

// ---- Yjs Document Store ----
const docs = new Map<string, Y.Doc>();

interface AwarenessState {
  userId: string;
  userName: string;
  color: string;
  position: { x: number; y: number } | null;
  lastActive: number;
}

const roomAwareness = new Map<string, Map<string, AwarenessState>>();

const persistIntervals = new Map<string, ReturnType<typeof setInterval>>();

function getOrCreateDoc(roomId: string): Y.Doc {
  let doc = docs.get(roomId);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(roomId, doc);

    // Persist Yjs doc state to DB periodically
    const persistInterval = setInterval(async () => {
      try {
        await persistRoomState(roomId, doc!);
      } catch (err) {
        console.error(`[persist] Error persisting room ${roomId}:`, err);
      }
    }, 30_000); // every 30 seconds
    persistIntervals.set(roomId, persistInterval);

    // Clean up interval when doc is destroyed
    doc.on("destroy", () => {
      const interval = persistIntervals.get(roomId);
      if (interval) {
        clearInterval(interval);
        persistIntervals.delete(roomId);
      }
      docs.delete(roomId);
    });
  }
  return doc;
}

async function persistRoomState(roomId: string, doc: Y.Doc) {
  const shapesMap = doc.getMap("shapes");
  const shapesJson = shapesMap.toJSON() as Record<string, unknown>;

  const shapes = Object.entries(shapesJson).map(([id, shape]) => {
    const s = shape as Record<string, unknown>;
    return {
      id,
      roomId,
      type: (s.type as string) || "rect",
      x: (s.x as number) || 0,
      y: (s.y as number) || 0,
      width: (s.width as number) || 100,
      height: (s.height as number) || 100,
      fill: (s.fill as string) || "#6366f1",
      stroke: (s.stroke as string) || "#000000",
      strokeWidth: (s.strokeWidth as number) || 2,
      rotation: (s.rotation as number) || 0,
      opacity: (s.opacity as number) || 1,
      zIndex: (s.zIndex as number) || 0,
      data: s.data ? JSON.stringify(s.data) : null,
      createdBy: (s.createdBy as string) || null,
    };
  });

  try {
    // Replace all shapes in the room with the current Yjs state
    await prisma.$transaction(async (tx) => {
      await tx.shape.deleteMany({ where: { roomId } });
      if (shapes.length > 0) {
        await tx.shape.createMany({ data: shapes });
      }
    });
    console.log(`[persist] Saved ${shapes.length} shapes for room ${roomId}`);
  } catch (err) {
    console.error(`[persist] DB error for room ${roomId}:`, err);
  }
}

// Load initial shapes from DB into Yjs doc
async function loadRoomState(roomId: string, doc: Y.Doc) {
  try {
    const shapes = await prisma.shape.findMany({
      where: { roomId },
    });

    const shapesMap = doc.getMap("shapes");
    doc.transact(() => {
      for (const shape of shapes) {
        shapesMap.set(shape.id, {
          id: shape.id,
          type: shape.type,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          fill: shape.fill,
          stroke: shape.stroke,
          strokeWidth: shape.strokeWidth,
          rotation: shape.rotation,
          opacity: shape.opacity,
          zIndex: shape.zIndex,
          data: shape.data ? JSON.parse(shape.data) : null,
          createdBy: shape.createdBy,
        });
      }
    });
    console.log(
      `[load] Loaded ${shapes.length} shapes for room ${roomId}`
    );
  } catch (err) {
    console.error(`[load] Error loading room ${roomId}:`, err);
  }
}

// ---- Socket.io Connection Handling ----
io.on("connection", (socket) => {
  let currentRoom: string | null = null;
  let userId: string = socket.id;

  console.log(`[connect] ${socket.id} connected`);

  // ---- Room: Join ----
  socket.on("room:join", async ({ roomId, userId: uId, userName, userColor }) => {
    // Leave previous room
    if (currentRoom) {
      socket.leave(currentRoom);
      removeAwareness(currentRoom, userId);
    }

    currentRoom = roomId;
    userId = uId || socket.id;
    socket.join(roomId);

    // Get or create Yjs doc
    const doc = getOrCreateDoc(roomId);

    // Load state if this is the first connection
    if (!docs.has(roomId) || Array.from(doc.getMap("shapes").keys()).length === 0) {
      await loadRoomState(roomId, doc);
    }

    // Initialize awareness for this room
    if (!roomAwareness.has(roomId)) {
      roomAwareness.set(roomId, new Map());
    }
    const awareness = roomAwareness.get(roomId)!;
    awareness.set(userId, {
      userId,
      userName: userName || "Anonymous",
      color: userColor || "#6366f1",
      position: null,
      lastActive: Date.now(),
    });

    // Send current room state to the joining client
    const shapesArray = Array.from(doc.getMap("shapes").values());
    socket.emit("room:state", {
      roomId,
      shapes: shapesArray,
      users: Array.from(awareness.values()),
    });

    // Broadcast Yjs document to the new client
    const update = Y.encodeStateAsUpdate(doc);
    socket.emit("yjs:sync", Buffer.from(update).toString("base64"));

    // Notify others
    socket.to(roomId).emit("user:joined", {
      userId,
      userName: userName || "Anonymous",
      color: userColor || "#6366f1",
    });

    console.log(`[join] ${userId} joined room ${roomId}`);
  });

  // ---- Yjs: Receive and broadcast updates ----
  socket.on("yjs:update", (data: string) => {
    if (!currentRoom) return;
    const doc = docs.get(currentRoom);
    if (!doc) return;

    try {
      const update = Buffer.from(data, "base64");
      Y.applyUpdate(doc, update);

      // Broadcast to all other clients in the room
      socket.to(currentRoom).emit("yjs:update", data);
    } catch (err) {
      console.error("[yjs] Error applying update:", err);
    }
  });

  // ---- Awareness / Cursor position ----
  socket.on("cursor:move", (data: { position: { x: number; y: number }; tool?: string }) => {
    if (!currentRoom) return;
    const awareness = roomAwareness.get(currentRoom);
    if (!awareness) return;

    const state = awareness.get(userId);
    if (state) {
      state.position = data.position;
      state.lastActive = Date.now();
      (state as any).tool = data.tool;
      awareness.set(userId, state);
    }

    io.to(currentRoom).emit("cursor:update", {
      userId,
      position: data.position,
      userName: state?.userName || "Anonymous",
      color: state?.color || "#6366f1",
      tool: data.tool,
      lastActive: Date.now(),
    });
  });

  // ---- Viewport sync ----
  socket.on("viewport:move", (data: { x: number; y: number; scale: number }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("viewport:update", {
      userId,
      ...data,
    });
  });

  // ---- Shape events (for optimistic UI sync with DB) ----
  socket.on("shape:created", (shape: Record<string, unknown>) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("shape:created", shape);
  });

  socket.on("shape:updated", (shape: Record<string, unknown>) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("shape:updated", shape);
  });

  socket.on("shape:deleted", (data: { id: string }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("shape:deleted", data);
  });

  // ---- Disconnect ----
  socket.on("disconnect", () => {
    console.log(`[disconnect] ${userId} disconnected`);
    if (currentRoom) {
      removeAwareness(currentRoom, userId);
      io.to(currentRoom).emit("user:left", { userId });
    }
  });

  // ---- Room: Leave ----
  socket.on("room:leave", () => {
    if (currentRoom) {
      removeAwareness(currentRoom, userId);
      socket.to(currentRoom).emit("user:left", { userId });
      socket.leave(currentRoom);
      currentRoom = null;
    }
  });
});

function removeAwareness(roomId: string, uid: string) {
  const awareness = roomAwareness.get(roomId);
  if (awareness) {
    awareness.delete(uid);
    if (awareness.size === 0) {
      roomAwareness.delete(roomId);
    }
  }
}

// ---- Start Server ----
httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     Whiteboard Collaboration Server              ║
║     Listening on port ${PORT}                       ║
║     CORS origin: ${process.env.CORS_ORIGIN || "http://localhost:3000"} ║
╚══════════════════════════════════════════════════╝
  `);
});

// ---- Graceful Shutdown ----
process.on("SIGINT", async () => {
  console.log("\n[shutdown] Shutting down gracefully...");

  // Persist all rooms before exiting
  for (const [roomId, doc] of docs.entries()) {
    try {
      await persistRoomState(roomId, doc);
    } catch (err) {
      console.error(`[shutdown] Error persisting room ${roomId}:`, err);
    }
  }

  await prisma.$disconnect();
  io.close();
  process.exit(0);
});
