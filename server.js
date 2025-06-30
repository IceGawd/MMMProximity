const express = require('express');
const WebSocket = require('ws');
const app = express();
const http = require('http');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public')); // serve client files

// Store connected clients
let peers = [];

wss.on('connection', (ws) => {
	peers.push(ws);

	console.log('peer joined!');

	ws.on('message', (msg) => {
		// Relay messages to all others
		console.log('message');
		for (let peer of peers) {
			if (peer !== ws && peer.readyState === WebSocket.OPEN) {
				peer.send(msg);
			}
		}
	});

	ws.on('close', () => {
		peers = peers.filter(p => p !== ws);
	});
});

server.listen(3000, () => {
	console.log('Server running on http://localhost:3000');
});
