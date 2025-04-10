require('dotenv').config();

const config = {
  database: {
    url: process.env.DATABASE_URL,
    queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 15000,
    protocolTimeout: parseInt(process.env.DB_PROTOCOL_TIMEOUT) || 15000,
    cacheTTL: parseInt(process.env.DB_CACHE_TTL) || 30000
  },
  server: {
    port: parseInt(process.env.PORT) || 5000,
    httpPort: parseInt(process.env.HTTP_PORT) || 8080,
    environment: process.env.NODE_ENV || 'development'
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '24h'
  },
  cors: {
    origins: JSON.parse(process.env.CORS_ORIGINS || '["https://localhost:5173"]')
  },
  ssl: {
    keyPath: process.env.SSL_KEY_PATH,
    certPath: process.env.SSL_CERT_PATH
  }
};

module.exports = config;
