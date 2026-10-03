# Инструкция по загрузке проекта на GitHub

## Шаг 1: Установка Git

Если Git еще не установлен:

1. Скачайте Git для Windows: https://git-scm.com/download/win
2. Запустите установщик
3. При установке выберите:
   - ✅ "Git from the command line and also from 3rd-party software"
   - ✅ "Use Windows' default console window"
4. Перезапустите PowerShell после установки

Проверьте установку:
```powershell
git --version
```

## Шаг 2: Настройка Git (первый раз)

```powershell
git config --global user.name "Ваше Имя"
git config --global user.email "your.email@example.com"
```

## Шаг 3: Инициализация репозитория

```powershell
cd c:\Users\User\Desktop\profi-canvas-flow-main

# Инициализировать git репозиторий
git init

# Добавить все файлы
git add .

# Создать первый коммит
git commit -m "Initial commit: Canvia logistics planning system"
```

## Шаг 4: Создание репозитория на GitHub

1. Откройте https://github.com/new
2. Введите название: **canvia-logistics** (или любое другое)
3. Описание: **Система планирования логистики Canvia**
4. Выберите **Private** (рекомендуется) или Public
5. **НЕ** создавайте README, .gitignore, license (у нас уже есть)
6. Нажмите **Create repository**

## Шаг 5: Загрузка на GitHub

GitHub покажет команды. Используйте вариант "…or push an existing repository":

```powershell
# Добавить удаленный репозиторий (замените USERNAME на ваш логин)
git remote add origin https://github.com/USERNAME/canvia-logistics.git

# Переименовать ветку в main (если нужно)
git branch -M main

# Загрузить код
git push -u origin main
```

При первом push GitHub запросит аутентификацию:
- **Логин**: ваш GitHub username
- **Пароль**: используйте Personal Access Token (не пароль от аккаунта!)

### Создание Personal Access Token:

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Название: "Canvia Push"
4. Срок: 90 days (или No expiration)
5. Права: ✅ **repo** (все подпункты)
6. Generate token
7. **СКОПИРУЙТЕ ТОКЕН** - он больше не появится!
8. Используйте токен вместо пароля при push

## Шаг 6: Проверка

Откройте https://github.com/USERNAME/canvia-logistics - должны увидеть все файлы.

## Альтернатива: GitHub Desktop

Если не хотите работать с командной строкой:

1. Скачайте GitHub Desktop: https://desktop.github.com/
2. Войдите в аккаунт GitHub
3. File → Add Local Repository → выберите папку проекта
4. Publish repository → выберите Private/Public → Publish

## Последующие обновления

После изменения кода:

```powershell
git add .
git commit -m "Описание изменений"
git push
```

## ⚠️ Важно

**.gitignore** уже настроен и исключает:
- ✅ `.env` (локальные настройки)
- ✅ `pids/` (временные PID файлы)
- ✅ `*.db` (база данных с данными)
- ✅ `node_modules/` (зависимости)
- ✅ `logs/` (логи сервера)

**НЕ коммитьте:**
- Пароли и токены
- Базу данных с реальными данными
- Логи и временные файлы

## Клонирование на другой компьютер

```powershell
git clone https://github.com/USERNAME/canvia-logistics.git
cd canvia-logistics

# Создать .env файлы из примеров
copy .env.example .env
copy server\.env.example server\.env

# Отредактировать .env - указать IP вашего сервера
notepad .env

# Установить зависимости
npm install
cd server
npm install
cd ..

# Запустить
.\scripts\server-start.ps1 -Dev
```

## Помощь

**Ошибка "git is not recognized":**
- Перезапустите PowerShell после установки Git
- Или укажите полный путь: `C:\Program Files\Git\bin\git.exe`

**Ошибка при push:**
- Проверьте токен (не пароль!)
- Убедитесь что токен имеет права **repo**

**Файл .env попал в репозиторий:**
```powershell
git rm --cached .env
git rm --cached server/.env
git commit -m "Remove .env files"
git push
```

Затем добавьте в .gitignore если еще нет.
