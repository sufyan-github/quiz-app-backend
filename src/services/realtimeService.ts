import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { resolveAuthToken } from './authService';
import { allowedCorsOrigins } from '../middleware/securityMiddleware';

export interface ModuleVersion {
  version: number;
  updatedAt: string;
}

class RealtimeService {
  private io: SocketIOServer | null = null;
  private readonly initialVersion = Date.now();
  private moduleVersions: Record<string, ModuleVersion> = {
    categories: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    questions: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    quizsets: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    studyplan: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    premium: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    payments: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    coupons: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    notifications: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    leaderboard: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    profile: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    dashboard: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    banners: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    advertisements: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    app_config: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    ai_settings: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    subscription_plans: { version: this.initialVersion, updatedAt: new Date().toISOString() },
    feature_flags: { version: this.initialVersion, updatedAt: new Date().toISOString() },
  };

  public init(httpServer: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          const allowed = allowedCorsOrigins();
          if (!origin || allowed.includes(origin)) callback(null, true);
          else callback(new Error('Origin is not allowed'));
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      },
      pingTimeout: 30000,
      pingInterval: 10000,
    });

    this.io.use(async (socket: Socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      if (typeof token !== 'string') return next(new Error('Authentication required'));

      const cleanToken = token.replace(/^Bearer\s+/i, '');
      const user = await resolveAuthToken(cleanToken);
      if (!user) return next(new Error('Authentication failed'));

      (socket as any).userId = user.userId;
      (socket as any).role = user.role;
      next();
    });

    this.io.on('connection', (socket: Socket) => {
      const userId = (socket as any).userId;
      console.log(`[RealtimeSocket] Client connected: ${socket.id}`);

      // Join global broadcast room
      socket.join('global_room');
      socket.join(`user_${userId}`);
      socket.join(`role_${(socket as any).role}`);

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
      this.moduleVersions[moduleName] = { version: Date.now(), updatedAt: new Date().toISOString() };
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
