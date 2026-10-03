# Управление плитками в группах

## Реализовано

### Backend API (уже было готово)
- `POST /api/canvas/groups/:id/tiles` - добавить плитку в группу
- `DELETE /api/canvas/groups/:id/tiles/:tileId` - убрать плитку из группы

### Frontend функции

#### Store Actions (src/App.tsx)

1. **addTileToGroup(groupId, tileId)**
   - Добавляет плитку в группу
   - Оптимистичное обновление UI
   - Автоматический пересчет границ группы
   - Откат при ошибке

2. **removeTileFromGroup(tileId)**
   - Убирает плитку из группы
   - Обнуляет groupId у плитки
   - Автоматический пересчет границ группы
   - Откат при ошибке

3. **recalculateGroupBounds(groupId)**
   - Пересчитывает границы группы по плиткам внутри
   - Автоматически удаляет группу, если в ней не осталось плиток
   - Использует те же параметры, что и при создании:
     - padding: 40px
     - headerHeight: 40px
     - tileHeight: 160px

### UI Компоненты

#### Умные кнопки в хедере
Показываются только при наличии выделенных плиток (Shift + клик):

1. **"Создать группу (N)"**
   - Появляется когда: все выделенные плитки НЕ в группах
   - Цвет: indigo
   - Действие: открывает модальное окно создания группы

2. **"Добавить в группу (N)"**
   - Появляется когда: есть плитки не в группах И существуют группы
   - Цвет: blue
   - Действие: открывает модальное окно выбора группы

3. **"Убрать из группы (N)"**
   - Появляется когда: все выделенные плитки в ОДНОЙ группе
   - Цвет: red
   - Действие: немедленно убирает плитки из группы

#### AddToGroupModal
Модальное окно для выбора группы при добавлении плиток:
- Список всех групп текущей вкладки
- Визуальное отображение цвета группы
- Кнопка отмены
- Клик по группе → добавление плиток

## Как пользоваться

### Добавить плитки в существующую группу
1. Зажмите **Shift** и кликайте по плиткам, которые хотите добавить
2. В хедере появится кнопка **"Добавить в группу (N)"**
3. Кликните по кнопке
4. Выберите группу из списка
5. Плитки добавятся в группу, границы автоматически расширятся

### Убрать плитки из группы
1. Зажмите **Shift** и кликайте по плиткам внутри ОДНОЙ группы
2. В хедере появится кнопка **"Убрать из группы (N)"**
3. Кликните по кнопке
4. Плитки выйдут из группы, границы автоматически пересчитаются

### Автоматическое удаление пустых групп
Если из группы убрать все плитки, группа автоматически удалится.

## Технические детали

### Алгоритм пересчета границ
```typescript
recalculateGroupBounds(groupId) {
  // 1. Получить все плитки группы
  const tilesInGroup = tiles.filter(t => t.groupId === groupId);
  
  // 2. Если плиток нет → удалить группу
  if (tilesInGroup.length === 0) {
    deleteGroup(groupId);
    return;
  }
  
  // 3. Найти минимальные и максимальные координаты
  const minX = Math.min(...tilesInGroup.map(t => t.x));
  const maxX = Math.max(...tilesInGroup.map(t => t.x));
  const minY = Math.min(...tilesInGroup.map(t => t.y));
  const maxY = Math.max(...tilesInGroup.map(t => t.y));
  
  // 4. Рассчитать новые границы с учетом padding
  const newBounds = {
    x: minX - padding,
    y: minY - headerHeight - padding,
    width: (maxX - minX) + 200 + padding * 2,
    height: (maxY - minY) + tileHeight + headerHeight + padding * 2
  };
  
  // 5. Обновить группу на сервере
  updateGroup(groupId, newBounds);
}
```

### Логика отображения кнопок
```typescript
// Все выделенные плитки
const selectedTilesData = tiles.filter(t => selectedTiles.includes(t.id));

// Все в одной группе?
const allSelectedInSameGroup = selectedTilesData.length > 0 && 
  selectedTilesData.every(t => t.groupId && t.groupId === selectedTilesData[0].groupId);

// Все не в группах?
const allSelectedNotInGroup = selectedTilesData.length > 0 && 
  selectedTilesData.every(t => !t.groupId);

// Есть плитки не в группах?
const someSelectedNotInGroup = selectedTilesData.some(t => !t.groupId);
```

## Связанные файлы
- `src/App.tsx` - основная логика и UI
- `src/api.ts` - API client (groupAPI.addTile, groupAPI.removeTile)
- `server/src/routes/groups.ts` - backend endpoints
- `GROUPS_PROGRESS.md` - документация по системе групп
