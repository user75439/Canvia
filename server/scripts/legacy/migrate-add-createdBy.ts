import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

console.log('🔄 Adding createdBy column to orders table...\n');

db.serialize(() => {
  // Проверяем существует ли колонка
  db.all("PRAGMA table_info(orders)", (err, columns: any[]) => {
    if (err) {
      console.error('❌ Error checking table:', err);
      process.exit(1);
    }

    const hasCreatedBy = columns.some(col => col.name === 'createdBy');

    if (hasCreatedBy) {
      console.log('✅ Column createdBy already exists');
      db.close();
      process.exit(0);
    } else {
      // Добавляем колонку createdBy
      db.run(`ALTER TABLE orders ADD COLUMN createdBy TEXT DEFAULT 'unknown'`, (err) => {
        if (err) {
          console.error('❌ Error adding column:', err);
          process.exit(1);
        }
        console.log('✅ Added createdBy column to orders table');
        console.log('\n🎉 Migration completed successfully!\n');
        
        db.close();
        process.exit(0);
      });
    }
  });
});
