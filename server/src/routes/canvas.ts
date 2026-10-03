import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { allAsync, getAsync, runAsync } from '../database.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { emitRealtime } from '../realtime.js';

const router = Router();
const SHARED_USER_ID = 'shared-user';

// ==================== TABS ====================

// GET /api/canvas/tabs
router.get('/tabs', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tabs = await allAsync(
      `SELECT id, date, cameraX, cameraY, zoom, updatedAt FROM tab_states 
       ORDER BY date DESC`
    );

    res.json({
      success: true,
      data: tabs
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/canvas/tabs
router.post('/tabs', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.body;

    if (!date) {
      throw new ValidationError('Date is required');
    }

    // Проверяем существует ли уже таб для этой даты
    let tab = await getAsync(
      'SELECT id, date, cameraX, cameraY, zoom FROM tab_states WHERE date = ?',
      [date]
    );

    if (!tab) {
      const id = uuidv4();
      await runAsync(
        `INSERT INTO tab_states (id, userId, date, cameraX, cameraY, zoom) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, SHARED_USER_ID, date, 0, 0, 1]
      );

      tab = await getAsync(
        'SELECT id, date, cameraX, cameraY, zoom FROM tab_states WHERE id = ?',
        [id]
      );
    }

    res.status(201).json({
      success: true,
      data: tab
    });
  } catch (error) {
    next(error);
  }
});

// ==================== TILES ====================

// GET /api/canvas/tiles
// Если tabId не передан — возвращаем все плитки
router.get('/tiles', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tabId } = req.query;

    const query = tabId
      ? `SELECT id, tabId, type, dataId, x, y, groupId, name, details, createdAt FROM tiles WHERE tabId = ? ORDER BY createdAt DESC`
      : `SELECT id, tabId, type, dataId, x, y, groupId, name, details, createdAt FROM tiles ORDER BY createdAt DESC`;

    const params = tabId ? [tabId] : [];
    const tiles = await allAsync(query, params);

    res.json({
      success: true,
      data: tiles
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/canvas/tiles
router.post('/tiles', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, tabId, type, dataId, x = 0, y = 0, name, details } = req.body;

    if (!tabId || !type || !dataId) {
      throw new ValidationError('tabId, type and dataId are required');
    }

    if (!['installer', 'order', 'brigade'].includes(type)) {
      throw new ValidationError('type must be "installer", "order" or "brigade"');
    }

    // Валидация координат
    const xNum = Number(x);
    const yNum = Number(y);
    if (isNaN(xNum) || isNaN(yNum) || !isFinite(xNum) || !isFinite(yNum)) {
      console.error('[POST /tiles] Invalid coordinates received:', { x, y, xNum, yNum });
      throw new ValidationError('x and y must be valid numbers');
    }

    // Используем ID от клиента или генерируем новый
    const tileId = id || uuidv4();

    await runAsync(
      `INSERT INTO tiles (id, userId, tabId, type, dataId, x, y, name, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tileId, SHARED_USER_ID, tabId, type, dataId, xNum, yNum, name, details]
    );

    const tile = await getAsync(
      'SELECT id, tabId, type, dataId, x, y, groupId, name, details, createdAt FROM tiles WHERE id = ?',
      [tileId]
    );

    emitRealtime('tile', 'created', { tabId: tile.tabId, data: tile });

    res.status(201).json({
      success: true,
      data: tile
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/canvas/tiles/:id
router.put('/tiles/:id', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { x, y, name, details } = req.body;

    const tile = await getAsync('SELECT id, tabId FROM tiles WHERE id = ?', [id]);

    if (!tile) {
      throw new NotFoundError('Tile');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (x !== undefined) {
      const xNum = Number(x);
      if (isNaN(xNum) || !isFinite(xNum)) {
        console.error('[PUT /tiles/:id] Invalid x coordinate:', { id, x, xNum });
        throw new ValidationError('x must be a valid number');
      }
      updates.push('x = ?');
      values.push(xNum);
    }
    if (y !== undefined) {
      const yNum = Number(y);
      if (isNaN(yNum) || !isFinite(yNum)) {
        console.error('[PUT /tiles/:id] Invalid y coordinate:', { id, y, yNum });
        throw new ValidationError('y must be a valid number');
      }
      updates.push('y = ?');
      values.push(yNum);
    }
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (details !== undefined) {
      updates.push('details = ?');
      values.push(details);
    }

    if (updates.length === 0) {
      const current = await getAsync(
        'SELECT id, tabId, type, dataId, x, y, groupId, name, details FROM tiles WHERE id = ?',
        [id]
      );
      return res.json({ success: true, data: current });
    }

    values.push(id);

    await runAsync(
      `UPDATE tiles SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await getAsync(
      'SELECT id, tabId, type, dataId, x, y, groupId, name, details, createdAt FROM tiles WHERE id = ?',
      [id]
    );

    emitRealtime('tile', 'updated', { tabId: updated.tabId, data: updated });

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/canvas/tiles/:id
router.delete('/tiles/:id', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const tile = await getAsync('SELECT id, tabId FROM tiles WHERE id = ?', [id]);

    if (!tile) {
      throw new NotFoundError('Tile');
    }

    await runAsync('DELETE FROM tiles WHERE id = ?', [id]);

    emitRealtime('tile', 'deleted', { tabId: tile.tabId, id });

    res.json({
      success: true,
      message: 'Tile deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// ==================== CONNECTIONS ====================

// GET /api/canvas/connections
// Если tabId не передан — возвращаем все связи
router.get('/connections', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tabId } = req.query;

    const query = tabId
      ? `SELECT id, fromTileId, toTileId, tabId, createdAt FROM connections WHERE tabId = ? ORDER BY createdAt DESC`
      : `SELECT id, fromTileId, toTileId, tabId, createdAt FROM connections ORDER BY createdAt DESC`;

    const params = tabId ? [tabId] : [];
    const connections = await allAsync(query, params);

    res.json({
      success: true,
      data: connections
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/canvas/connections
router.post('/connections', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, fromTileId, toTileId, tabId } = req.body;

    if (!fromTileId || !toTileId || !tabId) {
      throw new ValidationError('fromTileId, toTileId and tabId are required');
    }

    const connectionId = id || uuidv4();

    await runAsync(
      `INSERT INTO connections (id, userId, tabId, fromTileId, toTileId) 
       VALUES (?, ?, ?, ?, ?)`,
      [connectionId, SHARED_USER_ID, tabId, fromTileId, toTileId]
    );

    const connection = await getAsync(
      'SELECT id, fromTileId, toTileId, tabId, createdAt FROM connections WHERE id = ?',
      [connectionId]
    );

    emitRealtime('connection', 'created', { tabId, data: connection });

    res.status(201).json({
      success: true,
      data: connection
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/canvas/connections/:id
router.delete('/connections/:id', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const connection = await getAsync('SELECT id, tabId FROM connections WHERE id = ?', [id]);

    if (!connection) {
      throw new NotFoundError('Connection');
    }

    await runAsync('DELETE FROM connections WHERE id = ?', [id]);

    emitRealtime('connection', 'deleted', { tabId: connection.tabId, id });

    res.json({
      success: true,
      message: 'Connection deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// ==================== TAB STATE ====================
// Примечание: обзор (камера/зум) — личный у каждого зрителя и хранится
// в localStorage на клиенте; сервер держит tab_states только как реестр вкладок.

// DELETE /api/canvas/tabs/:date
router.delete('/tabs/:date', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.params;
    console.log('[DELETE /tabs/:date] Deleting tab:', date);

    if (!date) {
      throw new ValidationError('date is required');
    }

    // Удаляем tab_state по дате
    const result = await runAsync('DELETE FROM tab_states WHERE date = ?', [date]);
    console.log('[DELETE /tabs/:date] Deleted rows:', result);

    res.json({
      success: true,
      message: 'Tab deleted successfully'
    });
  } catch (error) {
    console.error('[DELETE /tabs/:date] error:', error);
    next(error);
  }
});

// ==================== GROUPS ====================

// GET /api/canvas/groups/:tabId - получить все группы для вкладки
router.get('/groups/:tabId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tabId } = req.params;

    const groups = await allAsync(
      `SELECT id, tabId, name, x, y, width, height, color, createdAt
       FROM groups
       WHERE tabId = ?
       ORDER BY createdAt DESC`,
      [tabId]
    );

    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/canvas/groups - создать группу
router.post('/groups', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tabId, name, x, y, width, height, color, tileIds } = req.body;

    if (!tabId || !name || !tileIds || !Array.isArray(tileIds)) {
      throw new ValidationError('tabId, name, and tileIds are required');
    }

    const id = uuidv4();

    // Создаем группу
    await runAsync(
      `INSERT INTO groups (id, tabId, name, x, y, width, height, color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tabId, name, x || 0, y || 0, width || 200, height || 150, color || '#6366f1']
    );

    // Привязываем плитки к группе
    for (const tileId of tileIds) {
      await runAsync(
        `UPDATE tiles SET groupId = ? WHERE id = ?`,
        [id, tileId]
      );
    }

    res.json({
      success: true,
      data: { id, tabId, name, x: x || 0, y: y || 0, width: width || 200, height: height || 150, color: color || '#6366f1' }
    });
    // Клиенты по событию группы перечитывают вкладку целиком
    // (заодно подтянутся groupId у плиток)
    emitRealtime('group', 'created', { tabId });
  } catch (error) {
    next(error);
  }
});

// PUT /api/canvas/groups/:id - обновить группу
router.put('/groups/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, x, y, width, height, color } = req.body;

    const existing = await getAsync('SELECT id FROM groups WHERE id = ?', [id]);
    if (!existing) {
      throw new NotFoundError('Group');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (x !== undefined) {
      updates.push('x = ?');
      values.push(x);
    }
    if (y !== undefined) {
      updates.push('y = ?');
      values.push(y);
    }
    if (width !== undefined) {
      updates.push('width = ?');
      values.push(width);
    }
    if (height !== undefined) {
      updates.push('height = ?');
      values.push(height);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      values.push(color);
    }

    if (updates.length === 0) {
      const current = await getAsync(
        'SELECT id, tabId, name, x, y, width, height, color, createdAt FROM groups WHERE id = ?',
        [id]
      );
      return res.json({ success: true, data: current });
    }

    values.push(id);

    await runAsync(
      `UPDATE groups SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await getAsync(
      'SELECT id, tabId, name, x, y, width, height, color, createdAt FROM groups WHERE id = ?',
      [id]
    );

    emitRealtime('group', 'updated', { tabId: updated.tabId, id });

    res.json({
      success: true,
      data: updated,
      message: 'Group updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/canvas/groups/:id - удалить группу
router.delete('/groups/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const grp = await getAsync('SELECT tabId FROM groups WHERE id = ?', [id]);

    // Отвязываем плитки от группы
    await runAsync(
      `UPDATE tiles SET groupId = NULL WHERE groupId = ?`,
      [id]
    );

    // Удаляем группу
    await runAsync(
      `DELETE FROM groups WHERE id = ?`,
      [id]
    );

    emitRealtime('group', 'deleted', { tabId: grp?.tabId, id });

    res.json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/canvas/groups/:id/tiles - добавить плитку в группу
router.post('/groups/:id/tiles', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { tileId } = req.body;

    if (!tileId) {
      throw new ValidationError('tileId is required');
    }

    await runAsync(
      `UPDATE tiles SET groupId = ? WHERE id = ?`,
      [id, tileId]
    );

    const grpAdd = await getAsync('SELECT tabId FROM groups WHERE id = ?', [id]);
    emitRealtime('group', 'updated', { tabId: grpAdd?.tabId, id });

    res.json({
      success: true,
      message: 'Tile added to group successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/canvas/groups/:id/tiles/:tileId - убрать плитку из группы
router.delete('/groups/:id/tiles/:tileId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, tileId } = req.params;

    await runAsync(
      `UPDATE tiles SET groupId = NULL WHERE id = ?`,
      [tileId]
    );

    const grpDel = await getAsync('SELECT tabId FROM groups WHERE id = ?', [id]);
    emitRealtime('group', 'updated', { tabId: grpDel?.tabId, id });

    res.json({
      success: true,
      message: 'Tile removed from group successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
