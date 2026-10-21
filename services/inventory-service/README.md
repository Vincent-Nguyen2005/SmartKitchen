# inventory-service

**Owner:** Khanh
**Responsibility:** Pantry stock and ingredient inventory APIs.

## Port
- Service: `4003`
- Database: `inventory_db` (container port `5403`)

## Endpoints
- `GET /health` → `{ status: "OK", service: "inventory-service", timestamp }`

## Local dev
```bash
pnpm --filter inventory-service dev
curl http://localhost:4003/healt
