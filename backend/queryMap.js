'use strict';

/**
 * Single source of truth for searchable fields across:
 * 1. Custom Logs (ES_INDEX: custom-logs)
 * 2. OBMQ Logs (OBMQ_INDEX: obmq-logs)
 */

/* =========================================================
   CUSTOM LOG FIELDS (Main Integration Logs)
   ========================================================= */

const CUSTOM_KEYWORD = [
  'MessageGuid',
  'CorrelationId',
  'ApplicationMessageId',
  'PredecessorMessageGuid',
  'ApplicationMessageType',
  'Sender',
  'Receiver',
  'IntegrationFlowName',
  'Status',
  'AlternateWebLink',
  'LogLevel',
  'CustomStatus',
  'ArchivingStatus',
  'TransactionId',
  'PreviousComponentName',
  'LocalComponentName',
  'OriginComponentName',
  'IntegrationArtifact.Id',
  'IntegrationArtifact.Name',
  'IntegrationArtifact.Type',
  'IntegrationArtifact.PackageId',
  'IntegrationArtifact.PackageName',
  'CustomHeaderProperties.Receiver',
  'CustomHeaderProperties.Sender',
  'CustomHeaderProperties.Region',
  'CustomHeaderProperties.BusinessObject',
  'CustomHeaderProperties.Queue',
  'CustomHeaderProperties.ClientId',
];

const CUSTOM_DATE = [
  'LogStart',
  'LogEnd',
  'LastChangeTime',
  'CustomHeaderProperties.TimeStamp',
];

const CUSTOM_BOOLEAN = [
  'ArchivingSenderChannelMessages',
  'ArchivingReceiverChannelMessages',
  'ArchivingLogAttachments',
  'ArchivingPersistedMessages',
];

/* =========================================================
   OBMQ LOG FIELDS (Salesforce / Order Broker Logs)
   ========================================================= */

const OBMQ_KEYWORD = [
  'RecordId__c',
  'Name',
  'Status__c',
  'Id',
  'log_source',
  'tags',
  'host.hostname',
  'host.name',
  'host.ip',
  'agent.name',
  'agent.id',
  'log.file.path',
];

const OBMQ_TEXT = [
  'Message__c',
  'Response__c',
];

const OBMQ_DATE = [
  'CreatedDate',
  'IntegrationStartTime__c',
  'IntegrationEndTime__c',
  'LastModifiedDate',
  '@timestamp',
];

const OBMQ_NUMERIC = [
  'TotalIntegrationTime__c',
  'log.offset',
];

/* =========================================================
   NESTED PATHS
   ========================================================= */
const NESTED_PATHS = {};

/* =========================================================
   VALIDATION ERROR
   ========================================================= */
class ValidationError extends Error { }

/* =========================================================
   FIELD TYPE MAPS
   ========================================================= */
const CUSTOM_FIELDS = {};
CUSTOM_KEYWORD.forEach((f) => { CUSTOM_FIELDS[f] = 'keyword'; });
CUSTOM_DATE.forEach((f) => { CUSTOM_FIELDS[f] = 'date'; });
CUSTOM_BOOLEAN.forEach((f) => { CUSTOM_FIELDS[f] = 'boolean'; });

const OBMQ_FIELDS = {};
OBMQ_KEYWORD.forEach((f) => { OBMQ_FIELDS[f] = 'keyword'; });
OBMQ_TEXT.forEach((f) => { OBMQ_FIELDS[f] = 'text'; });
OBMQ_DATE.forEach((f) => { OBMQ_FIELDS[f] = 'date'; });
OBMQ_NUMERIC.forEach((f) => { OBMQ_FIELDS[f] = 'numeric'; });

// Combined dictionary for lookup
const ALL_FIELDS = { ...CUSTOM_FIELDS, ...OBMQ_FIELDS };

/* =========================================================
   METADATA WITH FRIENDLY LABELS & CATEGORIES
   ========================================================= */
