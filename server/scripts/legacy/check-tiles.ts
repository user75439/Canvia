import { db, allAsync } from './database.js';

async function checkTiles() {
  try {
    console.log('🔍 Проверка всех плиток в базе данных...\n');
    
    const tiles = await allAsync('SELECT id, type, dataId, x, y, groupId, tabId FROM tiles', []);
    
    console.log(`✅ Всего плиток: ${tiles.length}\n`);
    
    tiles.forEach((tile: any) => {
      const xValid = typeof tile.x === 'number' && !isNaN(tile.x) && isFinite(tile.x);
      const yValid = typeof tile.y === 'number' && !isNaN(tile.y) && isFinite(tile.y);
      const status = xValid && yValid ? '✅' : '❌';
      
      console.log(`${status} ID: ${tile.id}`);
      console.log(`   Type: ${tile.type}, DataID: ${tile.dataId}`);
      console.log(`   Position: (${tile.x}, ${tile.y})`);
      console.log(`   GroupID: ${tile.groupId || 'none'}`);
      console.log(`   TabID: ${tile.tabId}\n`);
    });
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    db.close();
  }
}

checkTiles();
