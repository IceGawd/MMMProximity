const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const os = require('os');
const interfaces = os.networkInterfaces();

let externalIP = 'your-server-ip-here';
for (const iface of Object.values(interfaces)) {
	for (const config of iface) {
		if (config.family === 'IPv4' && !config.internal) {
			externalIP = config.address;
			break;
		}
	}
}


app.use(express.static('public'));

const clients = new Map(); // id -> { ws, signalBuffer }

wss.on('connection', (ws) => {
	const id = uuidv4();
	console.log(`Client connected: ${id}`);
	clients.set(id, { ws, signalBuffer: {} });

	// Notify new client of all existing clients
	const existingIds = Array.from(clients.keys()).filter(i => i !== id);
	ws.send(JSON.stringify({ type: 'init', id, peers: existingIds }));

	// Notify all others of the new client
	broadcastExcept(id, JSON.stringify({ type: 'new-peer', id }));

	ws.on('message', (msg) => {
		let data;
		try {
			data = JSON.parse(msg);
		} catch (e) {
			console.error('Bad JSON:', msg);
			return;
		}

		// Relay signal to specific target
		if (data.type === 'signal' && data.target && clients.has(data.target)) {
			clients.get(data.target).ws.send(JSON.stringify({
				type: 'signal',
				from: id,
				signal: data.signal
			}));
		}
	});

	ws.on('close', () => {
		console.log(`Client disconnected: ${id}`);
		clients.delete(id);
		broadcastExcept(id, JSON.stringify({ type: 'peer-disconnect', id }));
	});
});

function broadcastExcept(excludeId, msg) {
	for (const [id, client] of clients.entries()) {
		if (id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
			client.ws.send(msg);
		}
	}
}

server.listen(3000, () => {
	console.log(`Server running on:`);
	console.log(` - Local:  http://localhost:3000`);
	console.log(` - Remote: http://${externalIP}:3000`);
});
