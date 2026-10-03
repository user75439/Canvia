import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

console.log('🔄 Adding groups table...\n');

db.serialize(() => {
  // Создаем таблицу групп
  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      tabId TEXT NOT NULL,
      name TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      color TEXT DEFAULT '#6366f1',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tabId) REFERENCES tab_states(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating groups table:', err);
      process.exit(1);
    }
    console.log('✅ Created groups table');
  });

  // Проверяем и добавляем колонку groupId в tiles если её нет
  db.all(`PRAGMA table_info(tiles)`, (err, columns: any[]) => {
    if (err) {
      console.error('❌ Error checking tiles table:', err);
      process.exit(1);
    }

    const hasGroupId = columns.some(col => col.name === 'groupId');
    if (!hasGroupId) {
      db.run(`ALTER TABLE tiles ADD COLUMN groupId TEXT`, (err) => {
        if (err) {
          console.error('❌ Error adding groupId column:', err);
          process.exit(1);
        }
        console.log('✅ Added groupId column to tiles table');
      });
    } else {
      console.log('✅ groupId column already exists in tiles table');
    }

    console.log('\n🎉 Migration completed successfully!\n');
    db.close();
  });
});