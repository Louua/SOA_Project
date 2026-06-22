const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');
const { initProducer, publishEvent } = require('../shared/kafka-helper');

const PROTO_PATH = path.join(__dirname, '../shared/protos/patient.proto');
const PORT = process.env.PORT || '50051';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const clinicProto = grpc.loadPackageDefinition(packageDefinition).clinic;

async function startServer() {
  await initProducer();

  const server = new grpc.Server();

  server.addService(clinicProto.PatientService.service, {
    getPatientById: async (call, callback) => {
      try {
        const patient = await db.getPatientById(call.request.id);
        if (patient) {
          callback(null, patient);
        } else {
          callback({
            code: grpc.status.NOT_FOUND,
            details: `Patient not found with ID: ${call.request.id}`
          });
        }
      } catch (err) {
        callback({ code: grpc.status.INTERNAL, details: err.message });
      }
    },
    createPatient: async (call, callback) => {
      try {
        const id = 'p_' + crypto.randomBytes(4).toString('hex');
        const { name, medical_history } = call.request;
        const newPatient = await db.createPatient(id, name, medical_history);
        callback(null, newPatient);
      } catch (err) {
        callback({ code: grpc.status.INTERNAL, details: err.message });
      }
    },
    updatePatientVitals: async (call, callback) => {
      try {
        const { patient_id, heart_rate, temperature } = call.request;
        const patient = await db.getPatientById(patient_id);
        if (!patient) {
          return callback({
            code: grpc.status.NOT_FOUND,
            details: `Patient not found with ID: ${patient_id}`
          });
        }

        const updated = await db.updateVitals(patient_id, heart_rate, temperature);
        if (updated) {
          // Publish vitals updated event to Kafka/SimpleBroker
          await publishEvent('patient-vitals-updated', {
            patient_id,
            patient_name: patient.name,
            heart_rate,
            temperature,
            timestamp: new Date().toISOString()
          });

          callback(null, { success: true, message: 'Vitals updated successfully' });
        } else {
          callback(null, { success: false, message: 'No changes made' });
        }
      } catch (err) {
        callback({ code: grpc.status.INTERNAL, details: err.message });
      }
    },
    getAllPatients: async (call, callback) => {
      try {
        const patients = await db.getAllPatients();
        callback(null, { patients });
      } catch (err) {
        callback({ code: grpc.status.INTERNAL, details: err.message });
      }
    }
  });

  server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Failed to bind Patient-Service:', err);
    } else {
      console.log(`[Patient-Service] Running on gRPC port ${port}`);
    }
  });
}

startServer().catch(console.error);
