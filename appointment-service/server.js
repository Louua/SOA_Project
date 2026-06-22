const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const PROTO_PATH = path.join(__dirname, '../shared/protos/appointment.proto');
const PORT = process.env.PORT || '50052';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const clinicProto = grpc.loadPackageDefinition(packageDefinition).clinic;

const server = new grpc.Server();

server.addService(clinicProto.AppointmentService.service, {
  createAppointment: async (call, callback) => {
    try {
      const id = 'a_' + crypto.randomBytes(4).toString('hex');
      const { doctor_id, patient_id, date, time } = call.request;
      
      const newAppt = await db.createAppointment(id, doctor_id, patient_id, date, time);
      callback(null, newAppt);
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, details: err.message });
    }
  },
  cancelAppointment: async (call, callback) => {
    try {
      const { id } = call.request;
      const cancelled = await db.cancelAppointment(id);
      if (cancelled) {
        callback(null, { success: true, message: 'Appointment cancelled successfully' });
      } else {
        callback({
          code: grpc.status.NOT_FOUND,
          details: `Appointment with ID: ${id} not found`
        });
      }
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, details: err.message });
    }
  },
  getAppointmentsByDoctor: async (call, callback) => {
    try {
      const { doctor_id } = call.request;
      const doctor = await db.getDoctorById(doctor_id);
      if (!doctor) {
        return callback({
          code: grpc.status.NOT_FOUND,
          details: `Doctor with ID: ${doctor_id} not found`
        });
      }

      const appointments = await db.getAppointmentsByDoctor(doctor_id);
      callback(null, {
        doctor_name: doctor.name,
        appointments: appointments.map(a => ({
          id: a.id,
          doctor_id: a.doctor_id,
          patient_id: a.patient_id,
          date: a.date,
          time: a.time,
          status: a.status
        }))
      });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, details: err.message });
    }
  },
  getAllAppointments: async (call, callback) => {
    try {
      const appointments = await db.getAllAppointments();
      callback(null, {
        appointments: appointments.map(a => ({
          id: a.id,
          doctor_id: a.doctor_id,
          patient_id: a.patient_id,
          date: a.date,
          time: a.time,
          status: a.status
        }))
      });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, details: err.message });
    }
  }
});

server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('Failed to bind Appointment-Service:', err);
  } else {
    console.log(`[Appointment-Service] Running on gRPC port ${port}`);
  }
});
