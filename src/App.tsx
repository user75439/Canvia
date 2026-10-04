import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { authAPI, installerAPI, orderAPI, canvasAPI, brigadeAPI, groupAPI, getApiUrl } from './api';
import {
  UserIcon,
  WrenchScrewdriverIcon,
  ClipboardDocumentListIcon,
  PlusIcon,
  TrashIcon,
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  LinkIcon,
  CalendarIcon,
  PhoneIcon,
  MapPinIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  MinusIcon,
  ArrowsPointingOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  ShieldCheckIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
import { UserPlusIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/solid';

// ============ TYPES ============
interface User {
  id: string;
  login: string;
  role: string;
}

interface Installer {
  id: string;
  name: string;
  phone: string;
  status: 'free' | 'busy';
}

interface Order {
  id: string;
  number: string;
  address: string;
  description: string;
  deadline: string;
  createdBy: string;
  status: 'new' | 'processing' | 'completed';
  shift: 'day' | 'evening';
  workDone: string;
}

interface Brigade {
  id: string;
  name: string;
  color: string;
  members: string[];
  memberDetails?: Installer[];
}

interface Group {
  id: string;
  tabId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface Tile {
  id: string;
  type: 'installer' | 'order' | 'brigade';
  dataId: string;
  x: number;
  y: number;
  groupId?: string;
}

interface Connection {
  id: string;
  fromTileId: string;
  toTileId: string;
}

interface TabData {
  tiles: Tile[];
  connections: Connection[];
  cameraX: number;
  cameraY: number;
  zoom: number;
}

interface AppState {
  currentUser: User | null;
  installers: Installer[];
  orders: Order[];
  brigades: Brigade[];
  groups: Group[];
  tabs: Record<string, TabData>;
  activeTabDate: string;
  
  // Auth actions
  logout: () => void;
  realtimeOnline: boolean;
  realtimePolling: boolean;
  realtimeError: string | null;
  realtimeEvents: number;
  realtimeRevN: number;
  
  // Data actions
  addInstaller: (installer: Omit<Installer, 'id'>) => Promise<string>;
  updateInstaller: (id: string, updates: Partial<Installer>) => Promise<void>;
  deleteInstaller: (id: string) => Promise<void>;
  
  addOrder: (order: Omit<Order, 'id'>) => Promise<string>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  
  addBrigade: (brigade: Omit<Brigade, 'id'>) => Promise<string>;
  updateBrigade: (id: string, updates: Partial<Brigade>) => Promise<void>;
  deleteBrigade: (id: string) => Promise<void>;
  enableBrigadeMerge: boolean;
  toggleBrigadeMerge: () => void;
  
  // Group actions
  addGroup: (group: Omit<Group, 'id'>, tileIds: string[]) => Promise<string>;
  updateGroup: (id: string, updates: Partial<Group>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  moveGroup: (id: string, deltaX: number, deltaY: number) => Promise<void>;
  addTileToGroup: (groupId: string, tileId: string) => Promise<void>;
  removeTileFromGroup: (tileId: string) => Promise<void>;
  recalculateGroupBounds: (groupId: string) => Promise<void>;
  
  // Tile actions
  addTile: (tile: Omit<Tile, 'id'>) => Promise<void>;
  updateTilePosition: (id: string, x: number, y: number) => Promise<void>;
  deleteTile: (id: string) => Promise<void>;
  
  // Connection actions
  addConnection: (fromTileId: string, toTileId: string) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  
  // Tab actions
  setActiveTab: (date: string) => void;
  deleteTab: (date: string) => Promise<void>;
  updateCamera: (x: number, y: number, zoom: number) => void;
  
  // Persistence
  loadState: () => Promise<void>;
}

// Возвращает дату в локальном часовом поясе (без сдвига на UTC)
const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getToday = () => {
  const d = new Date();
  return getLocalDateString(d);
};

const getTomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getLocalDateString(d);
};

const formatDateLabel = (dateStr: string) => {
  const today = getToday();
  const tomorrow = getTomorrow();
  if (dateStr === today) return 'Сегодня';
  if (dateStr === tomorrow) return 'Завтра';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

const createEmptyTab = (): TabData => ({
  tiles: [],
  connections: [],
  cameraX: 0,
  cameraY: 0,
  zoom: 1,
});

// Камера — личное состояние каждого зрителя (не транслируется и не шарится
// через сервер): обзор каждого дня храним в localStorage, чтобы переживал
// перезагрузку, но не дёргался от чужих панорамирований.
const CAMERA_KEY = 'canvia-camera';
const loadCameraCache = (): Record<string, { x: number; y: number; zoom: number }> => {
  try {
    return JSON.parse(localStorage.getItem(CAMERA_KEY) || '{}');
  } catch {
    return {};
  }
};
const saveCameraCache = (date: string, x: number, y: number, zoom: number) => {
  try {
    const cache = loadCameraCache();
    cache[date] = { x, y, zoom };
    localStorage.setItem(CAMERA_KEY, JSON.stringify(cache));
  } catch {
    // quota и т.п. — обзор просто не сохранится
  }
};
const cameraForTab = (date: string): Pick<TabData, 'cameraX' | 'cameraY' | 'zoom'> => {
  const c = loadCameraCache()[date];
  return {
    cameraX: typeof c?.x === 'number' ? c.x : 0,
    cameraY: typeof c?.y === 'number' ? c.y : 0,
    zoom: typeof c?.zoom === 'number' ? c.zoom : 1,
  };
};

// ============ ZUSTAND STORE ============
// Debounce helper для отложенного сохранения
const tileSaveTimeouts = new Map<string, NodeJS.Timeout>();

const useStore = create<AppState>((set, get) => ({
  currentUser: null,
  realtimeOnline: false,
  realtimePolling: false,
  realtimeError: null,
  realtimeEvents: 0,
  realtimeRevN: 0,
  installers: [],
  orders: [],
  brigades: [],
  groups: [],
  tabs: { [getToday()]: createEmptyTab() },
  activeTabDate: getToday(),
  enableBrigadeMerge: false, // feature-flag для тестирования слияния бригад
  
  logout: () => {
    localStorage.removeItem('authToken');
    set({ currentUser: null });
  },
  
  addInstaller: async (installer) => {
    const tempId = uuidv4();
    // Добавляем в локальное состояние сразу с временным ID
    set(state => ({
      installers: [...state.installers, { ...installer, id: tempId }]
    }));
    
    // Отправляем на сервер
    try {
      const result = await installerAPI.create(installer.name, installer.phone, installer.status);
      const serverInstaller = result.data;
      
      // Обновляем локальное состояние с серверным ID и данными
      set(state => ({
        installers: state.installers.map(i => i.id === tempId ? { ...serverInstaller } : i)
      }));
      
      return serverInstaller.id;
    } catch (err) {
      console.error('[addInstaller] Failed to save to server:', err);
      // Откатываем при ошибке
      set(state => ({
        installers: state.installers.filter(i => i.id !== tempId)
      }));
      throw err;
    }
  },
  
  updateInstaller: async (id, updates) => {
    const prev = get().installers.find(i => i.id === id);
    // Оптимистичное обновление
    set(state => ({
      installers: state.installers.map(i => i.id === id ? { ...i, ...updates } : i)
    }));
    
    // Сохранение на сервер
    try {
      await installerAPI.update(id, updates);
    } catch (err) {
      console.error('[updateInstaller] Failed to save to server:', err);
      if (prev) {
        set(state => ({
          installers: state.installers.map(i => i.id === id ? prev : i)
        }));
      }
      throw err;
    }
  },
  
  deleteInstaller: async (id) => {
    const found = get().installers.findIndex(i => i.id === id);
    const prev = found >= 0 ? get().installers[found] : null;
    // Удаляем из локального состояния
    set(state => ({
      installers: state.installers.filter(i => i.id !== id)
    }));
    
    // Удаляем с сервера
    try {
      await installerAPI.delete(id);
    } catch (err) {
      console.error('Failed to delete installer from server:', err);
      if (prev) {
        set(state => {
          const installers = [...state.installers];
          installers.splice(Math.min(found, installers.length), 0, prev);
          return { installers };
        });
      }
      throw err;
    }
  },
  
  addOrder: async (order) => {
    const tempId = uuidv4();
    // Добавляем в локальное состояние сразу с временным ID
    set(state => ({
      orders: [...state.orders, { ...order, id: tempId, status: order.status || 'new', shift: order.shift || 'day', workDone: order.workDone || '' }]
    }));
    
    // Отправляем на сервер
    try {
      const result = await orderAPI.create(order.number, order.address, order.description, order.deadline, order.status, order.shift, order.workDone);
      const serverOrder = result.data;
      
      // Обновляем локальное состояние с серверным ID и данными
      set(state => ({
        orders: state.orders.map(o => o.id === tempId ? { ...serverOrder } : o)
      }));
      
      return serverOrder.id;
    } catch (err) {
      console.error('[addOrder] Failed to save to server:', err);
      // Откатываем при ошибке
      set(state => ({
        orders: state.orders.filter(o => o.id !== tempId)
      }));
      throw err;
    }
  },
  
  updateOrder: async (id, updates) => {
    const prev = get().orders.find(o => o.id === id);
    // Оптимистичное обновление
    set(state => ({
      orders: state.orders.map(o => o.id === id ? { ...o, ...updates } : o)
    }));
    
    // Сохранение на сервер
    try {
      await orderAPI.update(id, updates);
    } catch (err) {
      console.error('[updateOrder] Failed to save to server:', err);
      if (prev) {
        set(state => ({
          orders: state.orders.map(o => o.id === id ? prev : o)
        }));
      }
      throw err;
    }
  },
  
  deleteOrder: async (id) => {
    const found = get().orders.findIndex(o => o.id === id);
    const prev = found >= 0 ? get().orders[found] : null;
    // Оптимистичное удаление
    set(state => ({
      orders: state.orders.filter(o => o.id !== id)
    }));
    
    // Удаление на сервере
    try {
      await orderAPI.delete(id);
    } catch (err) {
      console.error('[deleteOrder] Failed to delete from server:', err);
      if (prev) {
        set(state => {
          const orders = [...state.orders];
          orders.splice(Math.min(found, orders.length), 0, prev);
          return { orders };
        });
      }
      throw err;
    }
  },
  
  addBrigade: async (brigade) => {
    const tempId = uuidv4();
    // Добавляем в локальное состояние сразу с временным ID
    set(state => ({
      brigades: [...state.brigades, { ...brigade, id: tempId }]
    }));
    
    // Отправляем на сервер
    try {
      const result = await brigadeAPI.create(brigade.name, brigade.color, brigade.members);
      const serverBrigade = result.data;
      
      // Обновляем локальное состояние с серверным ID и данными
      set(state => ({
        brigades: state.brigades.map(b => b.id === tempId ? { ...serverBrigade } : b)
      }));
      
      return serverBrigade.id;
    } catch (err) {
      console.error('[addBrigade] Failed to save to server:', err);
      // Откатываем при ошибке
      set(state => ({
        brigades: state.brigades.filter(b => b.id !== tempId)
      }));
      throw err;
    }
  },
  
  updateBrigade: async (id, updates) => {
    const prev = get().brigades.find(b => b.id === id);
    set(state => ({
      brigades: state.brigades.map(b => b.id === id ? { ...b, ...updates } : b)
    }));
    try {
      await brigadeAPI.update(id, updates);
    } catch (err) {
      console.error('[updateBrigade] Failed to save to server:', err);
      if (prev) {
        set(state => ({
          brigades: state.brigades.map(b => b.id === id ? prev : b)
        }));
      }
      throw err;
    }
  },
  
  deleteBrigade: async (id) => {
    // Удаляем из локального состояния
    set(state => ({
      brigades: state.brigades.filter(b => b.id !== id)
    }));
    
    // Удаляем с сервера
    try {
      await brigadeAPI.delete(id);
    } catch (err) {
      console.error('Failed to delete brigade from server:', err);
    }
  },
  
  // ==================== GROUP ACTIONS ====================
  addGroup: async (group, tileIds) => {
    const tempId = uuidv4();
    const state = get();
    const tabDate = state.activeTabDate;
    
    // Добавляем в локальное состояние с временным ID
    set(state => ({
      groups: [...state.groups, { ...group, id: tempId, tabId: tabDate }]
    }));
    
    // Обновляем groupId у плиток локально
    set(state => {
      const tab = state.tabs[tabDate] || createEmptyTab();
      const updatedTiles = tab.tiles.map(t => 
        tileIds.includes(t.id) ? { ...t, groupId: tempId } : t
      );
      return {
        tabs: {
          ...state.tabs,
          [tabDate]: { ...tab, tiles: updatedTiles }
        }
      };
    });
    
    // Сохраняем на сервер
    try {
      const result = await groupAPI.create(
        tabDate,
        group.name,
        group.x,
        group.y,
        group.width,
        group.height,
        group.color,
        tileIds
      );
      const serverGroup = result.data;
      
      // Обновляем локальное состояние с серверным ID
      set(state => {
        const updatedGroups = state.groups.map(g => 
          g.id === tempId ? serverGroup : g
        );
        
        // Обновляем groupId у плиток с серверным ID
        const tab = state.tabs[tabDate] || createEmptyTab();
        const updatedTiles = tab.tiles.map(t => 
          t.groupId === tempId ? { ...t, groupId: serverGroup.id } : t
        );
        
        return {
          groups: updatedGroups,
          tabs: {
            ...state.tabs,
            [tabDate]: { ...tab, tiles: updatedTiles }
          }
        };
      });
      
      return serverGroup.id;
    } catch (err) {
      console.error('[addGroup] Failed to save to server:', err);
      // Откатываем при ошибке
      set(state => ({
        groups: state.groups.filter(g => g.id !== tempId)
      }));
      throw err;
    }
  },
  
  updateGroup: async (id, updates) => {
    // Оптимистичное обновление
    set(state => ({
      groups: state.groups.map(g => g.id === id ? { ...g, ...updates } : g)
    }));
    
    // Сохранение на сервер
    try {
      await groupAPI.update(id, updates);
    } catch (err) {
      console.error('[updateGroup] Failed to save to server:', err);
    }
  },
  
  deleteGroup: async (id) => {
    const state = get();
    const tabDate = state.activeTabDate;
    
    // Удаляем из локального состояния
    set(state => ({
      groups: state.groups.filter(g => g.id !== id)
    }));
    
    // Открепляем плитки от группы
    set(state => {
      const tab = state.tabs[tabDate] || createEmptyTab();
      const updatedTiles = tab.tiles.map(t => 
        t.groupId === id ? { ...t, groupId: undefined } : t
      );
      return {
        tabs: {
          ...state.tabs,
          [tabDate]: { ...tab, tiles: updatedTiles }
        }
      };
    });
    
    // Удаляем с сервера
    try {
      await groupAPI.delete(id);
    } catch (err) {
      console.error('Failed to delete group from server:', err);
    }
  },
  
  moveGroup: async (id, deltaX, deltaY) => {
    const state = get();
    const tabDate = state.activeTabDate;
    const group = state.groups.find(g => g.id === id);
    
    if (!group) return;
    
    // Обновляем позицию группы
    const newX = group.x + deltaX;
    const newY = group.y + deltaY;
    
    set(state => ({
      groups: state.groups.map(g => 
        g.id === id ? { ...g, x: newX, y: newY } : g
      )
    }));
    
    // Обновляем позиции всех плиток в группе
    const tab = state.tabs[tabDate] || createEmptyTab();
    const tilesInGroup = tab.tiles.filter(t => t.groupId === id);
    
    for (const tile of tilesInGroup) {
      await get().updateTilePosition(tile.id, tile.x + deltaX, tile.y + deltaY);
    }
    
    // Сохраняем позицию группы на сервер
    try {
      await groupAPI.update(id, { x: newX, y: newY });
    } catch (err) {
      console.error('[moveGroup] Failed to save to server:', err);
    }
  },
  
  addTileToGroup: async (groupId, tileId) => {
    const state = get();
    const tabDate = state.activeTabDate;
    
    // Обновляем локально
    set(state => {
      const tab = state.tabs[tabDate] || createEmptyTab();
      const updatedTiles = tab.tiles.map(t => 
        t.id === tileId ? { ...t, groupId } : t
      );
      return {
        tabs: {
          ...state.tabs,
          [tabDate]: { ...tab, tiles: updatedTiles }
        }
      };
    });
    
    // Сохраняем на сервер
    try {
      await groupAPI.addTile(groupId, tileId);
      // Пересчитываем границы группы
      await get().recalculateGroupBounds(groupId);
    } catch (err) {
      console.error('[addTileToGroup] Failed:', err);
      // Откатываем
      set(state => {
        const tab = state.tabs[tabDate] || createEmptyTab();
        const updatedTiles = tab.tiles.map(t => 
          t.id === tileId ? { ...t, groupId: undefined } : t
        );
        return {
          tabs: {
            ...state.tabs,
            [tabDate]: { ...tab, tiles: updatedTiles }
          }
        };
      });
    }
  },
  
  removeTileFromGroup: async (tileId) => {
    const state = get();
    const tabDate = state.activeTabDate;
    const tab = state.tabs[tabDate] || createEmptyTab();
    const tile = tab.tiles.find(t => t.id === tileId);
    
    if (!tile || !tile.groupId) return;
    
    const groupId = tile.groupId;
    
    // Обновляем локально
    set(state => {
      const tab = state.tabs[tabDate] || createEmptyTab();
      const updatedTiles = tab.tiles.map(t => 
        t.id === tileId ? { ...t, groupId: undefined } : t
      );
      return {
        tabs: {
          ...state.tabs,
          [tabDate]: { ...tab, tiles: updatedTiles }
        }
      };
    });
    
    // Сохраняем на сервер
    try {
      await groupAPI.removeTile(groupId, tileId);
      // Пересчитываем границы группы
      await get().recalculateGroupBounds(groupId);
    } catch (err) {
      console.error('[removeTileFromGroup] Failed:', err);
      // Откатываем
      set(state => {
        const tab = state.tabs[tabDate] || createEmptyTab();
        const updatedTiles = tab.tiles.map(t => 
          t.id === tileId ? { ...t, groupId } : t
        );
        return {
          tabs: {
            ...state.tabs,
            [tabDate]: { ...tab, tiles: updatedTiles }
          }
        };
      });
    }
  },
  
  recalculateGroupBounds: async (groupId) => {
    const state = get();
    const tabDate = state.activeTabDate;
    const tab = state.tabs[tabDate] || createEmptyTab();
    const tilesInGroup = tab.tiles.filter(t => t.groupId === groupId);
    
    if (tilesInGroup.length === 0) {
      // Если в группе нет плиток, удаляем группу
      await get().deleteGroup(groupId);
      return;
    }
    
    // Вычисляем новые границы
    const padding = 40;
    const headerHeight = 40;
    const tileHeight = 160;
    
    const minX = Math.min(...tilesInGroup.map(t => t.x));
    const maxX = Math.max(...tilesInGroup.map(t => t.x));
    const minY = Math.min(...tilesInGroup.map(t => t.y));
    const maxY = Math.max(...tilesInGroup.map(t => t.y));
    
    const newBounds = {
      x: minX - padding,
      y: minY - headerHeight - padding,
      width: (maxX - minX) + 200 + padding * 2,
      height: (maxY - minY) + tileHeight + headerHeight + padding * 2
    };
    
    // Обновляем границы группы
    await get().updateGroup(groupId, newBounds);
  },
  
  addTile: async (tile) => {
    const id = uuidv4();
    const state = get();
    const tabDate = state.activeTabDate;
    
    // Гарантируем, что таб существует на сервере
    try {
      await canvasAPI.createTab(tabDate);
    } catch (e) {
      // Ignore if tab already exists
    }
    
    // Сохраняем в store
    set(state => {
      const tab = state.tabs[tabDate] || createEmptyTab();
      const newTiles = [...tab.tiles, { ...tile, id }];
      return {
        tabs: {
          ...state.tabs,
          [tabDate]: {
            ...tab,
            tiles: newTiles
          }
        }
      };
    });
    
    // Сохраняем на сервер
    try {
      const result = await canvasAPI.createTile({ ...tile, id, tabId: tabDate });

      // Если сервер вернул другой id, синхронизируем store
      const serverTile = result?.data;
      if (serverTile && serverTile.id && serverTile.id !== id) {
        set(state => {
          const tab = state.tabs[tabDate];
          if (!tab) return state;
          return {
            tabs: {
              ...state.tabs,
              [tabDate]: {
                ...tab,
                tiles: tab.tiles.map(t => t.id === id ? { ...t, id: serverTile.id } : t)
              }
            }
          };
        });
      }
    } catch (e) {
      console.error('[addTile] Failed to save tile to server:', e);
      // Откатываем изменения при ошибке
      set(state => {
        const tab = state.tabs[tabDate];
        if (!tab) return state;
        return {
          tabs: {
            ...state.tabs,
            [tabDate]: {
              ...tab,
              tiles: tab.tiles.filter(t => t.id !== id)
            }
          }
        };
      });
    }
  },
  
  updateTilePosition: async (id, x, y) => {
    const state = get();
    const tab = state.tabs[state.activeTabDate];
    if (!tab) return;
    
    // Валидация координат
    if (!isFinite(x) || !isFinite(y) || isNaN(x) || isNaN(y)) {
      console.warn('Invalid coordinates for tile update:', { id, x, y });
      return;
    }
    
    // Обычное обновление одной плитки
    set(state => {
      const tab = state.tabs[state.activeTabDate];
      if (!tab) return state;
      return {
        tabs: {
          ...state.tabs,
          [state.activeTabDate]: {
            ...tab,
            tiles: tab.tiles.map(t => t.id === id ? { ...t, x, y } : t)
          }
        }
      };
    });
    
    // Сохраняем на сервер с задержкой (debounce)
    const existingTimeout = tileSaveTimeouts.get(id);
    if (existingTimeout) clearTimeout(existingTimeout);
    
    const newTimeout = setTimeout(async () => {
      try {
        await canvasAPI.updateTile(id, x, y);
      } catch (e) {
        console.error('Failed to update tile:', e);
      } finally {
        tileSaveTimeouts.delete(id);
      }
    }, 300);
    
    tileSaveTimeouts.set(id, newTimeout);
  },
  
  deleteTile: async (id) => {
    // Отменяем pending timeout для этой плитки
    const existingTimeout = tileSaveTimeouts.get(id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      tileSaveTimeouts.delete(id);
    }
    
    // Удаляем из store
    set(state => {
      const tab = state.tabs[state.activeTabDate];
      if (!tab) return state;
      return {
        tabs: {
          ...state.tabs,
          [state.activeTabDate]: {
            ...tab,
            tiles: tab.tiles.filter(t => t.id !== id),
            connections: tab.connections.filter(c => c.fromTileId !== id && c.toTileId !== id)
          }
        }
      };
    });
    
    // Удаляем с сервера
    try {
      await canvasAPI.deleteTile(id);
    } catch (e) {
      console.error('Failed to delete tile from server:', e);
    }
  },
  
  addConnection: async (fromTileId, toTileId) => {
    if (fromTileId === toTileId) return;
    const state = get();
    const tabDate = state.activeTabDate;
    const tab = state.tabs[tabDate];
    if (!tab) return;
    
    const exists = tab.connections.some(
      c => (c.fromTileId === fromTileId && c.toTileId === toTileId) ||
           (c.fromTileId === toTileId && c.toTileId === fromTileId)
    );
    if (exists) return;
    
    const id = uuidv4();
    // Сохраняем в store
    set(state => {
      const tab = state.tabs[tabDate];
      if (!tab) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabDate]: {
            ...tab,
            connections: [...tab.connections, { id, fromTileId, toTileId }]
          }
        }
      };
    });
    
    // Сохраняем на сервер
    try {
      const res = await canvasAPI.createConnection({ id, fromTileId, toTileId, tabId: tabDate });
      // Если сервер сгенерировал свой id, синхронизируем
      const serverId = res?.data?.id;
      if (serverId && serverId !== id) {
        set(state => {
          const tab = state.tabs[tabDate];
          if (!tab) return state;
          return {
            tabs: {
              ...state.tabs,
              [tabDate]: {
                ...tab,
                connections: tab.connections.map(c => c.id === id ? { ...c, id: serverId } : c)
              }
            }
          };
        });
      }
    } catch (e) {
      console.error('Failed to save connection to server:', e);
    }
  },
  
  deleteConnection: async (id) => {
    const tab = get().tabs[get().activeTabDate];
    const prev = tab?.connections.find(c => c.id === id) || null;
    // Удаляем из store
    set(state => {
      const tab = state.tabs[state.activeTabDate];
      if (!tab) return state;
      return {
        tabs: {
          ...state.tabs,
          [state.activeTabDate]: {
            ...tab,
            connections: tab.connections.filter(c => c.id !== id)
          }
        }
      };
    });
    
    // Удаляем с сервера
    try {
      await canvasAPI.deleteConnection(id);
    } catch (e) {
      console.error('Failed to delete connection from server:', e);
      if (prev) {
        set(state => {
          const tab = state.tabs[state.activeTabDate];
          if (!tab) return state;
          if (tab.connections.some(c => c.id === id)) return state;
          return {
            tabs: {
              ...state.tabs,
              [state.activeTabDate]: {
                ...tab,
                connections: [...tab.connections, prev]
              }
            }
          };
        });
      }
      throw e;
    }
  },
  
  setActiveTab: (date) => {
    set(state => {
      if (state.tabs[date]) return { activeTabDate: date };
      // Новая вкладка локально — обзор берём из личного кэша
      return {
        activeTabDate: date,
        tabs: { ...state.tabs, [date]: { ...createEmptyTab(), ...cameraForTab(date) } }
      };
    });
  },
  
  deleteTab: async (date) => {
    const state = get();
    
    // Нельзя удалить сегодняшний день
    if (date === getToday()) {
      return;
    }
    
    // Если удаляем активный таб, переключаемся на сегодня
    if (state.activeTabDate === date) {
      set({ activeTabDate: getToday() });
    }
    
    // Удаляем из store
    const newTabs = { ...state.tabs };
    delete newTabs[date];
    set({ tabs: newTabs });
    
    // Удаляем с сервера все плитки и соединения этого таба + tab_state
    try {
      const tab = state.tabs[date];
      if (tab) {
        // Удаляем все плитки (это автоматически удалит связанные соединения благодаря CASCADE)
        await Promise.all(tab.tiles.map(tile => canvasAPI.deleteTile(tile.id)));
      }
      // Удаляем tab_state
      await canvasAPI.deleteTab(date);
    } catch (e) {
      console.error('Failed to delete tab from server:', e);
    }
  },
  
  updateCamera: (x, y, zoom) => {
    const tabDate = get().activeTabDate;

    // Обновляем в store мгновенно и кладём в локальный кэш —
    // на сервер обзор не отправляем: он личный у каждого зрителя
    set(state => {
      const tab = state.tabs[tabDate];
      if (!tab) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabDate]: { ...tab, cameraX: x, cameraY: y, zoom }
        }
      };
    });
    saveCameraCache(tabDate, x, y, zoom);
  },
  
  loadState: async () => {
    try {
      // Загружаем данные с сервера
      const [installersRes, ordersRes, brigadesRes, tabsRes] = await Promise.all([
        installerAPI.getAll().catch(() => ({ installers: [] })),
        orderAPI.getAll().catch(() => ({ orders: [] })),
        brigadeAPI.getAll().catch(() => ({ brigades: [] })),
        canvasAPI.getTabsData().catch(() => ({ data: [] }))
      ]);

      const tabs: Record<string, any> = {};
      const serverTabs = tabsRes.data || tabsRes.tabs || [];
      const allGroups: Group[] = [];
      
      const loadTab = async (date: string) => {
        const [tilesRes, connsRes, groupsRes] = await Promise.all([
          canvasAPI.getTiles(date).catch(() => ({ data: [] })),
          canvasAPI.getConnections(date).catch(() => ({ data: [] })),
          groupAPI.getAll(date).catch(() => ({ data: [] }))
        ]);
        tabs[date] = {
          tiles: tilesRes.data || tilesRes.tiles || [],
          connections: connsRes.data || connsRes.connections || [],
          ...cameraForTab(date),
        };
        // Собираем группы из всех табов
        const groups = groupsRes.data || groupsRes.groups || [];
        allGroups.push(...groups);
      };

      if (serverTabs.length > 0) {
        for (const tab of serverTabs) {
          await loadTab(tab.date);
        }
      } else {
        // Нет tab_states, пробуем восстановить все плитки и связи без таба
        const [allTilesRes, allConnsRes] = await Promise.all([
          canvasAPI.getTiles().catch(() => ({ data: [] })),
          canvasAPI.getConnections().catch(() => ({ data: [] }))
        ]);

        const allTiles = allTilesRes.data || allTilesRes.tiles || [];
        const allConns = allConnsRes.data || allConnsRes.connections || [];

        if (allTiles.length > 0) {
          // Группируем по tabId
          for (const tile of allTiles) {
            if (!tabs[tile.tabId]) {
              tabs[tile.tabId] = createEmptyTab();
            }
            tabs[tile.tabId].tiles.push(tile);
          }
          for (const conn of allConns) {
            if (!tabs[conn.tabId]) {
              tabs[conn.tabId] = createEmptyTab();
            }
            tabs[conn.tabId].connections.push(conn);
          }
        } else {
          // Совсем пусто — создаём таб сегодня и пишем его на сервер
          const today = getToday();
          try {
            await canvasAPI.createTab(today);
          } catch (e) {
            // Ignore if exists
          }
          await loadTab(today);
        }
      }

      const finalTabs = Object.keys(tabs).length > 0 ? tabs : { [getToday()]: createEmptyTab() };
      // Обзор — личный: поверх любых данных кладём кэш из localStorage
      for (const d of Object.keys(finalTabs)) {
        finalTabs[d] = { ...finalTabs[d], ...cameraForTab(d) };
      }
      
      const installers = installersRes.data?.installers || installersRes.data || installersRes.installers || [];
      const rawOrders = ordersRes.data?.orders || ordersRes.data || ordersRes.orders || [];
      // Нормализация: старые записи без смены считаем дневными
      const orders = (Array.isArray(rawOrders) ? rawOrders : []).map((o: any) => ({
        ...o,
        shift: o.shift === 'evening' ? 'evening' : 'day',
        workDone: o.workDone || '',
      }));
      const brigades = brigadesRes.data?.brigades || brigadesRes.data || brigadesRes.brigades || [];
      
      set({
        installers,
        orders,
        brigades,
        groups: allGroups,
        tabs: finalTabs,
        activeTabDate: Object.keys(tabs)[0] || getToday(),
      });
    } catch (e) {
      console.error('[loadState] Failed to load state:', e);
      // Не затираем существующие данные при ошибке сети —
      // только гарантируем наличие вкладки "сегодня"
      const today = getToday();
      set(state => ({
        tabs: state.tabs[today] ? state.tabs : { ...state.tabs, [today]: createEmptyTab() },
        activeTabDate: state.tabs[state.activeTabDate] ? state.activeTabDate : today,
      }));
    }
  },
  
  toggleBrigadeMerge: () => {
    set(state => ({ enableBrigadeMerge: !state.enableBrigadeMerge }));
  },
}));

