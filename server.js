const fs = require('fs');
const express = require('express');
const WebSocket = require('ws');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

const app = express();

const options = {
	key: fs.readFileSync('./key.pem'),
	cert: fs.readFileSync('./cert.pem'),
};

const server = https.createServer(options, app);
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

app.use(bodyParser.json());

app.post('/volume-matrix', (req, res) => {
	let { usernames, matrix, pannerMatrix } = req.body;
	usernames = usernames.map(str => str.toLowerCase());

	console.log('Received volume matrix!');
	console.log('Players:', usernames);
	console.log('Matrix:', matrix);
	console.log('Panner:', pannerMatrix);

	// Broadcast to all clients
	for (const [id, client] of clients.entries()) {
		if (client.ws.readyState === WebSocket.OPEN && client.username) {
			const index = usernames.indexOf(client.username);
			if (index !== -1) {
				// Build list of volume values this user should hear
				const volumes = {};
				for (let j = 0; j < usernames.length; j++) {
					if (j !== index) {
						const userid = getIdFromUsername(usernames[j]);
						volumes[userid] = { "volume": matrix[index][j], "panner": pannerMatrix[index][j] };
					}
				}

				client.ws.send(JSON.stringify({
					type: 'volume',
					volumes: volumes, 
				}));

				console.log(volumes)
			}
		}
	}

	res.sendStatus(200);
});

const clients = new Map(); // id -> { ws, signalBuffer, username }

wss.on('connection', (ws) => {
	const id = uuidv4();
	console.log(`Client connected: ${id}`);
	clients.set(id, { ws, signalBuffer: {}, username: null });

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

		// Username assignment
		if (data.type === 'username') {
			const client = clients.get(id);
			if (client) {
				client.username = data.data.toLowerCase();
				console.log(`Username for ${id} is ${data.data}`);
			}
			return; // Don't broadcast username messages
		}

		// Signal relay
		if (data.type === 'signal' && data.target && clients.has(data.target)) {
			clients.get(data.target).ws.send(JSON.stringify({
				type: 'signal',
				from: id,
				signal: data.signal
			}));
		}
	});

	ws.on('close', () => {
		console.log(`Client disconnected: ${id} (${clients.get(id)?.username || 'unknown'})`);
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

function getIdFromUsername(targetUsername) {
	for (const [id, clientData] of clients.entries()) {
		if (clientData.username === targetUsername) {
			return id;
		}
	}
	return null;
}


server.listen(3000, () => {
	console.log(`Server running on:`);
	console.log(` - Local:  https://localhost:3000`);
	console.log(` - Remote: https://${externalIP}:3000`);
});