const express = require('express');
const cors = require('cors');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { ApolloServer, gql } = require('apollo-server-express');

// Express application setup
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || '3000';
const PATIENT_SVC_URL = process.env.PATIENT_SVC_URL || 'localhost:50051';
const APPOINTMENT_SVC_URL = process.env.APPOINTMENT_SVC_URL || 'localhost:50052';
const EMERGENCY_SVC_URL = process.env.EMERGENCY_SVC_URL || 'localhost:50053';

// Load Protobufs & Setup gRPC Clients
function getGrpcClient(protoFileName, serviceName, url) {
  const PROTO_PATH = path.join(__dirname, '../shared/protos', protoFileName);
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const proto = grpc.loadPackageDefinition(packageDefinition).clinic;
  return new proto[serviceName](url, grpc.credentials.createInsecure());
}

const patientClient = getGrpcClient('patient.proto', 'PatientService', PATIENT_SVC_URL);
const appointmentClient = getGrpcClient('appointment.proto', 'AppointmentService', APPOINTMENT_SVC_URL);
const emergencyClient = getGrpcClient('emergency.proto', 'EmergencyService', EMERGENCY_SVC_URL);

// --- REST ROUTES ---
// POST /api/patients
app.post('/api/patients', (req, res) => {
  const { name, medical_history } = req.body;
  patientClient.createPatient({ name, medical_history }, (err, response) => {
    if (err) return res.status(500).json({ error: err.details || err.message });
    res.status(201).json(response);
  });
});

// GET /api/patients/:id
app.get('/api/patients/:id', (req, res) => {
  const { id } = req.params;
  patientClient.getPatientById({ id }, (err, response) => {
    if (err) {
      if (err.code === grpc.status.NOT_FOUND) return res.status(404).json({ error: err.details });
      return res.status(500).json({ error: err.details || err.message });
    }
    res.json(response);
  });
});

// POST /api/appointments
app.post('/api/appointments', (req, res) => {
  const { doctor_id, patient_id, date, time } = req.body;
  appointmentClient.createAppointment({ doctor_id, patient_id, date, time }, (err, response) => {
    if (err) return res.status(500).json({ error: err.details || err.message });
    res.status(201).json(response);
  });
});

// DELETE /api/appointments/:id
app.delete('/api/appointments/:id', (req, res) => {
  const { id } = req.params;
  appointmentClient.cancelAppointment({ id }, (err, response) => {
    if (err) {
      if (err.code === grpc.status.NOT_FOUND) return res.status(404).json({ error: err.details });
      return res.status(500).json({ error: err.details || err.message });
    }
    res.json(response);
  });
});

// GET /api/patients
app.get('/api/patients', (req, res) => {
  patientClient.getAllPatients({}, (err, response) => {
    if (err) return res.status(500).json({ error: err.details || err.message });
    res.json(response.patients || []);
  });
});

// GET /api/appointments
app.get('/api/appointments', (req, res) => {
  appointmentClient.getAllAppointments({}, (err, response) => {
    if (err) return res.status(500).json({ error: err.details || err.message });
    res.json(response.appointments || []);
  });
});

// GET /api/alerts
app.get('/api/alerts', (req, res) => {
  emergencyClient.getActiveAlerts({}, (err, response) => {
    if (err) return res.status(500).json({ error: err.details || err.message });
    res.json(response.alerts || []);
  });
});

// Serve frontend client
app.use(express.static(path.join(__dirname, 'public')));

// --- GRAPHQL SERVER SETUP ---
const typeDefs = gql`
  type Patient {
    id: ID!
    name: String!
    medical_history: String
    heart_rate: Int
    temperature: Float
  }

  type Appointment {
    id: ID!
    doctor_id: ID!
    patient_id: ID!
    date: String!
    time: String!
    status: String!
    patient: Patient
  }

  type DoctorDashboard {
    doctor_name: String!
    appointments: [Appointment!]!
  }

  type UpdateVitalsResponse {
    success: Boolean!
    message: String!
  }

  type Alert {
    id: ID!
    patient_id: ID!
    patient_name: String!
    heart_rate: Int!
    temperature: Float!
    severity: String!
    timestamp: String!
    message: String!
  }

  type Query {
    getDoctorDashboard(doctorId: ID!): DoctorDashboard!
    getActiveAlerts: [Alert!]!
    getAllPatients: [Patient!]!
    getAllAppointments: [Appointment!]!
  }

  type Mutation {
    updateVitals(patientId: ID!, heartRate: Int!, temperature: Float!): UpdateVitalsResponse!
  }
`;

const resolvers = {
  Query: {
    getDoctorDashboard: async (_, { doctorId }) => {
      return new Promise((resolve, reject) => {
        appointmentClient.getAppointmentsByDoctor({ doctor_id: doctorId }, async (err, response) => {
          if (err) return reject(new Error(err.details || err.message));

          // Populate patient details for each appointment in parallel
          const appointmentsWithPatients = await Promise.all(
            response.appointments.map(async (appt) => {
              try {
                const patient = await new Promise((resPat, rejPat) => {
                  patientClient.getPatientById({ id: appt.patient_id }, (pErr, pRes) => {
                    if (pErr) resPat(null);
                    else resPat(pRes);
                  });
                });
                return { ...appt, patient };
              } catch (e) {
                return { ...appt, patient: null };
              }
            })
          );

          resolve({
            doctor_name: response.doctor_name,
            appointments: appointmentsWithPatients
          });
        });
      });
    },
    getActiveAlerts: async () => {
      return new Promise((resolve, reject) => {
        emergencyClient.getActiveAlerts({}, (err, response) => {
          if (err) return reject(new Error(err.details || err.message));
          resolve(response.alerts || []);
        });
      });
    },
    getAllPatients: async () => {
      return new Promise((resolve, reject) => {
        patientClient.getAllPatients({}, (err, response) => {
          if (err) return reject(new Error(err.details || err.message));
          resolve(response.patients || []);
        });
      });
    },
    getAllAppointments: async () => {
      return new Promise((resolve, reject) => {
        appointmentClient.getAllAppointments({}, (err, response) => {
          if (err) return reject(new Error(err.details || err.message));
          resolve(response.appointments || []);
        });
      });
    }
  },
  Mutation: {
    updateVitals: async (_, { patientId, heartRate, temperature }) => {
      return new Promise((resolve, reject) => {
        patientClient.updatePatientVitals({
          patient_id: patientId,
          heart_rate: heartRate,
          temperature: temperature
        }, (err, response) => {
          if (err) return reject(new Error(err.details || err.message));
          resolve({
            success: response.success,
            message: response.message
          });
        });
      });
    }
  }
};

const server = new ApolloServer({ typeDefs, resolvers });

async function startGateway() {
  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  app.listen(PORT, () => {
    console.log(`[API-Gateway] REST server running on http://localhost:${PORT}`);
    console.log(`[API-Gateway] GraphQL server running on http://localhost:${PORT}/graphql`);
  });
}

startGateway().catch(console.error);
