import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const SESSION_TTL_MS = 15 * 60 * 1000;

interface PeerClient {
  ws: WebSocket;
  role: 'sender' | 'receiver';
  deviceName: string;
}

interface PairingRoom {
  code: string;
  createdAt: number;
  expiresAt: number;
  sender: PeerClient | null;
  receiver: PeerClient | null;
}

const rooms = new Map<string, PairingRoom>();

function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? generatePairingCode() : code;
}

function getLocalLanUrls(port: number): string[] {
  const interfaces = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const info of entries) {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push(`http://${info.address}:${port}`);
      }
    }
  }
  return urls;
}

function sendJson(ws: WebSocket | undefined | null, payload: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function closeRoom(code: string, reason = 'Session closed') {
  const room = rooms.get(code);
  if (!room) return;
  sendJson(room.sender?.ws, { type: 'session:closed', reason });
  sendJson(room.receiver?.ws, { type: 'session:closed', reason });
  rooms.delete(code);
}

// Periodically purge expired pairing rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now > room.expiresAt) {
      closeRoom(code, 'Temporary pairing session expired.');
    }
  }
}, 60_000).unref();

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Return local LAN addresses so desktop/laptop browsers can display a direct Wi-Fi QR URL
  app.get('/api/network-info', (_req, res) => {
    res.json({
      lanUrls: getLocalLanUrls(PORT),
      port: PORT,
      protocol: 'http',
    });
  });

  // WebSocket signaling & in-memory relay for temporary Wi-Fi device pairing.
  // Use noServer: true so unrelated upgrade requests (e.g. Vite HMR in dev) are never aborted.
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqPath = (request.url || '').split('?')[0];
    if (reqPath === '/ws/transfer') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (process.env.NODE_ENV === 'production') {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    let attachedCode: string | null = null;
    let attachedRole: 'sender' | 'receiver' | null = null;

    ws.on('message', (data, isBinary) => {
      // Binary frames are relayed directly to the paired peer inside the private room
      if (isBinary) {
        if (!attachedCode || !attachedRole) return;
        const room = rooms.get(attachedCode);
        if (!room) return;
        const target = attachedRole === 'sender' ? room.receiver?.ws : room.sender?.ws;
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(data, { binary: true });
        }
        return;
      }

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'session:create') {
        const role = msg.role === 'sender' ? 'sender' : 'receiver';
        const deviceName = String(msg.deviceName || 'Device').slice(0, 48);
        const code = generatePairingCode();
        const now = Date.now();
        const room: PairingRoom = {
          code,
          createdAt: now,
          expiresAt: now + SESSION_TTL_MS,
          sender: role === 'sender' ? { ws, role, deviceName } : null,
          receiver: role === 'receiver' ? { ws, role, deviceName } : null,
        };
        rooms.set(code, room);
        attachedCode = code;
        attachedRole = role;
        sendJson(ws, {
          type: 'session:created',
          code,
          role,
          expiresAt: room.expiresAt,
        });
        return;
      }

      if (type === 'session:join') {
        const code = String(msg.code || '').trim().toUpperCase();
        const role = msg.role === 'sender' ? 'sender' : 'receiver';
        const deviceName = String(msg.deviceName || 'Device').slice(0, 48);
        const room = rooms.get(code);

        if (!room || Date.now() > room.expiresAt) {
          sendJson(ws, {
            type: 'session:error',
            error: 'Pairing code not found or expired.',
          });
          return;
        }

        if (role === 'sender') {
          if (room.sender && room.sender.ws !== ws && room.sender.ws.readyState === WebSocket.OPEN) {
            sendJson(ws, { type: 'session:error', error: 'A sender is already paired.' });
            return;
          }
          room.sender = { ws, role, deviceName };
        } else {
          if (
            room.receiver &&
            room.receiver.ws !== ws &&
            room.receiver.ws.readyState === WebSocket.OPEN
          ) {
            sendJson(ws, { type: 'session:error', error: 'A receiver is already paired.' });
            return;
          }
          room.receiver = { ws, role, deviceName };
        }

        attachedCode = code;
        attachedRole = role;

        sendJson(ws, {
          type: 'session:joined',
          code,
          role,
          peerConnected: !!(room.sender && room.receiver),
          peerName:
            role === 'sender' ? room.receiver?.deviceName || null : room.sender?.deviceName || null,
        });

        const peer = role === 'sender' ? room.receiver : room.sender;
        if (peer) {
          sendJson(peer.ws, {
            type: 'peer:connected',
            peerRole: role,
            peerName: deviceName,
          });
        }
        return;
      }

      if (type === 'session:close') {
        if (attachedCode) {
          closeRoom(attachedCode, 'Transfer session closed by user.');
          attachedCode = null;
          attachedRole = null;
        }
        return;
      }

      // Relay all signaling, manifest offers, approvals, and acks inside the paired room only
      if (attachedCode && attachedRole) {
        const room = rooms.get(attachedCode);
        if (!room) return;
        const target = attachedRole === 'sender' ? room.receiver?.ws : room.sender?.ws;
        sendJson(target, msg);
      }
    });

    ws.on('close', () => {
      if (!attachedCode || !attachedRole) return;
      const room = rooms.get(attachedCode);
      if (!room) return;
      if (attachedRole === 'sender' && room.sender?.ws === ws) {
        room.sender = null;
        sendJson(room.receiver?.ws, { type: 'peer:disconnected', peerRole: 'sender' });
      } else if (attachedRole === 'receiver' && room.receiver?.ws === ws) {
        room.receiver = null;
        sendJson(room.sender?.ws, { type: 'peer:disconnected', peerRole: 'receiver' });
      }
      if (!room.sender && !room.receiver) {
        rooms.delete(attachedCode);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const hmrEnabled = process.env.DISABLE_HMR !== 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server },
        hmr: hmrEnabled,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SONORA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
