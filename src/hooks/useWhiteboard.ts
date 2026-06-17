"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { getSocket, connectSocket, disconnectSocket } from "@/lib/socket";
import type { Shape, CursorData, Tool, ViewportState } from "@/types/shared";
import { generateId } from "@/lib/id";

// ---- Binary encoding helpers for Yjs updates over WebSocket ----
function uint8ArrayToBase64(u8: Uint8Array): string {
  return btoa(String.fromCharCode(...u8));
}

function base64ToUint8Array(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

interface UseWhiteboardOptions {
  roomId: string;
  userId: string;
  userName: string;
  userColor: string;
  onViewportUpdate?: (viewport: ViewportState) => void;
}

interface UseWhiteboardReturn {
  shapes: Shape[];
  cursors: Map<string, CursorData>;
  connected: boolean;
  addShape: (shape: any) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  moveCursor: (position: { x: number; y: number } | null, tool?: Tool) => void;
  syncViewport: (viewport: ViewportState) => void;
  undo: () => void;
  redo: () => void;
}

export function useWhiteboard({
  roomId,
  userId,
  userName,
  userColor,
  onViewportUpdate,
}: UseWhiteboardOptions): UseWhiteboardReturn {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map());
  const [connected, setConnected] = useState(false);
  const ydocRef = useRef<Y.Doc | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  // Initialize Yjs doc and socket connection
  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const shapesMap = ydoc.getMap("shapes");

    // Undo manager
    undoManagerRef.current = new Y.UndoManager([shapesMap], {
      trackedOrigins: new Set([null]), // track all origins
    });

    // Listen for Yjs changes
    const observer = () => {
      const currentShapes = Array.from(shapesMap.values()) as Shape[];
      setShapes(currentShapes);
    };
    shapesMap.observe(observer);

    // Connect to WebSocket
    const socket = connectSocket();
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:join", { roomId, userId, userName, userColor });
    });
    socket.on("disconnect", () => setConnected(false));

    // Handle Yjs sync from server
    socket.on("yjs:sync", (base64Data: string) => {
      try {
        Y.applyUpdate(ydoc, base64ToUint8Array(base64Data));
      } catch (err) {
        console.error("[yjs] Error applying sync:", err);
      }
    });

    // Handle Yjs updates from other clients
    socket.on("yjs:update", (base64Data: string) => {
      try {
        Y.applyUpdate(ydoc, base64ToUint8Array(base64Data));
      } catch (err) {
        console.error("[yjs] Error applying update:", err);
      }
    });

    // Send local Yjs updates to server
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      // Don't echo back updates we received from the server
      if (origin === socket) return;
      socket.emit("yjs:update", uint8ArrayToBase64(update));
    };
    ydoc.on("update", updateHandler);

    // Handle room state
    socket.on("room:state", ({ shapes: roomShapes }: { shapes: Shape[] }) => {
      ydoc.transact(() => {
        shapesMap.clear();
        for (const shape of roomShapes) {
          shapesMap.set(shape.id, shape);
        }
      });
    });

    // Cursor updates
    socket.on("cursor:update", (data: CursorData) => {
      setCursors((prev) => {
        const next = new Map(prev);
        if (data.position) {
          next.set(data.userId, data);
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    });

    // User left
    socket.on("user:left", ({ userId: leftUserId }: { userId: string }) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(leftUserId);
        return next;
      });
    });

    // Viewport sync from other users
    socket.on("viewport:update", (data: { x: number; y: number; scale: number }) => {
      onViewportUpdate?.(data);
    });

    // If already connected, join room immediately
    if (socket.connected) {
      socket.emit("room:join", { roomId, userId, userName, userColor });
    }

    return () => {
      shapesMap.unobserve(observer);
      ydoc.off("update", updateHandler);
      socket.off("yjs:sync");
      socket.off("yjs:update");
      socket.off("room:state");
      socket.off("cursor:update");
      socket.off("viewport:update");
      socket.off("user:left");
      socket.off("connect");
      disconnectSocket();
      ydoc.destroy();
    };
  }, [roomId, userId, userName, userColor]);

  const addShape = useCallback(
    (shapeData: any) => {
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      const shapesMap = ydoc.getMap("shapes");
      const id = shapeData.id || generateId();
      const shape = {
        ...shapeData,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Shape;
      shapesMap.set(id, shape);
    },
    []
  );

  const updateShape = useCallback((id: string, updates: Partial<Shape>) => {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    const shapesMap = ydoc.getMap("shapes");
    const existing = shapesMap.get(id) as Record<string, unknown> | undefined;
    if (existing) {
      shapesMap.set(id, {
        ...existing,
        ...updates,
        updatedAt: new Date(),
      });
    }
  }, []);

  const deleteShape = useCallback((id: string) => {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    const shapesMap = ydoc.getMap("shapes");
    shapesMap.delete(id);
  }, []);

  const moveCursor = useCallback(
    (position: { x: number; y: number } | null, tool?: Tool) => {
      const socket = getSocket();
      if (position) {
        socket.emit("cursor:move", { position, tool });
      }
    },
    []
  );

  const syncViewport = useCallback(
    (viewport: { x: number; y: number; scale: number }) => {
      const socket = getSocket();
      socket.emit("viewport:move", viewport);
    },
    []
  );

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  return {
    shapes,
    cursors,
    connected,
    addShape,
    updateShape,
    deleteShape,
    moveCursor,
    syncViewport,
    undo,
    redo,
  };
}
