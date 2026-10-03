# Canvia - Система планирования логистики

## 📋 Описание

**Canvia** - веб-приложение для управления монтажниками и нарядами в локальной сети с обновлениями в реальном времени.

### Основные возможности
- 📅 Интерактивный канвас на каждый день (панорама, зум к курсору, тач-поддержка)
- 📋 Наряды: смена ☀️ День / 🌙 Вечер, статусы, поле «Что сделано»
- 👥 Монтажники и бригады (включая слияние перетаскиванием)
- 🗂️ Группы плиток с перемещением целиком
- ⚡ Realtime: правки одного видны всем сразу (SSE + long-poll fallback, индикатор LIVE/SYNC/OFF)
- 🔐 Роли: администратор / менеджер / пользователь (монтажник)
- 📱 Мобильная версия: просмотр + отметка выполнения с телефона
- 🌐 Доступ извне через Cloudflare Quick Tunnel

## 🚀 Быстрый старт

```bash
npm install
cd server && npm install && cd ..

# Терминал 1 — бэкенд
cd server && npm run dev     # :5000

# Терминал 2 — фронтенд
npm run dev                  # :8080
```

Проверка: `http://localhost:8080` (страница логина), `http://localhost:5000/api/health`.

## 👤 Роли

| Роль | Логин по умолчанию | Что может |
|------|-------------------|-----------|
| admin | `admin` / `admin` | Всё + пользователи |
| manager | — (создаёт admin) | Канвас, справочники, вкладки |
| user | — (создаёт admin) | Смотреть канвас, заполнять «Что сделано» |

> Монтажники из справочника — не учётки. Чтобы монтажник заходил с телефона, admin создаёт ему логин с ролью `user`. Пароль `admin` смените сразу после установки.

## 🌐 Доступ монтажнику по ссылке

```bash
cloudflared tunnel --url http://localhost:8080
```

Выданную `https://xxx.trycloudflare.com` ссылку можно отправлять — авторизация и API идут через тот же туннель, ничего дополнительно настраивать не нужно. Поддомен `*.trycloudflare.com` уже разрешён в `vite.config.ts` и CORS сервера.

## 🛠️ Технологии

**Фронтенд:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, EventSource (SSE)
**Бэкенд:** Node.js, Express, SQLite, JWT, bcryptjs

## 🔧 Команды

```bash
npm run dev      # Фронтенд (dev, :8080)
npm run build    # Сборка фронта
npm run lint     # Проверка
cd server && npm run dev    # Сервер (dev, :5000)
cd server && npm run build && npm start  # Сервер (prod)
```

## 📚 Документация

- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - структура проекта и схема БД
- **[docs/REALTIME.md](docs/REALTIME.md)** - как устроены обновления в реальном времени
- **[docs/STARTUP.md](docs/STARTUP.md)** - быстрый старт за 30 секунд
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - способы запуска + туннель
- **[docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md)** - диагностика и решение проблем
- **[docs/SERVER_ARCHITECTURE.md](docs/SERVER_ARCHITECTURE.md)** - архитектура сервера
- **[TILE_MANAGEMENT.md](TILE_MANAGEMENT.md)** - управление плитками и группами
- **[GROUPS_PROGRESS.md](GROUPS_PROGRESS.md)** - система групп

## 🐛 Решение проблем

**Порт занят:**
```bash
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

**Индикатор realtime не LIVE:** тапните по нему — панель покажет причину.

📚 Полный гайд: **[docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md)**

---

**Последнее обновление:** 3 октября 2026
