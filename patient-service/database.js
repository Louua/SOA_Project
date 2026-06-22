const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'patient.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('[Patient DB] Connected to SQLite3 database');
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      medical_history TEXT,
      heart_rate INTEGER DEFAULT 80,
      temperature REAL DEFAULT 37.0
    )
  `);

  // Seed data if empty
  db.get("SELECT COUNT(*) as count FROM patients", [], (err, row) => {
    if (!err && row.count === 0) {
      console.log('[Patient DB] Seeding database with initial patients...');
      const stmt = db.prepare("INSERT INTO patients (id, name, medical_history, heart_rate, temperature) VALUES (?, ?, ?, ?, ?)");
      stmt.run("p1", "Alice Smith", "Asthme, Hypertension", 75, 36.8);
      stmt.run("p2", "Bob Johnson", "Diabète Type 2", 82, 37.2);
      stmt.run("p3", "Charlie Brown", "Antécédents cardiaques", 90, 36.5);
      stmt.finalize();
    }
  });
});

module.exports = {
  db,
  getPatientById: (id) => {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM patients WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  createPatient: (id, name, medicalHistory) => {
    return new Promise((resolve, reject) => {
      db.run("INSERT INTO patients (id, name, medical_history) VALUES (?, ?, ?)", [id, name, medicalHistory], function(err) {
        if (err) reject(err);
        else resolve({ id, name, medical_history: medicalHistory, heart_rate: 80, temperature: 37.0 });
      });
    });
  },
  updateVitals: (id, heartRate, temperature) => {
    return new Promise((resolve, reject) => {
      db.run("UPDATE patients SET heart_rate = ?, temperature = ? WHERE id = ?", [heartRate, temperature, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  },
  getAllPatients: () => {
    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM patients", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
};
