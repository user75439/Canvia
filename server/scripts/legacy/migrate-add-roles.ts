import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

console.log('🔄 Adding role column to users table...\n');

db.serialize(() => {
  // Проверяем существует ли колонка
  db.all("PRAGMA table_info(users)", (err, columns: any[]) => {
    if (err) {
      console.error('❌ Error checking table:', err);
      process.exit(1);
    }

    const hasRole = columns.some(col => col.name === 'role');

    if (hasRole) {
      console.log('✅ Column role already exists');
      db.close();
      process.exit(0);
    } else {
      // Добавляем колонку role
      db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
        if (err) {
          console.error('❌ Error adding column:', err);
          process.exit(1);
        }
        console.log('✅ Added role column to users table');

        // Обновляем существующих пользователей: isAdmin=1 -> 'admin', остальные 'user'
        db.run(`UPDATE users SET role = CASE WHEN isAdmin = 1 THEN 'admin' ELSE 'user' END`, (err) => {
          if (err) {
            console.error('❌ Error updating roles:', err);
            process.exit(1);
          }
          console.log('✅ Updated existing user roles');
          console.log('\n🎉 Migration completed successfully!\n');

          db.close();
          process.exit(0);
        });
      });
    }
  });
});