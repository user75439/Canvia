// Скрипт для сброса пароля администратора
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/profi-planner.db');

const db = new sqlite3.Database(dbPath);

async function resetAdminPassword() {
  try {
    console.log('🔄 Сброс пароля администратора...\n');
    
    // Проверяем существующего админа
    const checkAdmin = new Promise((resolve, reject) => {
      db.get('SELECT id, login, password FROM users WHERE login = ?', ['admin'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    const admin = await checkAdmin as any;
    
    if (!admin) {
      console.log('❌ Пользователь admin не найден в базе!');
      console.log('   Создание нового администратора...\n');
      
      const newPassword = 'admin';
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (id, login, password, isAdmin) VALUES (?, ?, ?, ?)',
          ['admin-1', 'admin', hashedPassword, 1],
          (err) => {
            if (err) reject(err);
            else resolve(null);
          }
        );
      });
      
      console.log('✅ Администратор создан');
      console.log('   Логин:  admin');
      console.log('   Пароль: admin');
    } else {
      console.log('ℹ️  Найден пользователь admin');
      console.log(`   Текущий пароль (хеш): ${admin.password.substring(0, 20)}...\n`);
      
      // Проверяем формат пароля
      const isHashed = admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$');
      
      if (isHashed) {
        console.log('✅ Пароль уже в правильном формате (bcrypt hash)');
        
        // Проверяем что пароль "admin" работает
        const isValid = await bcrypt.compare('admin', admin.password);
        if (isValid) {
          console.log('✅ Пароль "admin" корректен');
        } else {
          console.log('⚠️  Пароль НЕ равен "admin", устанавливаем новый...\n');
          
          const newPassword = 'admin';
          const hashedPassword = await bcrypt.hash(newPassword, 10);
          
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE users SET password = ? WHERE login = ?',
              [hashedPassword, 'admin'],
              (err) => {
                if (err) reject(err);
                else resolve(null);
              }
            );
          });
          
          console.log('✅ Пароль обновлен на "admin"');
        }
      } else {
        console.log('⚠️  Пароль в старом формате (не хеширован), обновляем...\n');
        
        const newPassword = 'admin';
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE users SET password = ? WHERE login = ?',
            [hashedPassword, 'admin'],
            (err) => {
              if (err) reject(err);
              else resolve(null);
            }
          );
        });
        
        console.log('✅ Пароль обновлен и захеширован');
        console.log('   Новый пароль: admin');
      }
    }
    
    console.log('\n✅ Готово! Теперь можете войти:');
    console.log('   Логин:  admin');
    console.log('   Пароль: admin');
    console.log('');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    db.close();
  }
}

resetAdminPassword();
