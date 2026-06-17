import type { Shape as DbShape, Room as DbRoom, User as DbUser } from "../../prisma/generated/prisma/client";

// ---- Tool type (shared between Toolbar and Canvas) ----
export type Tool = "select" | "pen" | "eraser" | "rect" | "circle" | "line" | "arrow" | "text" | "path" | "image" | "pan";

// ---- Database entity types (re-exported for convenience) ----
export type { DbShape, DbRoom, DbUser };

// ---- Shape types ----
export type ShapeType = "rect" | "circle" | "line" | "text" | "arrow" | "image" | "path";

export interface ShapeData {
  text?: string;
  path?: { x: number; y: number }[];
  points?: number[];
  src?: string; // for image shapes
  borderRadius?: number;
}

export type Shape = Omit<DbShape, "data"> & {
  data: ShapeData | null;
};

// ---- Room types ----
export type Room = DbRoom;

// ---- User types ----
export type User = DbUser;

// ---- WebSocket event types ----
export enum WS_EVENTS {
  JOIN_ROOM = "room:join",
  LEAVE_ROOM = "room:leave",
  YJS_UPDATE = "yjs:update",
  YJS_AWARENESS = "yjs:awareness",
  SHAPE_CREATED = "shape:created",
  SHAPE_UPDATED = "shape:updated",
  SHAPE_DELETED = "shape:deleted",
  ROOM_STATE = "room:state",
  CURSOR_MOVE = "cursor:move",
  CURSOR_UPDATE = "cursor:update",
  USER_JOINED = "user:joined",
  USER_LEFT = "user:left",
  VIEWPORT_MOVE = "viewport:move",
  VIEWPORT_UPDATE = "viewport:update",
}

// ---- Viewport sync types ----
export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

// ---- Cursor/awareness types ----
export interface CursorPosition {
  x: number;
  y: number;
}

export interface CursorData {
  userId: string;
  userName: string;
  color: string;
  position: CursorPosition | null;
  lastActive: number;
  tool?: Tool;
}

export interface RoomState {
  roomId: string;
  users: CursorData[];
  shapes: Shape[];
}

// ---- tRPC input/output types ----
export interface CreateRoomInput {
  name: string;
  userId?: string;
}

export interface JoinRoomInput {
  roomId: string;
  userName: string;
  userColor?: string;
}

export interface ShapeInput {
  roomId: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  opacity?: number;
  data?: ShapeData;
  createdBy?: string;
}

export interface ShapeUpdateInput {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  data?: ShapeData;
}
