import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
export interface ModuleVersion {
    version: number;
    updatedAt: string;
}
declare class RealtimeService {
    private io;
    private readonly initialVersion;
    private moduleVersions;
    init(httpServer: HttpServer): SocketIOServer;
    /**
     * Centralized Event Emitter with Data Versioning
     */
    emit(moduleName: string, eventName: string, payload: any, userId?: string): void;
    getModuleVersions(): Record<string, ModuleVersion>;
}
export declare const realtimeService: RealtimeService;
export {};
//# sourceMappingURL=realtimeService.d.ts.map