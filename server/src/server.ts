import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { closeDatabase } from './database.js';
import { errorHandler, logger, authMiddleware, validateJson } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import canvasRoutes from './routes/canvas.js';
import brigadeRoutes from './routes/brigades.js';
import realtimeRoutes from './routes/realtime.js';

const app = express();
const PORT = parseInt(process.env.PORT || '5000');
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const CORS_ORIGINS = CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);

// ==================== MIDDLEWARE ====================
console.log('Allowed CORS origins:', CORS_ORIGINS);
app.use(cors({
  origin: (origin, callback) => {
    // Если нет origin (например, запрос с того же домена), разрешаем
    if (!origin) return callback(null, true);
    
    // Проверяем, есть ли origin в списке разрешенных
    if (CORS_ORIGINS.includes(origin)) {
      return callback(null, origin);
    }
    
    // Разрешаем локальные IP на портах 8080, 8081, 5173
    if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+):(8080|8081|5173)$/)) {
      return callback(null, origin);
    }
    
    // Разрешаем KeenDNS домены
    if (origin.match(/^https?:\/\/[\w-]+\.keenetic\.link(:\d+)?$/)) {
      return callback(null, origin);
    }

    // Разрешаем Cloudflare Quick Tunnel (поддомен меняется при каждом запуске)
    if (origin.match(/^https?:\/\/[\w-]+\.trycloudflare\.com(:\d+)?$/)) {
      return callback(null, origin);
    }
    
    // Отклоняем все остальные
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(logger);
app.use(validateJson);

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Data routes (требуют аутентификации)
app.use('/api/data', authMiddleware, dataRoutes);

// Canvas routes (требуют аутентификации)
app.use('/api/canvas', authMiddleware, canvasRoutes);

// Brigade routes (требуют аутентификации)
app.use('/api/brigades', authMiddleware, brigadeRoutes);

// Realtime: стрим событий и догоняющая синхронизация
// (авторизация внутри роутов: query-токен для SSE, заголовок для /sync)
app.use('/api', realtimeRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`
    }
  });
});

// Error handler
app.use(errorHandler);

// ==================== SERVER STARTUP ====================
const server = app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📝 API Documentation:`);
  console.log(`   - Health Check: http://${HOST}:${PORT}/api/health`);
  console.log(`   - Auth: http://${HOST}:${PORT}/api/auth/*`);
  console.log(`   - Data: http://${HOST}:${PORT}/api/data/*`);
  console.log(`   - Canvas: http://${HOST}:${PORT}/api/canvas/*`);
  console.log(`✅ Server is ready to accept requests\n`);
});

// ==================== GRACEFUL SHUTDOWN ====================
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  server.close(async () => {
    console.log('Server closed');
    try {
      await closeDatabase();
      console.log('Database connection closed');
      process.exit(0);
    } catch (error) {
      console.error('Error closing database:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;
