# Архитектура и спецификация сервера Canvia

**Дата:** 30 декабря 2025  
**Приоритеты:** Простота запуска | Отказоустойчивость | Минимальные зависимости

---

## 1. Назначение сервера

### Основная роль
Сервер Canvia является **единым источником истины (Single Source of Truth)** для всех данных приложения. Он отвечает за:

1. **Безопасное хранение и управление данными**
   - Хранение всех пользовательских данных в защищённой БД
   - Контроль целостности данных
   - Кэширование часто используемых данных

2. **Аутентификация и авторизация**
   - Валидация учётных данных
   - Выдача JWT токенов
   - Проверка прав доступа (admin/user)
   - Управление сеансами (sessions)

3. **Синхронизация данных между клиентами**
   - Один пользователь на разных устройствах видит одинаковые данные
   - Real-time обновления (опционально)
   - Разрешение конфликтов при одновременном редактировании

4. **Валидация бизнес-логики**
   - Проверка корректности данных перед сохранением
   - Закрытие бизнес-правил (например, админ может создавать пользователей)
   - Логирование всех операций

5. **Обеспечение надёжности**
   - Graceful shutdown без потери данных
   - Автоматическое восстановление после сбоев
   - Health checks для мониторинга

---

## 2. Технический стек сервера

### Основной стек
```
├── Node.js 18+ (runtime)
├── Express.js (веб-фреймворк)
├── SQLite 3 (база данных)
├── JWT (аутентификация)
├── bcryptjs (хеширование паролей)
├── dotenv (конфигурация)
└── CORS (кроссплатформенность)
```

### Почему эти технологии?

| Компонент | Причина выбора |
|-----------|-----------------|
| **Node.js** | Простой запуск, асинхронный по природе, Javascript един для фронта и беска |
| **Express.js** | Минимальная кривая обучения, огромное сообщество, лёгкое расширение |
| **SQLite** | Не требует отдельного сервера БД, один файл .db, идеален для малых/средних проектов, простая миграция |
| **JWT** | Stateless аутентификация, не требует сессионного хранилища, работает с мобильными |
| **bcryptjs** | Криптографически стойкое хеширование паролей, защита от rainbow tables |
| **dotenv** | Секреты и конфиг в .env файле, безопасность, разные окружения (dev/prod) |

---

## 3. Структура сервера

```
server/
├── src/
│   ├── server.ts              # Точка входа, инициализация Express
│   ├── database.ts            # Инициализация SQLite, миграции
│   ├── auth.ts                # JWT, хеширование, middleware
│   ├── routes/                # API маршруты
│   │   ├── auth.ts            # POST /auth/login, /auth/register, /auth/verify, /auth/logout
│   │   ├── data.ts            # CRUD для installers, orders
│   │   └── canvas.ts          # CRUD для tiles, connections, tab_states
│   ├── middleware/            # Custom middleware
│   │   ├── errorHandler.ts    # Обработка ошибок
│   │   ├── logger.ts          # Логирование запросов
│   │   └── validation.ts      # Валидация входных данных
│   ├── utils/
│   │   ├── errors.ts          # Кастомные ошибки
│   │   └── response.ts        # Стандартный формат ответов
│   └── data/
│       └── profi-planner.db   # SQLite база данных
├── logs/                      # Логи приложения
│   ├── error.log             # Ошибки
│   ├── access.log            # HTTP запросы
│   └── sync.log              # Операции синхронизации
├── .env.example              # Шаблон переменных окружения
├── .env                       # Реальные переменные (в .gitignore)
├── .gitignore                # Git ignore
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── README.md
```

---

## 4. API Endpoints спецификация

### 4.1 Аутентификация

#### `POST /api/auth/login`
**Описание:** Вход пользователя в систему  
**Требует:** Открытый endpoint (без токена)  
**Параметры:**
```json
{
  "login": "string (обязательно)",
  "password": "string (обязательно, min 3 символа)"
}
```
**Ответ успеха (200):**
```json
{
  "success": true,
  "userId": "uuid",
  "login": "string",
  "role": "admin|manager|user",
  "token": "jwt-token-очень-длинная-строка",
  "expiresIn": "7d"
}
```
**Ошибки:**
- 400: Отсутствуют обязательные поля
- 401: Неверный логин/пароль
- 500: Ошибка сервера

