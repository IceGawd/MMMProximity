const fs = require('fs');
const express = require('express');
const https = require('https');

const app = express();

const options = {
	key: fs.readFileSync('./key.pem'),
	cert: fs.readFileSync('./cert.pem'),
};

const server = https.createServer(options, app);

app.use(express.static('private'));

server.listen(3000, () => {
	console.log(`Server running on:`);
	console.log(` - Local:  https://localhost:3000`);
});