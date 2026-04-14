import { emptyResponse, errorResponse, jsonResponse, loadConfig, requireAdmin, resetState, resolveDestination } from '../_lib/router.js';

export const onRequestOptions = () => emptyResponse();

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) {
    return errorResponse(500, 'D1 binding "DB" is not configured.');
  }

  const url = new URL(request.url);
  const preview = url.searchParams.get('preview') === '1';
  const reset = url.searchParams.get('reset') === '1';

  if (reset) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;
    await resetState(env.DB);
  }

  const { config, updatedAt } = await loadConfig(env.DB);

  try {
    const resolved = await resolveDestination(env.DB, config, {
      preview,
      didReset: reset,
    });

    return jsonResponse({
      ok: true,
      configUpdatedAt: updatedAt,
      mode: resolved.mode,
      preview,
      didReset: reset,
      redirectUrl: resolved.redirectUrl,
      message: resolved.message,
      state: {
        seqIndex: resolved.state.seqIndex || 0,
        randomRemainingCount: Array.isArray(resolved.state.randomRemaining) ? resolved.state.randomRemaining.length : 0,
      },
    });
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : 'Failed to resolve destination.');
  }
};