// ============ REALTIME (SSE) ============
// Сервер шлёт события мутаций (плитки/связи/наряды), клиент применяет их
// точечно в стор без полного loadState. Камеру не транслируем —
// каждый смотрит своим обзором.
interface RemoteEvent {
  rev: number;
  epoch?: string;
  type?: string;
  entity?: 'tile' | 'connection' | 'order' | 'installer' | 'brigade' | 'group';
  action?: 'created' | 'updated' | 'deleted';
  tabId?: string;
  id?: string;
  data?: any;
}

let realtimeRev = 0;
let realtimeEpoch = '';
let realtimeSource: EventSource | null = null;
let realtimeTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeWatchdog: ReturnType<typeof setInterval> | null = null;
let lastRealtimeMsg = 0;

// Отметка входящего сообщения стрима: доказательство живого течения данных.
// Если стрим "подключён", но сообщения не текут — он мёртв, уходим на long-poll.
const noteRealtimeMessage = () => {
  lastRealtimeMsg = Date.now();
  const st = useStore.getState();
  useStore.setState({ realtimeEvents: st.realtimeEvents + 1 });
};

// Подтянуть целиком вкладку, созданную другим клиентом (редкий случай)
const refreshRemoteTab = async (tabId: string) => {
  try {
    const [tilesRes, connsRes, groupsRes] = await Promise.all([
      canvasAPI.getTiles(tabId).catch(() => ({ data: [] })),
      canvasAPI.getConnections(tabId).catch(() => ({ data: [] })),
      groupAPI.getAll(tabId).catch(() => ({ data: [] })),
    ]);
    const tiles = (tilesRes as any).data || [];
    const connections = (connsRes as any).data || [];
    const groups = (groupsRes as any).data || [];
    useStore.setState(state => ({
      tabs: {
        ...state.tabs,
        [tabId]: {
          tiles,
          connections,
          cameraX: 0,
          cameraY: 0,
          zoom: 1,
        },
      },
      groups: [...state.groups.filter(g => g.tabId !== tabId), ...groups],
    }));
  } catch (e) {
    console.error('[realtime] Failed to fetch remote tab:', e);
  }
};

