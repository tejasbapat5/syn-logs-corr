import { useEffect, useMemo, useRef, useState } from 'react';
import VirtualTable from './VirtualTable.jsx';
import DetailDrawer from './DetailDrawer.jsx';

const API = import.meta.env.VITE_API_URL || '';

const flatten = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o || {})) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
};

export default function App() {
  // Theme state: dark / light
  const [theme, setTheme] = useState(() => localStorage.getItem('logsphere-theme') || 'dark');

  // Active source mode: 'all' | 'obmq' | 'custom'
  const [source, setSource] = useState('all');

  // Stats from backend
  const [stats, setStats] = useState({
    connected: false,
    customLogs: { count: 0 },
    obmqLogs: { count: 0 },
  });

  // Fields and metadata from backend
  const [fieldsData, setFieldsData] = useState({
    fields: [],
    custom: [],
    obmq: [],
    metadata: { custom: [], obmq: [] },
  });

  // Unique filter row IDs
  const nextId = useRef(1);
  const newRow = (field = '', value = '') => ({
    id: nextId.current++,
    field,
    value,
  });

  const [filters, setFilters] = useState([newRow('RecordId__c')]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Selected row for DetailDrawer modal
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Toast message
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const logDebug = (...args) => {
    console.debug('[LogSphere]', ...args);
  };

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };

  // Sync theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('logsphere-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  // Fetch cluster stats
  const fetchStats = () => {
    fetch(`${API}/api/logs/stats`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStats((s) => ({ ...s, connected: false })));
  };

  // Initial load: fields & stats
  useEffect(() => {
    fetchStats();
    fetch(`${API}/api/logs/fields`)
      .then((r) => r.json())
      .then((data) => {
        setFieldsData(data);
        // Default first row based on source
        const initialField =
          source === 'obmq'
            ? data.obmq[0] || 'RecordId__c'
            : source === 'custom'
            ? data.custom[0] || 'MessageGuid'
            : data.obmq[0] || data.fields[0] || 'RecordId__c';
        setFilters([newRow(initialField)]);
      })
      .catch(() => setError('Cannot reach backend API'));
  }, []);

  // When source tab changes, adapt filter rows to that source's fields
  const handleSourceChange = (newSource) => {
    if (newSource === source) return;
    setSource(newSource);
    setPage(1);

    // Pick appropriate starting field for new source
    let defaultField = 'RecordId__c';
    if (newSource === 'obmq') {
      defaultField = fieldsData.obmq[0] || 'RecordId__c';
    } else if (newSource === 'custom') {
      defaultField = fieldsData.custom[0] || 'MessageGuid';
    } else {
      defaultField = fieldsData.obmq[0] || fieldsData.fields[0] || 'RecordId__c';
    }

    setFilters([newRow(defaultField)]);
  };

  const executeSearch = async (filtersForRequest, searchSource = source, targetPage = page, limit = pageSize) => {
    const payload = {
      source: searchSource,
      filters: filtersForRequest,
      page: targetPage,
      pageSize: limit,
    };

    logDebug('executeSearch:start', payload);
    setLoading(true);
    setError('');

    const controller = new AbortController();
    try {
      const response = await fetch(`${API}/api/logs/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await response.text();
      logDebug('executeSearch:response', {
        status: response.status,
        ok: response.ok,
        preview: rawText.slice(0, 500),
      });

      let json;
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch (parseError) {
        throw new Error(`Invalid JSON from backend: ${parseError.message}`);
      }

      if (!response.ok) {
        throw new Error(json.error || `Request failed (${response.status})`);
      }

      setResult(json);
      logDebug('executeSearch:success', {
        total: json?.pagination?.total,
        dataLength: json?.data?.length || 0,
        source: searchSource,
      });
      return json;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[LogSphere] executeSearch:error', e);
        setError(e.message || 'Search failed');
        setResult(null);
      }
      return null;
    } finally {
      setLoading(false);
      logDebug('executeSearch:end');
    }
  };

  // Determine available fields based on selected source mode
  const currentAvailableFields = useMemo(() => {
    if (source === 'obmq') return fieldsData.obmq || [];
    if (source === 'custom') return fieldsData.custom || [];
    return fieldsData.fields || [];
  }, [source, fieldsData]);

  // Metadata lookup maps
  const metaMap = useMemo(() => {
    const map = {};
    (fieldsData.metadata?.obmq || []).forEach((m) => {
      map[m.field] = { ...m, source: 'obmq' };
    });
    (fieldsData.metadata?.custom || []).forEach((m) => {
      map[m.field] = { ...m, source: 'custom' };
    });
    return map;
  }, [fieldsData]);

  // Filter manipulation helpers
  const usedFields = new Set(filters.map((f) => f.field));
  const canAdd = currentAvailableFields.some((f) => !usedFields.has(f));

  const addFilter = () => {
    const free = currentAvailableFields.find((f) => !usedFields.has(f));
    if (free) setFilters((rows) => [...rows, newRow(free)]);
  };

  const removeFilter = (id) => {
    setFilters((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  };

  const updateFilter = (id, patch) => {
    setFilters((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const clearFilters = () => {
    const defaultField =
      source === 'obmq'
        ? fieldsData.obmq[0] || 'RecordId__c'
        : source === 'custom'
        ? fieldsData.custom[0] || 'MessageGuid'
        : fieldsData.obmq[0] || fieldsData.fields[0] || 'RecordId__c';
    setFilters([newRow(defaultField)]);
  };

  // Apply a quick preset filter
  const applyPreset = (field, value, targetSource) => {
    if (targetSource && targetSource !== source) {
      setSource(targetSource);
    }
    setFilters([newRow(field, value)]);
    setPage(1);
    const presetFilters = [{ field, value }];
    logDebug('applyPreset', { field, value, source: targetSource || source });
    executeSearch(presetFilters, targetSource || source, 1, pageSize);
  };

  // Submit search
  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextPage = 1;
    setPage(nextPage);
    const validFilters = filters
      .map(({ field, value }) => ({ field, value: value.trim() }))
      .filter(({ field, value }) => field && value);

    logDebug('handleSubmit', {
      rawFilters: filters,
      validFilters,
      source,
      page: nextPage,
      pageSize,
    });

    if (validFilters.length === 0) {
      setError('Please provide a search value');
      logDebug('handleSubmit:empty', { filters });
      return;
    }

    await executeSearch(validFilters, source, nextPage, pageSize);
  };

  // Flatten rows and organize columns
  const { rows, cols } = useMemo(() => {
    const rawData = result?.data || [];
    const flattened = rawData.map((d) => flatten(d));

    // Priority column order based on active source
    const priorityCols = ['_actions', '_logType'];

    if (source === 'obmq') {
      priorityCols.push(
        'Status__c',
        'RecordId__c',
        'Name',
        'TotalIntegrationTime__c',
        'CreatedDate',
        'Id',
        'log_source'
      );
    } else if (source === 'custom') {
      priorityCols.push(
        'Status',
        'MessageGuid',
        'Sender',
        'Receiver',
        'IntegrationFlowName',
        'LogStart',
        'LogLevel'
      );
    } else {
      priorityCols.push(
        'Status',
        'Status__c',
        'RecordId__c',
        'Name',
        'MessageGuid',
        'CreatedDate',
        'LogStart'
      );
    }

    const allKeys = [...new Set(flattened.flatMap((r) => Object.keys(r)))].filter(
      (c) => c !== '_id' && c !== '_sourceIndex' && c !== '_logType'
    );

    const orderedCols = [
      '_actions',
      '_logType',
      ...priorityCols.filter((c) => allKeys.includes(c)),
      ...allKeys.filter((c) => !priorityCols.includes(c)),
    ];

    return { rows: flattened, cols: [...new Set(orderedCols)] };
  }, [result, source]);

  // Export Results
  const exportJson = () => {
    if (!result?.data || result.data.length === 0) return;
    const blob = new Blob([JSON.stringify(result.data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logsphere-${source}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported results to JSON!');
  };

  const exportCsv = () => {
    if (!rows || rows.length === 0) return;
    const displayCols = cols.filter((c) => c !== '_actions');
    const header = displayCols.join(',');
    const csvRows = rows.map((r) =>
      displayCols
        .map((c) => {
          const val = r[c] ?? '';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csvContent = [header, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logsphere-${source}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported results to CSV!');
  };

  const pg = result?.pagination;

  // Render the field dropdown options depending on the active source mode
  const renderFieldOptions = (currentField) => {
    // 1. OBMQ Mode: Dropdown of all OBMQ fields
    if (source === 'obmq') {
      const obmqMeta = fieldsData.metadata?.obmq || [];
      const categories = [...new Set(obmqMeta.map((m) => m.category || 'General'))];

      return categories.map((cat) => (
        <optgroup key={cat} label={`── ${cat} ──`}>
          {obmqMeta
            .filter((m) => m.category === cat)
            .filter((m) => m.field === currentField || !usedFields.has(m.field))
            .map((m) => (
              <option key={m.field} value={m.field}>
                {m.label || m.field}
              </option>
            ))}
        </optgroup>
      ));
    }

    // 2. Custom Logs Mode: Dropdown of all Custom Log fields
    if (source === 'custom') {
      const customMeta = fieldsData.metadata?.custom || [];
      const categories = [...new Set(customMeta.map((m) => m.category || 'General'))];

      return categories.map((cat) => (
        <optgroup key={cat} label={`── ${cat} ──`}>
          {customMeta
            .filter((m) => m.category === cat)
            .filter((m) => m.field === currentField || !usedFields.has(m.field))
            .map((m) => (
              <option key={m.field} value={m.field}>
                {m.label || m.field}
              </option>
            ))}
        </optgroup>
      ));
    }

    // 3. All Logs Mode: Distinct dropdown groups for OBMQ vs Custom Logs
    return (
      <>
        <optgroup label="── OBMQ Logs Fields ──">
          {(fieldsData.obmq || [])
            .filter((x) => x === currentField || !usedFields.has(x))
            .map((x) => (
              <option key={`obmq-${x}`} value={x}>
                [OBMQ] {metaMap[x]?.label || x}
              </option>
            ))}
        </optgroup>
        <optgroup label="── Custom Logs Fields ──">
          {(fieldsData.custom || [])
            .filter((x) => x === currentField || !usedFields.has(x))
            .map((x) => (
              <option key={`custom-${x}`} value={x}>
                [Custom] {metaMap[x]?.label || x}
              </option>
            ))}
        </optgroup>
      </>
    );
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div>
            <h1 className="brand-title">LogSphere</h1>
            <p className="brand-subtitle">Enterprise Elastic Search & Message Log Explorer</p>
          </div>
        </div>

        <div className="header-status-group">
          <div className="cluster-pill" title="Elasticsearch cluster connection status">
            <span className={`cluster-dot ${stats.connected ? '' : 'disconnected'}`} />
            <span>{stats.connected ? 'Elasticsearch Live' : 'Disconnected'}</span>
          </div>

          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label="Toggle visual theme"
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Search Panel */}
      <section className="card search-card">
        {/* Log Source Tabs */}
        <div className="tabs-container">
          <button
            type="button"
            className={`tab-btn ${source === 'all' ? 'active-all' : ''}`}
            onClick={() => handleSourceChange('all')}
            id="tab-all-logs"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
            </svg>
            All Logs (Unified)
            <span className="tab-count">
              {(stats.customLogs.count + stats.obmqLogs.count).toLocaleString()}
            </span>
          </button>

          <button
            type="button"
            className={`tab-btn ${source === 'obmq' ? 'active-obmq' : ''}`}
            onClick={() => handleSourceChange('obmq')}
            id="tab-obmq-logs"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
            OBMQ Logs
            <span className="tab-count">
              {stats.obmqLogs.count.toLocaleString()} docs
            </span>
          </button>

          <button
            type="button"
            className={`tab-btn ${source === 'custom' ? 'active-custom' : ''}`}
            onClick={() => handleSourceChange('custom')}
            id="tab-custom-logs"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            Custom Logs
            <span className="tab-count">
              {stats.customLogs.count.toLocaleString()} docs
            </span>
          </button>
        </div>

        {/* Quick Filter Presets */}
        <div className="presets-bar">
          <span className="presets-label">Quick Filters:</span>
          {source === 'obmq' && (
            <>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('Status__c', 'Delivered', 'obmq')}
              >
                Status__c = Delivered
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('RecordId__c', '0a69O000001WDHhQAO', 'obmq')}
              >
                RecordId = 0a69O000001WDHhQAO
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('Name', 'OBMQ-0000010466', 'obmq')}
              >
                Name = OBMQ-0000010466
              </button>
            </>
          )}

          {source === 'custom' && (
            <>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('Status', 'COMPLETED', 'custom')}
              >
                Status = COMPLETED
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('Status', 'FAILED', 'custom')}
              >
                Status = FAILED
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('Sender', 'TACC', 'custom')}
              >
                Sender = TACC
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('IntegrationFlowName', 'TACC_TokenGeneration', 'custom')}
              >
                Flow = TACC_TokenGeneration
              </button>
            </>
          )}

          {source === 'all' && (
            <>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('RecordId__c', '0a69O000001WDHhQAO', 'all')}
              >
                [OBMQ] RecordId__c = 0a69...
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('Status', 'FAILED', 'all')}
              >
                [Custom] Status = FAILED
              </button>
              <button
                type="button"
                className="preset-chip"
                onClick={() => applyPreset('Status__c', 'Delivered', 'all')}
              >
                [OBMQ] Status__c = Delivered
              </button>
            </>
          )}
        </div>

        {/* Dynamic Multi-Filter Form */}
        <form onSubmit={handleSubmit}>
          <div className="filters-builder">
            {filters.map((f, i) => {
              const currentMeta = metaMap[f.field];
              const isObmqField =
                fieldsData.obmq.includes(f.field) || currentMeta?.source === 'obmq';

              return (
                <div className="filter-row" key={f.id}>
                  {/* Visual Source Tag */}
                  <span
                    className={`field-badge ${
                      source === 'obmq' || isObmqField ? 'obmq' : 'custom'
                    }`}
                  >
                    {source === 'obmq'
                      ? 'OBMQ'
                      : source === 'custom'
                      ? 'CUSTOM'
                      : isObmqField
                      ? 'OBMQ'
                      : 'CUSTOM'}
                  </span>

                  {/* Differentiated Field Select Dropdown */}
                  <select
                    value={f.field}
                    onChange={(e) => updateFilter(f.id, { field: e.target.value })}
                    required
                    id={`field-select-${f.id}`}
                    aria-label="Select searchable log field"
                  >
                    {renderFieldOptions(f.field)}
                  </select>

                  {/* Dynamic Value Input with contextual placeholder */}
                  <input
                    value={f.value}
                    onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                    placeholder={
                      currentMeta?.placeholder ||
                      (isObmqField
                        ? 'Enter OBMQ value (e.g. 0a69O000001WDHhQAO or Delivered)'
                        : 'Enter value (e.g. FAILED, SAP, or GUID)')
                    }
                    maxLength={256}
                    required
                    id={`value-input-${f.id}`}
                  />

                  {/* Filter action buttons (+ / -) */}
                  <div className="filter-actions">
                    <button
                      type="button"
                      className="icon-btn remove"
                      onClick={() => removeFilter(f.id)}
                      disabled={filters.length === 1}
                      title="Remove this filter"
                      aria-label="Remove filter"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>

                    {i === filters.length - 1 && (
                      <button
                        type="button"
                        className="icon-btn add"
                        onClick={addFilter}
                        disabled={!canAdd}
                        title={canAdd ? 'Add another filter rule' : 'All available fields in use'}
                        aria-label="Add filter"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Form Footer Controls */}
          <div className="form-footer">
            <div className="form-left-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={clearFilters}
                title="Reset filters to default"
              >
                Clear Filters
              </button>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || filters.length === 0}
              id="search-btn"
            >
              {loading ? (
                <>
                  <span className="spinner" /> Searching {source.toUpperCase()} Logs…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Search Logs
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Error Alert */}
      {error && (
        <div className="alert-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <>
          <div className="results-summary-bar">
            <div className="summary-info">
              <span className="summary-count">
                {pg?.total?.toLocaleString() ?? 0} matching {pg?.total === 1 ? 'log' : 'logs'}
              </span>
              <span className="summary-took">({result.took} ms)</span>

              {result.sources && (
                <div className="source-breakdown-tags">
                  {result.sources['obmq-logs'] !== undefined && (
                    <span className="source-chip obmq">
                      OBMQ: {result.sources['obmq-logs'].toLocaleString()}
                    </span>
                  )}
                  {result.sources['custom-logs'] !== undefined && (
                    <span className="source-chip custom">
                      Custom: {result.sources['custom-logs'].toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="toolbar-right">
              {rows.length > 0 && (
                <>
                  <button
                    type="button"
                    className="export-btn"
                    onClick={exportJson}
                    title="Export matching page results as JSON"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export JSON
                  </button>
                  <button
                    type="button"
                    className="export-btn"
                    onClick={exportCsv}
                    title="Export matching page results as CSV"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export CSV
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Virtual Table */}
          {rows.length > 0 ? (
            <VirtualTable
              rows={rows}
              cols={cols}
              onSelectRow={(r) => setSelectedRecord(r)}
            />
          ) : (
            <div className="card empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <h3 className="empty-title">No matching log records found</h3>
              <p className="empty-desc">
                Try adjusting your filter criteria or checking across different log sources.
              </p>
            </div>
          )}

          {/* Pager */}
          {pg?.total > 0 && (
            <div className="pager-container card">
              <div className="pager-controls">
                <button
                  type="button"
                  className="pager-btn"
                  onClick={() => setPage(1)}
                  disabled={page === 1 || loading}
                >
                  « First
                </button>
                <button
                  type="button"
                  className="pager-btn"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!pg.hasPrev || loading}
                >
                  ‹ Prev
                </button>
                <span className="page-indicator">
                  Page {pg.page} of {pg.totalPages}
                </span>
                <button
                  type="button"
                  className="pager-btn"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!pg.hasNext || loading}
                >
                  Next ›
                </button>
                <button
                  type="button"
                  className="pager-btn"
                  onClick={() => setPage(pg.totalPages)}
                  disabled={page === pg.totalPages || loading}
                >
                  Last »
                </button>
              </div>

              <div className="page-size-selector">
                <label htmlFor="page-size-select">Rows per page:</label>
                <select
                  id="page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </>
      )}

      {/* Slide-over Detail Drawer */}
      <DetailDrawer
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
        onToast={showToast}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="toast" role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
