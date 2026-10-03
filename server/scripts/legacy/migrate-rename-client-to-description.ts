import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

function runAsync(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allAsync(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrate() {
  console.log('🔄 Starting migration: Rename client to description in orders table...');
  
  try {
    // Проверяем существующую структуру
    const tableInfo = await allAsync("PRAGMA table_info(orders)");
    const hasClient = tableInfo.some((col: any) => col.name === 'client');
    const hasDescription = tableInfo.some((col: any) => col.name === 'description');
    
    if (hasDescription && !hasClient) {
      console.log('✅ Migration already applied - description column exists');
      process.exit(0);
    }
    
    if (!hasClient) {
      console.log('⚠️  Warning: client column does not exist, adding description column...');
      await runAsync(`ALTER TABLE orders ADD COLUMN description TEXT DEFAULT 'Не указано'`);
      console.log('✅ Added description column');
      process.exit(0);
    }
    
    // SQLite не поддерживает RENAME COLUMN напрямую в старых версиях
    // Нужно пересоздать таблицу
    console.log('📋 Backing up orders data...');
    const orders = await allAsync('SELECT * FROM orders');
    console.log(`Found ${orders.length} orders`);
    
    // Создаем новую таблицу
    console.log('🔨 Creating new orders table...');
    await runAsync(`
      CREATE TABLE orders_new (
        id TEXT PRIMARY KEY,
        userId TEXT,
        number TEXT UNIQUE,
        address TEXT,
        description TEXT,
        deadline TEXT,
        status TEXT DEFAULT 'new',
        createdBy TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    
    // Копируем данные (client → description)
    console.log('📦 Migrating data...');
    for (const order of orders) {
      await runAsync(
        `INSERT INTO orders_new (id, userId, number, address, description, deadline, status, createdBy, createdAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.id,
          order.userId,
          order.number,
          order.address,
          order.client, // переименовываем client в description
          order.deadline,
          order.status,
          order.createdBy,
          order.createdAt
        ]
      );
    }
    
    // Удаляем старую таблицу
    console.log('🗑️  Dropping old orders table...');
    await runAsync('DROP TABLE orders');
    
    // Переименовываем новую таблицу
    console.log('✏️  Renaming new table...');
    await runAsync('ALTER TABLE orders_new RENAME TO orders');
    
    console.log('✅ Migration completed successfully!');
    console.log(`   Migrated ${orders.length} orders`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
