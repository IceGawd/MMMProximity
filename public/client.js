let socket;
let myId;
const peers = new Map(); // id -> SimplePeer
const audioElements = new Map(); // id -> Audio
const unusedSignals = new Map(); // id -> Signal

function start() {
	const username = document.getElementById('usernameInput').value || 'Anonymous';
	window.username = username; // Save it globally in case you need it later

	const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
	socket = new WebSocket(protocol + location.host);

	socket.onopen = () => {
		socket.send(JSON.stringify({
			type: 'username',
			data: username
		}));
	};

	socket.onmessage = async (event) => {
		const data = JSON.parse(event.data);

		if (data.type === 'volume') {
			for (const [id, volume] of Object.entries(data.volumes)) {
				setVolumeForPeer(id, volume);
			}
		}
		else if (data.type === 'init') {
			myId = data.id;
			data.peers.forEach(peerId => {
				connectToPeer(peerId, true); // initiator for existing
			});
		} else if (data.type === 'new-peer') {
			connectToPeer(data.id, false); // new peer, not initiator
		} else if (data.type === 'signal') {
			if (peers.has(data.from)) {
				peers.get(data.from).signal(data.signal);
			} else {
				unusedSignals.set(data.from, data.signal);
				console.warn('Signal for unknown peer, being saved: ', data.from);
			}
		} else if (data.type === 'peer-disconnect') {
			if (peers.has(data.id)) {
				peers.get(data.id).destroy();
				peers.delete(data.id);
				audioElements.get(data.id)?.remove();
				audioElements.delete(data.id);
			}
		}
	};
}

function connectToPeer(peerId, initiator) {
	navigator.mediaDevices.getUserMedia({
		audio: {
			autoGainControl: true,
			noiseSuppression: false,
			echoCancellation: true,
			channelCount: 1,
			sampleRate: 48000, // optional but sometimes helps
			sampleSize: 16,
		},
		video: false
	}).then(stream => {
		const peer = new SimplePeer({ initiator, trickle: false, stream });
		peers.set(peerId, peer);

		peer.on('signal', signal => {
			socket.send(JSON.stringify({
				type: 'signal',
				target: peerId,
				signal
			}));
		});

		peer.on('stream', remoteStream => {
			const audio = new Audio();
			audio.srcObject = remoteStream;
			audio.autoplay = true;
			audio.volume = 1.0;
			document.body.appendChild(audio);
			document.getElementById("status").textContent = "Connected!";
			audioElements.set(peerId, audio);
		});

		peer.on('close', () => {
			console.log('Peer closed:', peerId);
			audioElements.get(peerId)?.remove();
			audioElements.delete(peerId);
			peers.delete(peerId);
		});

		peer.on('error', err => {
			console.error('Peer error:', peerId, err);
		});

		if (unusedSignals.has(peerId)) {
			console.warn('Signalling saved peer: ', peerId);

			const signal = unusedSignals.get(peerId);
			peers.get(peerId).signal(signal);
			unusedSignals.delete(peerId);
		}
	});
}

function setVolumeForPeer(peerId, volume) {
	const audio = audioElements.get(peerId);
	if (audio) audio.volume = volume;
}
