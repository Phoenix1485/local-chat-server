const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function enforceSameOrigin(request: Request): Response | null {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return jsonError('Cross-origin request blocked.', 403);
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return null;
  }

  try {
    const originUrl = new URL(origin);
    const expectedHost =
      request.headers.get('x-forwarded-host')?.trim().toLowerCase() ??
      request.headers.get('host')?.trim().toLowerCase() ??
      '';

    if (!expectedHost) {
      return null;
    }

    const originHost = originUrl.host.trim().toLowerCase();
    if (originHost !== expectedHost) {
      return jsonError('Cross-origin request blocked.', 403);
    }
  } catch {
    return jsonError('Invalid request origin.', 400);
  }

  return null;
}

export function jsonError(message: string, status = 400): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
