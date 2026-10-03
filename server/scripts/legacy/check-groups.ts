import { db, allAsync } from './database.js';

async function checkGroups() {
  try {
    console.log('🔍 Проверка групп в базе данных...\n');
    
    const groups = await allAsync('SELECT * FROM groups', []);
    
    if (groups.length === 0) {
      console.log('❌ В базе данных нет ни одной группы!\n');
    } else {
      console.log(`✅ Найдено ${groups.length} групп:\n`);
      groups.forEach((group: any) => {
        console.log(`  ID: ${group.id}`);
        console.log(`  Name: ${group.name}`);
        console.log(`  TabID: ${group.tabId}`);
        console.log(`  Position: (${group.x}, ${group.y})`);
        console.log(`  Size: ${group.width}x${group.height}`);
        console.log(`  Color: ${group.color}`);
        console.log(`  Created: ${group.createdAt}\n`);
      });
    }
    
    // Также проверим плитки с groupId
    const tilesInGroups = await allAsync('SELECT id, type, dataId, groupId, tabId FROM tiles WHERE groupId IS NOT NULL', []);
    console.log(`\n📍 Плиток в группах: ${tilesInGroups.length}`);
    if (tilesInGroups.length > 0) {
      tilesInGroups.forEach((tile: any) => {
        console.log(`  Tile ${tile.id} → Group ${tile.groupId} (tab: ${tile.tabId})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    db.close();
  }
}

checkGroups();
