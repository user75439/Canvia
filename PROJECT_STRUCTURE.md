# 📁 Структура проекта Canvia

Дата: 3 октября 2026

## 📂 Корневая папка

```
profi-canvas-flow-main/
├── 📄 README.md                 # Основная документация
├── 📄 package.json              # Зависимости фронтенда
├── 📄 vite.config.ts            # Конфигурация сборки
├── 📄 tsconfig.json             # TypeScript конфиг
├── 📄 tailwind.config.ts        # Стили
├── 📄 index.html                # HTML страница
├── 📄 .env                      # Переменные окружения
├── 📄 .gitignore                # Git игнор
│
├── 📂 src/                      # ФРОНТЕНД
├── 📂 server/                   # БЕКЕНД  
├── 📂 scripts/                  # СКРИПТЫ ЗАПУСКА
├── 📂 docs/                     # ДОКУМЕНТАЦИЯ
├── 📂 public/                   # Статика
├── 📂 logs/                     # Логи
├── 📂 node_modules/             # Зависимости (авто)
└── 📂 dist/                     # Сборка (авто)
```

---

## 📂 src/ - Фронтенд (React + TypeScript)

```
src/
├── 📄 App.tsx                   # Главный компонент (1924 строки)
│                                # - Zustand store
│                                # - Canvas рендер
│                                # - Авторизация
│                                # - Управление плитками
│
├── 📄 api.ts                    # API клиент
│                                # - JWT авторизация
│                                # - REST запросы
│                                # - CORS настройка
│
├── 📄 main.tsx                  # Точка входа React
├── 📄 index.css                 # Глобальные стили
│
├── 📂 components/               # React компоненты
│   ├── NavLink.tsx              # Навигация
│   └── ui/                      # shadcn/ui компоненты (50+ файлов)
│       ├── button.tsx
│       ├── input.tsx
│       ├── dialog.tsx
│       └── ...
│
├── 📂 hooks/                    # Custom React hooks
│   ├── use-mobile.tsx
│   └── use-toast.ts
│
└── 📂 lib/                      # Утилиты
    └── utils.ts                 # Хелперы
```

**Ключевые файлы:**
- `App.tsx` - вся логика приложения (store, canvas, realtime, модалки)
- `api.ts` - все HTTP запросы к серверу (+ `getApiUrl`: локалка → `:5000`, туннель → тот же origin через vite proxy)

---

## 📂 server/ - Бекенд (Node.js + Express)

```
server/
├── 📄 package.json              # Зависимости сервера
├── 📄 tsconfig.json             # TypeScript конфиг
├── 📄 .env                      # Переменные окружения
│                                # PORT=5000
│                                # JWT_SECRET=...
│                                # CORS_ORIGIN=...
│
├── 📂 src/                      # Исходники
│   ├── 📄 server.ts             # Главный файл сервера
│   │                            # - Express setup
│   │                            # - CORS (локалка, keenetic.link, *.trycloudflare.com)
│   │                            # - JWT middleware
│   │                            # - Routes регистрация
│   │
│   ├── 📄 realtime.ts           # Шина realtime-событий
│   │                            # - Счётчик ревизий + epoch перезапуска
│   │                            # - Кольцевой буфер последних 200 событий
│   │
│   └── 📂 routes/               # API роуты
│       ├── auth.ts              # Авторизация
│       │                        # POST /api/auth/login
│       │                        # GET  /api/auth/me
│       │                        # POST /api/auth/verify
│       │                        # POST /api/auth/register (admin)
│       │                        # GET  /api/auth/users (manager+)
│       │                        # PATCH/DELETE /api/auth/users/:id (admin)
│       │
│       ├── canvas.ts            # Canvas API (плитки, связи, группы, вкладки)
│       │                        # GET/POST /api/canvas/tabs, DELETE /api/canvas/tabs/:date
│       │                        # GET/POST /api/canvas/tiles, PUT/DELETE /api/canvas/tiles/:id
│       │                        # GET/POST /api/canvas/connections, DELETE /api/canvas/connections/:id
│       │                        # GET/POST/PUT/DELETE /api/canvas/groups...
│       │                        # (камера НЕ хранится на сервере — localStorage у каждого)
│       │
│       ├── data.ts              # Справочники
│       │                        # GET/POST/PUT/DELETE /api/data/installers
│       │                        # GET/POST/PUT/PATCH/DELETE /api/data/orders
│       │                        # (PATCH доступен роли user: только workDone)
│       │
│       ├── brigades.ts          # Бригады
│       │                        # GET/POST/PUT/DELETE /api/brigades
│       │                        # POST /api/brigades/find-or-create
│       │                        # POST /api/brigades/:id/members
│       │
│       ├── realtime.ts          # Realtime-транспорты
│       │                        # GET /api/stream (SSE, токен в query)
│       │                        # GET /api/poll?since= (long-poll)
│       │                        # GET /api/sync?since= (догон)
│       │
│       └── users.ts             # (см. auth.ts — пользователи там)
│
├── 📂 data/                     # База данных SQLite
│   └── profi-planner.db         # SQLite файл
│                                # Tables:
│                                # - users (id, login, password-hash, role: admin/manager/user)
│                                # - installers (id, name, phone, status)
│                                # - orders (..., status, shift day/evening, workDone, createdBy)
│                                # - tiles (..., groupId)
│                                # - connections
│                                # - groups (id, tabId=date, name, x, y, width, height, color)
│                                # - brigades + brigade_members
│                                # - tab_states (реестр вкладок; камера живёт в localStorage)
│
├── 📂 dist/                     # Скомпилированный JS (авто)
└── 📂 node_modules/             # Зависимости (авто)
```

