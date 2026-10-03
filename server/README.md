# Canvia Server

Сервер для приложения Canvia. Хранит данные, управляет аутентификацией и синхронизирует информацию между клиентами.

## 🚀 Быстрый старт

### Требования
- Node.js 18+ (`node --version`)
- npm 9+ (`npm --version`)

### Установка и запуск (2 команды)

```bash
# 1. Установить зависимости
npm install

# 2. Запустить сервер в режиме разработки
npm run dev
```

Сервер запустится на `http://localhost:5000`

### Первый вход
```
Login: admin
Password: admin
```

## 📋 Структура проекта

```
server/
├── src/
│   ├── server.ts           # Точка входа
│   ├── database.ts         # SQLite инициализация
│   ├── auth.ts             # JWT и bcrypt
│   ├── middleware/
│   │   └── auth.ts         # Аутентификация & ошибки
│   ├── routes/
│   │   ├── auth.ts         # Login, register, verify
│   │   ├── data.ts         # Installers, orders
│   │   └── canvas.ts       # Tiles, connections
│   └── utils/
│       ├── errors.ts       # Кастомные ошибки
│       └── response.ts     # Форматы ответов
├── data/                   # SQLite БД (создаётся автоматически)
├── logs/                   # Логи (создаются автоматически)
├── .env                    # Переменные окружения
├── .env.example            # Шаблон .env
├── package.json
├── tsconfig.json
└── ecosystem.config.js     # Конфиг PM2
```

## ⚙️ Конфигурация

1. Создать `.env` файл:
```bash
cp .env.example .env
```

2. Отредактировать `.env`:
```env
NODE_ENV=development
PORT=5000
HOST=0.0.0.0
JWT_SECRET=your-secret-key-change-this-in-production
CORS_ORIGIN=http://localhost:5173
```

## 📚 API Endpoints

### Аутентификация
- `POST /api/auth/login` - Вход
- `POST /api/auth/register` - Регистрация (только админ)
- `POST /api/auth/verify` - Проверка токена
- `POST /api/auth/logout` - Выход

### Персонал
- `GET /api/data/installers` - Получить установщиков
- `POST /api/data/installers` - Создать установщика
- `PUT /api/data/installers/:id` - Обновить
- `DELETE /api/data/installers/:id` - Удалить

### Заказы
- `GET /api/data/orders` - Получить заказы
- `POST /api/data/orders` - Создать заказ
- `PUT /api/data/orders/:id` - Обновить
- `DELETE /api/data/orders/:id` - Удалить

### Холст
- `GET /api/canvas/tabs` - Получить вкладки (дни)
- `POST /api/canvas/tabs` - Создать вкладку
- `GET /api/canvas/tiles` - Получить плитки
- `POST /api/canvas/tiles` - Создать плитку
- `PUT /api/canvas/tiles/:id` - Переместить плитку
- `DELETE /api/canvas/tiles/:id` - Удалить плитку
- `GET /api/canvas/connections` - Получить соединения
- `POST /api/canvas/connections` - Создать соединение
- `DELETE /api/canvas/connections/:id` - Удалить соединение
- `PUT /api/canvas/tab-state` - Сохранить положение камеры

### Система
- `GET /api/health` - Проверка здоровья сервера

## 🏃 Различные режимы запуска

### Разработка (с горячей перезагрузкой)
```bash
npm run dev
```

### Production (скомпилированный код)
```bash
npm run build
npm start
```

### С PM2 (процесс-менеджер, рекомендуется для production)
```bash
# Глобальная установка PM2
npm install -g pm2

# Запуск
pm2 start ecosystem.config.js

# Просмотр логов
pm2 logs profi-planner-server

# Мониторинг
pm2 monit
```

## 💾 База данных

SQLite файл находится в `data/profi-planner.db` (создаётся автоматически).

### Таблицы
- `users` - Пользователи с хешами паролей
- `installers` - Установщики
- `orders` - Заказы
- `tiles` - Плитки на холсте
- `connections` - Связи между плитками
- `tab_states` - Состояние камеры для каждой вкладки

## 📊 Мониторинг и логирование

Логи пишутся в `logs/`:
- `access.log` - HTTP запросы
- `error.log` - Ошибки
- `combined.log` - Всё вместе

Просмотр логов:
```bash
tail -f logs/error.log
```

## 🔄 Бэкапирование

Сделать резервную копию БД:
```bash
npm run backup
```

Копии сохраняются в `backups/` (хранятся последние 10)

## 🐛 Решение проблем

### Ошибка: Port already in use
```bash
# Проверить что занимает порт 5000
netstat -an | grep 5000

# Или запустить на другом порту
PORT=5001 npm run dev
```

### Ошибка: Database is locked
Перезагрузить сервер:
```bash
pm2 restart profi-planner-server
```

### Токен постоянно истекает
В `src/auth.ts` изменить `expiresIn`:
```typescript
{ expiresIn: '30d' }  // Вместо '7d'
```

## 📦 Зависимости

- `express` - веб-фреймворк
- `sqlite3` - база данных
- `jsonwebtoken` - JWT токены
- `bcryptjs` - хеширование паролей
- `cors` - кроссплатформенные запросы
- `uuid` - генерация ID
- `dotenv` - переменные окружения

## 🔐 Безопасность

- JWT токены с срок действия 7 дней
- Пароли хешируются через bcrypt
- CORS настроен только для разрешённых источников
- Валидация всех входных данных
- Все операции логируются

## 📝 Лицензия

MIT

---

**Документация:** Смотрите [SERVER_ARCHITECTURE.md](../SERVER_ARCHITECTURE.md) в корне проекта
