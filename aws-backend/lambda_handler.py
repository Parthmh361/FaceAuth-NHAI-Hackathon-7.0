"""
AWS Lambda handler for NHAI FaceAuth attendance sync.
=====================================================
Receives batched offline attendance records from the mobile app and writes
them idempotently to DynamoDB. Paired with API Gateway (POST /attendance).

The mobile SyncService posts:  { "records": [ { id, employeeId, timestamp,
similarityScore, challenge }, ... ] }

Idempotency: the DynamoDB primary key is (employee_id, timestamp), so
re-sending the same record is a harmless overwrite — safe for the app's
"sync then purge" retry semantics.
"""

import json
import os
import decimal

import boto3
from botocore.exceptions import ClientError

TABLE_NAME = os.environ.get('TABLE_NAME', 'nhai_attendance')
_dynamo = boto3.resource('dynamodb')
_table = _dynamo.Table(TABLE_NAME)


def _response(status, body):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body),
    }


def handler(event, context):
    # API Gateway proxy integration delivers the JSON body as a string
    try:
        payload = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _response(400, {'error': 'invalid JSON body'})

    records = payload.get('records', [])
    if not isinstance(records, list) or not records:
        return _response(400, {'error': 'no records provided'})

    written, skipped = 0, 0
    try:
        with _table.batch_writer() as batch:
            for r in records:
                emp = r.get('employeeId')
                ts = r.get('timestamp')
                if emp is None or ts is None:
                    skipped += 1
                    continue
                batch.put_item(Item={
                    'employee_id': str(emp),
                    'timestamp': decimal.Decimal(str(ts)),
                    'similarity_score': decimal.Decimal(str(r.get('similarityScore', 0))),
                    'challenge': str(r.get('challenge', 'NONE')),
                    'device_record_id': decimal.Decimal(str(r.get('id', 0))),
                })
                written += 1
    except ClientError as e:
        return _response(500, {'error': e.response['Error']['Message']})

    # The app purges locally only on a 200, so report exactly what landed.
    return _response(200, {'synced': written, 'skipped': skipped})
