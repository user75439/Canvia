import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.join(__dirname, 'data/profi-planner.db');
const backupDir = path.join(__dirname, 'backups');
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

// Создать директорию для backup если нет
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

try {
  // Проверить что БД существует
  if (!fs.existsSync(dbPath)) {
    console.log('⚠️  Database does not exist yet');
    process.exit(0);
  }

  // Копировать файл БД
  fs.copyFileSync(dbPath, backupPath);
  console.log(`✅ Backup created: ${backupPath}`);

  // Оставить только последние 10 backup'ов
  const files = fs.readdirSync(backupDir)
    .map(f => ({ name: f, path: path.join(backupDir, f) }))
    .sort((a, b) => {
      const aTime = fs.statSync(a.path).mtime.getTime();
      const bTime = fs.statSync(b.path).mtime.getTime();
      return bTime - aTime;
    });

  if (files.length > 10) {
    files.slice(10).forEach(f => {
      fs.unlinkSync(f.path);
      console.log(`🗑️  Removed old backup: ${f.name}`);
    });
  }

  console.log(`📊 Total backups: ${files.slice(0, 10).length}`);
} catch (error) {
  console.error('❌ Backup failed:', error);
  process.exit(1);
}
