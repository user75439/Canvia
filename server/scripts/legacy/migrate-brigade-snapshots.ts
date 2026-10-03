import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

const runAsync = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const allAsync = (sql: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

async function migrate() {
  console.log('🔄 Starting brigade_members snapshot migration...');

  try {
    // Проверяем текущую структуру
    const tableInfo = await allAsync("PRAGMA table_info(brigade_members)");
    const hasName = tableInfo.some((col: any) => col.name === 'name');
    const hasPhone = tableInfo.some((col: any) => col.name === 'phone');

    if (hasName && hasPhone) {
      console.log('⚠️  Columns already exist, skipping migration');
      process.exit(0);
    }

    // Добавляем колонки для snapshot данных
    if (!hasName) {
      console.log('Adding name column...');
      await runAsync('ALTER TABLE brigade_members ADD COLUMN name TEXT');
      console.log('✅ Added name column');
    }

    if (!hasPhone) {
      console.log('Adding phone column...');
      await runAsync('ALTER TABLE brigade_members ADD COLUMN phone TEXT');
      console.log('✅ Added phone column');
    }

    // Заполняем существующие записи данными из installers
    console.log('Filling existing records with installer data...');
    const members = await allAsync('SELECT id, installerId FROM brigade_members WHERE name IS NULL');
    
    for (const member of members) {
      const installer = await allAsync(
        'SELECT name, phone FROM installers WHERE id = ?',
        [member.installerId]
      );
      
      if (installer.length > 0) {
        await runAsync(
          'UPDATE brigade_members SET name = ?, phone = ? WHERE id = ?',
          [installer[0].name, installer[0].phone, member.id]
        );
        console.log(`  Updated member ${member.id}`);
      }
    }

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

migrate();
