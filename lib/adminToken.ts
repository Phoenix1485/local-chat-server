import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ADMIN_KEY, ADMIN_TOKEN_TTL_MS } from '@/lib/config';

type TokenPayload = {
  iat: number;
  exp: number;
  nonce: string;
};

type AdminTokenClaims = {
  issuedAt: number;
  expiresAt: number;
};

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function signPayload(payloadPart: string): string {
  const digest = createHmac('sha256', ADMIN_KEY).update(payloadPart).digest();
  return toBase64Url(digest);
}

function parsePayload(payloadPart: string): TokenPayload | null {
  try {
    const raw = fromBase64Url(payloadPart).toString('utf8');
    const parsed = JSON.parse(raw) as Partial<TokenPayload>;

    if (
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number' ||
      typeof parsed.nonce !== 'string' ||
      parsed.exp <= parsed.iat
    ) {
      return null;
    }

    return {
      iat: parsed.iat,
      exp: parsed.exp,
      nonce: parsed.nonce
    };
  } catch {
    return null;
  }
}

export function issueAdminToken(now = Date.now()): { token: string; claims: AdminTokenClaims } {
  const payload: TokenPayload = {
    iat: now,
    exp: now + ADMIN_TOKEN_TTL_MS,
    nonce: randomUUID()
  };

  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signaturePart = signPayload(payloadPart);

  return {
    token: `${payloadPart}.${signaturePart}`,
    claims: {
      issuedAt: payload.iat,
      expiresAt: payload.exp
    }
  };
}

export function readAdminTokenClaims(token: string): AdminTokenClaims | null {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = signPayload(payloadPart);
  const signatureBuffer = Buffer.from(signaturePart);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const payload = parsePayload(payloadPart);
  if (!payload) {
    return null;
  }

  return {
    issuedAt: payload.iat,
    expiresAt: payload.exp
  };
}

export function isAdminTokenValid(token: string, now = Date.now()): boolean {
  const claims = readAdminTokenClaims(token);
  if (!claims) {
    return false;
  }
  return claims.expiresAt > now;
}