---

#### `POST /api/auth/register`
**Описание:** Создание нового пользователя (только администратором)  
**Требует:** JWT токен от админа в заголовке `Authorization: Bearer <token>`  
**Параметры:**
```json
{
  "login": "string (обязательно, уникален)",
  "password": "string (обязательно, min 3 символа)",
  "role": "user|manager|admin (опционально, default: 'user')"
}
```
**Ответ успеха (201):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "login": "string",
    "role": "user"
  },
  "message": "Пользователь успешно создан"
}
```
**Ошибки:**
- 401: Отсутствует токен или истёк
- 403: Пользователь не админ
- 400: Логин уже существует
- 500: Ошибка сервера

---

#### `POST /api/auth/verify`
**Описание:** Проверка валидности текущего токена  
**Требует:** JWT токен  
**Параметры:** Нет (токен берётся из заголовка)  
**Ответ успеха (200):**
```json
{
  "success": true,
  "id": "uuid",
  "login": "string",
  "role": "admin|manager|user"
}
```
**Ошибки:**
- 401: Токен отсутствует, истёк или невалиден

---

#### `POST /api/auth/logout`
**Описание:** Выход из системы (опционально, на фронте просто удаляется токен)  
**Требует:** JWT токен  
**Ответ успеха (200):**
```json
{
  "success": true,
  "message": "Успешный выход"
}
```

---

#### Управление пользователями
- `GET /api/auth/users` — список (роль manager и выше)
- `PATCH /api/auth/users/{id}/role` — смена роли (только admin, себе нельзя)
- `PATCH /api/auth/users/{id}/password` — смена пароля (только admin)
- `DELETE /api/auth/users/{id}` — удаление (только admin, себя нельзя)

---

### 4.2 Управление персоналом

#### `GET /api/data/installers`
**Описание:** Получить всех установщиков пользователя  
**Требует:** JWT токен  
**Ответ успеха (200):**
```json
[
  {
    "id": "uuid",
    "name": "string",
    "phone": "string",
    "status": "free|busy",
    "createdAt": "ISO8601"
  }
]
```

---

#### `POST /api/data/installers`
**Описание:** Создать нового установщика  
**Требует:** JWT токен  
**Параметры:**
```json
{
  "name": "string (обязательно)",
  "phone": "string (обязательно)",
  "status": "string (опционально, default: 'free')"
}
```
**Ответ успеха (201):** Объект установщика с id

---

#### `PUT /api/data/installers/{id}`
**Описание:** Обновить установщика  
**Требует:** JWT токен, установщик принадлежит пользователю  
**Параметры:** Любые поля для обновления (name, phone, status)

---

#### `DELETE /api/data/installers/{id}`
**Описание:** Удалить установщика  
**Требует:** JWT токен, установщик принадлежит пользователю

---

### 4.3 Управление заказами

#### `GET /api/data/orders`
#### `POST /api/data/orders` (роль manager и выше)
#### `PUT /api/data/orders/{id}` (роль manager и выше)
#### `PATCH /api/data/orders/{id}` (любая роль; роль `user` может менять **только** `workDone`)
#### `DELETE /api/data/orders/{id}` (роль manager и выше)

**Параметры:**
```json
{
  "number": "string (авто-генерация, если пуст; уникален)",
  "address": "string",
  "description": "string (бывший client)",
  "deadline": "string дата",
  "status": "new|processing|completed (default: 'new')",
  "shift": "day|evening (смена, default: 'day')",
  "workDone": "string (что сделано — заполняет и монтажник)"
}
```

---

### 4.4 Холст (Canvas)

#### `GET /api/canvas/tabs`
**Описание:** Получить все вкладки (дни) пользователя  
**Ответ:** Массив объектов с date, cameraX, cameraY, zoom

---

#### `POST /api/canvas/tabs` (роль manager и выше)
**Параметры:**
```json
{
  "date": "YYYY-MM-DD (обязательно)"
}
```

---

#### `DELETE /api/canvas/tabs/{date}` (роль manager и выше)
**Описание:** Удалить вкладку (плитки, связи, состояние)

---

#### `GET /api/canvas/tiles?tabId=<id>`
**Описание:** Получить плитки для вкладки  
**Ответ:** Массив плиток с x, y позициями

---

#### `POST /api/canvas/tiles` (роль manager и выше)
**Параметры:**
```json
{
  "tabId": "YYYY-MM-DD (обязательно)",
  "type": "installer|order|brigade (обязательно)",
  "dataId": "uuid (обязательно)",
  "x": "number",
  "y": "number",
  "name": "string",
  "details": "string"
}
```

---

#### `PUT /api/canvas/tiles/{id}` (роль manager и выше)
**Параметры:**
```json
{
  "x": "number",
  "y": "number"
}
```

---

#### `DELETE /api/canvas/tiles/{id}` (роль manager и выше)

---

#### `GET /api/canvas/connections?tabId=<id>`
#### `POST /api/canvas/connections` (любая роль — монтажник может связать себя с нарядом)
**Параметры:**
```json
{
  "fromTileId": "uuid (обязательно)",
  "toTileId": "uuid (обязательно)",
  "tabId": "YYYY-MM-DD (обязательно)"
}
```

---

#### `DELETE /api/canvas/connections/{id}` (роль manager и выше)

---

#### Группы
- `GET /api/canvas/groups/{tabId}` — все группы вкладки
- `POST /api/canvas/groups` — создать (с привязкой `tileIds`)
- `PUT /api/canvas/groups/{id}` — частичное обновление (только переданные поля)
- `DELETE /api/canvas/groups/{id}` — удалить (плитки остаются)
- `POST /api/canvas/groups/{id}/tiles` / `DELETE /api/canvas/groups/{id}/tiles/{tileId}` — ±плитка

---

#### Бригады
- `GET/POST /api/brigades`, `PUT/DELETE /api/brigades/{id}`
- `POST /api/brigades/find-or-create` — найти по составу
- `POST /api/brigades/{id}/members` — добавить монтажника

---

#### Обзор (камера/зум)
Хранится **только в localStorage клиента** (`canvia-camera`) — у каждого зрителя свой,
на сервер не отправляется. Эндпоинт `PUT /api/canvas/tab-state` удалён.
`tab_states` используется лишь как реестр вкладок (дат).

---

### 4.5 Realtime

Подробно: [REALTIME.md](REALTIME.md) (тут — коротко).

- Шина событий в памяти: rev-счётчик + кольцевой буфер 200 + epoch перезапуска
- `GET /api/stream?token=` — SSE (токен в query), `id: <rev>`, heartbeat-сообщение каждые 25с
- `GET /api/poll?since=` — long-poll до первого события (макс. 20с)
- `GET /api/sync?since=` — догон пропущенного
- Транслируются: плитки, связи, наряды, монтажники, бригады; по группам клиент перечитывает вкладку
- Камера не транслируется

---

## 5. База данных (SQLite)

### Таблицы и схема

#### `users`
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL (хеш bcrypt),
  role TEXT DEFAULT 'user', -- 'admin' | 'manager' | 'user'
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
**Индексы:** PRIMARY KEY (id), UNIQUE (login)  
**Seed данные:** admin / admin (bcrypt хеш, сменить сразу)

---

#### `installers`
```sql
CREATE TABLE installers (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'free', -- 'free' или 'busy'
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```
**Индексы:** userId (для быстрого поиска)

---

#### `orders`
```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  userId TEXT,
  number TEXT UNIQUE,              -- авто-генерация, если пуст
  address TEXT,
  description TEXT,                -- раньше client
  deadline TEXT,
  status TEXT DEFAULT 'new',       -- 'new' | 'processing' | 'completed'
  shift TEXT DEFAULT 'day',        -- 'day' | 'evening' (смена)
  workDone TEXT DEFAULT '',        -- что сделано (заполняет и монтажник)
  createdBy TEXT,                  -- login создателя
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

#### `tiles`
```sql
CREATE TABLE tiles (
  id TEXT PRIMARY KEY,
  userId TEXT,
  tabId TEXT NOT NULL,             -- дата YYYY-MM-DD
  type TEXT NOT NULL, -- 'installer' | 'order' | 'brigade'
  dataId TEXT NOT NULL, -- ссылка на installer / order / brigade id
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  groupId TEXT,                    -- группа (nullable)
  name TEXT,
  details TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

#### `connections`
```sql
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  tabId TEXT NOT NULL,
  fromTileId TEXT NOT NULL,
  toTileId TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (fromTileId) REFERENCES tiles(id) ON DELETE CASCADE,
  FOREIGN KEY (toTileId) REFERENCES tiles(id) ON DELETE CASCADE
);
```

---

#### `tab_states`
```sql
CREATE TABLE tab_states (
  id TEXT PRIMARY KEY,
  userId TEXT,
  date TEXT NOT NULL UNIQUE,       -- YYYY-MM-DD, общий реестр вкладок
  cameraX REAL DEFAULT 0,          -- legacy, больше не пишется
  cameraY REAL DEFAULT 0,          -- legacy, больше не пишется
  zoom REAL DEFAULT 1,             -- legacy, больше не пишется
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```
**Примечание:** обзор (камера/зум) — личный у каждого зрителя, хранится
в `localStorage` клиента (`canvia-camera`) и на сервер не отправляется.

---

#### `groups`
```sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  tabId TEXT NOT NULL,             -- дата YYYY-MM-DD (без FK)
  name TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 200,
  height REAL NOT NULL DEFAULT 150,
  color TEXT DEFAULT '#6366f1',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

#### `brigades` + `brigade_members`
```sql
CREATE TABLE brigades (
  id TEXT PRIMARY KEY,
  userId TEXT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#10b981',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE brigade_members (
  id TEXT PRIMARY KEY,
  brigadeId TEXT NOT NULL,
  installerId TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brigadeId) REFERENCES brigades(id) ON DELETE CASCADE,
  FOREIGN KEY (installerId) REFERENCES installers(id) ON DELETE CASCADE
);
```

---

## 6. Запуск сервера

### 6.1 Требования к окружению

**Минимальные требования:**
```
Node.js: 18.0.0+
npm: 9.0.0+
OS: Windows, macOS, Linux
Память: 512 MB
Диск: 100 MB свободного места
```

**Проверка версии:**
```bash
node --version  # v18.0.0+
npm --version   # 9.0.0+
```

---

### 6.2 Установка зависимостей

```bash
# Перейти в папку сервера
cd server

# Установить зависимости
npm install

# Результат: 230 пакетов установлено, 0 уязвимостей
```

---

### 6.3 Конфигурация окружения

**1. Создать файл `.env`:**
```bash
cp .env.example .env
```

**2. Отредактировать `.env`:**
```env
# Основные настройки
NODE_ENV=development          # development или production
PORT=5000                     # Порт сервера
HOST=0.0.0.0                  # Хост (0.0.0.0 = все интерфейсы)

# Безопасность
JWT_SECRET=your-secret-key-change-this-in-production  # ОБЯЗАТЕЛЬНО изменить на production!
BCRYPT_ROUNDS=10              # Количество раундов хеширования паролей

# База данных
DATABASE_PATH=./data/profi-planner.db  # Путь к SQLite файлу

# Логирование
LOG_LEVEL=info                # error, warn, info, debug
LOG_DIR=./logs                # Директория для логов

# CORS
CORS_ORIGIN=http://localhost:5173  # URL фронтенда (для production: https://yourdomain.com)

# Опционально: Ngrok (для туннелирования)
NGROK_ENABLED=false           # true если используется Ngrok
NGROK_AUTH_TOKEN=             # Токен Ngrok (если включен)
```

---

### 6.4 Запуск в режиме разработки

```bash
# В папке server/
npm run dev

# Ожидаемый вывод:
# Server running on http://localhost:5000
# Connected to SQLite database
# Users table ready
# Installers table ready
# Orders table ready
# Tiles table ready
# Connections table ready
# Tab states table ready
# Default admin user created
```

---

### 6.5 Запуск в режиме production

```bash
# Сборка TypeScript
npm run build

# Запуск скомпилированного кода
npm start

# Или через процесс-менеджер (рекомендуется)
npm install -g pm2
pm2 start dist/server.js --name "profi-planner"
pm2 save
pm2 startup
```

---

### 6.6 Использование PM2 для надёжности (рекомендуется)

**Что это:** Process Manager, автоматически перезапускает приложение при сбоях

**Установка:**
```bash
npm install -g pm2
```

**Создать `ecosystem.config.js` в корне server:**
```javascript
module.exports = {
  apps: [{
    name: 'profi-planner-server',
    script: './dist/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    // Отказоустойчивость
    watch: ['src'],              // Автоперезагрузка при изменении файлов
    ignore_watch: ['node_modules', 'logs', 'data'],
    max_memory_restart: '200M',  // Перезапуск если памяти > 200 MB
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Graceful shutdown
    kill_timeout: 10000,         // 10 секунд на graceful shutdown
    listen_timeout: 3000,        // Ожидание запуска
    // Перезагрузка
    max_restarts: 10,            // Максимум перезапусков
    min_uptime: '10s',           // Минимум времени для считания успешного запуска
    autorestart: true,           // Автоперезапуск при сбое
    exp_backoff_restart_delay: 100, // Экспоненциальная задержка между перезапусками
  }]
};
```

**Запуск с PM2:**
```bash
# Режим разработки
pm2 start ecosystem.config.js

# Режим production
pm2 start ecosystem.config.js --env production

# Просмотр логов
pm2 logs profi-planner-server

# Мониторинг
pm2 monit

# Перезапуск
pm2 restart profi-planner-server

# Остановка
pm2 stop profi-planner-server

# Удаление
pm2 delete profi-planner-server
```

---

## 7. Отказоустойчивость и надёжность

### 7.1 Graceful Shutdown

**Что это:** Корректное завершение приложения без потери данных

**Реализация в server.ts:**
```typescript
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

// Обработка сигналов завершения
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    // Закрыть БД соединение
    db.close(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    db.close(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});
```

---

### 7.2 Обработка ошибок БД

**Проблема:** SQLite блокировки при параллельных операциях  
**Решение:** Использовать асинхронные обёртки с retry logic

```typescript
const runAsync = (sql: string, params: any[] = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        // Обработка SQLITE_BUSY
        if (err.code === 'SQLITE_BUSY') {
          console.warn('Database busy, retrying...');
          setTimeout(() => runAsync(sql, params).then(resolve).catch(reject), 100);
        } else {
          reject(err);
        }
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
};
```

---

### 7.3 Health Check Endpoint

**Назначение:** Проверка что сервер живой

**Реализация:**
```typescript
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'connected' // Проверить соединение с БД
  });
});
```

**Использование с PM2:**
```bash
pm2 healthcheck
```

---

### 7.4 Логирование и мониторинг

**Структура логов:**
```
logs/
├── error.log       # Только ошибки
├── access.log      # HTTP запросы
├── sync.log        # Операции синхронизации
└── combined.log    # Всё вместе
```

**Пример логирования:**
```typescript
import fs from 'fs';
import path from 'path';

const logDir = process.env.LOG_DIR || './logs';

// Создать директорию если нет
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = {
  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}\n${error ? error.stack : ''}\n`;
    console.error(logMessage);
    fs.appendFileSync(path.join(logDir, 'error.log'), logMessage);
  },
  
  info: (message: string) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] INFO: ${message}\n`;
    console.log(logMessage);
    fs.appendFileSync(path.join(logDir, 'access.log'), logMessage);
  },
  
  sync: (action: string, data: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] SYNC: ${action} - ${JSON.stringify(data)}\n`;
    fs.appendFileSync(path.join(logDir, 'sync.log'), logMessage);
  }
};
```

---

### 7.5 Резервное копирование БД

**Простой скрипт backup.js:**
```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dbPath = './data/profi-planner.db';
const backupDir = './backups';
const timestamp = new Date().toISOString().replace(/:/g, '-');
const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

