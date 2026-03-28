import jwt from 'jsonwebtoken';
import { AppError } from './errors';

export interface TokenPayload {
  userId: string;
  userType: 'dsp' | 'staff' | 'admin';
  areaId?: string;
  iat?: number;
  exp?: number;
}

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
};

export function signToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  expiresIn: string,
): string {
  return jwt.sign(
    payload as object,
    getSecret(),
    { expiresIn: expiresIn as unknown as number },
  );
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, getSecret()) as TokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Token has expired');
    }
    throw new AppError(401, 'TOKEN_INVALID', 'Token is invalid');
  }
}

export function extractTokenFromHeader(authHeader: string | undefined): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'NO_TOKEN', 'Authentication token required');
  }
  const token = authHeader.slice(7);
  if (!token) {
    throw new AppError(401, 'NO_TOKEN', 'Authentication token required');
  }
  return token;
}
