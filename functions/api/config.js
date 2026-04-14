import { emptyResponse, errorResponse, jsonResponse, loadConfig, requireAdmin, saveConfig, validateConfig } from '../_lib/router.js';

export const onRequestOptions = () => emptyResponse();

export const onRequestGet = async ({ env }) => {
  if (!env.DB) {
    return errorResponse(500, 'D1 binding "DB" is not configured.');
  }

  const result = await loadConfig(env.DB);

  return jsonResponse({
    ok: true,
    config: result.config,
    updatedAt: result.updatedAt,
    source: result.source,
  });
};

export const onRequestPut = async ({ request, env }) => {
  if (!env.DB) {
    return errorResponse(500, 'D1 binding "DB" is not configured.');
  }

  const authError = requireAdmin(request, env);
  if (authError) return authError;

  let body;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'Request body must be valid JSON.');
  }

  const validation = validateConfig(body);
  if (!validation.ok) return errorResponse(400, validation.error);

  const saved = await saveConfig(env.DB, validation.config);

  return jsonResponse({
    ok: true,
    config: saved.config,
    updatedAt: saved.updatedAt,
    source: saved.source,
  });
};
