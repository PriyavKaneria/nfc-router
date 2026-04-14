export const DEFAULT_CONFIG = {
  mode: 'sequential',
  stateStore: 'local',
  storageKeyPrefix: 'priyav-nfc-router-v2',
  karmaMessage: 'Karma mode is parked for now. Come back soon.',
  campaignParams: {
    utm_source: 'nfc',
    utm_medium: 'tap',
    utm_campaign: 'priyav-card',
  },
  destinations: [
    { url: 'https://priyavkaneria.com', weight: 3 },
    { url: 'https://projects.priyavkaneria.com', weight: 2 },
    { url: 'https://interesume.priyavkaneria.com', weight: 2 },
    { url: 'https://index.priyavkaneria.com', weight: 2 },
    { url: 'https://priyavkaneria.com/#blog', weight: 2 },
    { url: 'https://x.priyavkaneria.com', weight: 2 },
  ],
};

const ALLOWED_MODES = new Set(['sequential', 'random_no_repeat', 'karma']);
const ALLOWED_STATE_STORES = new Set(['local', 'session']);

const CREATE_ROUTER_CONFIGS_SQL = `
  CREATE TABLE IF NOT EXISTS router_configs (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    config_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const CREATE_ROUTER_STATE_SQL = `
  CREATE TABLE IF NOT EXISTS router_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seq_index INTEGER NOT NULL DEFAULT 0,
    random_remaining TEXT,
    config_signature TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

export const jsonResponse = (payload, init = {}) => {
  const headers = new Headers(init.headers || {});
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload, null, 2), { ...init, headers });
};

export const emptyResponse = (status = 204, init = {}) => {
  const headers = new Headers(init.headers || {});
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(null, { ...init, status, headers });
};

export const errorResponse = (status, message) =>
  jsonResponse(
    {
      ok: false,
      error: message,
    },
    { status },
  );

export const normalizeDestinations = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') {
        try {
          return { url: new URL(item).toString(), weight: 1 };
        } catch {
          return null;
        }
      }

      if (!item || typeof item.url !== 'string') return null;

      try {
        const url = new URL(item.url).toString();
        const weight = Number.isFinite(item.weight)
          ? Math.max(1, Math.floor(item.weight))
          : Math.max(1, Math.floor(Number.parseInt(item.weight || '1', 10) || 1));
        return { url, weight };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

export const normalizeConfig = (input = {}) => {
  const normalizedDestinations = normalizeDestinations(
    input.destinations && input.destinations.length ? input.destinations : DEFAULT_CONFIG.destinations,
  );

  return {
    mode: ALLOWED_MODES.has(input.mode) ? input.mode : DEFAULT_CONFIG.mode,
    stateStore: ALLOWED_STATE_STORES.has(input.stateStore) ? input.stateStore : DEFAULT_CONFIG.stateStore,
    storageKeyPrefix:
      typeof input.storageKeyPrefix === 'string' && input.storageKeyPrefix.trim()
        ? input.storageKeyPrefix.trim()
        : DEFAULT_CONFIG.storageKeyPrefix,
    karmaMessage:
      typeof input.karmaMessage === 'string' && input.karmaMessage.trim()
        ? input.karmaMessage.trim()
        : DEFAULT_CONFIG.karmaMessage,
    campaignParams: normalizeCampaignParams(input.campaignParams),
    destinations: normalizedDestinations.length ? normalizedDestinations : DEFAULT_CONFIG.destinations,
  };
};

export const validateConfig = (input = {}) => {
  const normalized = normalizeConfig(input);

  if (!normalized.destinations.length) {
    return { ok: false, error: 'At least one destination is required.' };
  }

  if (normalized.mode !== 'karma' && !normalized.destinations.length) {
    return { ok: false, error: 'Sequential and random modes need at least one destination.' };
  }

  return { ok: true, config: normalized };
};

export const normalizeCampaignParams = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_CONFIG.campaignParams };
  }

  const entries = Object.entries(value)
    .filter(([key, innerValue]) => typeof key === 'string' && key.trim() && typeof innerValue === 'string')
    .map(([key, innerValue]) => [key.trim(), innerValue.trim()])
    .filter(([key, innerValue]) => key && innerValue);

  return entries.length ? Object.fromEntries(entries) : { ...DEFAULT_CONFIG.campaignParams };
};

export const ensureSchema = async (db) => {
  await db.prepare(CREATE_ROUTER_CONFIGS_SQL).run();
  await db.prepare(CREATE_ROUTER_STATE_SQL).run();
};

export const loadConfig = async (db) => {
  await ensureSchema(db);

  const row = await db.prepare('SELECT config_json, updated_at FROM router_configs WHERE id = 1').first();

  if (!row || !row.config_json) {
    return {
      config: normalizeConfig(DEFAULT_CONFIG),
      updatedAt: null,
      source: 'default',
    };
  }

  try {
    return {
      config: normalizeConfig(JSON.parse(row.config_json)),
      updatedAt: row.updated_at || null,
      source: 'd1',
    };
  } catch {
    return {
      config: normalizeConfig(DEFAULT_CONFIG),
      updatedAt: row.updated_at || null,
      source: 'default',
    };
  }
};

export const saveConfig = async (db, config) => {
  await ensureSchema(db);

  const payload = JSON.stringify(normalizeConfig(config));

  await db
    .prepare(
      `
      INSERT INTO router_configs (id, config_json, updated_at)
      VALUES (1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        config_json = excluded.config_json,
        updated_at = CURRENT_TIMESTAMP
    `,
    )
    .bind(payload)
    .run();

  await resetState(db);

  return loadConfig(db);
};

