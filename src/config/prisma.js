require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});
const { PrismaClient } = require("@prisma/client");

// Ensure DATABASE_URL is available
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
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

// Middleware for caching and timeout handling
prisma.$use(async (params, next) => {
  const cacheKey = `${params.model}-${params.action}-${JSON.stringify(
    params.args
  )}`;

  // Check cache for read operations
  if (["findUnique", "findFirst", "findMany"].includes(params.action)) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  try {
    // Execute the query with timeout
    const result = await Promise.race([
      next(params),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Database query timeout")),
          parseInt(process.env.DB_QUERY_TIMEOUT) || 15000
        )
      ),
    ]);

    // Cache the result for read operations
    if (["findUnique", "findFirst", "findMany"].includes(params.action)) {
      queryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });
    }

    return result;
  } catch (error) {
    if (error.message === "Database query timeout") {
      console.error(
        `Query timeout exceeded ${process.env.DB_QUERY_TIMEOUT}ms for operation: ${params.model}.${params.action}`
      );
    }
    throw error;
  }
});

// Cleanup old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of queryCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      queryCache.delete(key);
    }
  }
}, CACHE_TTL);

module.exports = { prisma };
