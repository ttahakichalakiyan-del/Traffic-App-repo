import { Router, Request, Response, NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { verifyDspToken } from '../middleware/auth.middleware';
import { db } from '../db';
import { areas, sectors } from '../db/schema';

const router = Router();

// ── GET /api/areas/:areaId ──────────────────────────────────
// Returns area info + boundary coordinates for map polygon display
router.get('/:areaId', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { areaId } = req.params;

    const [area] = await db
      .select({
        id: areas.id,
        name: areas.name,
        colorHex: areas.colorHex,
        isActive: areas.isActive,
        boundaryGeoJson: sql<string | null>`ST_AsGeoJSON(${areas.boundary})`,
      })
      .from(areas)
      .where(eq(areas.id, areaId))
      .limit(1);

    if (!area) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { message: 'Area not found' },
        timestamp: new Date().toISOString(),
      });
    }

    // Parse GeoJSON boundary into coordinate array for the map
    let boundaryCoordinates: Array<{ latitude: number; longitude: number }> = [];
    let centerLat: number | null = null;
    let centerLng: number | null = null;

    if (area.boundaryGeoJson) {
      try {
        const geo = JSON.parse(area.boundaryGeoJson);
        // GeoJSON Polygon: coordinates[0] = exterior ring [[lng, lat], ...]
        const ring: number[][] =
          geo.type === 'Polygon' ? geo.coordinates[0] :
          geo.type === 'MultiPolygon' ? geo.coordinates[0][0] : [];

        boundaryCoordinates = ring.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

        if (boundaryCoordinates.length > 0) {
          centerLat = boundaryCoordinates.reduce((s, c) => s + c.latitude, 0) / boundaryCoordinates.length;
          centerLng = boundaryCoordinates.reduce((s, c) => s + c.longitude, 0) / boundaryCoordinates.length;
        }
      } catch {
        // malformed boundary — return empty coords, map will use default center
      }
    }

    // Get sectors for this area
    const areaSectors = await db
      .select({ id: sectors.id, name: sectors.name, colorHex: sectors.colorHex })
      .from(sectors)
      .where(eq(sectors.areaId, areaId));

    return res.json({
      success: true,
      data: {
        id: area.id,
        name: area.name,
        colorHex: area.colorHex,
        isActive: area.isActive,
        boundary: area.boundaryGeoJson,
        boundaryCoordinates,
        centerLat,
        centerLng,
        sectors: areaSectors,
      },
      error: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export const areasRouter = router;
