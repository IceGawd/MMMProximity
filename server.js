const express = require('express');
const WebSocket = require('ws');
const app = express();
const http = require('http');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

// Store peers and their metadata
const peers = [];

wss.on('connection', (ws) => {
	console.log("Client connected");

	const peer = {
		ws,
		signal: null,
		isInitiator: false
	};
	peers.push(peer);

	const initiator = peers.find(p => p.isInitiator && p.signal);
	if (initiator && initiator.ws.readyState === WebSocket.OPEN) {
		console.log("Sending stored offer to new peer");
		ws.send(initiator.signal);
	}

	ws.on('message', (msg) => {
		console.log("Message received");

		let data;
		try {
			data = JSON.parse(msg);
		} catch (err) {
			console.error("Invalid JSON", msg);
			return;
		}

		if (data.type === 'offer') {
			peer.signal = msg;
			peer.isInitiator = true;
		}

		if (data.type === 'answer') {
			const initiator = peers.find(p => p.isInitiator);
			if (initiator && initiator.ws.readyState === WebSocket.OPEN) {
				initiator.ws.send(msg);
			}
			return;
		}
	});
	
	ws.on('close', () => {
		const idx = peers.indexOf(peer);
		if (idx !== -1) peers.splice(idx, 1);
	});
});

server.listen(3000, () => {
	console.log('Server running on http://localhost:3000');
});
