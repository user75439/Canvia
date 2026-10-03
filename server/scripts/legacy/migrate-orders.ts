import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

console.log('🔄 Migrating orders table to allow NULL values...\n');

db.serialize(() => {
  // 1. Создаем временную таблицу с новой схемой
  db.run(`
    CREATE TABLE orders_new (
      id TEXT PRIMARY KEY,
      userId TEXT,
      number TEXT UNIQUE,
      address TEXT,
      client TEXT,
      deadline TEXT,
      status TEXT DEFAULT 'new',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating new table:', err);
      process.exit(1);
    }
    console.log('✅ Created temporary table');
  });

  // 2. Копируем данные из старой таблицы
  db.run(`
    INSERT INTO orders_new (id, userId, number, address, client, deadline, status, createdAt)
    SELECT id, userId, number, address, client, deadline, status, createdAt FROM orders
  `, (err) => {
    if (err) {
      console.error('❌ Error copying data:', err);
      process.exit(1);
    }
    console.log('✅ Copied existing data');
  });

  // 3. Удаляем старую таблицу
  db.run(`DROP TABLE orders`, (err) => {
    if (err) {
      console.error('❌ Error dropping old table:', err);
      process.exit(1);
    }
    console.log('✅ Dropped old table');
  });

  // 4. Переименовываем новую таблицу
  db.run(`ALTER TABLE orders_new RENAME TO orders`, (err) => {
    if (err) {
      console.error('❌ Error renaming table:', err);
      process.exit(1);
    }
    console.log('✅ Renamed new table');
    console.log('\n🎉 Migration completed successfully!\n');
    
    db.close();
    process.exit(0);
  });
});
