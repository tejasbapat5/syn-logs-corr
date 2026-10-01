import { useState } from 'react';

function tryFormatJson(val) {
  if (!val) return null;
  if (typeof val === 'object') {
    return JSON.stringify(val, null, 2);
  }
  try {
    const parsed = JSON.parse(val);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(val);
  }
}

export default function DetailDrawer({ record, onClose, onToast }) {
  const [activeTab, setActiveTab] = useState('payload1');

  if (!record) return null;

  const isObmq = record._logType === 'obmq' || record._sourceIndex?.includes('obmq');

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    onToast?.(`Copied ${label} to clipboard!`);
  };

  const formattedMsg = tryFormatJson(record.Message__c);
  const formattedResp = tryFormatJson(record.Response__c);
  const formattedRaw = JSON.stringify(record, null, 2);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className={`field-badge ${isObmq ? 'obmq' : 'custom'}`}>
              {isObmq ? 'OBMQ LOG' : 'CUSTOM LOG'}
            </span>
            <h2 className="drawer-title">
              {isObmq ? (record.Name || record.RecordId__c || 'OBMQ Record') : (record.MessageGuid || 'Log Record')}
            </h2>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close detail drawer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="drawer-tabs">
          {isObmq ? (
            <>
              {formattedMsg && (
                <button
                  type="button"
                  className={`drawer-tab ${activeTab === 'payload1' ? 'active' : ''}`}
                  onClick={() => setActiveTab('payload1')}
                >
                  Order Message Payload
                </button>
              )}
              {formattedResp && (
                <button
                  type="button"
                  className={`drawer-tab ${activeTab === 'payload2' ? 'active' : ''}`}
                  onClick={() => setActiveTab('payload2')}
                >
                  Response Payload
                </button>
              )}
              <button
                type="button"
                className={`drawer-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Attributes
              </button>
              <button
                type="button"
                className={`drawer-tab ${activeTab === 'raw' ? 'active' : ''}`}
                onClick={() => setActiveTab('raw')}
              >
                Raw Document
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`drawer-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Overview & Headers
              </button>
              <button
                type="button"
                className={`drawer-tab ${activeTab === 'raw' ? 'active' : ''}`}
                onClick={() => setActiveTab('raw')}
              >
                Raw Document
              </button>
            </>
          )}
        </div>

        {/* Content Body */}
        <div className="drawer-content">
          {/* OBMQ Message tab */}
          {isObmq && activeTab === 'payload1' && formattedMsg && (
            <div className="code-container">
              <div className="code-header">
                <span>Message__c (Order Payload JSON)</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyToClipboard(formattedMsg, 'Message JSON')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy JSON
                </button>
              </div>
              <pre className="code-block">{formattedMsg}</pre>
            </div>
          )}

          {/* OBMQ Response tab */}
          {isObmq && activeTab === 'payload2' && formattedResp && (
            <div className="code-container">
              <div className="code-header">
                <span>Response__c (Response Payload JSON)</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyToClipboard(formattedResp, 'Response JSON')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy JSON
                </button>
              </div>
              <pre className="code-block">{formattedResp}</pre>
            </div>
          )}

          {/* Attributes / Overview tab */}
          {activeTab === 'overview' && (
            <>
              <div className="detail-grid">
                {isObmq ? (
                  <>
                    <div className="detail-item">
                      <div className="detail-label">Status</div>
                      <div className="detail-val">
                        <span className="status-pill success">{record.Status__c || 'Delivered'}</span>
                      </div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Record ID</div>
                      <div className="detail-val">{record.RecordId__c || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">OBMQ Name</div>
                      <div className="detail-val">{record.Name || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Salesforce ID</div>
                      <div className="detail-val">{record.Id || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Integration Duration</div>
                      <div className="detail-val">{record.TotalIntegrationTime__c ? `${record.TotalIntegrationTime__c} ms` : '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Created Date</div>
                      <div className="detail-val">{record.CreatedDate || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Start Time</div>
                      <div className="detail-val">{record.IntegrationStartTime__c || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">End Time</div>
                      <div className="detail-val">{record.IntegrationEndTime__c || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Log Source</div>
                      <div className="detail-val">{record.log_source || 'obmq'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Host Name</div>
                      <div className="detail-val">{record.host?.hostname || record.host?.name || '—'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="detail-item">
                      <div className="detail-label">Status</div>
                      <div className="detail-val">
                        <span className={`status-pill ${record.Status === 'COMPLETED' ? 'success' : record.Status === 'FAILED' ? 'error' : 'warn'}`}>
                          {record.Status || '—'}
                        </span>
                      </div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Message GUID</div>
                      <div className="detail-val">{record.MessageGuid || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Correlation ID</div>
                      <div className="detail-val">{record.CorrelationId || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Sender</div>
                      <div className="detail-val">{record.Sender || record['CustomHeaderProperties.Sender'] || record.CustomHeaderProperties?.Sender || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Receiver</div>
                      <div className="detail-val">{record.Receiver || record['CustomHeaderProperties.Receiver'] || record.CustomHeaderProperties?.Receiver || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Integration Flow</div>
                      <div className="detail-val">{record.IntegrationFlowName || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Log Start</div>
                      <div className="detail-val">{record.LogStart || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Log End</div>
                      <div className="detail-val">{record.LogEnd || '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Log Level</div>
                      <div className="detail-val">{record.LogLevel || 'INFO'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Transaction ID</div>
                      <div className="detail-val">{record.TransactionId || '—'}</div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Raw Document Tab */}
          {activeTab === 'raw' && (
            <div className="code-container">
              <div className="code-header">
                <span>Elasticsearch Source Document</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyToClipboard(formattedRaw, 'Document JSON')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy JSON
                </button>
              </div>
              <pre className="code-block">{formattedRaw}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