export const resetState = async (db) => {
  await ensureSchema(db);

  await db
    .prepare(
      `
      INSERT INTO router_state (id, seq_index, random_remaining, config_signature, updated_at)
      VALUES (1, 0, NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        seq_index = 0,
        random_remaining = NULL,
        config_signature = NULL,
        updated_at = CURRENT_TIMESTAMP
    `,
    )
    .run();
};

const loadState = async (db) => {
  await ensureSchema(db);

  const row = await db
    .prepare('SELECT seq_index, random_remaining, config_signature, updated_at FROM router_state WHERE id = 1')
    .first();

  if (!row) {
    return {
      seqIndex: 0,
      randomRemaining: [],
      configSignature: null,
      updatedAt: null,
    };
  }

  let randomRemaining = [];

  if (typeof row.random_remaining === 'string' && row.random_remaining.trim()) {
    try {
      const parsed = JSON.parse(row.random_remaining);
      randomRemaining = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      randomRemaining = [];
    }
  }

  return {
    seqIndex: Number.isFinite(Number(row.seq_index)) ? Number(row.seq_index) : 0,
    randomRemaining,
    configSignature: row.config_signature || null,
    updatedAt: row.updated_at || null,
  };
};

const persistState = async (db, state) => {
  await db
    .prepare(
      `
      INSERT INTO router_state (id, seq_index, random_remaining, config_signature, updated_at)
      VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        seq_index = excluded.seq_index,
        random_remaining = excluded.random_remaining,
        config_signature = excluded.config_signature,
        updated_at = CURRENT_TIMESTAMP
    `,
    )
    .bind(
      Math.max(0, Math.floor(state.seqIndex || 0)),
      state.randomRemaining && state.randomRemaining.length ? JSON.stringify(state.randomRemaining) : null,
      state.configSignature || null,
    )
    .run();
};

const shuffle = (items) => {
  const clone = items.slice();

  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }

  return clone;
};

const buildWeightedCycle = (destinations) => {
  const weighted = [];

  destinations.forEach((destination) => {
    for (let index = 0; index < destination.weight; index += 1) {
      weighted.push(destination.url);
    }
  });

  return shuffle(weighted);
};

const addCampaignParams = (url, campaignParams) => {
  if (!url) return null;

  const next = new URL(url);
  Object.entries(campaignParams || {}).forEach(([key, value]) => {
    if (typeof key === 'string' && key && typeof value === 'string' && value) {
      next.searchParams.set(key, value);
    }
  });
  return next.toString();
};

const getConfigSignature = (config) =>
  JSON.stringify({
    mode: config.mode,
    karmaMessage: config.karmaMessage,
    campaignParams: config.campaignParams,
    destinations: config.destinations,
  });

export const resolveDestination = async (db, config, options = {}) => {
  const preview = options.preview === true;
  const didReset = options.didReset === true;
  const signature = getConfigSignature(config);
  let state = await loadState(db);

  if (didReset || state.configSignature !== signature) {
    state = {
      seqIndex: 0,
      randomRemaining: [],
      configSignature: signature,
      updatedAt: null,
    };
  }

  if (config.mode === 'karma') {
    if (!preview || didReset) await persistState(db, state);

    return {
      mode: config.mode,
      preview,
      didReset,
      redirectUrl: null,
      message: config.karmaMessage,
      state,
    };
  }

  const destinations = normalizeDestinations(config.destinations);
  if (!destinations.length) {
    throw new Error('No destinations configured.');
  }

  if (config.mode === 'sequential') {
    const lastIndex = destinations.length - 1;
    const currentIndex = Math.max(0, Math.min(state.seqIndex || 0, lastIndex));
    const selected = destinations[currentIndex].url;
    const nextIndex = Math.min(currentIndex + 1, lastIndex);

    if (!preview) {
      state.seqIndex = nextIndex;
      state.configSignature = signature;
      await persistState(db, state);
    } else if (didReset) {
      await persistState(db, state);
    }

    return {
      mode: config.mode,
      preview,
      didReset,
      redirectUrl: addCampaignParams(selected, config.campaignParams),
      message: null,
      state: {
        ...state,
        seqIndex: nextIndex,
      },
    };
  }

  if (config.mode === 'random_no_repeat') {
    const currentRemaining =
      state.randomRemaining && state.randomRemaining.length ? state.randomRemaining.slice() : buildWeightedCycle(destinations);

    const selected = currentRemaining[0];
    const nextRemaining = preview ? currentRemaining : currentRemaining.slice(1);

    if (!preview) {
      state.randomRemaining = nextRemaining;
      state.configSignature = signature;
      await persistState(db, state);
    } else if (didReset) {
      state.randomRemaining = currentRemaining;
      await persistState(db, state);
    }

    return {
      mode: config.mode,
      preview,
      didReset,
      redirectUrl: addCampaignParams(selected, config.campaignParams),
      message: null,
      state: {
        ...state,
        randomRemaining: nextRemaining,
      },
    };
  }

  throw new Error(`Unsupported mode: ${config.mode}`);
};

export const readBearerToken = (request) => {
  const header = request.headers.get('authorization') || '';
  const [scheme, token] = header.split(/\s+/);
  return scheme && scheme.toLowerCase() === 'bearer' ? token || '' : '';
};

export const requireAdmin = (request, env) => {
  const expected = typeof env.ADMIN_TOKEN === 'string' ? env.ADMIN_TOKEN.trim() : '';
  if (!expected) return null;

  const actual = readBearerToken(request);
  if (actual === expected) return null;

  return errorResponse(401, 'Missing or invalid admin token.');
};
