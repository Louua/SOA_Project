const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'appointment.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to appointment database', err);
  } else {
    console.log('[Appointment DB] Connected to SQLite3 database');
  }
});

db.serialize(() => {
  // Create Doctors table
  db.run(`
    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT
    )
  `);

  // Create Appointments table
  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      doctor_id TEXT,
      patient_id TEXT,
      date TEXT,
      time TEXT,
      status TEXT DEFAULT 'SCHEDULED',
      FOREIGN KEY(doctor_id) REFERENCES doctors(id)
    )
  `);

  // Seed doctors and appointments if empty
  db.get("SELECT COUNT(*) as count FROM doctors", [], (err, row) => {
    if (!err && row.count === 0) {
      console.log('[Appointment DB] Seeding database with initial doctors and appointments...');
      
      const docStmt = db.prepare("INSERT INTO doctors (id, name, specialty) VALUES (?, ?, ?)");
      docStmt.run("d1", "Dr. Gregory House", "Néphrologie & Diagnostic");
      docStmt.run("d2", "Dr. Meredith Grey", "Chirurgie Générale");
      docStmt.finalize();

      const apptStmt = db.prepare("INSERT INTO appointments (id, doctor_id, patient_id, date, time, status) VALUES (?, ?, ?, ?, ?, ?)");
      const today = new Date().toISOString().split('T')[0];
      apptStmt.run("a1", "d1", "p1", today, "09:00", "SCHEDULED");
      apptStmt.run("a2", "d1", "p2", today, "10:30", "SCHEDULED");
      apptStmt.run("a3", "d2", "p3", today, "14:00", "SCHEDULED");
      apptStmt.finalize();
    }
  });
});

module.exports = {
  db,
  getDoctorById: (id) => {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM doctors WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  createAppointment: (id, doctorId, patientId, date, time) => {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO appointments (id, doctor_id, patient_id, date, time, status) VALUES (?, ?, ?, ?, ?, 'SCHEDULED')",
        [id, doctorId, patientId, date, time],
        function(err) {
          if (err) reject(err);
          else resolve({ id, doctor_id: doctorId, patient_id: patientId, date, time, status: 'SCHEDULED' });
        }
      );
    });
  },
  cancelAppointment: (id) => {
    return new Promise((resolve, reject) => {
      db.run("UPDATE appointments SET status = 'CANCELLED' WHERE id = ?", [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  },
  getAppointmentsByDoctor: (doctorId) => {
    const today = new Date().toISOString().split('T')[0];
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND status != 'CANCELLED'",
        [doctorId, today],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },
  getAllAppointments: () => {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM appointments",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }
};
