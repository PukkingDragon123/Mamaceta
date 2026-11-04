// Local PeerJS signaling server for development / LAN play: node tools/peer-server.mjs [port]
import { PeerServer } from 'peer';
const port = +(process.argv[2] || 9000);
PeerServer({ port, path: '/mm', host: process.env.HOST || '127.0.0.1', allow_discovery: false }, () => console.log(`PeerJS server on http://${process.env.HOST || '127.0.0.1'}:${port}/mm`));
