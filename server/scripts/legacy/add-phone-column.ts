import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`ALTER TABLE brigade_members ADD COLUMN phone TEXT`, (err) => {
    if (err) {
      console.log('Column phone already exists or error:', err.message);
    } else {
      console.log('Added phone column');
    }
    db.close();
  });
});