**Ключевые файлы:**
- `server.ts` - настройка Express, CORS, JWT
- `routes/` - все API endpoints
- `data/profi-planner.db` - вся информация приложения

---

## 📂 server/scripts/ - Вспомогательные скрипты

```
server/scripts/
├── 📄 backup.js                # Бэкап БД (`npm run backup` на сервере)
└── 📂 legacy/                  # Одноразовые миграции/проверки (в сборке не участвуют)
    ├── migrate-*.ts            # Исторические миграции схемы
    ├── check-*.ts, fix-*.ts    # Разовые диагностики
    └── clean-empty-groups.ts
```

Запуск сервера/фронта — вручную в двух терминалах (`server: npm run dev`, корень: `npm run dev`).
`reset-admin-password.ts` лежит в `server/src/` (`npm run reset-admin` на сервере).

---

## 📂 docs/ - Документация

```
docs/
├── 📄 STARTUP.md                # 🚀 Быстрый старт (30 сек)
│                                # - Как запустить
│                                # - Учётные записи
│                                # - Доступ к приложению
│
├── 📄 DEPLOYMENT.md             # 🎯 Способы запуска
│                                # - Ручной и разработка
│                                # - Cloudflare Tunnel для монтажников
│                                # - Переменные окружения
│
├── 📄 REALTIME.md               # ⚡ Обновления в реальном времени
│                                # - SSE / long-poll / sync
│                                # - Индикатор LIVE/SYNC/OFF
│
├── 📄 DIAGNOSTICS.md            # 🔧 Решение проблем
│                                # - 10 частых проблем
│                                # - Диагностика портов
│                                # - Работа с логами
│                                # - Firewall настройка
│                                # - Сброс БД
│
├── 📄 SERVER_ARCHITECTURE.md    # 🏗️ Архитектура сервера
│                                # - Назначение компонентов
│                                # - Технический стек
│                                # - API документация
│                                # - Схема БД
│
└── 📄 TECHNICAL_SPECIFICATION.md # 📋 Техспецификация
                                 # - Требования
                                 # - Функционал
                                 # - Безопасность
```

**Порядок чтения:**
1. STARTUP.md - начать здесь
2. DEPLOYMENT.md - если нужны другие способы запуска
3. DIAGNOSTICS.md - если проблемы
4. SERVER_ARCHITECTURE.md - для понимания архитектуры
5. TECHNICAL_SPECIFICATION.md - полная техдокументация

---

## 📂 public/ - Статические файлы

```
public/
└── robots.txt                   # SEO
```

---

