import { PrismaClient } from "../prisma/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || "";

  // Use Neon (PostgreSQL) adapter if connecting to a remote PG database
  if (databaseUrl.includes("neon.tech") || databaseUrl.startsWith("postgresql://")) {
    console.log("[db] Connecting to Neon PostgreSQL...");
    const adapter = new PrismaNeon({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
  }

  // Fallback to SQLite for local development
  console.log("[db] Connecting to SQLite...");
  const url = databaseUrl || "file:./dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = createPrismaClient();
