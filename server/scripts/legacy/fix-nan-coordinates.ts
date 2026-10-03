import { db, allAsync, runAsync } from './database.js';

async function fixNaNCoordinates() {
  console.log('🔍 Checking for tiles with NaN coordinates...');
  
  try {
    const tiles = await allAsync('SELECT id, x, y, tabId FROM tiles');
    
    let fixed = 0;
    for (const tile of tiles) {
      // Проверяем: NaN, null, или не-число (например, строка '[object Object]')
      const xValid = typeof tile.x === 'number' && !isNaN(tile.x) && isFinite(tile.x);
      const yValid = typeof tile.y === 'number' && !isNaN(tile.y) && isFinite(tile.y);
      
      if (!xValid || !yValid) {
        console.log(`❌ Found invalid tile: ${tile.id} (x: ${tile.x}, y: ${tile.y})`);
        // Удаляем плитку с невалидными координатами
        await runAsync('DELETE FROM tiles WHERE id = ?', [tile.id]);
        fixed++;
      }
    }
    
    if (fixed > 0) {
      console.log(`✅ Fixed ${fixed} tiles with invalid coordinates`);
    } else {
      console.log('✅ No tiles with invalid coordinates found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixNaNCoordinates();
