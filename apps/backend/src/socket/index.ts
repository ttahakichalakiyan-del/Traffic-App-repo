import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { verifyToken } from '../lib/jwt';

let io: Server | null = null;

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── JWT auth middleware ──────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error('NO_TOKEN'));
    }
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.userType = payload.userType;
      socket.data.areaId = payload.areaId;
      next();
    } catch {
      next(new Error('TOKEN_INVALID'));
    }
  });

  // ── Connection handler ───────────────────────────────────
  io.on('connection', (socket) => {
    const { userId, userType, areaId } = socket.data;

    if (userType === 'dsp') {
      // DSP connect
      if (areaId) {
        socket.join(`area_${areaId}`);
      }
      socket.join(`dsp_${userId}`);
      console.log(`[Socket] DSP connected: ${userId}, areaId=${areaId}, sid=${socket.id}`);
      socket.emit('connected', { message: 'Connected to CTPL system' });
    } else if (userType === 'staff') {
      // Staff connect
      socket.join(`staff_${userId}`);
      if (areaId) {
        socket.join(`area_${areaId}`);
      }
      console.log(`[Socket] Staff connected: ${userId}, sid=${socket.id}`);
    }

    // ── Sector subscription ──────────────────────────────
    socket.on('sector:subscribe', (data: { sectorIds: string[] }) => {
      for (const sectorId of data.sectorIds) {
        socket.join(`sector_${sectorId}`);
      }
    });

    socket.on('sector:unsubscribe', (data: { sectorIds: string[] }) => {
      for (const sectorId of data.sectorIds) {
        socket.leave(`sector_${sectorId}`);
      }
    });

    // ── Disconnect ───────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] ${userType} disconnected: ${userId}, reason=${reason}`);
    });
  });

  return io;
}

// ── Helper exports ─────────────────────────────────────────

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

export function emitToArea(areaId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`area_${areaId}`).emit(event, data);
}

export function emitToDsp(dspId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`dsp_${dspId}`).emit(event, data);
}

export function emitToStaff(staffId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`staff_${staffId}`).emit(event, data);
}
