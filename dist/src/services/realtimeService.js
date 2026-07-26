"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeService = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class RealtimeService {
    io = null;
    moduleVersions = {
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
    init(httpServer) {
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
            },
            pingTimeout: 30000,
            pingInterval: 10000,
        });
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
            if (token) {
                try {
                    const cleanToken = token.replace('Bearer ', '');
                    const decoded = jsonwebtoken_1.default.verify(cleanToken, process.env.JWT_SECRET || 'secret');
                    socket.userId = decoded.userId;
                }
                catch (err) {
                    // Allow anonymous socket connections with public room
                }
            }
            next();
        });
        this.io.on('connection', (socket) => {
            const userId = socket.userId;
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
            socket.on('check_sync_versions', (clientVersions, ack) => {
                const outOfSyncModules = [];
                for (const [mod, ver] of Object.entries(clientVersions)) {
                    if (this.moduleVersions[mod] && this.moduleVersions[mod].version > ver) {
                        outOfSyncModules.push(mod);
                    }
                }
                if (ack)
                    ack({ outOfSyncModules, serverVersions: this.moduleVersions });
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
    emit(moduleName, eventName, payload, userId) {
        if (!this.io) {
            console.warn(`[RealtimeService] Socket.io server not initialized yet.`);
            return;
        }
        // Increment module data version
        if (!this.moduleVersions[moduleName]) {
            this.moduleVersions[moduleName] = { version: 1, updatedAt: new Date().toISOString() };
        }
        else {
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
        }
        else {
            this.io.to('global_room').emit(eventName, enrichedPayload);
        }
    }
    getModuleVersions() {
        return this.moduleVersions;
    }
}
exports.realtimeService = new RealtimeService();
//# sourceMappingURL=realtimeService.js.map