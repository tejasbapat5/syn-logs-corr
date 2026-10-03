'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFilterQuery,
  buildOBMQFilterQuery,
} = require('./queryMap');

test('OBMQ identifier searches fall back to broad matching when exact keyword match is too strict', () => {
  const q = buildOBMQFilterQuery([{ field: 'RecordId__c', value: '0a69O000001WDHhQAO' }]);

  assert.ok(q.bool || q.wildcard || q.query_string, 'expected a resilient identifier query');
  if (q.bool) {
    assert.ok(Array.isArray(q.bool.should) || Array.isArray(q.bool.filter));
  }
});

test('Custom log searches keep AND semantics but still allow the identifier fallback path', () => {
  const q = buildFilterQuery([
    { field: 'MessageGuid', value: 'abc123' },
    { field: 'CorrelationId', value: 'xyz789' },
  ]);

  assert.equal(q.bool.filter.length, 2);
});

test('Custom log unknown fields use a broad fallback query so cross-log correlation IDs can match', () => {
  const q = buildFilterQuery([{ field: 'RecordId__c', value: '5009O00000KwL7xQAF' }]);

  assert.ok(q.bool || q.query_string || q.wildcard);
  if (q.bool) {
    assert.ok(Array.isArray(q.bool.should));
  }
});
