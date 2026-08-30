// Standalone signaling + ICE server for Render.com deployment.
// Node 22+ required (native TypeScript strip support).
import { createSignalingServer } from './server/signalingServer.ts';
import { createIceConfigHandler } from './api/ice.ts';
import http from 'node:http';

const PORT = Number(process.env.PORT || 7777);

const extraOrigins = String(process.env.TR_ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const ALLOWED_ORIGINS = [
  // Capacitor mobile origins
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  // GitHub Pages / future domain
  'https://mwoovancity.github.io',
  ...extraOrigins,
];

const iceHandler = createIceConfigHandler({
  env: {
    ...process.env,
    // Free Google STUN servers — no account needed
    COT_TURN_ICE_SERVERS_JSON: process.env.TR_ICE_SERVERS_JSON || JSON.stringify([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ]),
    COT_ALLOWED_ORIGINS: ALLOWED_ORIGINS.join(','),
  } as NodeJS.ProcessEnv,
});

const signaling = createSignalingServer({
  allowedOrigins: ALLOWED_ORIGINS,
  webSocketPaths: ['/api/signal'],
  healthPaths: [],
});

// Mount ICE endpoint on the same HTTP server
const { server } = signaling;
const originalListeners = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url === '/api/ice' || req.url?.startsWith('/api/ice?')) {
    iceHandler(req as never, res as never);
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  for (const listener of originalListeners) {
    (listener as Function)(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Tank Royale signal server listening on port ${PORT}`);
});
