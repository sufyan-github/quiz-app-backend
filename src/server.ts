import http from 'http';
import app from './app';
import { prisma } from './prisma';
import { realtimeService } from './services/realtimeService';
import { validateProductionEnvironment } from './config/environment';

validateProductionEnvironment();
const port = Number(process.env.PORT || 4000);
const server = http.createServer(app);
realtimeService.init(server);

server.listen(port, () => {
  console.log(`[Server] Quiz AI API and realtime service listening on port ${port}`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal} received; draining connections`);

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  server.close(async () => {
    await prisma.$disconnect();
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
