import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { allAsync, getAsync, runAsync } from '../database.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { emitRealtime } from '../realtime.js';

const router = Router();
const SHARED_USER_ID = 'shared-user';

// ==================== INSTALLERS ====================

// GET /api/data/installers
router.get('/installers', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const installers = await allAsync(
      'SELECT id, name, phone, status, createdAt FROM installers ORDER BY createdAt DESC'
    );

    res.json({
      success: true,
      data: installers
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/data/installers
router.post('/installers', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name = 'Не указано', phone = '', status = 'free' } = req.body;

    // Поля теперь опциональные - можно создать монтажника с неполными данными

    const id = uuidv4();

    await runAsync(
      'INSERT INTO installers (id, userId, name, phone, status) VALUES (?, ?, ?, ?, ?)',
      [id, SHARED_USER_ID, name, phone, status]
    );

    const installer = await getAsync('SELECT id, name, phone, status, createdAt FROM installers WHERE id = ?', [id]);

    emitRealtime('installer', 'created', { data: installer });

    res.status(201).json({
      success: true,
      data: installer,
      message: 'Installer created successfully'
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/data/installers/:id
router.put('/installers/:id', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, phone, status } = req.body;

    const installer = await getAsync('SELECT id FROM installers WHERE id = ?', [id]);

    if (!installer) {
      throw new NotFoundError('Installer');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        data: installer
      });
    }

    values.push(id);

    await runAsync(
      `UPDATE installers SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await getAsync('SELECT id, name, phone, status, createdAt FROM installers WHERE id = ?', [id]);

    emitRealtime('installer', 'updated', { data: updated });

    res.json({
      success: true,
      data: updated,
      message: 'Installer updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/data/installers/:id
router.delete('/installers/:id', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    console.log('[DELETE /installers/:id] Deleting installer:', id);

    const installer = await getAsync('SELECT id FROM installers WHERE id = ?', [id]);

    if (!installer) {
      throw new NotFoundError('Installer');
    }

    await runAsync('DELETE FROM installers WHERE id = ?', [id]);
    console.log('[DELETE /installers/:id] Deleted successfully');

    emitRealtime('installer', 'deleted', { id });

    res.json({
      success: true,
      message: 'Installer deleted successfully'
    });
  } catch (error) {
    console.error('[DELETE /installers/:id] error:', error);
    next(error);
  }
});

// ==================== ORDERS ====================

// GET /api/data/orders
router.get('/orders', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await allAsync(
      'SELECT id, number, address, description, deadline, status, shift, workDone, createdBy, createdAt FROM orders ORDER BY createdAt DESC'
    );

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/data/orders
router.post('/orders', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { 
      number,
      address = 'Не указан',
      description = 'Не указано',
      deadline = new Date().toISOString().split('T')[0],
      status = 'new',
      shift = 'day',
      workDone = '',
      createdBy
    } = req.body;

    // Если createdBy не передан, используем login текущего пользователя
    if (!createdBy && req.user) {
      createdBy = req.user.login;
    }

    // Автогенерация номера наряда если не указан
    if (!number) {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      number = `N${timestamp}${random}`;
    }

    // Валидация смены
    if (!['day', 'evening'].includes(shift)) {
      shift = 'day';
    }

    // Проверяем уникальность номера заказа
    const existing = await getAsync('SELECT id FROM orders WHERE number = ?', [number]);
    if (existing) {
      // Если коллизия, добавляем еще одну цифру
      number += Math.floor(Math.random() * 10);
    }

    const id = uuidv4();

    await runAsync(
      'INSERT INTO orders (id, userId, number, address, description, deadline, status, shift, workDone, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, SHARED_USER_ID, number, address, description, deadline, status, shift, workDone, createdBy || 'unknown']
    );

    const order = await getAsync(
      'SELECT id, number, address, description, deadline, status, shift, workDone, createdBy, createdAt FROM orders WHERE id = ?',
      [id]
    );

    emitRealtime('order', 'created', { data: order });

    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully'
    });
  } catch (error) {
    next(error);
  }
});

// PUT /PATCH /api/data/orders/:id
router.put('/orders/:id', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { number, address, description, deadline, status, shift, workDone } = req.body;

    const order = await getAsync('SELECT id FROM orders WHERE id = ?', [id]);

    if (!order) {
      throw new NotFoundError('Order');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (number !== undefined) {
      updates.push('number = ?');
      values.push(number);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      values.push(address);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (deadline !== undefined) {
      updates.push('deadline = ?');
      values.push(deadline);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (shift !== undefined) {
      if (!['day', 'evening'].includes(shift)) {
        throw new ValidationError('shift must be "day" or "evening"');
      }
      updates.push('shift = ?');
      values.push(shift);
    }
    if (workDone !== undefined) {
      updates.push('workDone = ?');
      values.push(workDone);
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        data: order
      });
    }

    values.push(id);

    await runAsync(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await getAsync(
      'SELECT id, number, address, description, deadline, status, shift, workDone, createdBy, createdAt FROM orders WHERE id = ?',
      [id]
    );

    emitRealtime('order', 'updated', { data: updated });

    res.json({
      success: true,
      data: updated,
      message: 'Order updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// PATCH поддерживает ту же логику, что и PUT
router.patch('/orders/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { number, address, description, deadline, status, shift, workDone } = req.body;

    const order = await getAsync('SELECT id FROM orders WHERE id = ?', [id]);

    if (!order) {
      throw new NotFoundError('Order');
    }

    const updates: string[] = [];
    const values: any[] = [];

    // Пользователь (монтажник) заполняет только отчёт о работе
    if (req.user!.role === 'user') {
      if (workDone !== undefined) {
        updates.push('workDone = ?');
        values.push(workDone);
      }
      if (updates.length === 0) {
        throw new ValidationError('Users can only update work report');
      }
    } else {
      // Менеджер и админ могут менять всё
      if (number !== undefined) {
        updates.push('number = ?');
        values.push(number);
      }
      if (address !== undefined) {
        updates.push('address = ?');
        values.push(address);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
      }
      if (deadline !== undefined) {
        updates.push('deadline = ?');
        values.push(deadline);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      if (shift !== undefined) {
        if (!['day', 'evening'].includes(shift)) {
          throw new ValidationError('shift must be "day" or "evening"');
        }
        updates.push('shift = ?');
        values.push(shift);
      }
      if (workDone !== undefined) {
        updates.push('workDone = ?');
        values.push(workDone);
      }
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        data: order
      });
    }

    values.push(id);

    await runAsync(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await getAsync(
      'SELECT id, number, address, description, deadline, status, shift, workDone, createdBy, createdAt FROM orders WHERE id = ?',
      [id]
    );

    emitRealtime('order', 'updated', { data: updated });

    res.json({
      success: true,
      data: updated,
      message: 'Order updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/data/orders/:id
router.delete('/orders/:id', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const order = await getAsync('SELECT id FROM orders WHERE id = ?', [id]);

    if (!order) {
      throw new NotFoundError('Order');
    }

    await runAsync('DELETE FROM orders WHERE id = ?', [id]);

    emitRealtime('order', 'deleted', { id });

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
