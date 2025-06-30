let peer;
let socket;

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

		peer.signal(signal);
	};

	navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
		peer = new SimplePeer({ initiator: isInitiator, trickle: false, stream });

		peer.on('signal', data => {
			console.log("signal");

			socket.send(JSON.stringify(data));
		});

		peer.on('stream', remoteStream => {
			console.log("stream");

			const audio = new Audio();
			audio.srcObject = remoteStream;
			audio.play();
		});
	});
}
