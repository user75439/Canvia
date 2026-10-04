import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'profi-planner.db');

// Создать директорию data если её нет
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    db.configure('busyTimeout', 5000); // 5 seconds timeout
    initializeDatabase();
  }
});

async function initializeDatabase() {
  try {
    // Таблица пользователей
    await runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        login TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table ready');

    // Дефолтного админа создаём только если в системе ВООБЩЕ нет администратора.
    // Проверка по роли, а не по логину: если 'admin' удалён/переименован, а другой
    // пользователь с ролью admin есть — ничего не создаём (иначе admin/admin воскреснет).
    const anyAdmin = await getAsync('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
    if (!anyAdmin) {
      // id 'admin-1' мог остаться занятым (например, от удалённого пользователя) — подбираем свободный
      let adminId = 'admin-1';
      const idTaken = await getAsync('SELECT id FROM users WHERE id = ?', [adminId]);
      if (idTaken) adminId = `admin-${Date.now().toString(36)}`;
      // Используем пароль из переменной окружения или дефолтный
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      await runAsync(
        'INSERT INTO users (id, login, password, role) VALUES (?, ?, ?, ?)',
        [adminId, 'admin', hashedPassword, 'admin']
      );
      console.log('✅ Default admin user created (login: admin)');
      
      if (!process.env.DEFAULT_ADMIN_PASSWORD) {
        console.warn('⚠️  WARNING: Using default password "admin" for admin user!');
        console.warn('⚠️  SECURITY RISK: Please change the admin password immediately!');
        console.warn('⚠️  Set DEFAULT_ADMIN_PASSWORD in .env for secure initial setup.');
      }
    } else {
      console.log('✅ Admin user already exists');
    }

    // Таблица установщиков
    await runAsync(`
      CREATE TABLE IF NOT EXISTS installers (
        id TEXT PRIMARY KEY,
        userId TEXT,
        name TEXT,
        phone TEXT,
        status TEXT DEFAULT 'free',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    console.log('✅ Installers table ready');

    // Таблица заказов
    await runAsync(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        userId TEXT,
        number TEXT UNIQUE,
        address TEXT,
        description TEXT,
        deadline TEXT,
        status TEXT DEFAULT 'new',
        shift TEXT DEFAULT 'day',
        workDone TEXT DEFAULT '',
        createdBy TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    // Миграция: колонка shift для существующих БД
    try {
      await runAsync(`ALTER TABLE orders ADD COLUMN shift TEXT DEFAULT 'day'`);
    } catch (error) {
      // Колонка уже существует, игнорируем ошибку
    }
    // Миграция: колонка workDone (что сделано) для существующих БД
    try {
      await runAsync(`ALTER TABLE orders ADD COLUMN workDone TEXT DEFAULT ''`);
    } catch (error) {
      // Колонка уже существует, игнорируем ошибку
    }
    console.log('✅ Orders table ready');

    // Таблица бригад
    await runAsync(`
      CREATE TABLE IF NOT EXISTS brigades (
        id TEXT PRIMARY KEY,
        userId TEXT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#10b981',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    console.log('✅ Brigades table ready');

    // Таблица членов бригад
    await runAsync(`
      CREATE TABLE IF NOT EXISTS brigade_members (
        id TEXT PRIMARY KEY,
        brigadeId TEXT NOT NULL,
        installerId TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (brigadeId) REFERENCES brigades(id) ON DELETE CASCADE,
        FOREIGN KEY (installerId) REFERENCES installers(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Brigade members table ready');

    // Таблица плиток (tiles)
    await runAsync(`
      CREATE TABLE IF NOT EXISTS tiles (
        id TEXT PRIMARY KEY,
        userId TEXT,
        tabId TEXT NOT NULL,
        type TEXT NOT NULL,
        dataId TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        groupId TEXT,
        name TEXT,
        details TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    
    // Добавляем колонку groupId если её нет (для миграции)
    try {
      await runAsync(`ALTER TABLE tiles ADD COLUMN groupId TEXT`);
    } catch (error) {
      // Колонка уже существует, игнорируем ошибку
    }
    
    console.log('✅ Tiles table ready');

    // Таблица соединений (connections)
    await runAsync(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        userId TEXT,
        tabId TEXT NOT NULL,
        fromTileId TEXT NOT NULL,
        toTileId TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (fromTileId) REFERENCES tiles(id) ON DELETE CASCADE,
        FOREIGN KEY (toTileId) REFERENCES tiles(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Connections table ready');

    // Таблица сохраненных состояний (для камеры и зума)
    await runAsync(`
      CREATE TABLE IF NOT EXISTS tab_states (
        id TEXT PRIMARY KEY,
        userId TEXT,
        date TEXT NOT NULL UNIQUE,
        cameraX REAL DEFAULT 0,
        cameraY REAL DEFAULT 0,
        zoom REAL DEFAULT 1,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    console.log('✅ Tab states table ready');

    // Таблица групп (tabId хранит дату вида YYYY-MM-DD, поэтому без FK)
    await runAsync(`
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        tabId TEXT NOT NULL,
        name TEXT NOT NULL,
        x REAL NOT NULL DEFAULT 0,
        y REAL NOT NULL DEFAULT 0,
        width REAL NOT NULL DEFAULT 200,
        height REAL NOT NULL DEFAULT 150,
        color TEXT DEFAULT '#6366f1',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Groups table ready');

    console.log('🎉 Database initialization complete\n');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

export const runAsync = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        if ((err as any).code === 'SQLITE_BUSY') {
          console.warn('Database busy, retrying...');
          setTimeout(() => runAsync(sql, params).then(resolve).catch(reject), 100);
        } else {
          reject(err);
        }
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
};

export const getAsync = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        if ((err as any).code === 'SQLITE_BUSY') {
          setTimeout(() => getAsync(sql, params).then(resolve).catch(reject), 100);
        } else {
          reject(err);
        }
      } else {
        resolve(row);
      }
    });
  });
};

export const allAsync = (sql: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        if ((err as any).code === 'SQLITE_BUSY') {
          setTimeout(() => allAsync(sql, params).then(resolve).catch(reject), 100);
        } else {
          reject(err);
        }
      } else {
        resolve(rows || []);
      }
    });
  });
};

export const closeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};
