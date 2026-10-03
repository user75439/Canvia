import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

console.log('🔄 Adding brigades table...\n');

db.serialize(() => {
  // Создаем таблицу бригад
  db.run(`
    CREATE TABLE IF NOT EXISTS brigades (
      id TEXT PRIMARY KEY,
      userId TEXT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#10b981',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating brigades table:', err);
      process.exit(1);
    }
    console.log('✅ Created brigades table');
  });

  // Создаем таблицу связей монтажников с бригадами
  db.run(`
    CREATE TABLE IF NOT EXISTS brigade_members (
      id TEXT PRIMARY KEY,
      brigadeId TEXT NOT NULL,
      installerId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brigadeId) REFERENCES brigades(id) ON DELETE CASCADE,
      FOREIGN KEY (installerId) REFERENCES installers(id) ON DELETE CASCADE,
      UNIQUE(brigadeId, installerId)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating brigade_members table:', err);
      process.exit(1);
    }
    console.log('✅ Created brigade_members table');
    console.log('\n🎉 Migration completed successfully!\n');
    
    db.close();
    process.exit(0);
  });
});
