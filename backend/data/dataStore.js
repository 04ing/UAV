const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STORE_DIR = path.join(DATA_DIR, 'store');

const STORE_FILES = {
  drones: 'drones.json',
  alarms: 'alarms.json',
  workOrders: 'workOrders.json',
  inspectionPlans: 'inspectionPlans.json',
  auditLogs: 'auditLogs.json',
  geoFences: 'geoFences.json',
  users: 'users.json'
};

function ensureStoreDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function loadFile(fileName, defaultValue) {
  ensureStoreDir();
  const filePath = path.join(STORE_DIR, fileName);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`[dataStore] Failed to load ${fileName}:`, err.message);
  }
  if (defaultValue !== undefined) {
    saveFile(fileName, defaultValue);
    return defaultValue;
  }
  return [];
}

function saveFile(fileName, data) {
  ensureStoreDir();
  const filePath = path.join(STORE_DIR, fileName);
  try {
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`[dataStore] Failed to save ${fileName}:`, err.message);
    return false;
  }
}

const DataStore = {
  drones: {
    getAll: () => loadFile(STORE_FILES.drones, []),
    getById: (id) => DataStore.drones.getAll().find(d => d.id === id),
    add: (drone) => {
      const drones = DataStore.drones.getAll();
      drones.push(drone);
      saveFile(STORE_FILES.drones, drones);
      return drone;
    },
    update: (id, updates) => {
      const drones = DataStore.drones.getAll();
      const idx = drones.findIndex(d => d.id === id);
      if (idx < 0) return null;
      drones[idx] = { ...drones[idx], ...updates };
      saveFile(STORE_FILES.drones, drones);
      return drones[idx];
    },
    delete: (id) => {
      const drones = DataStore.drones.getAll();
      const idx = drones.findIndex(d => d.id === id);
      if (idx < 0) return null;
      const removed = drones.splice(idx, 1)[0];
      saveFile(STORE_FILES.drones, drones);
      return removed;
    },
    clear: () => saveFile(STORE_FILES.drones, [])
  },

  alarms: {
    getAll: () => loadFile(STORE_FILES.alarms, []),
    getById: (id) => DataStore.alarms.getAll().find(a => a.id === id),
    add: (alarm) => {
      const alarms = DataStore.alarms.getAll();
      alarms.unshift(alarm);
      saveFile(STORE_FILES.alarms, alarms);
      return alarm;
    },
    update: (id, updates) => {
      const alarms = DataStore.alarms.getAll();
      const idx = alarms.findIndex(a => a.id === id);
      if (idx < 0) return null;
      alarms[idx] = { ...alarms[idx], ...updates };
      saveFile(STORE_FILES.alarms, alarms);
      return alarms[idx];
    },
    delete: (id) => {
      const alarms = DataStore.alarms.getAll();
      const idx = alarms.findIndex(a => a.id === id);
      if (idx < 0) return null;
      const removed = alarms.splice(idx, 1)[0];
      saveFile(STORE_FILES.alarms, alarms);
      return removed;
    },
    clear: () => saveFile(STORE_FILES.alarms, [])
  },

  workOrders: {
    getAll: () => loadFile(STORE_FILES.workOrders, []),
    getById: (id) => DataStore.workOrders.getAll().find(w => w.id === id),
    add: (order) => {
      const orders = DataStore.workOrders.getAll();
      orders.unshift(order);
      saveFile(STORE_FILES.workOrders, orders);
      return order;
    },
    update: (id, updates) => {
      const orders = DataStore.workOrders.getAll();
      const idx = orders.findIndex(w => w.id === id);
      if (idx < 0) return null;
      orders[idx] = { ...orders[idx], ...updates };
      saveFile(STORE_FILES.workOrders, orders);
      return orders[idx];
    },
    delete: (id) => {
      const orders = DataStore.workOrders.getAll();
      const idx = orders.findIndex(w => w.id === id);
      if (idx < 0) return null;
      const removed = orders.splice(idx, 1)[0];
      saveFile(STORE_FILES.workOrders, orders);
      return removed;
    },
    clear: () => saveFile(STORE_FILES.workOrders, [])
  },

  inspectionPlans: {
    getAll: () => loadFile(STORE_FILES.inspectionPlans, []),
    getById: (id) => DataStore.inspectionPlans.getAll().find(p => p.id === id),
    add: (plan) => {
      const plans = DataStore.inspectionPlans.getAll();
      plans.push(plan);
      saveFile(STORE_FILES.inspectionPlans, plans);
      return plan;
    },
    update: (id, updates) => {
      const plans = DataStore.inspectionPlans.getAll();
      const idx = plans.findIndex(p => p.id === id);
      if (idx < 0) return null;
      plans[idx] = { ...plans[idx], ...updates };
      saveFile(STORE_FILES.inspectionPlans, plans);
      return plans[idx];
    },
    delete: (id) => {
      const plans = DataStore.inspectionPlans.getAll();
      const idx = plans.findIndex(p => p.id === id);
      if (idx < 0) return null;
      const removed = plans.splice(idx, 1)[0];
      saveFile(STORE_FILES.inspectionPlans, plans);
      return removed;
    },
    clear: () => saveFile(STORE_FILES.inspectionPlans, [])
  },

  auditLogs: {
    getAll: () => loadFile(STORE_FILES.auditLogs, []),
    add: (log) => {
      const logs = DataStore.auditLogs.getAll();
      logs.unshift(log);
      if (logs.length > 1000) logs.pop();
      saveFile(STORE_FILES.auditLogs, logs);
      return log;
    },
    clear: () => saveFile(STORE_FILES.auditLogs, [])
  },

  geoFences: {
    getAll: () => loadFile(STORE_FILES.geoFences, []),
    getById: (id) => DataStore.geoFences.getAll().find(f => f.id === id),
    add: (fence) => {
      const fences = DataStore.geoFences.getAll();
      fences.push(fence);
      saveFile(STORE_FILES.geoFences, fences);
      return fence;
    },
    delete: (id) => {
      const fences = DataStore.geoFences.getAll();
      const idx = fences.findIndex(f => f.id === id);
      if (idx < 0) return null;
      const removed = fences.splice(idx, 1)[0];
      saveFile(STORE_FILES.geoFences, fences);
      return removed;
    },
    clear: () => saveFile(STORE_FILES.geoFences, [])
  },

  users: {
    getAll: () => loadFile(STORE_FILES.users, []),
    getById: (id) => DataStore.users.getAll().find(u => u.id === id),
    getByUsername: (username) => DataStore.users.getAll().find(u => u.username === username),
    add: (user) => {
      const users = DataStore.users.getAll();
      users.push(user);
      saveFile(STORE_FILES.users, users);
      return user;
    },
    clear: () => saveFile(STORE_FILES.users, [])
  },

  initFromMock: (mockData) => {
    if (!mockData) return;
    if (DataStore.drones.getAll().length === 0 && mockData.getDrones) {
      saveFile(STORE_FILES.drones, mockData.getDrones());
    }
    if (DataStore.alarms.getAll().length === 0 && mockData.getAlarms) {
      saveFile(STORE_FILES.alarms, mockData.getAlarms());
    }
    if (DataStore.workOrders.getAll().length === 0 && mockData.getWorkOrders) {
      saveFile(STORE_FILES.workOrders, mockData.getWorkOrders());
    }
    if (DataStore.inspectionPlans.getAll().length === 0 && mockData.getInspectionPlans) {
      saveFile(STORE_FILES.inspectionPlans, mockData.getInspectionPlans());
    }
    if (DataStore.auditLogs.getAll().length === 0 && mockData.getAuditLogs) {
      saveFile(STORE_FILES.auditLogs, mockData.getAuditLogs());
    }
    if (DataStore.geoFences.getAll().length === 0 && mockData.getGeoFences) {
      saveFile(STORE_FILES.geoFences, mockData.getGeoFences());
    }
    if (DataStore.users.getAll().length === 0 && mockData.getUsers) {
      saveFile(STORE_FILES.users, mockData.getUsers());
    }
  },

  resetAll: () => {
    Object.values(STORE_FILES).forEach(file => {
      const filePath = path.join(STORE_DIR, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  }
};

module.exports = DataStore;