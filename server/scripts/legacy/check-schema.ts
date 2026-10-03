import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

db.all(`PRAGMA table_info(brigade_members)`, (err, columns: any[]) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }

  console.log('brigade_members table schema:');
  columns.forEach(col => {
    console.log(`- ${col.name}: ${col.type}`);
  });

  db.close();
});