"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const prisma_1 = require("./prisma");
const realtimeService_1 = require("./services/realtimeService");
const environment_1 = require("./config/environment");
(0, environment_1.validateProductionEnvironment)();
const port = Number(process.env.PORT || 4000);
const server = http_1.default.createServer(app_1.default);
realtimeService_1.realtimeService.init(server);
server.listen(port, () => {
    console.log(`[Server] Quiz AI API and realtime service listening on port ${port}`);
});
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log(`[Server] ${signal} received; draining connections`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    server.close(async () => {
        await prisma_1.prisma.$disconnect();
        clearTimeout(forceExit);
        process.exit(0);
    });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled promise rejection', reason);
});
process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught exception', error);
    void shutdown('uncaughtException');
});
