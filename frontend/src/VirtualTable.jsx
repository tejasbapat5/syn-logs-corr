import { useEffect, useRef, useState, useMemo } from 'react';

const ROW_H = 40;
const VIEW_H = 520;
const BUFFER = 8;

const fmt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
};

export default function VirtualTable({ rows, cols, onSelectRow }) {
  const ref = useRef(null);
  const [top, setTop] = useState(0);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [rows]);

  const start = Math.max(0, Math.floor(top / ROW_H) - BUFFER);
  const end = Math.min(rows.length, Math.ceil((top + VIEW_H) / ROW_H) + BUFFER);

  // Column width calculator
  const colWidths = useMemo(() => {
    const map = {};
    cols.forEach((c) => {
      if (c === '_actions') map[c] = 90;
      else if (c === '_logType') map[c] = 110;
      else if (c === 'Status' || c === 'Status__c') map[c] = 125;
      else if (c === 'Name') map[c] = 175;
      else if (c === 'RecordId__c') map[c] = 210;
      else if (c === 'MessageGuid') map[c] = 230;
      else if (c === 'CreatedDate' || c === 'LogStart' || c === '@timestamp') map[c] = 180;
      else if (c === 'TotalIntegrationTime__c') map[c] = 140;
      else if (c === 'Sender' || c === 'Receiver') map[c] = 160;
      else if (c === 'IntegrationFlowName') map[c] = 220;
      else map[c] = 190;
    });
    return map;
  }, [cols]);

  const totalTableWidth = useMemo(() => {
    return cols.reduce((sum, c) => sum + (colWidths[c] || 190), 0);
  }, [cols, colWidths]);

  const renderCell = (col, val, row) => {
    if (col === '_actions') {
      return (
        <button
          type="button"
          className="row-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onSelectRow?.(row);
          }}
          title="Inspect Payload & Full Details"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View
        </button>
      );
    }

    if (col === '_logType') {
      const isObmq = val === 'obmq' || row._sourceIndex?.includes('obmq');
      return (
        <span className={`field-badge ${isObmq ? 'obmq' : 'custom'}`}>
          {isObmq ? 'OBMQ' : 'CUSTOM'}
        </span>
      );
    }

    if (col === 'Status' || col === 'Status__c') {
      const s = String(val || '').toUpperCase();
      let statusClass = 'info';
      if (s === 'COMPLETED' || s === 'DELIVERED' || s === 'SUCCESS') statusClass = 'success';
      else if (s === 'FAILED' || s === 'ERROR') statusClass = 'error';
      else if (s === 'DISCARDED' || s === 'WARNING') statusClass = 'warn';

      return (
        <span className={`status-pill ${statusClass}`}>
          {val || '—'}
        </span>
      );
    }

    const formatted = fmt(val);
    if (formatted === null) {
      return <span className="null">—</span>;
    }

    return (
      <span title={formatted}>
        {formatted}
      </span>
    );
  };

  return (
    <div className="table-card card">
      <div
        className="scroller"
        ref={ref}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      >
        <table style={{ minWidth: totalTableWidth }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  title={c}
                  style={{ width: colWidths[c], minWidth: colWidths[c] }}
                >
                  {c === '_actions' ? 'Details' : c === '_logType' ? 'Log Source' : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {start > 0 && <tr style={{ height: start * ROW_H }} />}
            {rows.slice(start, end).map((r, i) => (
              <tr
                key={r._id || start + i}
                onClick={() => onSelectRow?.(r)}
                title="Click to view complete log details"
              >
                {cols.map((c) => (
                  <td
                    key={c}
                    style={{ width: colWidths[c], maxWidth: colWidths[c] }}
                  >
                    {renderCell(c, r[c], r)}
                  </td>
                ))}
              </tr>
            ))}
            {end < rows.length && (
              <tr style={{ height: (rows.length - end) * ROW_H }} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
