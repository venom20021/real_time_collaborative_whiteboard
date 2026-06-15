"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}
