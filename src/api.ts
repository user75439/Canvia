// Динамический API URL - использует текущий хост
export const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const hostname = window.location.hostname;
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.\d+\.\d+\.\d+$/.test(hostname);
  if (!isLocal) {
    // Туннель/внешний домен: тот же origin через vite proxy (/api -> :5000),
    // т.к. порт 5000 снаружи недоступен
    return '/api';
  }
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:5000/api`;
};

const API_URL = getApiUrl();

// ============ TOKEN MANAGEMENT ============
const getToken = () => localStorage.getItem('authToken');
const setToken = (token: string) => localStorage.setItem('authToken', token);
const removeToken = () => localStorage.removeItem('authToken');

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = getToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeToken();
    window.location.href = '/';
  }

  return response;
};

// ============ AUTH ENDPOINTS ============
export const authAPI = {
  async login(login: string, password: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    if (!res.ok) {
      const error = await res.json();
      // Сервер возвращает { error: { code: '...', message: '...' } }
      throw error.error?.message || error.message || 'Неверный логин или пароль';
    }
    const data = await res.json();
    if (data.token) {
      setToken(data.token);
    }
    return data;
  },

  async verify() {
    const res = await fetchWithAuth(`${API_URL}/auth/verify`, {
      method: 'POST',
    });
    if (!res.ok) {
      removeToken();
      return null;
    }
    const data = await res.json();
    return data?.success ? { id: data.id, login: data.login, role: data.role } : null;
  },

  async register(login: string, password: string, roleOrIsAdmin: string | boolean = 'user') {
    const role =
      typeof roleOrIsAdmin === 'boolean'
        ? (roleOrIsAdmin ? 'admin' : 'user')
        : (roleOrIsAdmin || 'user');
    const res = await fetchWithAuth(`${API_URL}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ login, password, role }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message || 'Ошибка регистрации');
    }
    return await res.json();
  },

  async getUsers() {
    const res = await fetchWithAuth(`${API_URL}/auth/users`);
    if (!res.ok) throw new Error('Ошибка загрузки пользователей');
    const data = await res.json();
    return data.users;
  },

  async deleteUser(id: string) {
    const res = await fetchWithAuth(`${API_URL}/auth/users/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message || 'Ошибка удаления пользователя');
    }
  },

  async updateUserRole(id: string, role: string) {
    const res = await fetchWithAuth(`${API_URL}/auth/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message || 'Ошибка изменения роли');
    }
    return await res.json();
  },

  async updateUserPassword(id: string, password: string) {
    const res = await fetchWithAuth(`${API_URL}/auth/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message || 'Ошибка изменения пароля');
    }
    return await res.json();
  },

  logout() {
    removeToken();
  },
};

// ============ INSTALLER ENDPOINTS ============
export const installerAPI = {
  async getAll() {
    const res = await fetchWithAuth(`${API_URL}/data/installers`);
    if (!res.ok) throw new Error('Ошибка загрузки установщиков');
    return await res.json();
  },

  async create(name: string, phone: string, status: string = 'free') {
    const res = await fetchWithAuth(`${API_URL}/data/installers`, {
      method: 'POST',
      body: JSON.stringify({ name, phone, status }),
    });
    if (!res.ok) throw new Error('Ошибка создания установщика');
    return await res.json();
  },

  async update(id: string, updates: any) {
    const res = await fetchWithAuth(`${API_URL}/data/installers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Ошибка обновления установщика');
    return await res.json();
  },

  async delete(id: string) {
    const res = await fetchWithAuth(`${API_URL}/data/installers/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Ошибка удаления установщика');
    return await res.json();
  },
};

// ============ ORDER ENDPOINTS ============
export const orderAPI = {
  async getAll() {
    const res = await fetchWithAuth(`${API_URL}/data/orders`);
    if (!res.ok) throw new Error('Ошибка загрузки заказов');
    return await res.json();
  },

  async create(number: string, address: string, description: string, deadline: string, status: string = 'new', shift: string = 'day', workDone: string = '') {
    const res = await fetchWithAuth(`${API_URL}/data/orders`, {
      method: 'POST',
      body: JSON.stringify({ number, address, description, deadline, status, shift, workDone }),
    });
    if (!res.ok) throw new Error('Ошибка создания заказа');
    return await res.json();
  },

  async update(id: string, updates: any) {
    const res = await fetchWithAuth(`${API_URL}/data/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Ошибка обновления заказа');
    return await res.json();
  },

  async delete(id: string) {
    const res = await fetchWithAuth(`${API_URL}/data/orders/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Ошибка удаления заказа');
    return await res.json();
  },
};

// ============ CANVAS ENDPOINTS ============
export const canvasAPI = {
  // Tiles
  async getTiles(tabId?: string) {
    const url = tabId ? `${API_URL}/canvas/tiles?tabId=${tabId}` : `${API_URL}/canvas/tiles`;
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Ошибка загрузки плиток');
    return await res.json();
  },

  async createTile(tile: any) {
    const res = await fetchWithAuth(`${API_URL}/canvas/tiles`, {
      method: 'POST',
      body: JSON.stringify(tile),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error('Ошибка создания плитки: ' + errorText);
    }
    return await res.json();
  },

  async updateTile(id: string, x: number, y: number) {
    const res = await fetchWithAuth(`${API_URL}/canvas/tiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ x, y }),
    });
    if (!res.ok) throw new Error('Ошибка обновления плитки');
    return await res.json();
  },

  async deleteTile(id: string) {
    const res = await fetchWithAuth(`${API_URL}/canvas/tiles/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Ошибка удаления плитки');
    return await res.json();
  },

  // Connections
  async getConnections(tabId?: string) {
    const url = tabId ? `${API_URL}/canvas/connections?tabId=${tabId}` : `${API_URL}/canvas/connections`;
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Ошибка загрузки связей');
    return await res.json();
  },

  async createConnection(connection: { id: string; fromTileId: string; toTileId: string; tabId: string }) {
    const res = await fetchWithAuth(`${API_URL}/canvas/connections`, {
      method: 'POST',
      body: JSON.stringify(connection),
    });
    if (!res.ok) throw new Error('Ошибка создания связи');
    return await res.json();
  },

  async deleteConnection(id: string) {
    const res = await fetchWithAuth(`${API_URL}/canvas/connections/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Ошибка удаления связи');
    return await res.json();
  },

  // Tab States
  async getTabsData() {
    const res = await fetchWithAuth(`${API_URL}/canvas/tabs`);
    if (!res.ok) throw new Error('Ошибка загрузки вкладок');
    return await res.json();
  },

  async createTab(date: string) {
    const res = await fetchWithAuth(`${API_URL}/canvas/tabs`, {
      method: 'POST',
      body: JSON.stringify({ date }),
    });
    if (!res.ok) throw new Error('Ошибка создания вкладки');
    return await res.json();
  },

  async deleteTab(date: string) {
    const res = await fetchWithAuth(`${API_URL}/canvas/tabs/${encodeURIComponent(date)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Ошибка удаления вкладки');
    return await res.json();
  },
};

// ============ BRIGADE ENDPOINTS ============
export const brigadeAPI = {
  async getAll() {
    const res = await fetchWithAuth(`${API_URL}/brigades`);
    if (!res.ok) throw new Error('Ошибка загрузки бригад');
    return await res.json();
  },

  async create(name: string, color: string, members: string[]) {
    const res = await fetchWithAuth(`${API_URL}/brigades`, {
      method: 'POST',
      body: JSON.stringify({ name, color, members }),
    });
    if (!res.ok) throw new Error('Ошибка создания бригады');
    return await res.json();
  },

  async update(id: string, updates: any) {
    const res = await fetchWithAuth(`${API_URL}/brigades/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Ошибка обновления бригады');
    return await res.json();
  },

  async delete(id: string) {
    const res = await fetchWithAuth(`${API_URL}/brigades/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Ошибка удаления бригады');
    return await res.json();
  },

  async findOrCreate(installerIds: string[]) {
    const res = await fetchWithAuth(`${API_URL}/brigades/find-or-create`, {
      method: 'POST',
      body: JSON.stringify({ installerIds }),
    });
    if (!res.ok) throw new Error('Ошибка поиска бригады');
    const data = await res.json();
    return data;
  },

  async addMember(brigadeId: string, installerId: string) {
    const res = await fetchWithAuth(`${API_URL}/brigades/${brigadeId}/members`, {
      method: 'POST',
      body: JSON.stringify({ installerId }),
    });
    if (!res.ok) throw new Error('Ошибка добавления монтажника в бригаду');
    return await res.json();
  },
};

// ============ GROUP ENDPOINTS ============
export const groupAPI = {
  async getAll(tabId: string) {
    const res = await fetchWithAuth(`${API_URL}/canvas/groups/${encodeURIComponent(tabId)}`);
    if (!res.ok) throw new Error('Ошибка загрузки групп');
    return await res.json();
  },

  async create(tabId: string, name: string, x: number, y: number, width: number, height: number, color: string, tileIds: string[]) {
    const res = await fetchWithAuth(`${API_URL}/canvas/groups`, {
      method: 'POST',
      body: JSON.stringify({ tabId, name, x, y, width, height, color, tileIds }),
    });
    if (!res.ok) throw new Error('Ошибка создания группы');
    return await res.json();
  },

  async update(id: string, updates: { name?: string; x?: number; y?: number; width?: number; height?: number; color?: string }) {
    const res = await fetchWithAuth(`${API_URL}/canvas/groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Ошибка обновления группы');
    return await res.json();
  },

  async delete(id: string) {
    const res = await fetchWithAuth(`${API_URL}/canvas/groups/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Ошибка удаления группы');
    return await res.json();
  },

  async addTile(groupId: string, tileId: string) {
    const res = await fetchWithAuth(`${API_URL}/canvas/groups/${encodeURIComponent(groupId)}/tiles`, {
      method: 'POST',
      body: JSON.stringify({ tileId }),
    });
    if (!res.ok) throw new Error('Ошибка добавления плитки в группу');
    return await res.json();
  },

  async removeTile(groupId: string, tileId: string) {
    const res = await fetchWithAuth(`${API_URL}/canvas/groups/${encodeURIComponent(groupId)}/tiles/${encodeURIComponent(tileId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Ошибка удаления плитки из группы');
    return await res.json();
  },
};
