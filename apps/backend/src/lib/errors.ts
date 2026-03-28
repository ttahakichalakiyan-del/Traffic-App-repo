export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string = code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

// ============================================================
// Error factory helpers
// ============================================================

// Auth errors
export const AuthErrors = {
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', 'Token has expired'),
  tokenInvalid: () => new AppError(401, 'TOKEN_INVALID', 'Token is invalid'),
  noToken: () => new AppError(401, 'NO_TOKEN', 'Authentication token required'),
  accountDisabled: () => new AppError(403, 'ACCOUNT_DISABLED', 'Account is disabled'),
  unauthorized: () => new AppError(403, 'UNAUTHORIZED', 'Access denied'),
  wrongPassword: () => new AppError(401, 'WRONG_PASSWORD', 'Current password is incorrect'),
  wrongPin: () => new AppError(401, 'WRONG_PIN', 'Current PIN is incorrect'),
} as const;

// Validation errors
export const ValidationErrors = {
  validationError: (message: string) => new AppError(400, 'VALIDATION_ERROR', message),
  invalidUuid: (field: string) => new AppError(400, 'INVALID_UUID', `Invalid UUID for ${field}`),
  invalidDate: (field: string) => new AppError(400, 'INVALID_DATE', `Invalid date for ${field}`),
} as const;

// Roster errors
export const RosterErrors = {
  notFound: () => new AppError(404, 'ROSTER_NOT_FOUND', 'Roster not found'),
  alreadyPublished: () => new AppError(409, 'ROSTER_ALREADY_PUBLISHED', 'Roster is already published'),
  staffAlreadyAssigned: () => new AppError(409, 'STAFF_ALREADY_ASSIGNED', 'Staff already assigned to this roster'),
  staffWrongSector: () => new AppError(400, 'STAFF_WRONG_SECTOR', 'Staff does not belong to this sector'),
  cannotEditPublished: () => new AppError(400, 'CANNOT_EDIT_PUBLISHED', 'Cannot edit a published roster'),
} as const;

// Staff errors
export const StaffErrors = {
  notFound: () => new AppError(404, 'STAFF_NOT_FOUND', 'Staff member not found'),
  alreadyExists: () => new AppError(409, 'STAFF_ALREADY_EXISTS', 'Staff member already exists'),
} as const;

// Area errors
export const AreaErrors = {
  notFound: () => new AppError(404, 'AREA_NOT_FOUND', 'Area not found'),
  accessDenied: () => new AppError(403, 'AREA_ACCESS_DENIED', 'Access to this area is denied'),
} as const;

// General errors
export const GeneralErrors = {
  notFound: (resource: string = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found`),
  internalError: () => new AppError(500, 'INTERNAL_ERROR', 'Internal server error'),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
} as const;
