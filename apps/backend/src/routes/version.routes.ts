import { Router, Request, Response } from 'express';
import { APP_VERSIONS, MIN_SUPPORTED_DSP_VERSION, MIN_SUPPORTED_STAFF_VERSION } from '@ctpl/shared-types';

const router = Router();

// ============================================================
// GET /api/version — no auth required
// ============================================================
router.get('/', (_req: Request, res: Response) => {
  const dspCurrent = APP_VERSIONS.DSP_APP;
  const staffCurrent = APP_VERSIONS.STAFF_APP;
  const updateUrl = process.env.APK_DOWNLOAD_URL || null;

  res.json({
    success: true,
    data: {
      dspApp: {
        current: dspCurrent,
        minimum: MIN_SUPPORTED_DSP_VERSION,
        updateRequired: dspCurrent < MIN_SUPPORTED_DSP_VERSION,
        updateUrl,
      },
      staffApp: {
        current: staffCurrent,
        minimum: MIN_SUPPORTED_STAFF_VERSION,
        updateRequired: staffCurrent < MIN_SUPPORTED_STAFF_VERSION,
        updateUrl,
      },
      backend: APP_VERSIONS.BACKEND,
      buildDate: process.env.BUILD_DATE || '2026-03-25',
      updateUrl,
    },
    error: null,
    timestamp: new Date().toISOString(),
  });
});

export const versionRouter = router;
