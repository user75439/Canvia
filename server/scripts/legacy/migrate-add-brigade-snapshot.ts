import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

function runQuery(db: sqlite3.Database, query: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(query, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getTableInfo(db: sqlite3.Database, table: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrate() {
  const db = new sqlite3.Database(dbPath);

  try {
    console.log('🔄 Adding name and phone columns to brigade_members...\n');

    const columns = await getTableInfo(db, 'brigade_members');
    const hasName = columns.some(col => col.name === 'name');
    const hasPhone = columns.some(col => col.name === 'phone');

    if (!hasName) {
      await runQuery(db, `ALTER TABLE brigade_members ADD COLUMN name TEXT`);
      console.log('✅ Added name column to brigade_members table');
    } else {
      console.log('✅ name column already exists in brigade_members table');
    }

    if (!hasPhone) {
      await runQuery(db, `ALTER TABLE brigade_members ADD COLUMN phone TEXT`);
      console.log('✅ Added phone column to brigade_members table');
    } else {
      console.log('✅ phone column already exists in brigade_members table');
    }

    console.log('\n🎉 Migration completed successfully!\n');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();