const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const crypto = require('crypto');
const db = require('./rxdb-store');
const { initConsumer } = require('../shared/kafka-helper');

const PROTO_PATH = path.join(__dirname, '../shared/protos/emergency.proto');
const PORT = process.env.PORT || '50053';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const clinicProto = grpc.loadPackageDefinition(packageDefinition).clinic;

function analyzeVitals(patient_id, patient_name, heart_rate, temperature) {
  let isAbnormal = false;
  let severity = 'NORMAL';
  let messages = [];

  if (heart_rate > 120) {
    isAbnormal = true;
    severity = 'CRITICAL';
    messages.push(`Tachycardie sévère: ${heart_rate} bpm (seuil: 120)`);
  } else if (heart_rate < 50) {
    isAbnormal = true;
    severity = 'CRITICAL';
    messages.push(`Bradycardie sévère: ${heart_rate} bpm (seuil: 50)`);
  }

  if (temperature > 39.0) {
    isAbnormal = true;
    severity = severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
    messages.push(`Fièvre élevée: ${temperature}°C (seuil: 39°C)`);
  } else if (temperature < 35.0) {
    isAbnormal = true;
    severity = 'CRITICAL';
    messages.push(`Hypothermie sévère: ${temperature}°C (seuil: 35°C)`);
  }

  return {
    isAbnormal,
    severity,
    message: messages.join(' | ')
  };
}

async function startServer() {
  // Initialize Database
  await db.getDatabase();

  // Subscribe to patient vital updates
  await initConsumer('patient-vitals-updated', async (event) => {
    console.log('[Emergency Service] Received vitals update event:', event);
    const { patient_id, patient_name, heart_rate, temperature, timestamp } = event;
    const analysis = analyzeVitals(patient_id, patient_name, heart_rate, temperature);

    if (analysis.isAbnormal) {
      const alert = {
        id: 'alt_' + crypto.randomBytes(4).toString('hex'),
        patient_id,
        patient_name,
        heart_rate,
        temperature,
        severity: analysis.severity,
        timestamp: timestamp || new Date().toISOString(),
        message: analysis.message
      };

      console.log(`[Emergency Service] ALERT DETECTED: ${analysis.message}`);
      await db.insertAlert(alert);
    }
  });

  const server = new grpc.Server();

  server.addService(clinicProto.EmergencyService.service, {
    getActiveAlerts: async (call, callback) => {
      try {
        const alerts = await db.getAllAlerts();
        callback(null, { alerts });
      } catch (err) {
        callback({ code: grpc.status.INTERNAL, details: err.message });
      }
    }
  });

  server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Failed to bind Emergency-Service:', err);
    } else {
      console.log(`[Emergency-Service] Running on gRPC port ${port}`);
    }
  });
}

startServer().catch(console.error);
