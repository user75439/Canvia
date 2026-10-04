// Сброс пароля пользователя: npm run reset-admin -- <login> [newPassword]
// Без аргументов — сбрасывает пароль первому пользователю с ролью admin.
// НИЧЕГО не создаёт молча: если логин не найден — покажет список и выйдет
// (старая версия создавала admin/admin и писала в несуществующую колонку isAdmin).
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

const get = (sql: string, params: any[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const all = (sql: string, params: any[] = []): Promise<any[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

const run = (sql: string, params: any[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

async function resetPassword() {
  try {
    const loginArg = process.argv[2];
    const passwordArg = process.argv[3] || process.env.DEFAULT_ADMIN_PASSWORD || 'admin';

    let target: any;
    if (loginArg) {
      target = await get('SELECT id, login, role FROM users WHERE LOWER(login) = LOWER(?)', [loginArg]);
      if (!target) {
        console.log(`❌ Пользователь '${loginArg}' не найден.`);
        const users = await all('SELECT login, role FROM users ORDER BY login');
        console.log('   Есть в базе:');
        for (const u of users) console.log(`   - ${u.login} (${u.role})`);
        return;
      }
    } else {
      target = await get("SELECT id, login, role FROM users WHERE role = 'admin' ORDER BY createdAt LIMIT 1");
      if (!target) {
        console.log('❌ В базе нет ни одного пользователя с ролью admin. Создайте его через админ-панель.');
        return;
      }
      console.log(`ℹ️  Логин не указан — беру первого админа: ${target.login}`);
    }

    const hashedPassword = await bcrypt.hash(passwordArg, 10);
    await run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, target.id]);

    console.log('\n✅ Готово! Теперь можете войти:');
    console.log(`   Логин:  ${target.login}`);
    console.log(`   Пароль: ${passwordArg}`);
    console.log('');
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    db.close();
  }
}

resetPassword();
