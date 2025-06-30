let peer;
let socket;
let pendingSignal;
window.audio = null;

function start(isInitiator) {
	socket = new WebSocket('ws://' + location.host);

	socket.onmessage = async (event) => {
		let signal;

		if (event.data instanceof Blob) {
			const text = await event.data.text();
			signal = JSON.parse(text);
		} else {
			signal = JSON.parse(event.data);
		}

		// If peer isn't ready yet, store the signal to apply later
		if (!peer) {
			console.log("Peer not ready, storing pending signal");
			pendingSignal = signal;
		} else {
			peer.signal(signal);
		}
	};

	navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
		peer = new SimplePeer({ initiator: isInitiator, trickle: false, stream });

		if (pendingSignal) {
			console.log("Applying stored signal");
			peer.signal(pendingSignal);
			pendingSignal = null;
		}

		peer.on('signal', data => {
			socket.send(JSON.stringify(data));
		});

		peer.on('stream', remoteStream => {
			console.log("Received remote stream!");

			const audio = new Audio();
			audio.srcObject = remoteStream;
			audio.volume = 1.0;
			audio.autoplay = true;
			audio.play();

			window.audio = audio;
		});
	});

}
