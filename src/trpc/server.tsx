import { createCallerFactory } from "./init";
import { appRouter } from "./router";
import { createTRPCContext } from "./init";
import { cache } from "react";

export const getCaller = cache(async () => {
  const ctx = await createTRPCContext();
  const createCaller = createCallerFactory(appRouter);
  return createCaller(ctx);
});
