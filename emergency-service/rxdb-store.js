const { createRxDatabase } = require('rxdb');
const { getRxStorageMemory } = require('rxdb/plugins/storage-memory');

const alertSchema = {
  title: 'alerts schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    patient_id: { type: 'string' },
    patient_name: { type: 'string' },
    heart_rate: { type: 'integer' },
    temperature: { type: 'number' },
    severity: { type: 'string' },
    timestamp: { type: 'string' },
    message: { type: 'string' }
  },
  required: ['id', 'patient_id', 'patient_name', 'heart_rate', 'temperature', 'severity', 'timestamp', 'message']
};

let dbPromise = null;

async function getDatabase() {
  if (!dbPromise) {
    dbPromise = createRxDatabase({
      name: 'emergency_db',
      storage: getRxStorageMemory()
    }).then(async (db) => {
      await db.addCollections({
        alerts: {
          schema: alertSchema
        }
      });
      console.log('[RxDB] Emergency DB initialized successfully');
      return db;
    });
  }
  return dbPromise;
}

async function insertAlert(alert) {
  const db = await getDatabase();
  await db.alerts.insert(alert);
}

async function getAllAlerts() {
  const db = await getDatabase();
  const docs = await db.alerts.find().exec();
  return docs.map(doc => doc.toJSON());
}

module.exports = {
  getDatabase,
  insertAlert,
  getAllAlerts
};
