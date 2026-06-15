import { PrismaClient } from "../../prisma/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || "";

  // Use Neon (PostgreSQL) adapter if connecting to a remote PG database
  if (databaseUrl.includes("neon.tech") || databaseUrl.startsWith("postgresql://")) {
    const adapter = new PrismaNeon({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
  }

  // Fallback to SQLite for local development
  const url = databaseUrl || "file:./dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