// Создать директорию для backup если нет
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Копировать файл БД
fs.copyFileSync(dbPath, backupPath);
console.log(`✅ Backup created: ${backupPath}`);

// Оставить только последние 10 backup'ов
const files = fs.readdirSync(backupDir)
  .map(f => ({ name: f, path: path.join(backupDir, f) }))
  .sort((a, b) => fs.statSync(b.path).mtime - fs.statSync(a.path).mtime);

files.slice(10).forEach(f => {
  fs.unlinkSync(f.path);
  console.log(`🗑️  Removed old backup: ${f.name}`);
});
```

**Запуск backup'а ежедневно (cron):**
```bash
# Добавить в crontab
0 2 * * * cd /path/to/server && node backup.js
```

---

## 8. Docker (опционально для простоты deployment)

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build TypeScript
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  profi-planner:
    build: .
    ports:
      - "5000:5000"
    environment:
      NODE_ENV: production
      PORT: 5000
      JWT_SECRET: your-secret-key-here
      DATABASE_PATH: /app/data/profi-planner.db
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
```

**Запуск:**
```bash
docker-compose up -d
```

---

## 9. Чек-лист запуска

- [ ] Node.js 18+ установлен (`node --version`)
- [ ] npm 9+ установлен (`npm --version`)
- [ ] Клонирован репозиторий с сервером
- [ ] В папке `server/` выполнен `npm install`
- [ ] Создан файл `.env` из `.env.example`
- [ ] `JWT_SECRET` изменён на сложный ключ для production
- [ ] Папки `data/` и `logs/` создаются автоматически
- [ ] Сервер запущен (`npm run dev` или `npm start`)
- [ ] Сервер слушает на `http://localhost:5000`
- [ ] Endpoint `/api/health` возвращает 200 OK
- [ ] Админ `login: admin, password: admin` создан в БД
- [ ] CORS настроен на URL фронтенда
- [ ] Логи пишутся в `logs/` директорию

