# AP – ELK Log Search

```
AP/
├── frontend/   React (Vite)
└── backend/    Express
```
Requires Node 18+ and a running local Elasticsearch.

## Run
```bash
# terminal 1
cd backend && cp .env.example .env && npm install && npm start     # :3001

# terminal 2
cd frontend && cp .env.example .env && npm install && npm run dev  # :5173
```
Open http://localhost:5173 (Vite proxies `/api` to the backend).

## API
`POST /api/logs/search`
```json
{ "filters": [ { "field": "Status", "value": "FAILED" }, { "field": "Sender", "value": "SAP" } ], "page": 1, "pageSize": 50 }
```
Filters are combined with **AND** (max 10). The old `{ "field", "value" }` shape still works as a single filter.
→ `{ data, pagination: { page, pageSize, total, totalPages, hasNext, hasPrev }, took }`
`GET /api/logs/fields` – supported fields.

## UI
Use **+** to add another field/value row and **−** to remove one. A field already used in one row is hidden from the other dropdowns.

## Customising
Edit `backend/queryMap.js` (KEYWORD / DATE / BOOLEAN lists, `NESTED_PATHS`). The frontend never sends raw ES queries.
ES index names must be lowercase – set `ES_INDEX` to your real index name.
