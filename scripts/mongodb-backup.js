#!/usr/bin/env node
'use strict';
// Manual backup runner. Requires MongoDB Database Tools (mongodump).
// IMPORTANT: BACKUP_DEST_DIR must be a persistent, separately backed-up volume.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const target = process.env.BACKUP_DEST_DIR;
if (!uri || !target) {
  console.error('Missing MONGODB_URI/MONGO_URI or BACKUP_DEST_DIR. No backup attempted.');
  process.exit(2);
}
const dest = path.resolve(target);
const repo = path.resolve(__dirname, '..');
if (dest === repo || dest.startsWith(repo + path.sep) || dest.startsWith(os.tmpdir() + path.sep)) {
  console.error('Refusing repository or temporary destination; use separate persistent storage.');
  process.exit(2);
}
fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = 'ideal-floor-mongodb-' + stamp;
const partial = path.join(dest, base + '.archive.gz.partial');
const final = path.join(dest, base + '.archive.gz');
const out = fs.openSync(partial, 'wx', 0o600);
const dump = spawn('mongodump', ['--uri=' + uri, '--archive', '--gzip'], {
  stdio: ['ignore', out, 'pipe'],
  env: process.env
});
let stderr = '';
dump.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
dump.on('error', err => { console.error('mongodump unavailable:', err.message); cleanup(); process.exitCode = 1; });
dump.on('close', code => {
  fs.closeSync(out);
  if (code !== 0) {
    console.error('Backup failed:', stderr.replace(/mongodb(?:\\+srv)?:\\/\\/[^\\s]+/gi, '[redacted-uri]'));
    cleanup();
    process.exitCode = 1;
    return;
  }
  if (!fs.statSync(partial).size) { console.error('Empty archive'); cleanup(); process.exitCode = 1; return; }
  fs.renameSync(partial, final);
  const hash = crypto.createHash('sha256');
  const reader = fs.createReadStream(final);
  reader.on('data', chunk => hash.update(chunk));
  reader.on('end', () => {
    fs.writeFileSync(final + '.sha256', hash.digest('hex') + '  ' + path.basename(final) + '\\n', { mode: 0o600, flag: 'wx' });
    console.log('Backup created:', final, '(restore must be tested separately)');
  });
  reader.on('error', err => { console.error(err.message); process.exitCode = 1; });
});
function cleanup() { try { fs.unlinkSync(partial); } catch (_) {} }
