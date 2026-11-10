# IDEAL FLOOR CRM — Backup and security runbook (draft)

## Current verified facts
- Application: Node.js/Express + Mongoose, hosted on Render in Oregon.
- MongoDB is external to Render's Postgres/Key Value offerings.
- MongoDB provider, cluster region, backup tier, retention, and restore capability are **not verified**.
- This repository does **not** establish that production backups exist.

## Do not do
- Never run a production restore without a fresh verified backup and explicit approval.
- Never store MongoDB URI, backup files, or encryption keys in GitHub, browser, application logs, or public folders.
- Never rely on Render's ephemeral filesystem as a durable backup destination.
- Do not enable AI write access before recovery testing and permission review.

## Immediate operator checklist
1. Identify MongoDB provider, cluster, region, backup plan, and point-in-time recovery capability.
2. Verify MongoDB Atlas (if used) automated backup status and retention in the provider console.
3. Confirm residency and cross-border transfer requirements with Kazakhstan legal/security advisors.
4. Provision a **separate encrypted, access-controlled, persistent** backup destination, preferably with versioning and immutability.
5. Use a dedicated read-only backup credential with minimum privileges and secret manager storage.
6. Test a backup and restoration into a disposable **nonproduction** database; compare collection counts and representative records.
7. Enable scheduled runs with failure alerts and retention policy; monitor last successful backup.
8. Document RPO (maximum acceptable data loss) and RTO (maximum acceptable outage).

## Manual archive utility
`node scripts/mongodb-backup.js` requires:
- MongoDB Database Tools (`mongodump`) installed on the execution host.
- `MONGODB_URI` or `MONGO_URI` supplied securely.
- `BACKUP_DEST_DIR` pointing to separately persistent storage.

It writes a gzip archive and SHA-256 checksum. It does **not** encrypt, schedule, replicate, upload, retain, or test restores. It is **not** a complete backup solution and must not be deployed as such.

## Restore rehearsal (isolated environment only)
1. Create disposable MongoDB database/cluster with restricted access.
2. Verify archive checksum.
3. Restore archive using MongoDB Database Tools (`mongorestore`) with a destination URI for the isolated environment; ensure namespace mapping is correct.
4. Validate data, permissions, and app behavior. Record duration and results.
5. Delete the test environment after approval.

## Security issues for next review
- Ensure JWT_SECRET is fixed, strong, and set in production; startup currently falls back to a random secret.
- Review public API routes, scope enforcement, export endpoints, CORS, audit log redaction, session lifecycle, rate limiting, and security headers.
- Check whether startup seeding modifies administrator permissions and whether this is intended.
- Run dependency and authorization tests before making production changes.

## IDEAL AI sequence
Only after backups, restore test, and access-control audit: implement read-only AI service with role-scoped tools, audit logs, usage limits, and no direct MongoDB query generation.
