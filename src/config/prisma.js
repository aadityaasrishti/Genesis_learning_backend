require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { PrismaClient } = require("@prisma/client");

// Ensure DATABASE_URL is available
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"], // Removed "query" from log options
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  errorFormat: "pretty",
  __internal: {
    engine: {
      queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 15000,
      protocolTimeout: parseInt(process.env.DB_PROTOCOL_TIMEOUT) || 15000,
      cacheQueries: true,
      metrics: true,
    },
  },
});

// Create a query cache map
const queryCache = new Map();
const CACHE_TTL = parseInt(process.env.DB_CACHE_TTL) || 30000;

// Add middleware for caching and error handling
prisma.$use(async (params, next) => {
  try {
    // Only cache GET operations
    if (
      params.action === "findMany" ||
      params.action === "findFirst" ||
      params.action === "findUnique"
    ) {
      const cacheKey = JSON.stringify(params);
      const cached = queryCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }

      const result = await next(params);
      queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    // For mutations, invalidate the cache
    if (
      params.action === "create" ||
      params.action === "update" ||
      params.action === "delete"
    ) {
      queryCache.clear();
    }

    return next(params);
  } catch (error) {
    console.error(
      `Database query error in ${params.model}.${params.action}:`,
      error
    );
    throw error;
  }
});

// Remove query event listener and keep only error events
prisma.$on("error", (e) => {
  console.error("Database error:", e);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit();
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit();
});

module.exports = { prisma };
