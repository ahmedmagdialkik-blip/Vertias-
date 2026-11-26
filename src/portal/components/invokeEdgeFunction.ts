export async function invokeEdgeFunction<T = any>(
  sb: any,
  fnName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null; isEdgeUnavailable?: boolean }> {
  try {
    const { data, error } = await sb.functions.invoke(fnName, { body });
    if (error) {
      let message = error.message || `Edge Function "${fnName}" request failed.`;
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const parsed = await ctx.json();
          if (parsed?.error) message = String(parsed.error);
        } catch {
          // keep fallback message
        }
      }
      const isEdgeUnavailable =
        /failed to send a request|networkerror|fetch failed|404|not found/i.test(message);
      return { data: (data as T) || null, error: message, isEdgeUnavailable };
    }
    if (data && typeof data === 'object' && typeof (data as any).error === 'string' && (data as any).error && (data as any).ok !== true) {
      return { data: data as T, error: String((data as any).error) };
    }
    return { data: data as T, error: null };
  } catch (err: any) {
    const message = err?.message || `Unable to reach Edge Function "${fnName}".`;
    return {
      data: null,
      error: message,
      isEdgeUnavailable: /fetch|network|404/i.test(message)
    };
  }
}
