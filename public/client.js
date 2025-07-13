let socket;
let myId;
const peers = new Map(); // id -> SimplePeer
const audioElements = new Map(); // id -> Audio
const unusedSignals = new Map(); // id -> Signal

const volumeSlider = document.getElementById("volumeSlider");
const disconnectButton = document.getElementById("disconnectButton");

let localVolumeMultiplier = 1;

volumeSlider.addEventListener("input", () => {
	localVolumeMultiplier = parseFloat(volumeSlider.value);
	document.getElementById("volumeValue").textContent = localVolumeMultiplier;
	for (const [peerId, audio] of audioElements.entries()) {
		if (audio.gainNode) audio.gainNode.gain.value = localVolumeMultiplier;
	}
});

disconnectButton.addEventListener("click", () => {
	if (socket) socket.close();
	for (const peer of peers.values()) peer.destroy();
	peers.clear();
	audioElements.forEach(({ source, panner, gainNode }) => {
		if (gainNode) gainNode.disconnect();
		if (panner) panner.disconnect();
		if (source) source.disconnect();
	});
	audioElements.clear();
	document.getElementById("status").textContent = "Disconnected.";
});

document.getElementById("startButton").addEventListener("click", async () => {
	audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	await audioCtx.resume();

	document.getElementById("status").textContent = "Joining...";
	await start();
});

async function start() {
	const username = document.getElementById('usernameInput').value || 'Anonymous';
	window.username = username;

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
			for (const [id, dict] of Object.entries(data.volumes)) {
				setVolumeForPeer(id, dict["volume"], dict["panner"]);
			}
		}
		else if (data.type === 'init') {
			myId = data.id;

			// Use for...of instead of forEach + await
			for (const peerId of data.peers) {
				await connectToPeer(peerId, true);
			}
		}
		else if (data.type === 'new-peer') {
			await connectToPeer(data.id, false);
		}
		else if (data.type === 'signal') {
			if (peers.has(data.from)) {
				peers.get(data.from).signal(data.signal);
			} else {
				unusedSignals.set(data.from, data.signal);
				console.warn('Signal for unknown peer, being saved: ', data.from);
			}
		}
		else if (data.type === 'peer-disconnect') {
			if (peers.has(data.id)) {
				peers.get(data.id).destroy();
				removePeerThings(data.id);
			}
		}
	};
}

async function connectToPeer(peerId, initiator) {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			autoGainControl: true,
			noiseSuppression: false,
			echoCancellation: false,
			channelCount: 1,
			sampleRate: 48000,
			sampleSize: 16,
		},
		video: false
	});

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
		// console.log("Remote stream received:", remoteStream);
		// console.log("Audio tracks:", remoteStream.getAudioTracks());
		// console.log("Track enabled?", remoteStream.getAudioTracks()[0]?.enabled);
		// console.log("Track muted?", remoteStream.getAudioTracks()[0]?.muted);

		// /*

		document.getElementById("status").textContent = "Waiting for Stream...";

		remoteStream.getAudioTracks()[0].onunmute = () => {
			// /*
			const audio = new Audio();
			audio.srcObject = remoteStream;
			audio.autoplay = true;
			audio.volume = 0;
			document.body.appendChild(audio);
			document.getElementById("status").textContent = "Audio Connected, waiting for CTX...";
			// */

			// console.log("Track is now unmuted!");
			// console.log("Track muted?", remoteStream.getAudioTracks()[0]?.muted);

			const tracks = remoteStream.getAudioTracks();
			// console.log("Tracks:", tracks.length);
			// console.log("Track readyState:", tracks[0]?.readyState);

			const source = audioCtx.createMediaStreamSource(remoteStream);

			const gain = audioCtx.createGain();
			gain.gain.value = 1.0;

			const panner = audioCtx.createStereoPanner();
			panner.pan.value = 0;

			source.connect(gain);
			gain.connect(panner);
			panner.connect(audioCtx.destination);
			audioElements.set(peerId, { source , gain , panner });

			// console.log("State of AudioContext:", audioCtx.state);
			document.getElementById("status").textContent = "Connected!";
		};

		// */

		/*
		const testOsc = audioCtx.createOscillator();
		testOsc.frequency.value = 440;

		const panner = audioCtx.createStereoPanner();
		panner.pan.value = 1;

		testOsc.connect(panner);
		panner.connect(audioCtx.destination);
		testOsc.start();
		setTimeout(() => testOsc.stop(), 1000);
		// */
	});

	peer.on('close', () => {
		console.log('Peer closed:', peerId);
		removePeerThings(peerId);
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
}

function setVolumeForPeer(peerId, volume, panner) {
	const audioObj = audioElements.get(peerId);
	if (audioObj) {
		audioObj.gain.gain.value = volume * localVolumeMultiplier;
		audioObj.panner.pan.value = panner;
	}
}

function removePeerThings(peerId) {
	const peer = peers.get(peerId);
	if (peer) {
		peers.delete(peerId);
	}

	const audioObj = audioElements.get(peerId);
	if (audioObj) {
		try {
			audioObj.source?.disconnect();
			audioObj.panner?.disconnect();
			audioObj.gain?.disconnect();
		} catch (e) {
			console.warn("Failed to cleanly disconnect audio nodes for", peerId, e);
		}
		audioElements.delete(peerId);
	}
}