// One Prisma client per function instance. On Neon we use the serverless driver for fast cold starts.
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

let client: PrismaClient | undefined;

export function db(): PrismaClient {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (url && url.includes("neon.tech")) {
    client = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  } else {
    client = new PrismaClient();
  }
  return client;
}

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