const applyRemoteEvent = (evt: RemoteEvent) => {
  if (typeof evt.rev !== 'number' || evt.rev <= realtimeRev) return; // дубликат или эхо
  realtimeRev = evt.rev;
  useStore.setState({ realtimeRevN: evt.rev });
  if (!evt.entity) return;

  if ((evt.entity === 'tile' || evt.entity === 'connection') && evt.tabId) {
    const tabId = evt.tabId;
    const st = useStore.getState();
    if (!st.tabs[tabId]) {
      void refreshRemoteTab(tabId);
      return;
    }
    if (evt.action === 'deleted' && evt.id) {
      const id = evt.id;
      useStore.setState(state => {
        const tab = state.tabs[tabId];
        if (!tab) return state;
        if (evt.entity === 'tile') {
          return {
            tabs: {
              ...state.tabs,
              [tabId]: {
                ...tab,
                tiles: tab.tiles.filter(t => t.id !== id),
                connections: tab.connections.filter(c => c.fromTileId !== id && c.toTileId !== id),
              },
            },
          };
        }
        return {
          tabs: {
            ...state.tabs,
            [tabId]: { ...tab, connections: tab.connections.filter(c => c.id !== id) },
          },
        };
      });
    } else if (evt.data) {
      const incoming = evt.data;
      useStore.setState(state => {
        const tab = state.tabs[tabId];
        if (!tab) return state;
        if (evt.entity === 'tile') {
          const exists = tab.tiles.some(t => t.id === incoming.id);
          return {
            tabs: {
              ...state.tabs,
              [tabId]: {
                ...tab,
                tiles: exists
                  ? tab.tiles.map(t => (t.id === incoming.id ? { ...t, ...incoming } : t))
                  : [...tab.tiles, incoming],
              },
            },
          };
        }
        const exists = tab.connections.some(c => c.id === incoming.id);
        return {
          tabs: {
            ...state.tabs,
            [tabId]: {
              ...tab,
              connections: exists
                ? tab.connections.map(c => (c.id === incoming.id ? { ...c, ...incoming } : c))
                : [...tab.connections, incoming],
            },
          },
        };
      });
    }
  } else if (evt.entity === 'order') {
    if (evt.action === 'deleted' && evt.id) {
      const id = evt.id;
      useStore.setState(state => ({ orders: state.orders.filter(o => o.id !== id) }));
    } else if (evt.data) {
      const incoming = {
        ...evt.data,
        shift: evt.data.shift === 'evening' ? 'evening' : 'day',
        workDone: evt.data.workDone || '',
      };
      useStore.setState(state => ({
        orders: state.orders.some(o => o.id === incoming.id)
          ? state.orders.map(o => (o.id === incoming.id ? { ...o, ...incoming } : o))
          : [...state.orders, incoming],
      }));
    }
  } else if (evt.entity === 'installer') {
    if (evt.action === 'deleted' && evt.id) {
      const id = evt.id;
      useStore.setState(state => ({ installers: state.installers.filter(i => i.id !== id) }));
    } else if (evt.data) {
      const incoming = evt.data;
      useStore.setState(state => ({
        installers: state.installers.some(i => i.id === incoming.id)
          ? state.installers.map(i => (i.id === incoming.id ? { ...i, ...incoming } : i))
          : [...state.installers, incoming],
      }));
    }
  } else if (evt.entity === 'brigade') {
    if (evt.action === 'deleted' && evt.id) {
      const id = evt.id;
      useStore.setState(state => ({ brigades: state.brigades.filter(b => b.id !== id) }));
    } else if (evt.data) {
      const incoming = {
        ...evt.data,
        members: Array.isArray(evt.data.members)
          ? evt.data.members
          : (evt.data.memberDetails || []).map((m: any) => m.id),
      };
      useStore.setState(state => ({
        brigades: state.brigades.some(b => b.id === incoming.id)
          ? state.brigades.map(b => (b.id === incoming.id ? { ...b, ...incoming } : b))
          : [...state.brigades, incoming],
      }));
    }
  } else if (evt.entity === 'group') {
    // Группа тянет за собой привязки плиток — перечитываем вкладку целиком
    const tabId = evt.tabId;
    if (!tabId) return;
    const st = useStore.getState();
    if (!st.tabs[tabId]) return;
    void refreshRemoteTab(tabId);
  }
};

const startRealtime = () => {
  stopRealtime();
  const token = localStorage.getItem('authToken');
  if (!token) {
    useStore.setState({ realtimeError: 'нет токена — войдите заново' });
    return;
  }
  if (typeof EventSource === 'undefined') {
    startFallback('нет EventSource в браузере, включён опрос');
    return;
  }
  // getApiUrl() может вернуть относительный /api (туннель) — EventSource так умеет
  const es = new EventSource(`${getApiUrl()}/stream?token=${encodeURIComponent(token)}`);
  realtimeSource = es;
  // Если стрим не поднялся за 10с (висит в подключении) — включаем опрос,
  // стрим при этом продолжает пытаться подключиться
  if (realtimeTimer) clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(() => {
    realtimeTimer = null;
    startFallback('стрим не отвечает 10с, включён опрос');
  }, 10000);
  es.onmessage = e => {
    try {
      const evt = JSON.parse(e.data) as RemoteEvent;
      noteRealtimeMessage();
      if (evt.type === 'ping') return; // сторожевой сигнал, не событие
      if (evt.type === 'ready') {
        if (realtimeEpoch && evt.epoch && evt.epoch !== realtimeEpoch) {
          // Сервер перезапускался — буфер потерян, синхронизируемся полностью
          realtimeEpoch = evt.epoch;
          realtimeRev = evt.rev || 0;
          void useStore.getState().loadState();
          return;
        }
        if (evt.epoch) realtimeEpoch = evt.epoch;
        if (typeof evt.rev === 'number' && evt.rev > realtimeRev) realtimeRev = evt.rev;
        return;
      }
      applyRemoteEvent(evt);
    } catch (err) {
      console.error('[realtime] Bad event:', err);
    }
  };
  es.onopen = () => {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer);
      realtimeTimer = null;
    }
    stopFallback();
    lastRealtimeMsg = Date.now();
    useStore.setState({ realtimeOnline: true, realtimeError: null });
    // Сторож: стрим может быть "подключён", но тело не течёт
    // (буферизация на туннеле/прокси). Пинг идёт каждые 25с —
    // тишина дольше 45с означает мёртвый стрим.
    if (realtimeWatchdog) clearInterval(realtimeWatchdog);
    realtimeWatchdog = setInterval(() => {
      if (Date.now() - lastRealtimeMsg > 45000) {
        if (realtimeWatchdog) {
          clearInterval(realtimeWatchdog);
          realtimeWatchdog = null;
        }
        realtimeSource?.close();
        realtimeSource = null;
        useStore.setState({ realtimeOnline: false });
        startFallback('стрим молчит 45с, включён long-poll');
      }
    }, 10000);
  };
  es.onerror = () => {
    useStore.setState({ realtimeOnline: false });
    startFallback('стрим оборван, включён опрос');
    // Самодиагностика: жива ли API вообще (отдельно от стрима)
    void (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${getApiUrl()}/health`, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(timer);
        if (!r.ok) {
          useStore.setState({ realtimeError: `api status ${r.status}` });
        }
      } catch (err: any) {
        useStore.setState({
          realtimeError: err?.name === 'AbortError' ? 'api timeout 8s' : `api: ${err?.message || err}`,
        });
      }
    })();
  };
};

const stopRealtime = () => {
  if (realtimeTimer) {
    clearTimeout(realtimeTimer);
    realtimeTimer = null;
  }
  if (realtimeWatchdog) {
    clearInterval(realtimeWatchdog);
    realtimeWatchdog = null;
  }
  stopFallback();
  realtimeSource?.close();
  realtimeSource = null;
  useStore.setState({ realtimeOnline: false });
};

// Запасной режим: long-poll /poll (висит до события, макс. 20с).
// В отличие от бесконечного SSE, отвечает конечным JSON —
// такие ответы не режут туннели и прокси с буферизацией.
let realtimePollActive = false;

const pollLoop = async () => {
  if (!realtimePollActive) return;
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      stopFallback();
      return;
    }
    const res = await fetch(`${getApiUrl()}/poll?since=${realtimeRev}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const body = await res.json();
      if (body.epoch && realtimeEpoch && body.epoch !== realtimeEpoch) {
        realtimeEpoch = body.epoch;
        realtimeRev = body.rev || 0;
        await useStore.getState().loadState();
      } else {
        for (const evt of body.events || []) applyRemoteEvent(evt as RemoteEvent);
      }
    }
  } catch {
    // Сеть легла — пауза перед повтором, чтобы не hammer'ить
    await new Promise(r => setTimeout(r, 2000));
  }
  if (realtimePollActive) void pollLoop();
};

const startFallback = (reason: string) => {
  useStore.setState({ realtimePolling: true, realtimeError: reason });
  if (realtimePollActive) return;
  realtimePollActive = true;
  void pollLoop();
};

const stopFallback = () => {
  realtimePollActive = false;
  useStore.setState({ realtimePolling: false });
};

// Догоняющая синхронизация при возврате на вкладку/появлении сети
const catchUpRealtime = async () => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/sync?since=${realtimeRev}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const body = await res.json();
    if (body.epoch && realtimeEpoch && body.epoch !== realtimeEpoch) {
      realtimeEpoch = body.epoch;
      realtimeRev = body.rev || 0;
      await useStore.getState().loadState();
      return;
    }
    for (const evt of body.events || []) applyRemoteEvent(evt as RemoteEvent);
  } catch (e) {
    console.error('[realtime] catch-up failed:', e);
  }
};

