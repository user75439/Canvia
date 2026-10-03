import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { allAsync, getAsync, runAsync } from '../database.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { emitRealtime } from '../realtime.js';

const router = Router();
const SHARED_USER_ID = 'shared-user';

// ==================== BRIGADES ====================

// GET /api/brigades
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const brigades = await allAsync(
      'SELECT id, name, color, createdAt FROM brigades ORDER BY createdAt DESC'
    );

    // Для каждой бригады получаем список монтажников (из snapshot данных)
    const brigadesWithMembers = await Promise.all(
      brigades.map(async (brigade: any) => {
        // Получаем членов бригады с их данными из таблицы installers
        const members = await allAsync(
          `SELECT bm.installerId as id, i.name, i.phone 
           FROM brigade_members bm 
           JOIN installers i ON bm.installerId = i.id
           WHERE bm.brigadeId = ?
           ORDER BY bm.createdAt ASC`,
          [brigade.id]
        );
        return {
          ...brigade,
          members: members.map((m: any) => m.id),
          memberDetails: members
        };
      })
    );

    res.json({
      success: true,
      data: brigadesWithMembers
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/brigades
router.post('/', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, color = '#10b981', members = [] } = req.body;

    if (!name) {
      throw new ValidationError('Name is required');
    }

    const id = uuidv4();

    await runAsync(
      'INSERT INTO brigades (id, userId, name, color) VALUES (?, ?, ?, ?)',
      [id, SHARED_USER_ID, name, color]
    );

    // Добавляем монтажников в бригаду
    for (const installerId of members) {
      const memberId = uuidv4();
      await runAsync(
        'INSERT INTO brigade_members (id, brigadeId, installerId) VALUES (?, ?, ?)',
        [memberId, id, installerId]
      );
    }

    const brigade = await getAsync(
      'SELECT id, name, color, createdAt FROM brigades WHERE id = ?',
      [id]
    );

    const memberDetails = await allAsync(
      `SELECT i.id, i.name, i.phone 
       FROM installers i 
       JOIN brigade_members bm ON bm.installerId = i.id 
       WHERE bm.brigadeId = ?`,
      [id]
    );

    const created = {
      ...brigade,
      members,
      memberDetails,
    };
    emitRealtime('brigade', 'created', { data: created });

    res.status(201).json({
      success: true,
      data: created,
      message: 'Brigade created successfully'
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/brigades/:id
router.put('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, color, members } = req.body;

    const brigade = await getAsync('SELECT id FROM brigades WHERE id = ?', [id]);

    if (!brigade) {
      throw new NotFoundError('Brigade');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      values.push(color);
    }

    if (updates.length > 0) {
      values.push(id);
      await runAsync(
        `UPDATE brigades SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Обновляем состав бригады если передан
    if (members !== undefined) {
      // Удаляем старых членов
      await runAsync('DELETE FROM brigade_members WHERE brigadeId = ?', [id]);
      
      // Добавляем новых
      for (const installerId of members) {
        const memberId = uuidv4();
        await runAsync(
          'INSERT INTO brigade_members (id, brigadeId, installerId) VALUES (?, ?, ?)',
          [memberId, id, installerId]
        );
      }
    }

    const updated = await getAsync(
      'SELECT id, name, color, createdAt FROM brigades WHERE id = ?',
      [id]
    );

    const memberDetails = await allAsync(
      `SELECT i.id, i.name, i.phone 
       FROM installers i 
       JOIN brigade_members bm ON bm.installerId = i.id 
       WHERE bm.brigadeId = ?`,
      [id]
    );

    const payload = {
      ...updated,
      members: memberDetails.map((m: any) => m.id),
      memberDetails,
    };
    emitRealtime('brigade', 'updated', { data: payload });

    res.json({
      success: true,
      data: payload,
      message: 'Brigade updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/brigades/:id
router.delete('/:id', authMiddleware, requireRole('manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const brigade = await getAsync('SELECT id FROM brigades WHERE id = ?', [id]);

    if (!brigade) {
      throw new NotFoundError('Brigade');
    }

    await runAsync('DELETE FROM brigade_members WHERE brigadeId = ?', [id]);
    await runAsync('DELETE FROM brigades WHERE id = ?', [id]);

    emitRealtime('brigade', 'deleted', { id });

    res.json({
      success: true,
      message: 'Brigade deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/brigades/find-or-create - найти или создать бригаду по составу
router.post('/find-or-create', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { installerIds } = req.body;
    console.log('[find-or-create] Request:', { installerIds });

    if (!Array.isArray(installerIds) || installerIds.length < 2) {
      throw new ValidationError('Требуется минимум 2 монтажника');
    }

    // Сортируем IDs для единообразного поиска
    const sortedIds = [...installerIds].sort();
    
    // Получаем все бригады с их составами
    const allBrigades = await allAsync(
      `SELECT brigadeId, installerId FROM brigade_members ORDER BY brigadeId, installerId`,
      []
    );

    // Группируем по brigadeId
    const brigadeMap = new Map();
    for (const row of allBrigades) {
      const brigadeId = row.brigadeId;
      const installerId = row.installerId;
      if (!brigadeMap.has(brigadeId)) {
        brigadeMap.set(brigadeId, []);
      }
      brigadeMap.get(brigadeId).push(installerId);
    }

    // Ищем бригаду с таким же составом
    const targetSet = sortedIds.join(',');
    for (const [brigadeId, memberIds] of brigadeMap.entries()) {
      const memberSet = memberIds.sort().join(',');
      if (memberSet === targetSet) {
        // Нашли бригаду с таким составом
        return res.json({
          success: true,
          brigadeId,
          isNew: false
        });
      }
    }

    // Бригада с таким составом не найдена - не создаем новую
    return res.json({
      success: false,
      error: 'Бригада с таким составом не найдена'
    });
  } catch (error) {
    console.error('[find-or-create] Error:', error);
    next(error);
  }
});

// POST /api/brigades/:id/members - добавить монтажника в бригаду
router.post('/:id/members', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { installerId } = req.body;

    if (!installerId) {
      throw new ValidationError('installerId is required');
    }

    const brigade = await getAsync('SELECT id FROM brigades WHERE id = ?', [id]);
    if (!brigade) {
      throw new NotFoundError('Brigade');
    }

    const installer = await getAsync(
      'SELECT id, name, phone FROM installers WHERE id = ?',
      [installerId]
    );
    
    if (!installer) {
      throw new NotFoundError('Installer');
    }

    // Проверяем, не добавлен ли уже
    const existing = await getAsync(
      'SELECT id FROM brigade_members WHERE brigadeId = ? AND installerId = ?',
      [id, installerId]
    );

    if (existing) {
      return res.json({
        success: true,
        message: 'Installer already in brigade'
      });
    }

    // Добавляем с snapshot данных в транзакции
    await runAsync('BEGIN TRANSACTION');
    try {
      const memberId = uuidv4();
      await runAsync(
        'INSERT INTO brigade_members (id, brigadeId, installerId) VALUES (?, ?, ?)',
        [memberId, id, installer.id]
      );
      await runAsync('COMMIT');
    } catch (error) {
      await runAsync('ROLLBACK');
      throw error;
    }

    // Рассылаем обновлённый состав бригады
    const refreshed = await getAsync(
      'SELECT id, name, color, createdAt FROM brigades WHERE id = ?',
      [id]
    );
    const refreshedMembers = await allAsync(
      `SELECT i.id, i.name, i.phone
       FROM installers i
       JOIN brigade_members bm ON bm.installerId = i.id
       WHERE bm.brigadeId = ?`,
      [id]
    );
    emitRealtime('brigade', 'updated', {
      data: {
        ...refreshed,
        members: refreshedMembers.map((m: any) => m.id),
        memberDetails: refreshedMembers,
      },
    });

    res.json({
      success: true,
      message: 'Installer added to brigade'
    });
  } catch (error) {
    next(error);
  }
});

export default router;