## 📂 logs/ - Логи приложения

```
logs/
├── server.log                   # Основные логи сервера
├── error.log                    # Только ошибки
└── access.log                   # HTTP запросы
```

**Использование:**
```powershell
# Смотреть в реальном времени
Get-Content logs/server.log -Tail 20 -Wait

# Последние ошибки
Get-Content logs/error.log -Tail 50
```

---

## 🔧 Конфигурационные файлы

### Корневая папка

| Файл | Назначение |
|------|-----------|
| `package.json` | Зависимости фронтенда (React, Vite, Tailwind) |
| `vite.config.ts` | Dev сервер на :8080, allowedHosts *.trycloudflare.com, proxy /api → :5000 |
| `tsconfig.json` | TypeScript настройки |
| `tailwind.config.ts` | Стили и темы |
| `eslint.config.js` | Линтер кода |
| `postcss.config.js` | PostCSS обработка |
| `components.json` | shadcn/ui конфиг |
| `.env` | Переменные окружения (опционально) |
| `.gitignore` | Git игнорирует node_modules, dist, .env |

### server/

| Файл | Назначение |
|------|-----------|
| `package.json` | Зависимости сервера (Express, SQLite, JWT) |
| `tsconfig.json` | TypeScript для сервера |
| `.env` | PORT, JWT_SECRET, CORS_ORIGIN, NODE_ENV |

---

## 📊 Размеры и статистика

**Основной код:**
- `src/App.tsx`: ~4550 строк (store, canvas, realtime, модалки)
- `src/api.ts`: ~410 строк (HTTP клиент)
- `server/src/server.ts`: ~140 строк (Express setup)
- `server/src/routes/`: ~1650 строк (все API)
- `server/src/realtime.ts` + `routes/realtime.ts`: шина событий и SSE/long-poll/sync

**База данных:**
- 9 таблиц (users, installers, orders, tiles, connections, groups, brigades, brigade_members, tab_states)
- 1 пользователь по умолчанию (admin, пароль сменить сразу)

**Зависимости:**
- Фронтенд: ~50 npm пакетов
- Сервер: ~15 npm пакетов
- UI компоненты: 50+ shadcn/ui компонентов

---

## 🚀 Быстрая навигация

### Хочу запустить приложение
👉 `npm run dev` в корне (фронт) + `npm run dev` в `server/` (бэкенд)

### Хочу дать доступ монтажнику
👉 `cloudflared tunnel --url http://localhost:8080`, ссылку — ему

### Есть проблема
👉 `docs/DIAGNOSTICS.md`

### Хочу понять как работает
👉 `docs/SERVER_ARCHITECTURE.md`

### Хочу изменить код
- Фронтенд: `src/App.tsx`
- API клиент: `src/api.ts`
- Сервер: `server/src/server.ts`
- API роуты: `server/src/routes/`

### Хочу изменить данные
- База: `server/data/profi-planner.db`
- Конфиг сервера: `server/.env`
- Конфиг фронтенда: `vite.config.ts`

---

## 🗂️ Что где искать

**Авторизация:**
- Фронтенд: `src/App.tsx` (строки ~1700-1800)
- API: `src/api.ts` (authAPI)
- Сервер: `server/src/routes/auth.ts`

**Canvas и плитки:**
- Фронтенд: `src/App.tsx` (строки ~100-1500)
- API: `src/api.ts` (canvasAPI)
- Сервер: `server/src/routes/canvas.ts`

**Справочники (монтажники/наряды):**
- Фронтенд: `src/App.tsx` (диалоги)
- API: `src/api.ts` (installerAPI, orderAPI)
- Сервер: `server/src/routes/data.ts`

**Пользователи:**
- Фронтенд: `src/App.tsx` (админ панель)
- API: `src/api.ts` (authAPI)
- Сервер: `server/src/routes/auth.ts`

**Realtime:**
- Дока: `docs/REALTIME.md`
- Сервер: `server/src/realtime.ts`, `server/src/routes/realtime.ts`
- Фронтенд: `src/App.tsx` (блок REALTIME), индикатор в хедере

---

**Последнее обновление:** 3 октября 2026
