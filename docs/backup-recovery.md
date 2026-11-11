# CRM backup and recovery

Administrators: Employees → Backups. Save the recovery key to separate protected offline storage, then download a backup or connect Google Drive. Archives are encrypted AES-256-GCM streams containing gzip-compressed canonical MongoDB Extended JSON. The complete encrypted archive is decrypted and its record checksum and counts checked before offering it for download or upload. A Drive upload counts as successful only after a metadata readback confirms size, MD5 and private visibility. No automatic deletion of old copies is implemented: monitor Drive space.

## Server configuration

- `BACKUP_ENCRYPTION_KEY`: 32 random bytes encoded as 64 hex characters. Keep fixed; changing it makes existing tokens and archives unreadable with the new key. Never commit it.
- Existing `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` can identify the OAuth web client; Gmail refresh tokens are NOT reused. Optional dedicated `BACKUP_GOOGLE_CLIENT_ID` / `BACKUP_GOOGLE_CLIENT_SECRET` override these.
- Enable Google Drive API in that client's project. Add `https://dealer-crm.onrender.com/backup-google/callback` as an authorized redirect URI. Consent requests only `drive.file`, allowing the application to create its own private folder. The ChatGPT-created folder is separate and is not silently assumed accessible to the CRM OAuth application.
- Refresh tokens are encrypted in `crm_backup_config` with a domain-separated key. OAuth state is single-use, expires in 10 minutes and requires an HttpOnly Secure SameSite=Lax browser cookie. The administrator's current account must still be active at callback time.
- No new API key, password or refresh token is returned to the browser. Only the dedicated key download (administrator, authenticated, no-store) returns the backup encryption key so the owner can recover independently.

## Scope and limitations

This copies all non-system collections in the application's current database, including collections, indexes and view definitions. BSON types are represented with canonical EJSON. Cloudinary/Drive/other external photos and files are references, not binary copies. Database users, Atlas configuration, Render environment variables and other databases are NOT included.

The export is a sequential online copy, NOT a point-in-time snapshot or MongoDB-native mongodump archive. Concurrent changes across collections can be captured at different moments. Quiesce business writes for a consistent rehearsal. Unsupported collection kinds fail the export rather than being silently skipped. Temporary files use mode 0600 and are removed after delivery/failure; temporary disk on Render is not durable storage. The server limits each operation to 10 minutes and encrypted files to 1 GiB.

Automatic backup is opt-in, no more than once per 24 hours, checked every 15 minutes while the service is awake, with a 15-minute database lease and one-hour failure backoff. Render Free can sleep: there is NO guaranteed schedule. The UI marks copies older than 36 hours overdue. Use an independently scheduled runner or provider snapshots for guaranteed backup intervals. Alerts and immutable retention are not implemented.

## Restore rehearsal — NEVER against production

Keep the original archive and recovery key. Install this project's normal dependencies on an isolated machine. Configure `RESTORE_MONGODB_URI` securely in the process environment for a separate test cluster; do not put the URI in source, screenshots, shell history or public logs.

```
node scripts/restore-backup.js /path/to/archive.idealbak /path/to/IDEAL-CRM-recovery-key.json ideal_crm_restore_rehearsal
```

The script authenticates and validates the full archive before connecting to the destination, refuses database names that do not start `ideal_crm_restore_`, and refuses nonempty destinations. It restores documents, indexes, collection options and views, then compares document counts. Failed restores may leave a partial test database: inspect it before retrying. This script never drops a database and does not change the production connection string.

Locally verified: fake-database round trip with ObjectId, Date, Decimal128, Binary, Long >2^53, indexes, validators and views; wrong key/tampering/truncation rejected; production/nonempty restore destinations rejected; HTTP administrator gates and OAuth-state rejection tested. A real-data production backup, Google upload and isolated MongoDB restore must be confirmed after user OAuth consent. Unit tests alone are not a production recovery rehearsal.
