import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

console.log('🔄 Migrating installers table to allow NULL values...\n');

db.serialize(() => {
  // 1. Создаем временную таблицу с новой схемой
  db.run(`
    CREATE TABLE installers_new (
      id TEXT PRIMARY KEY,
      userId TEXT,
      name TEXT,
      phone TEXT,
      status TEXT DEFAULT 'free',
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
    INSERT INTO installers_new (id, userId, name, phone, status, createdAt)
    SELECT id, userId, name, phone, status, createdAt FROM installers
  `, (err) => {
    if (err) {
      console.error('❌ Error copying data:', err);
      process.exit(1);
    }
    console.log('✅ Copied existing data');
  });

  // 3. Удаляем старую таблицу
  db.run(`DROP TABLE installers`, (err) => {
    if (err) {
      console.error('❌ Error dropping old table:', err);
      process.exit(1);
    }
    console.log('✅ Dropped old table');
  });

  // 4. Переименовываем новую таблицу
  db.run(`ALTER TABLE installers_new RENAME TO installers`, (err) => {
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