---

## 10. Решение проблем

### Проблема: `SQLITE_BUSY: database is locked`
**Причина:** Конфликты доступа к БД  
**Решение:** 
- Включить WAL (Write-Ahead Logging) в SQLite
- Использовать connection pool или queue

```typescript
db.configure('busyTimeout', 5000); // 5 секунд timeout
```

---

### Проблема: Сервер не стартует
**Проверить:**
- Порт 5000 не занят: `netstat -an | grep 5000`
- `.env` файл существует и корректен
- Папка `data/` доступна для записи
- Node.js версия >= 18: `node --version`

---

### Проблема: Токен постоянно истекает
**Решение:** Увеличить expiresIn в generateToken

```typescript
export const generateToken = (userId: string, login: string, isAdmin: boolean) => {
  return jwt.sign(
    { id: userId, login, isAdmin },
    JWT_SECRET,
    { expiresIn: '30d' }  // Вместо '7d'
  );
};
```

---

### Проблема: Фронтенд не может подключиться к серверу
**Проверить:**
- Сервер запущен: `curl http://localhost:5000/api/health`
- CORS настроен правильно в `server.ts`
- URL в `src/api.ts` указывает на правильный хост:порт
- Firewall не блокирует порт 5000

---

## 11. Масштабирование на будущее

