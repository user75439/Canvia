import { db, allAsync, runAsync } from './database.js';

async function cleanEmptyGroups() {
  console.log('🔍 Checking for empty groups...\n');
  
  try {
    const groups = await allAsync('SELECT id, name, tabId FROM groups', []);
    
    let deleted = 0;
    for (const group of groups) {
      // Проверяем, есть ли плитки в этой группе
      const tilesInGroup = await allAsync(
        'SELECT COUNT(*) as count FROM tiles WHERE groupId = ?',
        [group.id]
      );
      
      const count = tilesInGroup[0].count;
      
      if (count === 0) {
        console.log(`❌ Empty group found: ${group.name} (${group.id})`);
        await runAsync('DELETE FROM groups WHERE id = ?', [group.id]);
        deleted++;
      }
    }
    
    if (deleted > 0) {
      console.log(`\n✅ Deleted ${deleted} empty groups`);
    } else {
      console.log('✅ No empty groups found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanEmptyGroups();
