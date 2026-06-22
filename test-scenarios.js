const http = require('http');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data.trim() ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n===== STARTING SYSTEM INTEGRATION TESTS =====\n');

  try {
    // 1. Create a Patient via REST
    console.log('[Test 1] Creating new patient via REST POST /api/patients...');
    const patientRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/patients',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Sarah Connor',
      medical_history: 'Légère anémie, exposition chronique au stress'
    });
    
    console.log('Response Status:', patientRes.statusCode);
    console.log('Created Patient:', patientRes.body);
    const patientId = patientRes.body.id;

    if (!patientId) {
      throw new Error('Patient ID was not generated');
    }

    // 2. Create Appointment via REST
    console.log('\n[Test 2] Scheduling appointment via REST POST /api/appointments...');
    const today = new Date().toISOString().split('T')[0];
    const apptRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/appointments',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      doctor_id: 'd1',
      patient_id: patientId,
      date: today,
      time: '11:15'
    });
    console.log('Response Status:', apptRes.statusCode);
    console.log('Created Appointment:', apptRes.body);

    // 3. Fetch Doctor Dashboard via GraphQL
    console.log('\n[Test 3] Querying Doctor Dashboard via GraphQL...');
    const graphqlQuery = {
      query: `
        query GetDoctorDashboard($doctorId: ID!) {
          getDoctorDashboard(doctorId: $doctorId) {
            doctor_name
            appointments {
              id
              date
              time
              status
              patient {
                id
                name
                medical_history
                heart_rate
                temperature
              }
            }
          }
        }
      `,
      variables: { doctorId: 'd1' }
    };

    const dashRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/graphql',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, graphqlQuery);
    
    console.log('Response Status:', dashRes.statusCode);
    console.log('Dashboard Data:', JSON.stringify(dashRes.body, null, 2));

    // 4. Send Abnormal Vitals via GraphQL Mutation (Triggers Alert)
    console.log('\n[Test 4] Simulating high fever & tachycardia via GraphQL Mutation...');
    const graphqlMutation = {
      query: `
        mutation UpdateVitals($patientId: ID!, $heartRate: Int!, $temperature: Float!) {
          updateVitals(patientId: $patientId, heartRate: $heartRate, temperature: $temperature) {
            success
            message
          }
        }
      `,
      variables: {
        patientId: patientId,
        heartRate: 135, // High heart rate
        temperature: 39.5 // High fever
      }
    };

    const vitalsRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/graphql',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, graphqlMutation);
    console.log('Response Status:', vitalsRes.statusCode);
    console.log('Update Vitals Response:', vitalsRes.body);

    // 5. Wait for Kafka/SimpleBroker and query active alerts
    console.log('\n[Test 5] Waiting for event consumer to process and register emergency alert in RxDB...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const alertsQuery = {
      query: `
        query GetActiveAlerts {
          getActiveAlerts {
            id
            patient_id
            patient_name
            heart_rate
            temperature
            severity
            timestamp
            message
          }
        }
      `
    };

    const alertsRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/graphql',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, alertsQuery);

    console.log('Response Status:', alertsRes.statusCode);
    console.log('Emergency Alerts in RxDB:', JSON.stringify(alertsRes.body, null, 2));

    console.log('\n===== INTEGRATION TESTS COMPLETED SUCCESSFULLY =====\n');
  } catch (err) {
    console.error('\n❌ INTEGRATION TEST FAILED:', err);
  }
}

runTests();
