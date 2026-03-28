import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../lib/errors';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = formatZodErrors(result.error);
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Validation failed: ${fieldErrors.join('; ')}`,
      );
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fieldErrors = formatZodErrors(result.error);
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Query validation failed: ${fieldErrors.join('; ')}`,
      );
    }
    req.query = result.data;
    next();
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const fieldErrors = formatZodErrors(result.error);
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Params validation failed: ${fieldErrors.join('; ')}`,
      );
    }
    req.params = result.data;
    next();
  };
}

function formatZodErrors(error: ZodError): string[] {
  return error.errors.map((e) => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });
}

// UUID v4 regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates a UUID route parameter — returns 400 INVALID_UUID if malformed.
 * Apply to any route with :id, :areaId, :staffId, :rosterId etc.
 */
export function validateUuidParam(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const id = req.params[paramName];
    if (!id || !UUID_REGEX.test(id)) {
      throw new AppError(400, 'INVALID_UUID', `Invalid ${paramName} format`);
    }
    next();
  };
}

/**
 * Validates lat/lng are within Pakistan bounds (from Zod schema) and
 * logs a warning if outside Lahore-specific bounds (does not reject).
 */
export function validateLahoreBounds(lat: number, lng: number): boolean {
  const LAHORE = { minLat: 31.2, maxLat: 31.8, minLng: 74.0, maxLng: 74.5 };
  const inLahore =
    lat >= LAHORE.minLat &&
    lat <= LAHORE.maxLat &&
    lng >= LAHORE.minLng &&
    lng <= LAHORE.maxLng;

  if (!inLahore) {
    console.warn(`[GEO] Location outside Lahore bounds: ${lat},${lng} — accepted (border area)`);
  }
  return true; // Never reject — staff may be on city boundary
}
