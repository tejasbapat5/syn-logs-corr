'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const {
  FIELDS,
  CUSTOM_FIELDS,
  OBMQ_FIELDS,
  OBMQ_METADATA,
  CUSTOM_METADATA,
  buildFilterQuery,
  buildOBMQFilterQuery,
  buildOBMQQuery,
  ValidationError,
} = require('./queryMap');

const PORT = Number(process.env.PORT) || 3001;

const ES_URL = (
  process.env.ES_URL || 'http://localhost:9200'
).replace(/\/+$/, '');

// Existing/main log index
const ES_INDEX = process.env.ES_INDEX || 'custom-logs';

// New OBMQ log index
const OBMQ_INDEX = process.env.OBMQ_INDEX || 'obmq-logs';

const TIMEOUT_MS = Number(process.env.ES_TIMEOUT_MS) || 10000;

const MAX_PAGE_SIZE = 100;

// Elasticsearch default index.max_result_window
const MAX_WINDOW = 10000;

const MAX_FILTERS = 10;

/* =========================================================
   CUSTOM ERROR
   ========================================================= */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* =========================================================
   ELASTICSEARCH HEADERS
   ========================================================= */

function esHeaders() {
  const h = {
    'Content-Type': 'application/json',
  };

  const { ES_API_KEY, ES_USERNAME, ES_PASSWORD } = process.env;

  if (ES_API_KEY) {
    h.Authorization = `ApiKey ${ES_API_KEY}`;
  } else if (ES_USERNAME) {
    h.Authorization =
      'Basic ' +
      Buffer.from(`${ES_USERNAME}:${ES_PASSWORD || ''}`).toString('base64');
  }

  return h;
}

/* =========================================================
   SEARCH ELASTICSEARCH INDEX
   ========================================================= */

async function esSearch(index, body) {
  let res;

  try {
    res = await fetch(
      `${ES_URL}/${encodeURIComponent(index)}/_search`,
      {
        method: 'POST',
        headers: esHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new HttpError(
        504,
        `Elasticsearch timed out after ${TIMEOUT_MS}ms`
      );
    }
    throw new HttpError(502, `Cannot reach Elasticsearch at ${ES_URL}`);
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const reason = json?.error?.reason || res.statusText;
    throw new HttpError(
      502,
      `Elasticsearch error (${res.status}): ${reason}`
    );
  }

  return json;
}

/* =========================================================
   COUNT ELASTICSEARCH INDEX DOCS
   ========================================================= */

async function esCount(index) {
  try {
    const res = await fetch(`${ES_URL}/${encodeURIComponent(index)}/_count`, {
      headers: esHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return json.count || 0;
  } catch {
    return null;
  }
}

/* =========================================================
   PARSE FILTER
   ========================================================= */

function parseFilter(f, i, total) {
  const label = total > 1 ? `Filter ${i + 1}: ` : '';

  if (!f || typeof f !== 'object') {
    throw new ValidationError(
      `${label}must be an object with "field" and "value"`
    );
  }

  const { field, value, source } = f;

  if (typeof field !== 'string' || !field) {
    throw new ValidationError(`${label}"field" is required`);
  }

  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new ValidationError(`${label}"value" is required`);
  }

  const v = String(value).trim();

  if (!v) {
    throw new ValidationError(`${label}"value" must not be empty`);
  }

  if (v.length > 256) {
    throw new ValidationError(`${label}"value" is too long (max 256 chars)`);
  }

  return {
    field,
    value: v,
    source: source || 'auto',
  };
}

/* =========================================================
   PARSE REQUEST
   ========================================================= */

function parseRequest(body) {
  body = body || {};

  let raw;
  if (Array.isArray(body.filters)) {
    raw = body.filters;
  } else if (body.field !== undefined) {
    raw = [
      {
        field: body.field,
        value: body.value,
        source: body.source,
      },
    ];
  } else {
    raw = [];
  }

  if (raw.length === 0) {
    throw new ValidationError('At least one filter is required');
  }

  if (raw.length > MAX_FILTERS) {
    throw new ValidationError(`Too many filters (max ${MAX_FILTERS})`);
  }

  const filters = raw.map((f, i) => parseFilter(f, i, raw.length));

  const page = body.page === undefined ? 1 : Number(body.page);
  const pageSize = body.pageSize === undefined ? 50 : Number(body.pageSize);
  const source = ['all', 'custom', 'obmq'].includes(body.source)
    ? body.source
    : 'all';

  if (!Number.isInteger(page) || page < 1) {
    throw new ValidationError('"page" must be an integer >= 1');
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ValidationError(`"pageSize" must be 1-${MAX_PAGE_SIZE}`);
  }

  if (page * pageSize > MAX_WINDOW) {
    throw new ValidationError(
      `Results beyond ${MAX_WINDOW} are not reachable; refine your search`
    );
  }

  return {
    filters,
    source,
    page,
    pageSize,
  };
}

/* =========================================================
   EXPRESS APP
   ========================================================= */

const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));

/* =========================================================
   GET SEARCHABLE FIELDS (WITH OBMQ & CUSTOM SEPARATED)
   ========================================================= */

app.get('/api/logs/fields', (_req, res) => {
  res.json({
    fields: Object.keys(FIELDS),
    custom: Object.keys(CUSTOM_FIELDS),
    obmq: Object.keys(OBMQ_FIELDS),
    metadata: {
      custom: CUSTOM_METADATA,
      obmq: OBMQ_METADATA,
    },
  });
});

/* =========================================================
   GET SYSTEM / INDEX STATS
   ========================================================= */

