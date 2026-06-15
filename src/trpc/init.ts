import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const createTRPCContext = cache(async () => {
  return {
    prisma,
    // Future: add auth context here
    userId: null as string | null,
  };
});

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