Если понадобится масштабировать:

### 11.1 PostgreSQL вместо SQLite
```typescript
// Простая замена БД без изменения логики
import pg from 'pg';
const pool = new pg.Pool(connectionString);
```

### 11.2 Redis для кэширования
```typescript
import redis from 'redis';
const client = redis.createClient();
// Кэширование часто запрашиваемых данных
```

### 11.3 Load Balancing
```
nginx/
└── → Node.js процесс 1 (порт 5000)
├── → Node.js процесс 2 (порт 5001)
└── → Node.js процесс 3 (порт 5002)
```

### 11.4 Message Queue (для асинхронных задач)
```typescript
import bull from 'bull';
const emailQueue = new Queue('send-email');
```

---

## Резюме

| Аспект | Решение |
|--------|---------|
| **Простота запуска** | npm install → npm run dev (2 команды) |
| **Отказоустойчивость** | PM2, Graceful Shutdown, Retry Logic |
| **Хранение данных** | SQLite (один файл, не требует сервера) |
| **Безопасность** | JWT + bcrypt, CORS, .env секреты |
| **Мониторинг** | Health checks, логи, PM2 dashboard |
| **Масштабирование** | Docker, Load balancer, PostgreSQL на будущее |

**Итог:** Сервер готов к production использованию с упором на простоту и надёжность.
