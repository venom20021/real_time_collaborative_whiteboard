import { router } from "./init";
import { roomsRouter } from "./routers/rooms";
import { shapesRouter } from "./routers/shapes";

export const appRouter = router({
  room: roomsRouter,
  shape: shapesRouter,
});

export type AppRouter = typeof appRouter;
