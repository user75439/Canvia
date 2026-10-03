import { Router, Request, Response, NextFunction } from 'express';
import { validateLoginCredentials, generateToken, createUser, hashPassword } from '../auth.js';
import { authMiddleware, requireAdmin, requireRole } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';
import { db } from '../database.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      throw new ValidationError('Login and password are required');
    }

    const user = await validateLoginCredentials(login, password);
    const token = generateToken(user.id, user.login, user.role);

    // Проверка на дефолтный пароль
    const isDefaultPassword = login === 'admin' && password === 'admin';
    
    res.json({
      success: true,
      userId: user.id,
      login: user.login,
      role: user.role,
      token,
      expiresIn: '7d',
      warning: isDefaultPassword ? 'SECURITY_WARNING: Using default password! Please change it immediately.' : undefined
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/register (только админ)
router.post('/register', authMiddleware, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { login, password, role = 'user' } = req.body;

    const user = await createUser(login, password, role);

    res.status(201).json({
      success: true,
      user,
      message: 'User created successfully'
    });
  } catch (error) {
    next(error);
  }
});


// GET /api/auth/me - получить информацию о текущем пользователе
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({
    success: true,
    userId: req.user!.id,
    login: req.user!.login,
    role: req.user!.role
  });
});

// POST /api/auth/verify
router.post('/verify', authMiddleware, (req: Request, res: Response) => {
  res.json({
    success: true,
    id: req.user!.id,
    login: req.user!.login,
    role: req.user!.role
  });
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// GET /api/auth/users (менеджер и выше)
router.get('/users', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    db.all('SELECT id, login, role FROM users ORDER BY login', (err, rows) => {
      if (err) {
        return next(err);
      }
      
      res.json({
        success: true,
        users: (rows as any[]).map(u => ({
          id: u.id,
          login: u.login,
          role: u.role
        }))
      });
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/auth/users/:id (только админ)
router.delete('/users/:id', authMiddleware, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // Нельзя удалить себя
    if (id === req.user!.id) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Cannot delete yourself' }
      });
    }
    
    db.run('DELETE FROM users WHERE id = ?', [id], (err) => {
      if (err) {
        return next(err);
      }
      
      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/auth/users/:id/role (только админ)
router.patch('/users/:id/role', authMiddleware, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'manager', 'user'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid role. Must be admin, manager, or user' }
      });
    }
    
    // Нельзя изменить свою роль
    if (id === req.user!.id) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Cannot change your own role' }
      });
    }
    
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, id], (err) => {
      if (err) {
        return next(err);
      }
      
      res.json({
        success: true,
        message: 'User role updated successfully'
      });
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/auth/users/:id/password (только админ)
router.patch('/users/:id/password', authMiddleware, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password || password.length < 3) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Password must be at least 3 characters' }
      });
    }
    
    const hashedPassword = await hashPassword(password);
    
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id], (err) => {
      if (err) {
        return next(err);
      }
      
      res.json({
        success: true,
        message: 'User password updated successfully'
      });
    });
  } catch (error) {
    next(error);
  }
});

export default router;
