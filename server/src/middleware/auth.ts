import { Request, Response, NextFunction } from 'express';
import { AppError, AuthenticationError, AuthorizationError, ValidationError } from '../utils/errors.js';
import { verifyToken, TokenPayload } from '../auth.js';
import fs from 'fs';
import path from 'path';

// Расширить тип Express Request
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Token is required'));
  }

  const token = authHeader.substring(7);

  try {
    const user = verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError('Token is required'));
    }

    // Определяем уровни доступа: user < manager < admin
    const roleLevels: Record<string, number> = {
      'user': 1,
      'manager': 2,
      'admin': 3
    };

    const userLevel = roleLevels[req.user.role] || 0;
    const requiredLevel = roleLevels[requiredRole] || 0;

    if (userLevel < requiredLevel) {
      return next(new AuthorizationError(`${requiredRole} access required`));
    }

    next();
  };
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AuthenticationError('Token is required'));
  }

  if (req.user.role !== 'admin') {
    return next(new AuthorizationError('Admin access required'));
  }

  next();
};

export const validateUserOwnership = (resourceUserId: string, req: Request) => {
  if (!req.user) {
    throw new AuthenticationError('Token is required');
  }

  if (req.user.id !== resourceUserId && req.user.role !== 'admin') {
    throw new AuthorizationError('Access denied');
  }
};

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  // Логирование ошибки
  const logDir = process.env.LOG_DIR || './logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logMessage = `[${new Date().toISOString()}] ${err.name || 'Error'}: ${err.message}\n${err.stack || ''}\n`;
  fs.appendFileSync(path.join(logDir, 'error.log'), logMessage);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message
      }
    });
  }

  // Обработка ошибок валидации Express
  if (err.status && err.message) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message
      }
    });
  }

  // Неизвестная ошибка
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    }
  });
};

export const logger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logDir = process.env.LOG_DIR || './logs';

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logMessage = `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms\n`;
    fs.appendFileSync(path.join(logDir, 'access.log'), logMessage);
  });

  next();
};

export const validateJson = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    if (!req.is('application/json')) {
      return next(new ValidationError('Content-Type must be application/json'));
    }
  }
  next();
};