const OBMQ_METADATA = [
  { field: 'RecordId__c', label: 'Record ID (RecordId__c)', type: 'keyword', category: 'Core Identifiers', placeholder: 'e.g. 0a69O000001WDHhQAO' },
  { field: 'Name', label: 'OBMQ Name', type: 'keyword', category: 'Core Identifiers', placeholder: 'e.g. OBMQ-0000010466' },
  { field: 'Status__c', label: 'Status (Status__c)', type: 'keyword', category: 'Status & State', placeholder: 'e.g. Delivered' },
  { field: 'Id', label: 'Salesforce ID (Id)', type: 'keyword', category: 'Core Identifiers', placeholder: 'e.g. a0K9O00000SRzX7UAL' },
  { field: 'TotalIntegrationTime__c', label: 'Integration Time (ms)', type: 'numeric', category: 'Performance', placeholder: 'e.g. 1971' },
  { field: 'Message__c', label: 'Message Payload (JSON)', type: 'text', category: 'Payloads', placeholder: 'Search inside request JSON...' },
  { field: 'Response__c', label: 'Response Payload (JSON)', type: 'text', category: 'Payloads', placeholder: 'Search inside response JSON...' },
  { field: 'CreatedDate', label: 'Created Date', type: 'date', category: 'Timestamps', placeholder: 'YYYY-MM-DD or full timestamp' },
  { field: 'IntegrationStartTime__c', label: 'Integration Start Time', type: 'date', category: 'Timestamps', placeholder: 'YYYY-MM-DD or full timestamp' },
  { field: 'IntegrationEndTime__c', label: 'Integration End Time', type: 'date', category: 'Timestamps', placeholder: 'YYYY-MM-DD or full timestamp' },
  { field: 'LastModifiedDate', label: 'Last Modified Date', type: 'date', category: 'Timestamps', placeholder: 'YYYY-MM-DD' },
  { field: '@timestamp', label: '@timestamp (Ingest)', type: 'date', category: 'Timestamps', placeholder: 'YYYY-MM-DD' },
  { field: 'log_source', label: 'Log Source', type: 'keyword', category: 'System & Beat', placeholder: 'e.g. obmq' },
  { field: 'tags', label: 'Tags', type: 'keyword', category: 'System & Beat', placeholder: 'e.g. beats_input_raw_event' },
  { field: 'host.hostname', label: 'Host Hostname', type: 'keyword', category: 'System & Beat', placeholder: 'e.g. a1f8fc12ef72' },
  { field: 'agent.name', label: 'Agent Name', type: 'keyword', category: 'System & Beat', placeholder: 'e.g. a1f8fc12ef72' },
];

const CUSTOM_METADATA = [
  { field: 'MessageGuid', label: 'Message GUID', type: 'keyword', category: 'Identifiers', placeholder: 'e.g. AGqPHFClCekK9euVZrwi0NJnEjsS' },
  { field: 'CorrelationId', label: 'Correlation ID', type: 'keyword', category: 'Identifiers', placeholder: 'e.g. AGqPHFBxJ4ozUYvWZPPJiFrdR399' },
  { field: 'Status', label: 'Status', type: 'keyword', category: 'Status & State', placeholder: 'COMPLETED, FAILED, DISCARDED' },
  { field: 'Sender', label: 'Sender', type: 'keyword', category: 'Integration & Routing', placeholder: 'e.g. SAP, TACC' },
  { field: 'Receiver', label: 'Receiver', type: 'keyword', category: 'Integration & Routing', placeholder: 'e.g. SFDC, SAP IS' },
  { field: 'IntegrationFlowName', label: 'Integration Flow Name', type: 'keyword', category: 'Integration & Routing', placeholder: 'e.g. TACC_TokenGeneration' },
  { field: 'LogLevel', label: 'Log Level', type: 'keyword', category: 'Status & State', placeholder: 'e.g. INFO, ERROR' },
  { field: 'CustomStatus', label: 'Custom Status', type: 'keyword', category: 'Status & State', placeholder: 'e.g. COMPLETED' },
  { field: 'TransactionId', label: 'Transaction ID', type: 'keyword', category: 'Identifiers', placeholder: 'e.g. c972f43216...' },
  { field: 'IntegrationArtifact.Name', label: 'Artifact Name', type: 'keyword', category: 'Integration & Routing', placeholder: 'e.g. TACC_BR_TokenGeneration' },
  { field: 'IntegrationArtifact.Id', label: 'Artifact ID', type: 'keyword', category: 'Integration & Routing', placeholder: 'e.g. TACC_TokenGeneration' },
  { field: 'CustomHeaderProperties.Sender', label: 'Header Sender', type: 'keyword', category: 'Custom Headers', placeholder: 'e.g. TACC' },
  { field: 'CustomHeaderProperties.Receiver', label: 'Header Receiver', type: 'keyword', category: 'Custom Headers', placeholder: 'e.g. SAP IS' },
  { field: 'CustomHeaderProperties.Region', label: 'Header Region', type: 'keyword', category: 'Custom Headers', placeholder: 'e.g. LATAM, NA, EMEA' },
  { field: 'CustomHeaderProperties.BusinessObject', label: 'Business Object', type: 'keyword', category: 'Custom Headers', placeholder: 'e.g. Authentication Token' },
  { field: 'CustomHeaderProperties.Queue', label: 'Queue', type: 'keyword', category: 'Custom Headers', placeholder: 'e.g. InboundQueue' },
  { field: 'LogStart', label: 'Log Start Time', type: 'date', category: 'Timestamps', placeholder: 'YYYY-MM-DD or full timestamp' },
  { field: 'LogEnd', label: 'Log End Time', type: 'date', category: 'Timestamps', placeholder: 'YYYY-MM-DD' },
  { field: 'LastChangeTime', label: 'Last Change Time', type: 'date', category: 'Timestamps', placeholder: 'Epoch millis or ISO date' },
  { field: 'ArchivingStatus', label: 'Archiving Status', type: 'keyword', category: 'Status & State', placeholder: 'e.g. NOT_RELEVANT' },
];

/* =========================================================
   BUILDERS
   ========================================================= */
