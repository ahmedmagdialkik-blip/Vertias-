// Shared CORS utility for Veritas MUN Supabase Edge Functions
// Avoids hardcoded preview-breaking domains while preventing arbitrary credentialed cross-origin misuse.

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

export function resolveAllowedOrigin(requestOrigin: string | null, envOrigins?: string): string | null {
  if (!requestOrigin) return null;
  let parsed: URL;
  try {
    parsed = new URL(requestOrigin);
  } catch {
    return null;
  }

  const configured = (envOrigins || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowList = new Set([...DEFAULT_ORIGINS, ...configured]);
  if (allowList.has(parsed.origin)) {
    return parsed.origin;
  }

  // Allow HTTPS Vercel deployments for this Veritas project (vercel.app) cleanly
  if (parsed.protocol === 'https:' && (parsed.hostname.endsWith('.vercel.app') || parsed.hostname.endsWith('.aistudio.google.com'))) {
    return parsed.origin;
  }

  return null;
}

export function buildCorsHeaders(req: Request, envOrigins?: string): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowed = resolveAllowedOrigin(origin, envOrigins);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin'
  };
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed;
  }
  return headers;
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  envOrigins?: string
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...buildCorsHeaders(req, envOrigins)
    }
  });
}

export function handlePreflight(req: Request, envOrigins?: string): Response {
  return new Response('ok', {
    status: 200,
    headers: buildCorsHeaders(req, envOrigins)
  });
}
