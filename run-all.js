const { fork } = require('child_process');
const path = require('path');
const { SimpleBroker } = require('./shared/simple-broker');

// 1. Start the simple TCP broker fallback
const broker = new SimpleBroker(9099);
broker.start();

const services = [
  { name: 'Patient-Service', file: './patient-service/server.js', port: 50051 },
  { name: 'Appointment-Service', file: './appointment-service/server.js', port: 50052 },
  { name: 'Emergency-Service', file: './emergency-service/server.js', port: 50053 },
  { name: 'API-Gateway', file: './api-gateway/gateway.js', port: 3000 }
];

const processes = [];

console.log('[Runner] Starting SmartClinic microservices...');

services.forEach(svc => {
  const child = fork(path.resolve(svc.file), [], {
    env: {
      ...process.env,
      PORT: svc.port,
      USE_KAFKA: 'false' // Use our SimpleBroker TCP fallback
    },
    silent: true
  });

  processes.push({ child, name: svc.name });

  child.stdout.on('data', (data) => {
    console.log(`[\x1b[36m${svc.name}\x1b[0m] ${data.toString().trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`[\x1b[31m${svc.name} ERROR\x1b[0m] ${data.toString().trim()}`);
  });

  child.on('close', (code) => {
    console.log(`[Runner] ${svc.name} exited with code ${code}`);
  });
});

process.on('SIGINT', () => {
  console.log('[Runner] Shutting down all services...');
  processes.forEach(p => p.child.kill());
  process.exit();
});