const BUILDERS = {
  keyword: (field, value) => ({
    match_phrase: {
      [field]: value,
    },
  }),

  text: (field, value) => ({
    match_phrase: {
      [field]: value,
    },
  }),

  numeric: (field, value) => {
    const num = Number(value);
    if (Number.isNaN(num)) {
      throw new ValidationError(`${field} expects a numeric value`);
    }
    return {
      term: {
        [field]: num,
      },
    };
  },

  date: (field, value) => {
    if (Number.isNaN(Date.parse(value))) {
      throw new ValidationError(
        `${field} expects a valid date, e.g. 2026-08-31 or 2026-08-31T10:00:00Z`
      );
    }
    return {
      range: {
        [field]: {
          gte: value,
          lte: value,
        },
      },
    };
  },

  boolean: (field, value) => {
    const s = String(value).toLowerCase();
    if (s !== 'true' && s !== 'false') {
      throw new ValidationError(`${field} expects true or false`);
    }
    return {
      term: {
        [field]: s === 'true',
      },
    };
  },
};

/* =========================================================
   BUILD CLAUSE FOR CUSTOM LOGS
   ========================================================= */
function buildCustomQuery(field, value) {
  if (!CUSTOM_FIELDS[field]) {
    // If not a predefined custom field, check if it's in ALL_FIELDS or general
    if (!ALL_FIELDS[field]) {
      throw new ValidationError(`Unsupported field for Custom Logs: ${String(field).slice(0, 60)}`);
    }
    // Fall back to keyword match
    return { match_phrase: { [field]: value } };
  }

  const q = BUILDERS[CUSTOM_FIELDS[field]](field, value);
  const root = field.split('.')[0];

  return field.includes('.') && NESTED_PATHS[root]
    ? {
      nested: {
        path: NESTED_PATHS[root],
        query: q,
      },
    }
    : q;
}

/* =========================================================
   BUILD MAIN CUSTOM LOG FILTER QUERY
   ========================================================= */
function buildFilterQuery(filters) {
  const clauses = filters.map((f, i) => {
    try {
      return buildCustomQuery(f.field, f.value);
    } catch (e) {
      if (e instanceof ValidationError && filters.length > 1) {
        throw new ValidationError(`Filter ${i + 1}: ${e.message}`);
      }
      throw e;
    }
  });

  if (clauses.length === 1) return clauses[0];
  return { bool: { filter: clauses } };
}

/* =========================================================
   BUILD CLAUSE FOR OBMQ LOGS
   ========================================================= */
function buildOBMQQueryClause(field, value) {
  const type = OBMQ_FIELDS[field];
  if (type && BUILDERS[type]) {
    return BUILDERS[type](field, value);
  }

  // If the field isn't an explicit OBMQ field (e.g. user selected custom field in cross-search),
  // search the value across all fields in OBMQ:
  return {
    query_string: {
      query: `"${escapeQueryValue(value)}"`,
      fields: ['*'],
      lenient: true,
    },
  };
}

/* =========================================================
   BUILD OBMQ FILTER QUERY
   ========================================================= */
function buildOBMQFilterQuery(filters) {
  if (!filters || filters.length === 0) {
    return { match_all: {} };
  }

  const clauses = filters.map((f, i) => {
    try {
      return buildOBMQQueryClause(f.field, f.value);
    } catch (e) {
      if (e instanceof ValidationError && filters.length > 1) {
        throw new ValidationError(`Filter ${i + 1}: ${e.message}`);
      }
      throw e;
    }
  });

  if (clauses.length === 1) return clauses[0];
  return { bool: { filter: clauses } };
}

/* =========================================================
   LEGACY / GENERAL OBMQ QUERY
   ========================================================= */
function buildOBMQQuery(filters) {
  const values = filters
    .map((f) => String(f.value).trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new ValidationError('At least one value is required for OBMQ search');
  }

  if (values.length === 1) {
    return {
      query_string: {
        query: `"${escapeQueryValue(values[0])}"`,
        fields: ['*'],
        lenient: true,
      },
    };
  }

  return {
    bool: {
      must: values.map((value) => ({
        query_string: {
          query: `"${escapeQueryValue(value)}"`,
          fields: ['*'],
          lenient: true,
        },
      })),
    },
  };
}

/* =========================================================
   ESCAPE QUERY VALUE
   ========================================================= */
function escapeQueryValue(value) {
  return String(value).replace(/([+\-=&|><!(){}\[\]^"~*?:\\/])/g, '\\$1');
}

/* =========================================================
   EXPORT
   ========================================================= */
module.exports = {
  FIELDS: ALL_FIELDS,
  CUSTOM_FIELDS,
  OBMQ_FIELDS,
  OBMQ_METADATA,
  CUSTOM_METADATA,
  buildQuery: buildCustomQuery,
  buildCustomQuery,
  buildFilterQuery,
  buildOBMQQueryClause,
  buildOBMQFilterQuery,
  buildOBMQQuery,
  escapeQueryValue,
  ValidationError,
};