app.get('/api/logs/stats', async (_req, res) => {
  try {
    const [customCount, obmqCount] = await Promise.all([
      esCount(ES_INDEX),
      esCount(OBMQ_INDEX),
    ]);

    res.json({
      connected: customCount !== null || obmqCount !== null,
      customLogs: {
        index: ES_INDEX,
        count: customCount ?? 0,
      },
      obmqLogs: {
        index: OBMQ_INDEX,
        count: obmqCount ?? 0,
      },
    });
  } catch (err) {
    res.json({
      connected: false,
      error: err.message,
    });
  }
});

/* =========================================================
   MAIN SEARCH
   ========================================================= */

app.post('/api/logs/search', async (req, res, next) => {
  try {
    const { filters, source, page, pageSize } = parseRequest(req.body);

    let mainData = [];
    let mainTotal = 0;
    let mainTook = 0;

    let obmqData = [];
    let obmqTotal = 0;
    let obmqTook = 0;

    /*
     * 1. If source is 'all' or 'custom', query Custom Logs
     */
    if (source === 'all' || source === 'custom') {
      try {
        const query = buildFilterQuery(filters);
        const mainResult = await esSearch(ES_INDEX, {
          from: (page - 1) * pageSize,
          size: pageSize,
          track_total_hits: true,
          query,
          sort: [
            {
              LogStart: {
                order: 'desc',
                unmapped_type: 'date',
                missing: '_last',
              },
            },
          ],
        });

        mainData = (mainResult.hits?.hits || []).map((h) => ({
          _id: h._id,
          _sourceIndex: ES_INDEX,
          _logType: 'custom',
          ...(h._source || {}),
        }));

        mainTotal = mainResult.hits?.total?.value || 0;
        mainTook = mainResult.took || 0;
      } catch (err) {
        // If searching specific source and it fails, rethrow
        if (source === 'custom') throw err;
        // In 'all' mode, if custom logs cannot match an OBMQ-only field, treat as 0 hits
        console.warn('Custom logs query warning in multi-source mode:', err.message);
      }
    }

    /*
     * 2. If source is 'all' or 'obmq', query OBMQ Logs
     */
    if (source === 'all' || source === 'obmq') {
      try {
        const query = buildOBMQFilterQuery(filters);
        const obmqResult = await esSearch(OBMQ_INDEX, {
          from: (page - 1) * pageSize,
          size: pageSize,
          track_total_hits: true,
          query,
          sort: [
            {
              CreatedDate: {
                order: 'desc',
                unmapped_type: 'date',
                missing: '_last',
              },
            },
          ],
        });

        obmqData = (obmqResult.hits?.hits || []).map((h) => ({
          _id: h._id,
          _sourceIndex: OBMQ_INDEX,
          _logType: 'obmq',
          ...(h._source || {}),
        }));

        obmqTotal = obmqResult.hits?.total?.value || 0;
        obmqTook = obmqResult.took || 0;
      } catch (err) {
        if (source === 'obmq') throw err;
        console.warn('OBMQ logs query warning in multi-source mode:', err.message);
      }
    }

    /*
     * 3. Combine / select results based on source
     */
    let combinedData = [];
    let total = 0;

    if (source === 'obmq') {
      combinedData = obmqData;
      total = obmqTotal;
    } else if (source === 'custom') {
      combinedData = mainData;
      total = mainTotal;
    } else {
      // In 'all' mode, merge results
      combinedData = [...obmqData, ...mainData];
      total = mainTotal + obmqTotal;

      // Sort combined data by most recent timestamp
      combinedData.sort((a, b) => {
        const timeA = new Date(a.CreatedDate || a.LogStart || a['@timestamp'] || 0).getTime();
        const timeB = new Date(b.CreatedDate || b.LogStart || b['@timestamp'] || 0).getTime();
        return timeB - timeA;
      });

      // Keep up to pageSize
      if (combinedData.length > pageSize) {
        combinedData = combinedData.slice(0, pageSize);
      }
    }

    res.json({
      data: combinedData,
      source,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
        hasNext: page * pageSize < Math.min(total, MAX_WINDOW),
        hasPrev: page > 1,
      },
      took: mainTook + obmqTook,
      sources: {
        [ES_INDEX]: mainTotal,
        [OBMQ_INDEX]: obmqTotal,
      },
    });
  } catch (e) {
    next(e);
  }
});

/* =========================================================
   SEARCH ONLY OBMQ (LEGACY COMPATIBILITY)
   ========================================================= */

app.post('/api/obmq/search', async (req, res, next) => {
  try {
    const { value } = req.body || {};
    if (typeof value !== 'string' || !value.trim()) {
      throw new ValidationError('ID value is required');
    }
    const id = value.trim();

    const result = await esSearch(OBMQ_INDEX, {
      size: MAX_PAGE_SIZE,
      track_total_hits: true,
      query: {
        query_string: {
          query: `"${id}"`,
          fields: ['*'],
          lenient: true,
        },
      },
    });

    const total = result.hits?.total?.value || 0;

    res.json({
      data: (result.hits?.hits || []).map((h) => ({
        _id: h._id,
        _sourceIndex: OBMQ_INDEX,
        _logType: 'obmq',
        ...(h._source || {}),
      })),
      total,
      took: result.took,
      index: OBMQ_INDEX,
    });
  } catch (e) {
    next(e);
  }
});

/* =========================================================
   ERROR HANDLER
   ========================================================= */

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

/* =========================================================
   START SERVER
   ========================================================= */

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`Main index: ${ES_URL}/${ES_INDEX}`);
  console.log(`OBMQ index: ${ES_URL}/${OBMQ_INDEX}`);
});