// ============ LOGIN PAGE ============
const LoginPage: React.FC = () => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const data = await authAPI.login(login, password);
      // API вернул успешный ответ с данными пользователя
      if (data.success && data.userId) {
        // Проверка на предупреждение о дефолтном пароле
        if (data.warning) {
          setError('⚠️ ВНИМАНИЕ: Используется стандартный пароль! Немедленно смените его в настройках.');
        }
        
        // Создаём объект пользователя для Zustand store
        const user = {
          id: data.userId,
          login: data.login,
          role: data.role
        };
        // Сохраняем токен в localStorage
        if (data.token) {
          localStorage.setItem('authToken', data.token);
        }
        // Устанавливаем текущего пользователя напрямую
        useStore.setState({ currentUser: user });
        
        // Если нет предупреждения, очищаем ошибку
        if (!data.warning) {
          setError('');
        }
      } else {
        setError('Неверный логин или пароль');
      }
    } catch (err: any) {
      // Правильная обработка ошибки
      if (typeof err === 'string') {
        setError(err);
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError('Неверный логин или пароль');
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 canvas-grid opacity-30" />
      <div className="relative z-10 w-full max-w-md">
        <div className="glass-effect rounded-2xl border border-border p-8 animate-fade-in">
          <div className="flex items-center justify-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
              <WrenchScrewdriverIcon className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">Электронный Город</h1>
          <p className="text-muted-foreground text-center mb-8">Планирование монтажей</p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Логин</label>
              <input
                type="text"
                value={login}
                onChange={e => setLogin(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-input border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                placeholder="Введите логин"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-input border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                placeholder="Введите пароль"
              />
            </div>
            {error && (
              <p className="text-destructive text-sm text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
          
          <p className="text-xs text-muted-foreground text-center mt-6">
            © 2026 Электронный Город. Все права защищены.
          </p>
        </div>
      </div>
    </div>
  );
};

// ============ ADMIN PANEL ============
const AdminPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser } = useStore();
  const [users, setUsers] = useState<any[]>([]);
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');
  
  useEffect(() => {
    loadUsers();
  }, []);
  
  const loadUsers = async () => {
    try {
      const serverUsers = await authAPI.getUsers();
      setUsers(serverUsers);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки пользователей');
    } finally {
      setLoadingUsers(false);
    }
  };
  
  const handleAdd = async () => {
    if (!newLogin || !newPassword) return;
    if (users.some(u => u.login === newLogin)) {
      setError('Пользователь с таким логином уже существует');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      await authAPI.register(newLogin, newPassword, role);
      await loadUsers();
      setNewLogin('');
      setNewPassword('');
      setRole('user');
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDelete = async (id: string) => {
    try {
      await authAPI.deleteUser(id);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления');
    }
  };

  const handleToggleRole = async (id: string, currentRole: string) => {
    try {
      setError('');
      let newRole: string;
      if (currentRole === 'user') {
        newRole = 'manager';
      } else if (currentRole === 'manager') {
        newRole = 'admin';
      } else {
        newRole = 'user';
      }
      await authAPI.updateUserRole(id, newRole);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Ошибка изменения роли');
    }
  };

  const handleChangePassword = async (id: string) => {
    if (!editPassword || editPassword.length < 3) {
      setError('Пароль должен быть минимум 3 символа');
      return;
    }
    try {
      setError('');
      await authAPI.updateUserPassword(id, editPassword);
      setEditingUserId(null);
      setEditPassword('');
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Ошибка изменения пароля');
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Cog6ToothIcon className="w-5 h-5" />
            {currentUser?.role === 'admin' ? 'Управление пользователями' : 'Просмотр пользователей'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-4 max-h-96 overflow-y-auto scrollbar-thin">
          {loadingUsers ? (
            <p className="text-center text-muted-foreground py-8">Загрузка...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Нет пользователей</p>
          ) : (
            users.map(user => (
              <div key={user.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${user.role === 'admin' ? 'bg-warning/20' : user.role === 'manager' ? 'bg-blue-500/20' : 'bg-primary/20'}`}>
                      <UserIcon className={`w-4 h-4 ${user.role === 'admin' ? 'text-warning' : user.role === 'manager' ? 'text-blue-500' : 'text-primary'}`} />
                    </div>
                    <div>
                      <p className="font-medium font-mono">{user.login}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.role === 'admin' ? 'Администратор' : user.role === 'manager' ? 'Менеджер' : 'Пользователь'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.id !== currentUser?.id && currentUser?.role === 'admin' && (
                      <button
                        onClick={() => handleToggleRole(user.id, user.role)}
                        className="p-2 text-warning hover:bg-warning/10 rounded-lg transition-colors"
                        title={
                          user.role === 'user' ? 'Сделать менеджером' :
                          user.role === 'manager' ? 'Сделать администратором' :
                          'Сделать пользователем'
                        }
                      >
                        <ShieldCheckIcon className="w-4 h-4" />
                      </button>
                    )}
                    {currentUser?.role === 'admin' && (
                      <button
                        onClick={() => {
                          if (editingUserId === user.id) {
                            setEditingUserId(null);
                            setEditPassword('');
                          } else {
                            setEditingUserId(user.id);
                            setEditPassword('');
                          }
                        }}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Сменить пароль"
                      >
                        <KeyIcon className="w-4 h-4" />
                      </button>
                    )}
                    {user.id !== currentUser?.id && currentUser?.role === 'admin' && (
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Удалить"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {editingUserId === user.id && (
                  <div className="flex gap-2 pl-11">
                    <input
                      type="password"
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      placeholder="Новый пароль"
                      className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
                    />
                    <button
                      onClick={() => handleChangePassword(user.id)}
                      className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => {
                        setEditingUserId(null);
                        setEditPassword('');
                      }}
                      className="px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        
        {currentUser?.role === 'admin' && (
          <div className="p-4 border-t border-border space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={newLogin}
                onChange={e => setNewLogin(e.target.value)}
                placeholder="Логин"
                className="px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
              />
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Пароль"
                className="px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
                >
                  <option value="user">Пользователь</option>
                  <option value="manager">Менеджер</option>
                  <option value="admin">Администратор</option>
                </select>
                Роль
              </label>
              <button
                onClick={handleAdd}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserPlusIcon className="w-4 h-4" />
                {loading ? 'Создание...' : 'Добавить'}
              </button>
            </div>
            {error && (
              <p className="text-destructive text-sm">{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============ PERSONNEL MODAL ============
const PersonnelModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { installers, updateInstaller, addInstaller, deleteInstaller, currentUser } = useStore();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editingInstaller, setEditingInstaller] = useState<Installer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  
  const filtered = installers.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.phone.includes(search)
  );
  
  const handleAdd = async () => {
    if (!newName && !newPhone) {
      alert('Укажите хотя бы имя или телефон');
      return;
    }
    try {
      await addInstaller({ name: newName || 'Не указано', phone: newPhone, status: 'free' });
      setNewName('');
      setNewPhone('');
      setShowAdd(false);
    } catch (err) {
      alert('Ошибка при создании');
    }
  };
  
  const handleEdit = (installer: Installer) => {
    setEditingInstaller(installer);
    setEditName(installer.name);
    setEditPhone(installer.phone);
    setShowAdd(false);
  };
  
  const handleSaveEdit = async () => {
    if (!editingInstaller) return;
    if (!editName && !editPhone) {
      alert('Укажите хотя бы имя или телефон');
      return;
    }
    try {
      await updateInstaller(editingInstaller.id, {
        name: editName || 'Не указано',
        phone: editPhone
      });
      setEditingInstaller(null);
      setEditName('');
      setEditPhone('');
    } catch (err) {
      alert('Ошибка при обновлении');
    }
  };
  
  const handleCancelEdit = () => {
    setEditingInstaller(null);
    setEditName('');
    setEditPhone('');
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserGroupIcon className="w-5 h-5" />
            Монтажники ({installers.length})
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">F2</span>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="p-4 border-b border-border flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по ФИО или телефону..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
            />
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            Добавить
          </button>
        </div>
        
        {showAdd && (
          <div className="p-4 border-b border-border bg-muted/30 flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="ФИО"
              className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
            />
            <input
              type="tel"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="Телефон"
              className="w-40 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg bg-success text-success-foreground text-sm font-medium hover:bg-success/90 transition-colors"
            >
              Сохранить
            </button>
          </div>
        )}
        
        {editingInstaller && (
          <div className="p-4 border-b border-border bg-blue-500/10 flex gap-3">
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="ФИО"
              className="flex-1 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
            />
            <input
              type="tel"
              value={editPhone}
              onChange={e => setEditPhone(e.target.value)}
              placeholder="Телефон"
              className="w-40 px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
            />
            <button
              onClick={handleSaveEdit}
              className="px-4 py-2 rounded-lg bg-success text-success-foreground text-sm font-medium hover:bg-success/90 transition-colors"
            >
              Сохранить
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              Отмена
            </button>
          </div>
        )}
        
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Сотрудники не найдены</p>
          ) : (
            filtered.map(installer => (
              <div key={installer.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-tile-installer/20 flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-tile-installer" />
                  </div>
                  <div>
                    <p className="font-medium">{installer.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <PhoneIcon className="w-3 h-3" />
                      {installer.phone || 'Нет телефона'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(installer)}
                    className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Редактировать"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await deleteInstaller(installer.id);
                      } catch (err) {
                        console.error('Error deleting installer:', err);
                        alert('Ошибка при удалении монтажника');
                      }
                    }}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    title="Удалить монтажника"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ============ BRIGADES MODAL ============
const BrigadesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { brigades, installers, addBrigade, updateBrigade, deleteBrigade } = useStore();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingBrigade, setEditingBrigade] = useState<Brigade | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  const filtered = brigades.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );
  
  const handleAdd = async () => {
    if (!newName.trim()) {
      alert('Укажите название бригады');
      return;
    }
    if (selectedMembers.length === 0) {
      alert('Добавьте хотя бы одного монтажника');
      return;
    }
    try {
      await addBrigade({ name: newName, color: '#10b981', members: selectedMembers });
      setNewName('');
      setSelectedMembers([]);
      setShowAdd(false);
    } catch (err) {
      alert('Ошибка при создании бригады');
    }
  };
  
  const handleEdit = (brigade: Brigade) => {
    setEditingBrigade(brigade);
    setNewName(brigade.name);
    setSelectedMembers(brigade.members);
    setShowAdd(false);
  };
  
  const handleSaveEdit = async () => {
    if (!editingBrigade) return;
    if (!newName.trim()) {
      alert('Укажите название бригады');
      return;
    }
    if (selectedMembers.length === 0) {
      alert('Добавьте хотя бы одного монтажника');
      return;
    }
    try {
      await updateBrigade(editingBrigade.id, { name: newName, members: selectedMembers });
      setEditingBrigade(null);
      setNewName('');
      setSelectedMembers([]);
    } catch (err) {
      alert('Ошибка при обновлении бригады');
    }
  };
  
  const handleCancelEdit = () => {
    setEditingBrigade(null);
    setNewName('');
    setSelectedMembers([]);
  };
  
  const toggleMember = (installerId: string) => {
    setSelectedMembers(prev =>
      prev.includes(installerId)
        ? prev.filter(id => id !== installerId)
        : [...prev, installerId]
    );
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserGroupIcon className="w-5 h-5 text-green-600" />
            Бригады ({brigades.length})
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">F3</span>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="p-4 border-b border-border flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
            />
          </div>
          {!editingBrigade && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              {showAdd ? <MinusIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
              Создать
            </button>
          )}
        </div>
        
        {showAdd && !editingBrigade && (
          <div className="p-4 border-b border-border bg-muted/30 space-y-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Название бригады"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
            />
            
            <div>
              <label className="text-sm font-medium mb-2 block">Состав бригады:</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {installers.map(installer => (
                  <label
                    key={installer.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(installer.id)}
                      onChange={() => toggleMember(installer.id)}
                      className="w-4 h-4 rounded"
                    />
                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{installer.name}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <button
              onClick={handleAdd}
              className="w-full py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
            >
              Добавить бригаду
            </button>
          </div>
        )}
        
        {editingBrigade && (
          <div className="p-4 border-b border-border bg-green-600/5 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-green-600">Редактирование бригады</h3>
              <button
                onClick={handleCancelEdit}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Отмена
              </button>
            </div>
            
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Название бригады"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
            />
            
            <div>
              <label className="text-sm font-medium mb-2 block">Состав бригады:</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {installers.map(installer => (
                  <label
                    key={installer.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(installer.id)}
                      onChange={() => toggleMember(installer.id)}
                      className="w-4 h-4 rounded"
                    />
                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{installer.name}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <button
              onClick={handleSaveEdit}
              className="w-full py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
            >
              Сохранить изменения
            </button>
          </div>
        )}
        
        <div className="p-4 max-h-96 overflow-y-auto space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {search ? 'Ничего не найдено' : 'Нет бригад'}
            </p>
          ) : (
            filtered.map(brigade => (
              <div key={brigade.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center">
                    <UserGroupIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">{brigade.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {brigade.members.length} {brigade.members.length === 1 ? 'монтажник' : 'монтажников'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(brigade);
                    }}
                    className="p-2 text-green-600 hover:bg-green-600/10 rounded-lg transition-colors"
                    title="Редактировать бригаду"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await deleteBrigade(brigade.id);
                      } catch (err) {
                        console.error('Error deleting brigade:', err);
                        alert('Ошибка при удалении бригады');
                      }
                    }}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    title="Удалить бригаду"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ============ EDIT ORDER MODAL ============
const EditOrderModal: React.FC<{
  order: Order;
  onClose: () => void;
  onSave: (updates: Partial<Order>) => void;
}> = ({ order, onClose, onSave }) => {
  const { currentUser } = useStore();
  const isRestricted = currentUser?.role === 'user';
  const [number, setNumber] = useState(order.number);
  const [address, setAddress] = useState(order.address);
  const [description, setDescription] = useState(order.description);
  const [deadline, setDeadline] = useState(order.deadline);
  const [status, setStatus] = useState(order.status);
  const [shift, setShift] = useState<'day' | 'evening'>(order.shift === 'evening' ? 'evening' : 'day');
  const [workDone, setWorkDone] = useState(order.workDone || '');
  
  const handleSave = async () => {
    try {
      await onSave({ number, address, description, deadline, status, shift, workDone });
      onClose();
    } catch {
      alert('Ошибка при сохранении наряда');
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardDocumentListIcon className="w-5 h-5 text-tile-order" />
            Редактировать наряд
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-3">
          {isRestricted ? (
            <div className="p-3 rounded-lg bg-muted/50 space-y-1.5 text-sm">
              <p><span className="text-muted-foreground">Наряд: </span><span className="font-mono font-medium">{number}</span></p>
              <p><span className="text-muted-foreground">Адрес: </span><span className="font-medium">{address}</span></p>
              {description && description !== 'Не указано' && (
                <p><span className="text-muted-foreground">Описание: </span>{description}</p>
              )}
              {deadline && (
                <p><span className="text-muted-foreground">Срок: </span>{new Date(deadline).toLocaleDateString('ru-RU')}</p>
              )}
              <p><span className="text-muted-foreground">Статус: </span>{status === 'new' ? '🔴 Новый' : status === 'processing' ? '🔵 В обработке' : '🟢 Выполнен'}</p>
              <p><span className="text-muted-foreground">Смена: </span>{shift === 'evening' ? '🌙 Вечер' : '☀️ День'}</p>
            </div>
          ) : (
          <>
          <div>
            <label className="text-sm font-medium block mb-1">Номер наряда</label>
            <input
              type="text"
              value={number}
              onChange={e => setNumber(e.target.value)}
              disabled={isRestricted}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm font-mono disabled:opacity-60"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium block mb-1">Адрес</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              disabled={isRestricted}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm disabled:opacity-60"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium block mb-1">Описание</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={isRestricted}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm disabled:opacity-60"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium block mb-1">Срок выполнения</label>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              disabled={isRestricted}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm disabled:opacity-60"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium block mb-2">Статус</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={status === 'new'}
                  onChange={() => setStatus('new')}
                  className="text-red-500"
                />
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span>Новый</span>
                </span>
              </label>
              
              <label className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={status === 'processing'}
                  onChange={() => setStatus('processing')}
                  className="text-blue-500"
                />
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span>В обработке</span>
                </span>
              </label>
              
              <label className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={status === 'completed'}
                  onChange={() => setStatus('completed')}
                  className="text-green-500"
                />
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  <span>Выполнен</span>
                </span>
              </label>
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium block mb-2">Смена</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShift('day')}
                className={`py-2 rounded-lg text-sm font-medium transition-colors border ${shift === 'day' ? 'bg-amber-500/20 text-amber-500 border-amber-500/50' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
              >
                ☀️ День
              </button>
              <button
                type="button"
                onClick={() => setShift('evening')}
                className={`py-2 rounded-lg text-sm font-medium transition-colors border ${shift === 'evening' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
              >
                🌙 Вечер
              </button>
            </div>
          </div>
          </>
          )}

          <div>
            <label className="text-sm font-medium block mb-1">Что сделано <span className="text-muted-foreground font-normal">(может заполнить монтажник)</span></label>
            <textarea
              value={workDone}
              onChange={e => setWorkDone(e.target.value)}
              placeholder="Опишите выполненную работу..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm resize-y"
            />
          </div>
          
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={!number || !address}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ CREATE TILE MODAL ============
const CreateTileModal: React.FC<{
  type: 'installer' | 'order' | 'brigade';
  onClose: () => void;
  onCreated: (dataId: string) => void;
}> = ({ type, onClose, onCreated }) => {
  const { installers, brigades, addOrder, addInstaller, currentUser } = useStore();
  const [selectedInstaller, setSelectedInstaller] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [orderDeadline, setOrderDeadline] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [orderStatus, setOrderStatus] = useState<'new' | 'processing' | 'completed'>('new');
  const [orderShift, setOrderShift] = useState<'day' | 'evening'>('day');
  const [newInstallerName, setNewInstallerName] = useState('');
  const [newInstallerPhone, setNewInstallerPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const handleCreateOrder = async () => {
    if (!orderNumber && !orderAddress && !orderDescription) {
      alert('Укажите хотя бы одно поле (номер, адрес или описание)');
      return;
    }
    setIsLoading(true);
    try {
      const id = await addOrder({
        number: orderNumber || '',
        address: orderAddress || 'Не указан',
        description: orderDescription || 'Не указано',
        deadline: orderDeadline,
        createdBy: currentUser?.login || 'unknown',
        status: orderStatus,
        shift: orderShift
      });
      onCreated(id);
    } catch (err) {
      console.error('Failed to create order:', err);
      alert('Ошибка при создании наряда');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSelectInstaller = () => {
    if (!selectedInstaller) return;
    onCreated(selectedInstaller);
  };
  
  const handleCreateInstaller = async () => {
    if (!newInstallerName && !newInstallerPhone) {
      alert('Укажите хотя бы имя или телефон');
      return;
    }
    setIsLoading(true);
    try {
      const id = await addInstaller({ name: newInstallerName || 'Не указано', phone: newInstallerPhone, status: 'free' });
      onCreated(id);
    } catch (err) {
      console.error('Failed to create installer:', err);
      alert('Ошибка при создании монтажника');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {type === 'installer' ? (
              <>
                <UserIcon className="w-5 h-5 text-tile-installer" />
                Добавить монтажника
              </>
            ) : type === 'order' ? (
              <>
                <ClipboardDocumentListIcon className="w-5 h-5 text-tile-order" />
                Создать наряд
              </>
            ) : (
              <>
                <UserGroupIcon className="w-5 h-5 text-green-600" />
                Добавить бригаду
              </>
            )}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          {type === 'installer' ? (
            <>
              {installers.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Выбрать из списка</label>
                  <select
                    value={selectedInstaller}
                    onChange={e => setSelectedInstaller(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
                  >
                    <option value="">-- Выберите монтажника --</option>
                    {installers.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSelectInstaller}
                    disabled={!selectedInstaller}
                    className="w-full py-2 rounded-lg bg-tile-installer text-primary-foreground font-medium hover:bg-tile-installer/90 transition-colors disabled:opacity-50"
                  >
                    Добавить на холст
                  </button>
                </div>
              )}
              
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">или создать нового</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              
              <div className="space-y-3">
                <input
                  type="text"
                  value={newInstallerName}
                  onChange={e => setNewInstallerName(e.target.value)}
                  placeholder="ФИО"
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
                />
                <input
                  type="tel"
                  value={newInstallerPhone}
                  onChange={e => setNewInstallerPhone(e.target.value)}
                  placeholder="Телефон"
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
                />
                <button
                  onClick={handleCreateInstaller}
                  disabled={isLoading}
                  className="w-full py-2 rounded-lg bg-success text-success-foreground font-medium hover:bg-success/90 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Создание...' : 'Создать и добавить'}
                </button>
              </div>
            </>
          ) : type === 'brigade' ? (
            <>
              {brigades.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Выбрать из списка</label>
                  <select
                    value={selectedInstaller}
                    onChange={e => setSelectedInstaller(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
                  >
                    <option value="">-- Выберите бригаду --</option>
                    {brigades.map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.members.length} чел.)</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSelectInstaller}
                    disabled={!selectedInstaller}
                    className="w-full py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Добавить на холст
                  </button>
                </div>
              )}
              {brigades.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Нет бригад. Создайте бригаду через кнопку "Бригады" в header.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={orderAddress}
                onChange={e => setOrderAddress(e.target.value)}
                placeholder="Адрес *"
                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
              />
              <input
                type="text"
                value={orderDescription}
                onChange={e => setOrderDescription(e.target.value)}
                placeholder="Описание"
                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
              />
              <input
                type="date"
                value={orderDeadline}
                onChange={e => setOrderDeadline(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
              />
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">Статус</label>
                <select
                  value={orderStatus}
                  onChange={e => setOrderStatus(e.target.value as 'new' | 'processing' | 'completed')}
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-sm"
                >
                  <option value="new">🔴 Новый</option>
                  <option value="processing">🔵 В обработке</option>
                  <option value="completed">🟢 Выполнен</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">Смена</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderShift('day')}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors border ${orderShift === 'day' ? 'bg-amber-500/20 text-amber-500 border-amber-500/50' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                  >
                    ☀️ День
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderShift('evening')}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors border ${orderShift === 'evening' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                  >
                    🌙 Вечер
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Номер наряда (опционально, сгенерируется автоматически)</label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  placeholder="Оставьте пустым для автогенерации"
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none text-xs font-mono text-muted-foreground"
                />
              </div>
              <button
                onClick={handleCreateOrder}
                disabled={isLoading}
                className="w-full py-2 rounded-lg bg-tile-order text-primary-foreground font-medium hover:bg-tile-order/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Создание...' : 'Создать наряд'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ TILE COMPONENT ============
const TileCard: React.FC<{
  tile: Tile;
  data: Installer | Order | Brigade | null;
  isConnecting: boolean;
  isSelected: boolean;
  isNearby?: boolean;
  isDragging?: boolean;
  isGroupDragging?: boolean;
  isDimmed?: boolean;
  onStartConnect: () => void;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  zoom: number;
  currentUser: User | null;
}> = ({ tile, data, isConnecting, isSelected, isNearby, isDragging, isGroupDragging, isDimmed, onStartConnect, onSelect, onEdit, onDelete, onDragStart, zoom, currentUser }) => {
  const isInstaller = tile.type === 'installer';
  const isBrigade = tile.type === 'brigade';
  const installer = isInstaller ? (data as Installer) : null;
  const brigade = isBrigade ? (data as Brigade) : null;
  const order = !isInstaller && !isBrigade ? (data as Order) : null;
  
  // Генерация названия бригады из первых 4 букв имен участников
  const getBrigadeName = () => {
    if (!brigade || !brigade.memberDetails || brigade.memberDetails.length === 0) {
      return 'Бригада';
    }
    return brigade.memberDetails
      .map((member: any) => member.name?.substring(0, 4) || '????')
      .join('+');
  };
  
  return (
    <div
      data-tile-id={tile.id}
      className={`absolute select-none ${currentUser?.role === 'user' ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} ${isDragging || isGroupDragging ? '' : 'transition-all'} ${isDimmed ? 'opacity-25 saturate-50' : ''} ${
        isInstaller ? 'tile-glow-installer' : isBrigade ? 'tile-glow-brigade' : 'tile-glow-order'
      } ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''} ${
        isNearby ? 'ring-4 ring-green-500 ring-offset-2 ring-offset-background animate-pulse' : ''
      } ${
        !data ? 'opacity-50' : ''
      }`}
      style={{
        left: tile.x,
        top: tile.y,
        width: 220,
      }}
      onMouseDown={onDragStart}
    >
      <div className={`rounded-xl border-2 overflow-hidden bg-card ${
        isInstaller ? 'border-tile-installer/50' : isBrigade ? 'border-green-600/50' : 'border-tile-order/50'
      } ${!data ? 'border-dashed' : ''}`}>
        <div className={`px-3 py-2 flex items-center justify-between ${
          isInstaller ? 'bg-tile-installer/20' : isBrigade ? 'bg-green-600/20' : 'bg-tile-order/20'
        }`}>
          <div className="flex items-center gap-2">
            {isInstaller ? (
              <UserIcon className="w-4 h-4 text-tile-installer" />
            ) : isBrigade ? (
              <UserGroupIcon className="w-4 h-4 text-green-600" />
            ) : (
              <ClipboardDocumentListIcon className="w-4 h-4 text-tile-order" />
            )}
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isInstaller ? 'Монтажник' : isBrigade ? 'Бригада' : 'Наряд'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!isInstaller && !isBrigade && onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-1.5 rounded hover:bg-muted transition-colors"
                title="Редактировать наряд"
              >
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onStartConnect(); }}
              className={`p-1.5 rounded transition-colors ${
                isConnecting ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
              title="Создать связь"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
            {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded hover:bg-destructive/20 text-destructive transition-colors"
              title="Удалить"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
            )}
          </div>
        </div>
        
        <div className="p-3 space-y-2">
          {!data ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground font-medium mb-1">Данные не найдены</p>
              <p className="text-[10px] text-muted-foreground/60 font-mono break-all">{tile.dataId}</p>
            </div>
          ) : (
            <>
              {isInstaller && installer && (
                <>
                  <p className="font-semibold truncate">{installer.name}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <PhoneIcon className="w-3 h-3" />
                    {installer.phone || 'Нет телефона'}
                  </div>
                </>
              )}
              
              {isBrigade && brigade && (
                <>
                  <p className="font-semibold truncate text-green-600">{getBrigadeName()}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserGroupIcon className="w-3 h-3" />
                    {brigade.members.length} {brigade.members.length === 1 ? 'монтажник' : 'монтажников'}
                  </div>
                </>
              )}
              
              {!isInstaller && !isBrigade && order && (
                <>
                  <div className="flex items-start gap-1">
                    <MapPinIcon className="w-4 h-4 mt-0.5 shrink-0 text-tile-order" />
                    <p className="font-semibold text-base leading-tight line-clamp-2">{order.address}</p>
                  </div>
                  {order.description && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <UserIcon className="w-3 h-3" />
                      {order.description}
                    </div>
                  )}
                  {order.deadline && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarIcon className="w-3 h-3" />
                      {new Date(order.deadline).toLocaleDateString('ru-RU')}
                    </div>
                  )}
                  {order.workDone && (
                    <div className="text-xs p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <p className="font-medium text-emerald-500 mb-0.5">✅ Сделано</p>
                      <p className="text-foreground/90 whitespace-pre-wrap line-clamp-4">{order.workDone}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-1 flex-wrap">
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                    order.status === 'new' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    order.status === 'processing' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}>
                    {order.status === 'new' ? '🔴 Новый' :
                     order.status === 'processing' ? '🔵 В обработке' :
                     '🟢 Выполнен'}
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${
                    (order.shift || 'day') === 'evening' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                  }`}>
                    {(order.shift || 'day') === 'evening' ? '🌙 Вечер' : '☀️ День'}
                  </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border">
                    Создал: {order.createdBy}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ GROUP MODAL ============
const AddToGroupModal: React.FC<{
  groups: Group[];
  onClose: () => void;
  onSelect: (groupId: string) => void;
}> = ({ groups, onClose, onSelect }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Добавить в группу</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Нет доступных групп
            </div>
          ) : (
            groups.map((group) => (
              <button
                key={group.id}
                onClick={() => onSelect(group.id)}
                className="w-full p-3 rounded-lg border-2 border-border hover:border-primary transition-all text-left flex items-center gap-3"
              >
                <div 
                  className="w-8 h-8 rounded-lg border-2"
                  style={{ 
                    backgroundColor: group.color + '20',
                    borderColor: group.color
                  }}
                />
                <span className="font-medium">{group.name}</span>
              </button>
            ))
          )}
        </div>
        
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

const GroupModal: React.FC<{
  group: Group | null;
  selectedTiles: string[];
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
  onUpdate: (id: string, name: string, color: string) => void;
}> = ({ group, selectedTiles, onClose, onCreate, onUpdate }) => {
  const [name, setName] = useState(group?.name || '');
  const [color, setColor] = useState(group?.color || '#6366f1');
  
  const colors = [
    { name: 'Индиго', value: '#6366f1' },
    { name: 'Синий', value: '#3b82f6' },
    { name: 'Зеленый', value: '#10b981' },
    { name: 'Желтый', value: '#f59e0b' },
    { name: 'Оранжевый', value: '#f97316' },
    { name: 'Красный', value: '#ef4444' },
    { name: 'Розовый', value: '#ec4899' },
    { name: 'Фиолетовый', value: '#a855f7' },
  ];
  
  const handleSave = () => {
    if (!name.trim()) {
      alert('Введите название группы');
      return;
    }
    
    if (group) {
      onUpdate(group.id, name, color);
    } else {
      onCreate(name, color);
    }
    onClose();
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {group ? 'Редактировать группу' : 'Создать группу'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          {!group && (
            <div className="text-sm text-muted-foreground">
              Выбрано плиток: <span className="font-semibold text-foreground">{selectedTiles.length}</span>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-2">Название группы</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Объект на ул. Ленина"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary outline-none"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Цвет группы</label>
            <div className="grid grid-cols-4 gap-2">
              {colors.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`p-3 rounded-lg border-2 transition-all hover:scale-105 ${
                    color === c.value ? 'border-foreground ring-2 ring-offset-2 ring-offset-background' : 'border-border'
                  }`}
                  style={{ backgroundColor: c.value + '20' }}
                  title={c.name}
                >
                  <div className="w-full h-6 rounded" style={{ backgroundColor: c.value }} />
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            {group ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ CANVAS ============
const Canvas: React.FC = () => {
  const {
    tabs, activeTabDate, installers, orders, brigades, groups, updateTilePosition, deleteTile,
    addTile, addConnection, deleteConnection, updateCamera, currentUser, logout, moveGroup, deleteGroup,
    enableBrigadeMerge, toggleBrigadeMerge, realtimeOnline, realtimePolling, realtimeError, realtimeEvents, realtimeRevN
  } = useStore();
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingTile, setDraggingTile] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const [groupDragStart, setGroupDragStart] = useState({ x: 0, y: 0 });
  const [showPersonnel, setShowPersonnel] = useState(false);
  const [showBrigades, setShowBrigades] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCreateTile, setShowCreateTile] = useState<'installer' | 'order' | 'brigade' | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [showMergeConfirmation, setShowMergeConfirmation] = useState<{
    type: 'add-to-brigade';
    installerId1?: string;
    installerId2?: string;
    brigadeId?: string;
    installerId?: string;
    x?: number;
    y?: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [nearbyTile, setNearbyTile] = useState<string | null>(null); // для подсветки при наведении
  const [showRtInfo, setShowRtInfo] = useState(false); // панель статуса realtime
  const [shiftFilter, setShiftFilter] = useState<'all' | 'day' | 'evening'>('all'); // фильтр смены на канвасе
  
  const tab = tabs[activeTabDate] || { tiles: [], connections: [], cameraX: 0, cameraY: 0, zoom: 1 };
  const { tiles, connections, cameraX, cameraY, zoom } = tab;
  const currentGroups = groups.filter(g => g.tabId === activeTabDate);

  // Подсчёт нарядов по сменам для активной вкладки
  const getOrderShift = (tile: Tile): 'day' | 'evening' | null => {
    if (tile.type !== 'order') return null;
    return orders.find(o => o.id === tile.dataId)?.shift === 'evening' ? 'evening' : 'day';
  };
  const dayOrderCount = tiles.filter(t => getOrderShift(t) === 'day').length;
  const eveningOrderCount = tiles.filter(t => getOrderShift(t) === 'evening').length;
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setShowPersonnel(true);
      }
      if (e.key === 'F3') {
        e.preventDefault();
        setShowBrigades(true);
      }
      if (e.key === 'Escape') {
        setConnectingFrom(null);
        setShowPersonnel(false);
        setShowBrigades(false);
        setShowAdmin(false);
        setShowCreateTile(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Pan handling
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-grid')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - cameraX, y: e.clientY - cameraY });
    }
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    
    if (isPanning) {
      const newX = e.clientX - panStart.x;
      const newY = e.clientY - panStart.y;
      updateCamera(newX, newY, zoom);
    }
    
    if (draggingTile) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left - cameraX) / zoom - dragOffset.x;
        const y = (e.clientY - rect.top - cameraY) / zoom - dragOffset.y;
        updateTilePosition(draggingTile, x, y);
        
        // Определяем близкую плитку для подсветки при слиянии
        const draggedTile = tiles.find(t => t.id === draggingTile);
        if (draggedTile && draggedTile.type === 'installer') {
          const tileCenterX = x + 110;
          const tileCenterY = y + 80;
          const nearby = findNearbyTile(tileCenterX, tileCenterY, 100, ['installer', 'brigade']);
          setNearbyTile(nearby ? nearby.id : null);
        }
      }
    }
    
    if (draggingGroup) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const currentX = (e.clientX - rect.left - cameraX) / zoom;
        const currentY = (e.clientY - rect.top - cameraY) / zoom;
        const deltaX = currentX - groupDragStart.x;
        const deltaY = currentY - groupDragStart.y;
        
        // Небольшой порог для начала перемещения
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          moveGroup(draggingGroup, deltaX, deltaY);
          setGroupDragStart({ x: currentX, y: currentY });
        }
      }
    }
  };
  
  const handleMouseUp = async () => {
    // Обработка слияния плиток монтажников
    if (draggingTile) {
      const draggedTile = tiles.find(t => t.id === draggingTile);
      
      if (draggedTile && draggedTile.type === 'installer') {
        // Вычисляем позицию центра перетаскиваемой плитки
        const tileCenterX = draggedTile.x + 110;
        const tileCenterY = draggedTile.y + 80;
        
        // Ищем близкую плитку в радиусе 100px
        const nearby = findNearbyTile(tileCenterX, tileCenterY, 100, ['installer', 'brigade']);
        
        if (nearby) {
          if (nearby.type === 'installer') {
            // Слияние двух монтажников → бригада (без подтверждения)
            await handleMergeTwoInstallers(
              draggedTile.dataId,
              nearby.dataId,
              nearby.x,
              nearby.y
            );
          } else if (nearby.type === 'brigade') {
            // Добавление монтажника в бригаду
            setShowMergeConfirmation({
              type: 'add-to-brigade',
              brigadeId: nearby.dataId,
              installerId: draggedTile.dataId
            });
          }
        }
      }
      
      setNearbyTile(null);
    }
    
    setIsPanning(false);
    setDraggingTile(null);
    setDraggingGroup(null);
  };
  
  // Wheel handling: колесо — зум к курсору, Ctrl/⌘+колесо — движение обзора
  // вверх/вниз, Shift+колесо — панорама по горизонтали.
  // Нюанс: щипок на тачпаде тоже приходит с ctrlKey — отличаем его по дробной
  // дельте (у мыши с Ctrl дельта целая), щипок по-прежнему зумит.
  // Нативный слушатель с passive: false, чтобы preventDefault гарантированно
  // блокировал скролл/зум страницы.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useStore.getState();
      const t = st.tabs[st.activeTabDate];
      if (!t) return;
      const { cameraX: cx, cameraY: cy, zoom: z } = t;

      // Нормализация дельт (Firefox может отдавать строки)
      const unit = e.deltaMode === 1 ? 16 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;

      const zoomAtCursor = (delta: number) => {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const factor = Math.exp(-delta * 0.0015);
        const newZoom = Math.min(Math.max(z * factor, 0.25), 2);
        const wx = (mx - cx) / z;
        const wy = (my - cy) / z;
        st.updateCamera(mx - wx * newZoom, my - wy * newZoom, newZoom);
      };

      if (e.shiftKey) {
        st.updateCamera(cx - dy, cy, z);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (!Number.isInteger(dy)) {
          // Щипок тачпада — зум к курсору
          zoomAtCursor(dy);
        } else {
          // Колесо с Ctrl — движение обзора вверх/вниз
          st.updateCamera(cx, cy - dy, z);
        }
        return;
      }

      // Обычное колесо: вертикальный жест — зум, горизонтальный — панорама
      if (Math.abs(dx) > Math.abs(dy)) {
        st.updateCamera(cx - dx, cy, z);
      } else {
        zoomAtCursor(dy);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Touch handling: один палец — панорама, щипок — зум к точке,
  // короткий тап по наряду — открыть редактирование.
  // Кнопки внутри плиток пропускаем — у них работает обычный click.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    let mode: 'none' | 'pan' | 'pinch' | 'maybe-tap' = 'none';
    let lastX = 0, lastY = 0, startX = 0, startY = 0, startT = 0;
    let pinchDist = 0;
    let tapTileId: string | null = null;

    const isBg = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t === el || t.classList.contains('canvas-grid'));
    const tileIdFrom = (t: EventTarget | null) =>
      t instanceof HTMLElement ? t.closest('[data-tile-id]')?.getAttribute('data-tile-id') : null;
    const touchDist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        mode = 'pinch';
        pinchDist = touchDist(e.touches[0], e.touches[1]);
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        startX = lastX = t.clientX;
        startY = lastY = t.clientY;
        startT = Date.now();
        if (isBg(e.target)) {
          mode = 'pan';
        } else if (e.target instanceof HTMLElement && e.target.closest('button')) {
          mode = 'none';
          tapTileId = null;
        } else {
          const id = tileIdFrom(e.target);
          if (id) {
            mode = 'maybe-tap';
            tapTileId = id;
          } else {
            mode = 'none';
            tapTileId = null;
          }
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const st = useStore.getState();
      const tab = st.tabs[st.activeTabDate];
      if (!tab) return;
      if (mode === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        st.updateCamera(tab.cameraX + (t.clientX - lastX), tab.cameraY + (t.clientY - lastY), tab.zoom);
        lastX = t.clientX;
        lastY = t.clientY;
      } else if (mode === 'maybe-tap' && e.touches.length === 1) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - startX, t.clientY - startY) > 12) {
          mode = 'none';
          tapTileId = null;
        }
      } else if (mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const a = e.touches[0], b = e.touches[1];
        const rect = el.getBoundingClientRect();
        const mx = (a.clientX + b.clientX) / 2 - rect.left;
        const my = (a.clientY + b.clientY) / 2 - rect.top;
        const d = touchDist(a, b);
        const factor = pinchDist > 0 ? d / pinchDist : 1;
        const newZoom = Math.min(Math.max(tab.zoom * factor, 0.25), 2);
        const wx = (mx - tab.cameraX) / tab.zoom;
        const wy = (my - tab.cameraY) / tab.zoom;
        st.updateCamera(mx - wx * newZoom, my - wy * newZoom, newZoom);
        pinchDist = d;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (mode === 'maybe-tap' && tapTileId && e.touches.length === 0 && Date.now() - startT < 400) {
        const st = useStore.getState();
        const tab = st.tabs[st.activeTabDate];
        const tile = tab?.tiles.find(t => t.id === tapTileId);
        if (tile?.type === 'order') {
          const order = st.orders.find(o => o.id === tile.dataId);
          if (order) setEditingOrder(order);
        }
      }
      if (e.touches.length === 0) {
        mode = 'none';
        tapTileId = null;
      } else if (e.touches.length === 1) {
        mode = 'pan';
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);
  
  const handleTileDragStart = (tileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Проверяем, может ли пользователь перемещать плитки
    if (currentUser?.role === 'user') {
      return; // Пользователи с ролью 'user' не могут перемещать плитки
    }
    
    const tile = tiles.find(t => t.id === tileId);
    if (!tile) return;
    
    // Shift + клик = выделение плитки
    if (e.shiftKey) {
      setSelectedTiles(prev => 
        prev.includes(tileId) 
          ? prev.filter(id => id !== tileId)
          : [...prev, tileId]
      );
      return;
    }
    
    if (connectingFrom) {
      if (connectingFrom !== tileId) {
        addConnection(connectingFrom, tileId);
      }
      setConnectingFrom(null);
      return;
    }
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = (e.clientX - rect.left - cameraX) / zoom;
      const mouseY = (e.clientY - rect.top - cameraY) / zoom;
      setDragOffset({ x: mouseX - tile.x, y: mouseY - tile.y });
      setDraggingTile(tileId);
    }
  };
  
  const handleCreateTile = (type: 'installer' | 'order' | 'brigade', dataId: string) => {
    addTile({
      type,
      dataId,
      x: (-cameraX + 400) / zoom,
      y: (-cameraY + 300) / zoom
    });
    setShowCreateTile(null);
  };
  
  const getDataForTile = (tile: Tile) => {
    if (tile.type === 'installer') {
      return installers.find(i => i.id === tile.dataId) || null;
    }
    if (tile.type === 'brigade') {
      return brigades.find(b => b.id === tile.dataId) || null;
    }
    return orders.find(o => o.id === tile.dataId) || null;
  };
  
  const getTileCenter = (tile: Tile) => ({
    x: tile.x + 110,
    y: tile.y + 60
  });
  
  // Поиск плитки в радиусе для слияния
  const findNearbyTile = (x: number, y: number, radius: number, types: ('installer' | 'brigade')[]): Tile | null => {
    const tileWidth = 220;
    const tileHeight = 160;
    
    for (const tile of tiles) {
      if (!types.includes(tile.type as any)) continue;
      if (draggingTile && tile.id === draggingTile) continue; // не учитываем перетаскиваемую
      
      // Проверяем расстояние от точки до центра плитки
      const tileCenterX = tile.x + tileWidth / 2;
      const tileCenterY = tile.y + tileHeight / 2;
      const distance = Math.sqrt(
        Math.pow(x - tileCenterX, 2) + Math.pow(y - tileCenterY, 2)
      );
      
      if (distance <= radius) {
        return tile;
      }
    }
    return null;
  };
  
  // Вычисление границ группы по плиткам
  const calculateGroupBounds = (groupId: string) => {
    const groupTiles = tiles.filter(t => t.groupId === groupId);
    if (groupTiles.length === 0) return null;
    
    const padding = 40;
    const headerHeight = 40;
    const tileWidth = 220;
    const tileHeight = 160; // Увеличено для учета контента
    
    const minX = Math.min(...groupTiles.map(t => t.x));
    const minY = Math.min(...groupTiles.map(t => t.y));
    const maxX = Math.max(...groupTiles.map(t => t.x + tileWidth));
    const maxY = Math.max(...groupTiles.map(t => t.y + tileHeight));
    
    return {
      x: minX - padding,
      y: minY - padding - headerHeight,
      width: maxX - minX + 2 * padding,
      height: maxY - minY + 2 * padding + headerHeight
    };
  };
  
  // Обработка начала перетаскивания группы
  const handleGroupDragStart = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Проверяем, может ли пользователь перемещать группы
    if (currentUser?.role === 'user') {
      return; // Пользователи с ролью 'user' не могут перемещать группы
    }
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setDraggingGroup(groupId);
      setGroupDragStart({
        x: (e.clientX - rect.left - cameraX) / zoom,
        y: (e.clientY - rect.top - cameraY) / zoom
      });
    }
  };
  
  // Слияние двух монтажников в бригаду
  const handleMergeTwoInstallers = async (installerId1: string, installerId2: string, x: number, y: number) => {
    console.log('[handleMergeTwoInstallers] Starting merge:', { installerId1, installerId2, x, y });
    let tile1Restored = false;
    let tile2Restored = false;
    
    try {
      // Проверка: не объединять монтажника сам с собой
      if (installerId1 === installerId2) {
        console.log('[handleMergeTwoInstallers] Same installer, skipping');
        return;
      }
      
      // Получаем данные монтажников
      const installer1 = installers.find(i => i.id === installerId1);
      const installer2 = installers.find(i => i.id === installerId2);
      
      if (!installer1 || !installer2) {
        console.log('[handleMergeTwoInstallers] Installers not found:', { installer1, installer2 });
        return;
      }
      
      // Находим плитки перед удалением
      const tile1 = tiles.find(t => t.dataId === installerId1 && t.type === 'installer');
      const tile2 = tiles.find(t => t.dataId === installerId2 && t.type === 'installer');
      
      console.log('[handleMergeTwoInstallers] Found tiles:', { tile1: !!tile1, tile2: !!tile2 });
      
      // Создаем/находим бригаду
      let result = await brigadeAPI.findOrCreate([installer1.id, installer2.id]);
      console.log('[handleMergeTwoInstallers] Brigade API result:', result);
      
      // Если бригады с таким составом не существует, создаем новую
      if (!result.success) {
        console.log('[handleMergeTwoInstallers] Brigade not found, creating new one');
        const createResult = await brigadeAPI.create(
          `Бригада ${new Date().toLocaleDateString()}`,
          '#10b981',
          [installer1.id, installer2.id]
        );
        result = { success: true, brigadeId: createResult.data.id };
        console.log('[handleMergeTwoInstallers] Created new brigade:', result.brigadeId);
      }
      
      const brigadeId = result.brigadeId;
      console.log('[handleMergeTwoInstallers] Using brigade:', brigadeId);
      
      // Проверяем, существует ли уже плитка бригады
      const existingBrigadeTile = tiles.find(t => t.dataId === brigadeId && t.type === 'brigade');
      console.log('[handleMergeTwoInstallers] Existing brigade tile:', !!existingBrigadeTile);
      
      if (existingBrigadeTile) {
        // Бригада уже существует на канвасе, просто перемещаем ее
        console.log('[handleMergeTwoInstallers] Moving existing brigade tile');
        await updateTilePosition(existingBrigadeTile.id, x, y);
        return;
      }
      
      // Удаляем обе плитки монтажников
      if (tile1) {
        await deleteTile(tile1.id);
        tile1Restored = true;
      }
      if (tile2) {
        await deleteTile(tile2.id);
        tile2Restored = true;
      }
      
      // Создаем плитку бригады на месте второго монтажника
      console.log('[handleMergeTwoInstallers] Creating new brigade tile at:', { x, y });
      await addTile({
        type: 'brigade',
        dataId: brigadeId,
        x,
        y
      });
      
      // Перезагружаем данные, чтобы новая бригада появилась в store
      console.log('[handleMergeTwoInstallers] Reloading state');
      await useStore.getState().loadState();
      
      console.log('[handleMergeTwoInstallers] Merge completed successfully');
    } catch (err) {
      console.error('Failed to merge installers:', err);
      
      // Rollback: восстанавливаем удаленные плитки
      try {
        if (tile1Restored && tile1) {
          await addTile({
            type: 'installer',
            dataId: tile1.dataId,
            x: tile1.x,
            y: tile1.y
          });
        }
        if (tile2Restored && tile2) {
          await addTile({
            type: 'installer',
            dataId: tile2.dataId,
            x: tile2.x,
            y: tile2.y
          });
        }
      } catch (rollbackErr) {
        console.error('Failed to rollback tile restoration:', rollbackErr);
      }
    }
  };
  
  // Добавление монтажника в существующую бригаду
  const handleAddInstallerToBrigade = async (brigadeId: string, installerId: string) => {
    let installerTileDeleted = false;
    let installerTileData: { dataId: string; x: number; y: number } | null = null;
    
    try {
      const installer = installers.find(i => i.id === installerId);
      if (!installer) return;
      
      // Находим плитку монтажника перед удалением
      const installerTile = tiles.find(t => t.dataId === installerId && t.type === 'installer');
      if (installerTile) {
        installerTileData = { dataId: installerTile.dataId, x: installerTile.x, y: installerTile.y };
      }
      
      // Добавляем монтажника в бригаду
      await brigadeAPI.addMember(brigadeId, installer.id);
      
      // Удаляем плитку монтажника
      if (installerTile) {
        await deleteTile(installerTile.id);
        installerTileDeleted = true;
      }
      
      // Перезагружаем данные
      await useStore.getState().loadState();
      
    } catch (err) {
      console.error('Failed to add installer to brigade:', err);
      
      // Rollback: восстанавливаем удаленную плитку монтажника
      try {
        if (installerTileDeleted && installerTileData) {
          await addTile({
            type: 'installer',
            dataId: installerTileData.dataId,
            x: installerTileData.x,
            y: installerTileData.y
          });
        }
      } catch (rollbackErr) {
        console.error('Failed to rollback installer tile restoration:', rollbackErr);
      }
    }
  };
  
  // Создание группы из выделенных плиток
  const handleCreateGroup = () => {
    if (selectedTiles.length === 0) return;
    setShowGroupModal(true);
  };
  
  const handleCreateGroupSubmit = async (name: string, color: string) => {
    if (selectedTiles.length === 0) return;
    
    // Вычисляем границы по выделенным плиткам
    const selectedTilesData = tiles.filter(t => selectedTiles.includes(t.id));
    if (selectedTilesData.length === 0) return;
    
    const padding = 40;
    const headerHeight = 40;
    const tileWidth = 220;
    const tileHeight = 160; // Увеличено для учета контента
    
    const minX = Math.min(...selectedTilesData.map(t => t.x));
    const minY = Math.min(...selectedTilesData.map(t => t.y));
    const maxX = Math.max(...selectedTilesData.map(t => t.x + tileWidth));
    const maxY = Math.max(...selectedTilesData.map(t => t.y + tileHeight));
    
    try {
      await useStore.getState().addGroup({
        tabId: activeTabDate,
        name,
        x: minX - padding,
        y: minY - padding - headerHeight,
        width: maxX - minX + 2 * padding,
        height: maxY - minY + 2 * padding + headerHeight,
        color
      }, selectedTiles);
      
      setSelectedTiles([]);
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };
  
  const handleUpdateGroupSubmit = async (id: string, name: string, color: string) => {
    try {
      await useStore.getState().updateGroup(id, { name, color });
    } catch (err) {
      console.error('Failed to update group:', err);
    }
  };
  
  // Определяем состояние выделенных плиток для показа кнопок
  const selectedTilesData = tiles.filter(t => selectedTiles.includes(t.id));
  const allSelectedInSameGroup = selectedTilesData.length > 0 && 
    selectedTilesData.every(t => t.groupId && t.groupId === selectedTilesData[0].groupId);
  const allSelectedNotInGroup = selectedTilesData.length > 0 && 
    selectedTilesData.every(t => !t.groupId);
  const someSelectedNotInGroup = selectedTilesData.some(t => !t.groupId);
  
  const handleRemoveFromGroup = async () => {
    for (const tileId of selectedTiles) {
      await useStore.getState().removeTileFromGroup(tileId);
    }
    setSelectedTiles([]);
  };
  
  const handleAddToGroup = () => {
    setShowAddToGroupModal(true);
  };
  
  const handleAddToGroupSubmit = async (groupId: string) => {
    for (const tileId of selectedTiles) {
      await useStore.getState().addTileToGroup(groupId, tileId);
    }
    setSelectedTiles([]);
    setShowAddToGroupModal(false);
  };
  
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 gap-2 shrink-0 z-20 overflow-x-auto scrollbar-thin">
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <WrenchScrewdriverIcon className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold whitespace-nowrap">ЭГ <span className="hidden sm:inline font-normal text-muted-foreground">· Наряды</span></span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <>
          <button
            onClick={() => setShowCreateTile('installer')}
            className="px-3 py-1.5 rounded-lg bg-tile-installer/20 text-tile-installer text-sm font-medium hover:bg-tile-installer/30 transition-colors flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Монтажник</span>
          </button>
          <button
            onClick={() => setShowCreateTile('order')}
            className="px-3 py-1.5 rounded-lg bg-tile-order/20 text-tile-order text-sm font-medium hover:bg-tile-order/30 transition-colors flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Наряд</span>
          </button>
          <button
            onClick={() => setShowCreateTile('brigade')}
            className="px-3 py-1.5 rounded-lg bg-green-600/20 text-green-600 text-sm font-medium hover:bg-green-600/30 transition-colors flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Бригада</span>
          </button>
          </>
          )}
          {selectedTiles.length > 0 && (
            <>
              {allSelectedNotInGroup && (
                <button
                  onClick={handleCreateGroup}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-600 text-sm font-medium hover:bg-indigo-600/30 transition-colors flex items-center gap-2 animate-fade-in"
                >
                  <PlusIcon className="w-4 h-4" />
                  Создать группу ({selectedTiles.length})
                </button>
              )}
              {someSelectedNotInGroup && currentGroups.length > 0 && !allSelectedNotInGroup && (
                <button
                  onClick={handleAddToGroup}
                  className="px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-600 text-sm font-medium hover:bg-blue-600/30 transition-colors flex items-center gap-2 animate-fade-in"
                >
                  <PlusIcon className="w-4 h-4" />
                  Добавить в группу ({selectedTiles.length})
                </button>
              )}
              {allSelectedInSameGroup && (
                <button
                  onClick={handleRemoveFromGroup}
                  className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-600 text-sm font-medium hover:bg-red-600/30 transition-colors flex items-center gap-2 animate-fade-in"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Убрать из группы ({selectedTiles.length})
                </button>
              )}
            </>
          )}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted" title="Фильтр смены">
            <button
              onClick={() => setShiftFilter('all')}
              className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors ${shiftFilter === 'all' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="Показать все смены"
            >
              Все <span className="hidden sm:inline">({dayOrderCount + eveningOrderCount})</span>
            </button>
            <button
              onClick={() => setShiftFilter(shiftFilter === 'day' ? 'all' : 'day')}
              className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors ${shiftFilter === 'day' ? 'bg-amber-500/20 text-amber-500 shadow' : 'text-muted-foreground hover:text-foreground'}`}
              title="Дневная смена"
            >
              ☀️ День <span className="hidden sm:inline">({dayOrderCount})</span>
            </button>
            <button
              onClick={() => setShiftFilter(shiftFilter === 'evening' ? 'all' : 'evening')}
              className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors ${shiftFilter === 'evening' ? 'bg-indigo-500/20 text-indigo-400 shadow' : 'text-muted-foreground hover:text-foreground'}`}
              title="Вечерняя смена"
            >
              🌙 Вечер <span className="hidden sm:inline">({eveningOrderCount})</span>
            </button>
          </div>
          <div className="w-px h-6 bg-border mx-2" />
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
          <button
            onClick={() => setShowPersonnel(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Персонал (F2)"
          >
            <UserGroupIcon className="w-5 h-5" />
          </button>
          )}
          <button
            onClick={() => setShowBrigades(true)}
            className="p-2 rounded-lg hover:bg-green-600/10 transition-colors text-green-600"
            title="Бригады (F3)"
          >
            <UserGroupIcon className="w-5 h-5" />
          </button>
          {(currentUser?.role === 'admin') && (
            <button
              onClick={toggleBrigadeMerge}
              className={`p-2 rounded-lg transition-colors ${enableBrigadeMerge ? 'bg-orange-600/20 text-orange-600' : 'hover:bg-muted text-muted-foreground'}`}
              title={enableBrigadeMerge ? "Отключить слияние бригад" : "Включить слияние бригад"}
            >
              <LinkIcon className="w-5 h-5" />
            </button>
          )}
          {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
            <button
              onClick={() => setShowAdmin(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title={currentUser?.role === 'admin' ? "Управление пользователями" : "Просмотр пользователей"}
            >
              <Cog6ToothIcon className="w-5 h-5" />
            </button>
          )}
          <div className="w-px h-6 bg-border mx-2" />
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium shrink-0 select-none ${realtimeOnline ? 'bg-emerald-500/15 text-emerald-500' : realtimePolling ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'}`}
            title={realtimeOnline ? 'Realtime подключен — изменения прилетают сами' : realtimePolling ? 'Режим long-poll — почти без задержки. Нажмите для подробностей.' : `Realtime нет${realtimeError ? ` (${realtimeError})` : ''}. Нажмите для подробностей.`}
            onClick={() => setShowRtInfo(v => !v)}
            style={{ cursor: 'pointer' }}
          >
            <span className={`w-2 h-2 rounded-full ${realtimeOnline ? 'bg-emerald-500 animate-pulse' : realtimePolling ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
            {realtimeOnline ? 'LIVE' : realtimePolling ? 'SYNC' : 'OFF'}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
            <UserIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm hidden sm:inline">{currentUser?.login}</span>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-destructive/20 text-destructive transition-colors"
            title="Выйти"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
          </button>
        </div>
      </header>
      
      {/* Tabs */}
      <TabBar />

      {showRtInfo && (
        <div className="fixed top-16 right-4 z-50 w-72 p-3 rounded-xl bg-card border border-border shadow-lg text-xs space-y-2">
          <p className="font-semibold text-sm">
            Realtime: {realtimeOnline ? '🟢 стрим' : realtimePolling ? '🟡 long-poll' : '⚪ нет соединения'}
          </p>
          <p className="text-muted-foreground">
            Сообщений получено: {realtimeEvents}, rev {realtimeRevN}
          </p>
          {realtimePolling && !realtimeOnline && (
            <p className="text-muted-foreground">
              Прямой стрим недоступен, обновления идут long-poll'ом почти без задержки.
            </p>
          )}
          {!realtimeOnline && !realtimePolling && (
            <>
              <p className="text-muted-foreground break-words">
                {realtimeError || 'Причина пока неизвестна — подождите пару секунд или нажмите «Повторить».'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    useStore.setState({ realtimeError: null });
                    startRealtime();
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium"
                >
                  Повторить
                </button>
                <button
                  onClick={() => setShowRtInfo(false)}
                  className="flex-1 py-1.5 rounded-lg border border-border"
                >
                  Закрыть
                </button>
              </div>
            </>
          )}
          {!realtimeOnline && realtimePolling && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowRtInfo(false)}
                className="flex-1 py-1.5 rounded-lg border border-border"
              >
                Закрыть
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="canvas-grid absolute"
          style={{
            width: '200%',
            height: '200%',
            left: -5000 + cameraX,
            top: -5000 + cameraY,
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          }}
        />
        
        {/* SVG Connections */}
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ overflow: 'visible' }}
        >
          {(() => {
            return connections.map(conn => {
              const fromTile = tiles.find(t => t.id === conn.fromTileId);
              const toTile = tiles.find(t => t.id === conn.toTileId);
              if (!fromTile || !toTile) return null;
              
              // Обычная связь
              const from = getTileCenter(fromTile);
              const to = getTileCenter(toTile);
              const x1 = from.x * zoom + cameraX;
              const y1 = from.y * zoom + cameraY;
              const x2 = to.x * zoom + cameraX;
              const y2 = to.y * zoom + cameraY;
              const stroke = "hsl(217 91% 60%)";
              const strokeDasharray = "6 4";
              const isInternal = false; // Для обычных соединений показываем маркеры
              
              return (
                <g key={conn.id}>
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={stroke}
                    strokeWidth={2}
                    strokeDasharray={strokeDasharray}
                    opacity={0.6}
                  />
                  {!isInternal && <circle cx={x1} cy={y1} r={4} fill="hsl(199 89% 48%)" />}
                  {!isInternal && <circle cx={x2} cy={y2} r={4} fill="hsl(262 83% 58%)" />}
                  {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                  <circle
                    cx={(x1 + x2) / 2}
                    cy={(y1 + y2) / 2}
                    r={10}
                    fill="hsl(var(--card))"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={1.5}
                    className="cursor-pointer pointer-events-auto hover:fill-[hsl(var(--destructive)/0.2)]"
                    onClick={async () => {
                      try {
                        await deleteConnection(conn.id);
                      } catch {
                        alert('Ошибка при удалении связи');
                      }
                    }}
                  />
                  )}
                  {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                  <g 
                    className="pointer-events-none"
                    transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`}
                  >
                    <line x1={-4} y1={-4} x2={4} y2={4} stroke="hsl(var(--destructive))" strokeWidth={2} strokeLinecap="round" />
                    <line x1={4} y1={-4} x2={-4} y2={4} stroke="hsl(var(--destructive))" strokeWidth={2} strokeLinecap="round" />
                  </g>
                  )}
                </g>
              );
            });
          })()}
          
          {/* Connecting line preview */}
          {connectingFrom && (() => {
            const fromTile = tiles.find(t => t.id === connectingFrom);
            if (!fromTile) return null;
            const from = getTileCenter(fromTile);
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return null;
            
            const x1 = from.x * zoom + cameraX;
            const y1 = from.y * zoom + cameraY;
            const x2 = mousePos.x - rect.left;
            const y2 = mousePos.y - rect.top;
            
            return (
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="hsl(217 91% 60%)"
                strokeWidth={2}
                strokeDasharray="4 4"
                opacity={0.4}
              />
            );
          })()}
          
          {/* Groups */}
          {currentGroups.map(group => {
            const bounds = calculateGroupBounds(group.id);
            if (!bounds) return null;
            
            const x = bounds.x * zoom + cameraX;
            const y = bounds.y * zoom + cameraY;
            const width = bounds.width * zoom;
            const height = bounds.height * zoom;
            
            return (
              <g key={group.id} style={{ pointerEvents: 'auto' }}>
                {/* Фон группы */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={group.color}
                  fillOpacity={0.05}
                  rx={8 * zoom}
                  className="pointer-events-none"
                />
                {/* Граница группы */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="none"
                  stroke={group.color}
                  strokeWidth={2}
                  rx={8 * zoom}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Заголовок группы */}
                <g>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={40 * zoom}
                    fill={group.color}
                    fillOpacity={0.1}
                    rx={8 * zoom}
                    style={{ cursor: currentUser?.role === 'user' ? 'not-allowed' : 'move' }}
                    onMouseDown={(e: any) => {
                      handleGroupDragStart(group.id, e);
                    }}
                    onDoubleClick={(e: any) => {
                      e.stopPropagation();
                      setEditingGroup(group);
                      setShowGroupModal(true);
                    }}
                  />
                  <text
                    x={x + 10 * zoom}
                    y={y + 25 * zoom}
                    fill={group.color}
                    fontSize={14 * zoom}
                    fontWeight="600"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {group.name}
                  </text>
                  {/* Кнопка удаления группы */}
                  <g
                    transform={`translate(${x + width - 28 * zoom}, ${y + 15 * zoom})`}
                    style={{ cursor: 'pointer' }}
                    onMouseDown={(e: any) => e.stopPropagation()}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      deleteGroup(group.id);
                    }}
                  >
                    <circle r={11 * zoom} fill={group.color} fillOpacity={0.15} />
                    <line x1={-5 * zoom} y1={-5 * zoom} x2={5 * zoom} y2={5 * zoom} stroke={group.color} strokeWidth={2} strokeLinecap="round" />
                    <line x1={5 * zoom} y1={-5 * zoom} x2={-5 * zoom} y2={5 * zoom} stroke={group.color} strokeWidth={2} strokeLinecap="round" />
                  </g>
                </g>
              </g>
            );
          })}
        </svg>
        
        {/* Tiles */}
        <div
          style={{
            transform: `translate(${cameraX}px, ${cameraY}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {tiles.map(tile => {
            const tileData = getDataForTile(tile);
            const isNearby = nearbyTile === tile.id; // подсветка при наведении
            const tileShift = tile.type === 'order' ? ((tileData as Order | null)?.shift || 'day') : null;
            const isDimmed = shiftFilter !== 'all' && tileShift !== null && tileShift !== shiftFilter;
            return (
              <TileCard
                key={tile.id}
                tile={tile}
                data={tileData}
                isConnecting={connectingFrom === tile.id}
                isSelected={selectedTiles.includes(tile.id)}
                isNearby={isNearby}
                isDragging={draggingTile === tile.id}
                isGroupDragging={false}
                isDimmed={isDimmed}
                onStartConnect={() => setConnectingFrom(tile.id)}
                onSelect={() => {}}
                onEdit={tile.type === 'order' && tileData ? () => setEditingOrder(tileData as Order) : undefined}
                onDelete={() => deleteTile(tile.id)}
                onDragStart={(e) => handleTileDragStart(tile.id, e)}
                zoom={zoom}
                currentUser={currentUser}
              />
            );
          })}
        </div>
        
        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-card border border-border rounded-lg p-1">
          <button
            onClick={() => updateCamera(cameraX, cameraY, Math.min(zoom * 1.2, 2))}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => updateCamera(cameraX, cameraY, Math.max(zoom * 0.8, 0.25))}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <MinusIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border" />
          <button
            onClick={() => updateCamera(0, 0, 1)}
            className="p-2 hover:bg-muted rounded transition-colors"
            title="Сбросить вид"
          >
            <ArrowsPointingOutIcon className="w-4 h-4" />
          </button>
        </div>
        
        {/* Connection mode indicator */}
        {connectingFrom && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium animate-pulse">
            Выберите вторую плитку для создания связи
          </div>
        )}
      </div>
      
      {/* Modals */}
      {showPersonnel && <PersonnelModal onClose={() => setShowPersonnel(false)} />}
      {showBrigades && <BrigadesModal onClose={() => setShowBrigades(false)} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showCreateTile && (
        <CreateTileModal
          type={showCreateTile}
          onClose={() => setShowCreateTile(null)}
          onCreated={(dataId) => handleCreateTile(showCreateTile, dataId)}
        />
      )}
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSave={async (updates) => {
            await useStore.getState().updateOrder(editingOrder.id, updates);
          }}
        />
      )}
      {showGroupModal && (
        <GroupModal
          group={editingGroup}
          selectedTiles={selectedTiles}
          onClose={() => {
            setShowGroupModal(false);
            setEditingGroup(null);
          }}
          onCreate={handleCreateGroupSubmit}
          onUpdate={handleUpdateGroupSubmit}
        />
      )}
      
      {showAddToGroupModal && (
        <AddToGroupModal
          groups={currentGroups}
          onClose={() => setShowAddToGroupModal(false)}
          onSelect={handleAddToGroupSubmit}
        />
      )}
      
      {showMergeConfirmation && (
        <MergeConfirmationModal
          confirmation={showMergeConfirmation}
          onConfirm={async () => {
            if (showMergeConfirmation.type === 'add-to-brigade') {
              await handleAddInstallerToBrigade(
                showMergeConfirmation.brigadeId!,
                showMergeConfirmation.installerId!
              );
            }
            setShowMergeConfirmation(null);
          }}
          onCancel={() => setShowMergeConfirmation(null)}
        />
      )}
    </div>
  );
};

// ============ MERGE CONFIRMATION MODAL ============
const MergeConfirmationModal: React.FC<{
  confirmation: {
    type: 'add-to-brigade';
    installerId1?: string;
    installerId2?: string;
    brigadeId?: string;
    installerId?: string;
    x?: number;
    y?: number;
  };
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ confirmation, onConfirm, onCancel }) => {
  const { installers, brigades } = useStore();
  
  const getInstallerName = (id: string) => {
    const installer = installers.find(i => i.id === id);
    return installer ? installer.name : 'Неизвестный монтажник';
  };
  
  const getBrigadeName = (id: string) => {
    const brigade = brigades.find(b => b.id === id);
    return brigade ? `Бригада ${brigade.members.map(m => getInstallerName(m.installerId)).join(', ')}` : 'Неизвестная бригада';
  };
  
  const getMessage = () => {
    const brigade = getBrigadeName(confirmation.brigadeId!);
    const installer = getInstallerName(confirmation.installerId!);
    return `Добавить монтажника "${installer}" в ${brigade}?`;
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Подтверждение действия</h3>
        <p className="text-gray-700 mb-6">{getMessage()}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ TAB BAR ============
const TabBar: React.FC = () => {
  const { activeTabDate, setActiveTab, deleteTab, tabs, currentUser } = useStore();
  const [customDate, setCustomDate] = useState('');
  
  const today = getToday();
  const tomorrow = getTomorrow();
  
  const allDates = useMemo(() => {
    const dates = new Set([today, tomorrow, ...Object.keys(tabs)]);
    return Array.from(dates).sort();
  }, [tabs, today, tomorrow]);
  
  const handleAddCustomDate = async () => {
    if (customDate && !allDates.includes(customDate)) {
      setActiveTab(customDate);
      setCustomDate('');
      
      // Создаем таб на сервере
      try {
        await canvasAPI.createTab(customDate);
      } catch (e) {
        console.error('Failed to create tab on server:', e);
      }
    }
  };
  
  const handleDeleteTab = (date: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (date === today) return;
    
    deleteTab(date);
  };
  
  return (
    <div className="h-12 border-b border-border bg-card/50 flex items-center px-4 gap-2 shrink-0 overflow-x-auto scrollbar-thin">
      {allDates.map(date => (
        <button
          key={date}
          onClick={() => setActiveTab(date)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 group ${
            activeTabDate === date
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          <span className="flex items-center gap-2">
            {formatDateLabel(date)}
            {(() => {
              const orderCount = (tabs[date]?.tiles || []).filter(t => t.type === 'order').length;
              return orderCount > 0 ? (
                <span className="px-1.5 py-0.5 text-xs rounded bg-background/20" title="Количество нарядов">
                  {orderCount}
                </span>
              ) : null;
            })()}
          </span>
          {date !== today && (currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
            <XMarkIcon
              onClick={(e) => handleDeleteTab(date, e)}
              className="w-4 h-4 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
            />
          )}
        </button>
      ))}
      
      {(currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
      <div className="flex items-center gap-2 ml-2">
        <input
          type="date"
          value={customDate}
          onChange={e => setCustomDate(e.target.value)}
          className="px-2 py-1 rounded bg-input border border-border text-sm focus:border-primary outline-none"
        />
        <button
          onClick={handleAddCustomDate}
          disabled={!customDate}
          className="p-1.5 rounded bg-muted hover:bg-muted/80 disabled:opacity-50 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>
      )}
    </div>
  );
};

// ============ MAIN APP ============
const App: React.FC = () => {
  const { currentUser, loadState, enableBrigadeMerge, toggleBrigadeMerge } = useStore();
  const [isRestoring, setIsRestoring] = useState(true);
  
  // На загрузке приложения пытаемся восстановить сессию из localStorage
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('authToken');
      if (token && !currentUser) {
        try {
          // Пытаемся получить информацию о текущем пользователе
          const response = await fetch(`${getApiUrl().replace('/api', '')}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            const user = {
              id: data.userId,
              login: data.login,
              role: data.role
            };
            useStore.setState({ currentUser: user });
          } else if (response.status === 401) {
            // Токен невалиден, удаляем его
            localStorage.removeItem('authToken');
          }
          // Для других ошибок (500, сеть и т.д.) оставляем токен, возможно сервер временно недоступен
        } catch (err) {
          // Ошибка сети - оставляем токен, попробуем позже
          console.warn('Failed to restore session:', err);
        }
      }
      setIsRestoring(false);
    };
    
    restoreSession();
  }, []);
  
  useEffect(() => {
    if (currentUser && !isRestoring) {
      loadState().finally(() => startRealtime());
      const onVis = () => {
        if (document.visibilityState === 'visible') void catchUpRealtime();
      };
      const onOnline = () => void catchUpRealtime();
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('online', onOnline);
      return () => {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('online', onOnline);
        stopRealtime();
      };
    }
  }, [currentUser, loadState, isRestoring]);
  
  if (isRestoring) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Восстановление сессии...</p>
        </div>
      </div>
    );
  }
  
  if (!currentUser) {
    return <LoginPage />;
  }
  
  return <Canvas />;
};

export default App;
