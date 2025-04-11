require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});
const { PrismaClient } = require("@prisma/client");

// Ensure DATABASE_URL is available
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Higher timeout for batch operations
const BATCH_TIMEOUT = parseInt(process.env.DB_QUERY_TIMEOUT) * 3 || 45000;

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
  const cacheKey = `${params.model}-${params.action}-${JSON.stringify(params.args)}`;
  const isBatchOperation = params.action.includes('Many') || params.action === 'deleteMany';
  const timeoutDuration = isBatchOperation ? BATCH_TIMEOUT : (parseInt(process.env.DB_QUERY_TIMEOUT) || 15000);

  // Check cache for read operations
  if (["findUnique", "findFirst", "findMany"].includes(params.action)) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  try {
    // Execute the query with appropriate timeout
    const result = await Promise.race([
      next(params),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Database query timeout after ${timeoutDuration}ms`)),
          timeoutDuration
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
    if (error.message.includes("Database query timeout")) {
      console.error(`Query timeout exceeded ${timeoutDuration}ms for operation:`, {
        model: params.model,
        action: params.action,
        isBatchOperation,
        args: params.args
      });
      
      // For batch operations, try to split into smaller chunks if possible
      if (isBatchOperation && params.action === 'deleteMany' && Array.isArray(params.args?.where?.id?.in)) {
        const ids = params.args.where.id.in;
        const chunkSize = Math.ceil(ids.length / 3);
        console.log(`Retrying deleteMany operation in chunks of ${chunkSize}`);
        
        // Split into chunks and retry
        const chunks = [];
        for (let i = 0; i < ids.length; i += chunkSize) {
          chunks.push(ids.slice(i, i + chunkSize));
        }
        
        const results = await Promise.all(
          chunks.map(chunk => 
            prisma[params.model].deleteMany({
              ...params.args,
              where: { ...params.args.where, id: { in: chunk } }
            })
          )
        );
        
        return results.reduce((acc, curr) => ({ count: acc.count + curr.count }), { count: 0 });
      }
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
