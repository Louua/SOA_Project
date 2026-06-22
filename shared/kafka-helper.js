const { Kafka } = require('kafkajs');
const { SimpleBrokerClient } = require('./simple-broker');

const USE_KAFKA = process.env.USE_KAFKA === 'true';
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';

let producer = null;
let simpleClient = null;

async function initProducer() {
  if (USE_KAFKA) {
    try {
      const kafka = new Kafka({ clientId: 'clinic-system', brokers: [KAFKA_BROKER] });
      producer = kafka.producer();
      await producer.connect();
      console.log('[Messaging] Connected to Kafka producer');
      return;
    } catch (e) {
      console.warn('[Messaging] Kafka connection failed, falling back to simple broker:', e.message);
    }
  }

  simpleClient = new SimpleBrokerClient();
  await simpleClient.connect();
  console.log('[Messaging] Connected to SimpleBroker (TCP fallback)');
}

async function publishEvent(topic, message) {
  if (producer) {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }]
    });
  } else if (simpleClient) {
    simpleClient.publish(topic, message);
  } else {
    console.error('[Messaging] No active producer/broker client');
  }
}

async function initConsumer(topic, onMessage) {
  if (USE_KAFKA) {
    try {
      const kafka = new Kafka({ clientId: 'clinic-system', brokers: [KAFKA_BROKER] });
      const consumer = kafka.consumer({ groupId: `group-${topic}` });
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: true });
      await consumer.run({
        eachMessage: async ({ message }) => {
          try {
            const val = JSON.parse(message.value.toString());
            onMessage(val);
          } catch (e) {
            console.error('Error parsing Kafka message:', e);
          }
        }
      });
      console.log(`[Messaging] Subscribed to Kafka topic: ${topic}`);
      return;
    } catch (e) {
      console.warn(`[Messaging] Kafka consumer failed for ${topic}, falling back to simple broker:`, e.message);
    }
  }

  if (!simpleClient) {
    simpleClient = new SimpleBrokerClient();
    await simpleClient.connect();
  }
  simpleClient.subscribe(topic, onMessage);
  console.log(`[Messaging] Subscribed to SimpleBroker topic: ${topic}`);
}

module.exports = {
  initProducer,
  publishEvent,
  initConsumer
};
