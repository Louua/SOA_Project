const net = require('net');

class SimpleBroker {
  constructor(port = 9099) {
    this.port = port;
    this.clients = new Set();
    this.topics = {}; // topic -> set of clients
  }

  start() {
    this.server = net.createServer((socket) => {
      this.clients.add(socket);
      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const msgStr = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 1);
          try {
            const msg = JSON.parse(msgStr);
            this.handleMessage(socket, msg);
          } catch (e) {
            console.error('Broker parsing error:', e);
          }
          boundary = buffer.indexOf('\n');
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket);
        for (const topic of Object.keys(this.topics)) {
          this.topics[topic].delete(socket);
        }
      });

      socket.on('error', () => {});
    });

    this.server.listen(this.port, () => {
      console.log(`[SimpleBroker] Runing fallback TCP broker on port ${this.port}`);
    });
  }

  handleMessage(socket, msg) {
    if (msg.type === 'subscribe') {
      if (!this.topics[msg.topic]) {
        this.topics[msg.topic] = new Set();
      }
      this.topics[msg.topic].add(socket);
    } else if (msg.type === 'publish') {
      const subscribers = this.topics[msg.topic];
      if (subscribers) {
        const payload = JSON.stringify({ topic: msg.topic, message: msg.message }) + '\n';
        for (const sub of subscribers) {
          if (!sub.destroyed) {
            sub.write(payload);
          }
        }
      }
    }
  }
}

// Client wrapper
class SimpleBrokerClient {
  constructor(port = 9099) {
    this.port = port;
    this.socket = null;
    this.listeners = {};
    this.connected = false;
  }

  connect() {
    return new Promise((resolve) => {
      this.socket = net.connect({ port: this.port }, () => {
        this.connected = true;
        resolve(true);
      });

      let buffer = '';
      this.socket.on('data', (data) => {
        buffer += data.toString();
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const msgStr = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 1);
          try {
            const msg = JSON.parse(msgStr);
            if (this.listeners[msg.topic]) {
              this.listeners[msg.topic].forEach(cb => cb(msg.message));
            }
          } catch (e) {
            console.error('Client parse error:', e);
          }
          boundary = buffer.indexOf('\n');
        }
      });

      this.socket.on('error', () => {
        this.connected = false;
        resolve(false);
      });
    });
  }

  subscribe(topic, cb) {
    if (!this.listeners[topic]) {
      this.listeners[topic] = [];
    }
    this.listeners[topic].push(cb);
    if (this.connected) {
      this.socket.write(JSON.stringify({ type: 'subscribe', topic }) + '\n');
    }
  }

  publish(topic, message) {
    if (this.connected) {
      this.socket.write(JSON.stringify({ type: 'publish', topic, message }) + '\n');
    }
  }
}

module.exports = { SimpleBroker, SimpleBrokerClient };
