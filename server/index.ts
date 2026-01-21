/**
 * Foundry API Server
 * @see Architecture Document
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load environment variables
import './config/env.js';

// Import database
import { testConnection, closeConnection } from './db/index.js';

// Import middleware
import { errorHandler } from './middleware/error-handler.js';
import { standardLimiter } from './middleware/rate-limit.js';

// Import routes
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import projectsRouter from './routes/projects.js';
import dataSourcesRouter from './routes/data-sources.js';
import schemaMappingsRouter from './routes/schema-mappings.js';
import jobsRouter from './routes/jobs.js';
import datasetsRouter from './routes/datasets.js';
import oauthRouter from './routes/oauth.js';
import organisationsRouter from './routes/organisations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN?.split(',') || []
    : true,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Ensure upload directory exists
const uploadsDir = '/tmp/uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Apply rate limiting to all API routes
app.use('/api', standardLimiter);

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/data-sources', dataSourcesRouter);
app.use('/api/schema-mappings', schemaMappingsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/organisations', organisationsRouter);

// Mount nested routes for data sources, schema mappings, jobs, datasets
app.use('/api', dataSourcesRouter);
app.use('/api', schemaMappingsRouter);
app.use('/api', jobsRouter);
app.use('/api', datasetsRouter);

// Static files for production
const staticPath = path.join(process.cwd(), 'dist', 'public');
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));

  // SPA fallback - serve index.html for non-API routes
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(staticPath, 'index.html'));
    } else {
      next();
    }
  });
}

// Global error handler - MUST be last
app.use(errorHandler);

// Graceful shutdown
let server: ReturnType<typeof app.listen>;

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);

  server.close(async () => {
    console.log('HTTP server closed');
    await closeConnection();
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Test database connection
    await testConnection();

    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
