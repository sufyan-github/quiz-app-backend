import { Router, Request, Response } from 'express';
import { realtimeService } from '../services/realtimeService';

const router = Router();

router.get('/versions', (req: Request, res: Response) => {
  res.json({
    success: true,
    serverVersions: realtimeService.getModuleVersions(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
