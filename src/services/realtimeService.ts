import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

export interface ModuleVersion {
  version: number;
  updatedAt: string;
}

class RealtimeService {
  private io: SocketIOServer | null = null;
  private moduleVersions: Record<string, ModuleVersion> = {
    categories: { version: 1, updatedAt: new Date().toISOString() },
    questions: { version: 1, updatedAt: new Date().toISOString() },
    quizsets: { version: 1, updatedAt: new Date().toISOString() },
    studyplan: { version: 1, updatedAt: new Date().toISOString() },
    premium: { version: 1, updatedAt: new Date().toISOString() },
    payments: { version: 1, updatedAt: new Date().toISOString() },
    coupons: { version: 1, updatedAt: new Date().toISOString() },
    notifications: { version: 1, updatedAt: new Date().toISOString() },
    leaderboard: { version: 1, updatedAt: new Date().toISOString() },
    profile: { version: 1, updatedAt: new Date().toISOString() },
    dashboard: { version: 1, updatedAt: new Date().toISOString() },
    banners: { version: 1, updatedAt: new Date().toISOString() },
    advertisements: { version: 1, updatedAt: new Date().toISOString() },
    app_config: { version: 1, updatedAt: new Date().toISOString() },
    ai_settings: { version: 1, updatedAt: new Date().toISOString() },
    subscription_plans: { version: 1, updatedAt: new Date().toISOString() },
    feature_flags: { version: 1, updatedAt: new Date().toISOString() },
  };

  public init(httpServer: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      },
      pingTimeout: 30000,
      pingInterval: 10000,
    });

    this.io.use((socket: Socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      if (token) {
        try {
          const cleanToken = token.replace('Bearer ', '');
          const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET || 'secret') as any;
          (socket as any).userId = decoded.userId;
        } catch (err) {
          // Allow anonymous socket connections with public room
        }
      }
      next();
    });

    this.io.on('connection', (socket: Socket) => {
      const userId = (socket as any).userId;
      console.log(`[RealtimeSocket] Client connected: ${socket.id} (User: ${userId || 'Guest'})`);

      // Join global broadcast room
      socket.join('global_room');

      if (userId) {
        socket.join(`user_${userId}`);
      }

      // Handshake: send current data versions to client
      socket.emit('sync_handshake', {
        serverVersions: this.moduleVersions,
        timestamp: new Date().toISOString(),
      });

      // Handle client version check on reconnect
      socket.on('check_sync_versions', (clientVersions: Record<string, number>, ack?: Function) => {
        const outOfSyncModules: string[] = [];
        for (const [mod, ver] of Object.entries(clientVersions)) {
          if (this.moduleVersions[mod] && this.moduleVersions[mod].version > ver) {
            outOfSyncModules.push(mod);
          }
        }
        if (ack) ack({ outOfSyncModules, serverVersions: this.moduleVersions });
      });

      socket.on('disconnect', (reason) => {
        console.log(`[RealtimeSocket] Client disconnected: ${socket.id} (${reason})`);
      });
    });

    return this.io;
  }

  /**
   * Centralized Event Emitter with Data Versioning
   */
  public emit(moduleName: string, eventName: string, payload: any, userId?: string): void {
    if (!this.io) {
      console.warn(`[RealtimeService] Socket.io server not initialized yet.`);
      return;
    }

    // Increment module data version
    if (!this.moduleVersions[moduleName]) {
      this.moduleVersions[moduleName] = { version: 1, updatedAt: new Date().toISOString() };
    } else {
      this.moduleVersions[moduleName].version += 1;
      this.moduleVersions[moduleName].updatedAt = new Date().toISOString();
    }

    const currentVer = this.moduleVersions[moduleName].version;
    const enrichedPayload = {
      ...payload,
      module: moduleName,
      event: eventName,
      dataVersion: currentVer,
      timestamp: new Date().toISOString(),
    };

    console.log(`[RealtimeService] Emitting event '${eventName}' [Module: ${moduleName}, Ver: ${currentVer}]`);

    if (userId) {
      this.io.to(`user_${userId}`).emit(eventName, enrichedPayload);
    } else {
      this.io.to('global_room').emit(eventName, enrichedPayload);
    }
  }

  public getModuleVersions(): Record<string, ModuleVersion> {
    return this.moduleVersions;
  }
}

export const realtimeService = new RealtimeService();
