import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: [], error: null, timestamp: new Date().toISOString() });
});

export const staffRouter = router;
