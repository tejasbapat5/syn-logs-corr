const ES_URL = 'http://localhost:9200';

async function request(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function ensureIndex(name) {
  try {
    await request(`${ES_URL}/${name}`, 'PUT', {
      settings: { index: { number_of_shards: 1, number_of_replicas: 0 } },
    });
  } catch (error) {
    if (!String(error.message).includes('resource_already_exists_exception')) {
      throw error;
    }
  }
}

async function main() {
  await ensureIndex('custom-logs');
  await ensureIndex('obmq-logs');

  const customDoc = {
    MessageGuid: 'sap-msg-001',
    CorrelationId: 'corr-5009-001',
    ApplicationMessageId: 'app-5009-001',
    Status: 'COMPLETED',
    Sender: 'SAP',
    Receiver: 'SFDC',
    IntegrationFlowName: 'Identity_CaseCreate_SalesforceGlobal',
    LogLevel: 'INFO',
    LogStart: '2026-08-26T10:15:00Z',
    LastChangeTime: '2026-08-26T10:15:05Z',
    TransactionId: 'txn-5009-001',
    CustomHeaderProperties: {
      id: '5009O00000KwL7xQAF',
      Sender: 'SAP',
      Receiver: 'SFDC',
      BusinessObject: 'Case',
      Region: 'NA',
    },
  };

  const obmqDoc = {
    RecordId__c: '5009O00000KwL7xQAF',
    Name: 'OBMQ-0000010333',
    Status__c: 'Delivered',
    Id: 'a0K9O00000SRzX7UAL',
    CreatedDate: '2026-08-26T10:15:01Z',
    IntegrationStartTime__c: '2026-08-26T10:15:00Z',
    IntegrationEndTime__c: '2026-08-26T10:15:04Z',
    Message__c: '{"order_header":{"custom_header_id":"5009O00000KwL7xQAF"}}',
    Response__c: '{"CardHeaderID":"5009O00000KwL7xQAF"}',
  };

  await request(`${ES_URL}/custom-logs/_doc`, 'POST', customDoc);
  await request(`${ES_URL}/obmq-logs/_doc`, 'POST', obmqDoc);

  console.log('Seeded sample correlation documents into custom-logs and obmq-logs');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
