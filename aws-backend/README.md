# NHAI FaceAuth — AWS Sync Backend

Reference backend for the offline → online attendance **sync & purge** deliverable.
When a field device regains connectivity, the app's `SyncService` POSTs its queued
attendance records here; on a `200` it marks them synced and purges local copies.

## Contents

| File | Purpose |
|---|---|
| `lambda_handler.py` | AWS Lambda — validates records, writes to DynamoDB idempotently |
| `serverless.yml` | One-command infra: Lambda + API Gateway + DynamoDB table |
| `mock_server.py` | Zero-dependency local stand-in for live demos (no AWS needed) |

## Option A — Local demo (recommended for the hackathon)

No AWS account required. Great for showing the full sync/purge loop on stage.

```bash
python mock_server.py
```

1. Find your laptop's LAN IP (`ipconfig` on Windows → IPv4 Address).
2. In `FaceAuthApp/SyncService.ts` set:
   ```ts
   const AWS_ENDPOINT = 'http://<LAPTOP_IP>:8080/attendance';
   ```
3. Phone + laptop on the **same Wi-Fi**.
4. Enroll → verify a few times offline (airplane mode), then re-enable Wi-Fi or
   tap **Sync**. Records print in the server console and the app's pending count
   drops to zero (purge confirmed).

## Option B — Real AWS deployment

```bash
npm install -g serverless
cd aws-backend
serverless deploy          # provisions Lambda + API Gateway + DynamoDB
```

Serverless prints an endpoint like:

```
endpoint: POST https://abc123.execute-api.ap-south-1.amazonaws.com/prod/attendance
```

Paste that into `SyncService.ts` → `AWS_ENDPOINT`. Done.

### Verify records landed

```bash
aws dynamodb scan --table-name nhai_attendance --region ap-south-1
```

## Request / response contract

**Request** (from the app):
```json
{
  "records": [
    { "id": 1, "employeeId": "EMP-1234", "timestamp": 1733385600000,
      "similarityScore": 0.71, "challenge": "BLINK" }
  ]
}
```

**Response** (on success):
```json
{ "synced": 1, "skipped": 0 }
```

## Why it's safe to retry

The DynamoDB primary key is `(employee_id, timestamp)`. Re-sending the same
record overwrites itself rather than duplicating — so if the network drops
mid-sync, the app can safely resend the whole batch on the next attempt.

## Security notes for production

- Put the endpoint behind **API Gateway + IAM / Cognito** or an API key; the demo is open.
- Enable **TLS only** (API Gateway is HTTPS by default).
- Consider **field-level encryption** of `employee_id` if it is PII under your policy.
