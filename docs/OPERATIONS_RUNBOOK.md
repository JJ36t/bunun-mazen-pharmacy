# Bunun Mazen Pharmacy — Operations Runbook

## Table of Contents
1. [First Launch](#first-launch)
2. [Daily Operations](#daily-operations)
3. [Backup & Restore](#backup--restore)
4. [Offsite Backup Configuration](#offsite-backup-configuration)
5. [Health Monitoring](#health-monitoring)
6. [License Management](#license-management)
7. [User Management](#user-management)
8. [Troubleshooting](#troubleshooting)
9. [Emergency Procedures](#emergency-procedures)

---

## First Launch

### Prerequisites
- PostgreSQL 14+ installed and running
- Environment variables set:
  ```
  PHARMACY_DB_USER=postgres
  PHARMACY_DB_PASSWORD=<your-secure-password>
  PHARMACY_DB_HOST=localhost
  PHARMACY_DB_PORT=5432
  PHARMACY_HEALTH_PORT=9191  # optional, default 9191
  PHARMACY_OFFSITE_BACKUP_PATH=  # optional, offsite backup target
  ```

### What happens on first launch
1. App connects to PostgreSQL (creates `pharmacy_db` if missing)
2. Migrations 0001–0044 run automatically
3. If `keys/manifest.json` is missing → generates new Ed25519 keypair
4. If `admin` user is missing → generates random passwords (printed to console)
5. Health endpoint starts on `127.0.0.1:9191`
6. Materialized views refresh

**IMPORTANT:** Save the admin/cashier passwords printed in the console. You will be forced to change them on first login.

---

## Daily Operations

### Opening the cash drawer
1. Login as `cashier` or `admin`
2. Click "Start Shift" — this records the starting cash amount
3. The drawer is now active for the day

### Closing the day
1. Click "End Shift" — this records the ending cash and computes variance
2. Click "Daily Close" in Accounting → resets daily counters
3. Run a backup (see [Backup & Restore](#backup--restore))

### Printing receipts
- Receipts print in Arabic with proper letter shaping (initial/medial/final forms)
- Printer must be ESC/POS compatible (most thermal printers are)
- Configure paper width (80mm or 58mm) in Settings

---

## Backup & Restore

### Creating a backup
1. Go to Settings → Backup
2. Enter a strong password (used for AES-256-GCM encryption)
3. Click "Create Backup"
4. The encrypted file is saved to Desktop as `Pharmacy_Backup_YYYYMMDD_HHMMSS.enc`

**Encryption details:**
- Algorithm: AES-256-GCM (authenticated encryption)
- KDF: PBKDF2-HMAC-SHA256, 600,000 iterations (OWASP 2023 recommendation)
- Salt: 16 bytes random per backup
- Format: `v2:iterations:salt:nonce:ciphertext` (all base64-encoded)

### Restoring a backup
1. Go to Settings → Backup → Restore
2. Select the `.enc` file
3. Enter the password
4. Click "Restore to Database"

**What gets restored:**
- All business data (medicines, invoices, debts, suppliers, etc.)
- Settings

**What is NOT restored (preserved):**
- Users (you keep your login)
- Roles & permissions (RBAC intact)
- Audit logs (tamper-proof history)

**Warning:** Restore TRUNCATES all business tables first. Old data is wiped before new data is inserted. This is by design — restoring into a non-empty database would mix old + new data.

---

## Offsite Backup Configuration

### Why offsite?
Local backups protect against DB corruption but not against:
- Disk failure (local backup is on the same disk)
- Theft
- Ransomware (encrypts both DB and local backups)
- Fire/flood

### Configuration
Set the offsite backup path via one of:

**Option A: Environment variable (recommended for deployment)**
```bash
PHARMACY_OFFSITE_BACKUP_PATH=/mnt/nas/backups/pharmacy
```

**Option B: Database setting (operator-configurable)**
```sql
INSERT INTO settings (key, value) VALUES ('offsite_backup_path', '/mnt/nas/backups/pharmacy')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Or via Settings UI: Settings → Backup → Offsite Path

### How it works
- Every `create_backup` call also copies the encrypted file to the offsite path
- Old offsite backups (>30 days) are auto-pruned
- Success/failure is logged to `audit_logs` with action types:
  - `BACKUP_OFFSITE` (success)
  - `BACKUP_OFFSITE_FAILED` (failure)

### Supported targets
- Local folder (different disk)
- SMB/CIFS mount (Windows share, Samba)
- NFS mount (Linux)
- USB drive (mounted path)
- Network-attached storage (NAS)

**Note:** Cloud storage (S3, Google Drive) requires mounting as a filesystem first (e.g., rclone mount).

---

## Health Monitoring

### Health endpoint
The app exposes an HTTP endpoint on `127.0.0.1:9191`:

- `GET /health` — full health check (DB ping, active sessions, uptime)
- `GET /ready` — simple readiness probe (DB ping only)
- `GET /` — service info

### Example response
```json
{
  "status": "ok",
  "version": "2.3.0",
  "db_ok": true,
  "db_latency_ms": 2,
  "active_sessions": 3,
  "uptime_s": 86400,
  "error": null
}
```

### Monitoring setup
**Uptime Kuma:**
1. Add new monitor → HTTP(s)
2. URL: `http://your-server-ip:9191/health`
3. Keyword: `"status":"ok"`
4. Interval: 60s

**Consul:**
```json
{
  "check": {
    "http": "http://localhost:9191/ready",
    "interval": "10s"
  }
}
```

**Kubernetes liveness probe:**
```yaml
livenessProbe:
  httpGet:
    path: /ready
    port: 9191
  initialDelaySeconds: 30
  periodSeconds: 10
```

### Health table
Health checks are persisted to `app_health` table (last 1000 entries):
```sql
SELECT * FROM get_latest_health();
```

---

## License Management

### How licensing works
- Each device has a unique fingerprint (SHA-256 of CPU brand + hostname)
- The license key is signed with Ed25519 (asymmetric)
- The app verifies the signature using the public key in `keys/manifest.json`

### Generating a license for a new device
1. On the target device, run the app once → it generates `keys/manifest.json` + `keys/private_key.hex`
2. Get the device fingerprint: Settings → License → Device ID
3. On the LICENSE SERVER (the machine with the private key), run:
   ```bash
   cargo run --bin generate_device_license -- --device-id <DEVICE_ID> --key-file keys/private_key.hex
   ```
4. Send the generated license key to the device operator
5. On the target device: Settings → License → Enter Key

### Tauri updater signing key
Before publishing a release, generate the updater keypair:
```bash
bash scripts/generate_updater_key.sh --yes
```
This patches `tauri.conf.json` with the public key and saves the private key to `~/.tauri/pharmacy-updater.key`.

For signed builds:
```bash
TAURI_SIGNING_PRIVATE_KEY=~/.tauri/pharmacy-updater.key npm run tauri build
```

---

## User Management

### Default users
On first launch, the app creates:
- `admin` (Super Admin) — random 16-char password
- `cashier` (Cashier) — random 12-char password

Both are flagged `must_change_password = TRUE` and forced to change on first login.

### RBAC roles
8 system roles with permission matrix:
1. **Super Admin** — full access (cannot be deleted)
2. **Pharmacist** — manage inventory, prescriptions, sales
3. **Senior Cashier** — sales + refunds + reports
4. **Cashier** — sales only (no refunds)
5. **Accountant** — accounting + reports (no sales)
6. **Inventory Manager** — inventory management only
7. **Auditor** — read-only access to all reports
8. **Viewer** — read-only dashboard

### Session security
- Session token: UUID v4
- Stored as SHA-256 hash in DB (not plaintext)
- Sliding expiry: 8 hours of inactivity → logout
- Absolute max lifetime: 24 hours → forced re-login
- bcrypt cost 12 for password hashing
- Rate limit: 5 failed logins per 5 minutes per username

---

## Troubleshooting

### App crashes on startup
**Cause 1: Database not running**
- Check: `pg_isready -h localhost -p 5432`
- Fix: `sudo systemctl start postgresql`

**Cause 2: PHARMACY_DB_PASSWORD not set**
- In release mode, the app refuses to start without this env var
- Fix: set the env var or run in debug mode

**Cause 3: Migration failure**
- Look for the panic message — it tells you exactly what to do
- Do NOT manually delete `_sqlx_migrations` table unless instructed
- Common fixes:
  ```sql
  -- For specific broken migration:
  DELETE FROM _sqlx_migrations WHERE version = <N>;
  
  -- For full reset (DATA LOSS):
  DROP DATABASE pharmacy_db;
  ```

### "Session expired" errors
- Sessions expire after 8h of inactivity or 24h absolute
- Fix: logout and login again
- If persistent, check server time: `SELECT NOW();` should match local time

### Arabic text not printing correctly
- Verify printer is ESC/POS compatible
- Check paper width setting (80mm vs 58mm)
- The app uses proper Arabic letter shaping (initial/medial/final forms)
- For custom printers, may need to adjust `print_receipt_direct` in main.rs

### Health endpoint not responding
- Check if port 9191 is in use: `netstat -tlnp | grep 9191`
- Override port: `PHARMACY_HEALTH_PORT=9192 ./bunun-mazen-pharmacy`
- Health server only binds to 127.0.0.1 (localhost) — not exposed externally
- For external monitoring, use a reverse proxy (nginx, caddy)

---

## Emergency Procedures

### Lost admin password
1. Stop the app
2. Run the reset tool:
   ```bash
   cargo run --bin reset_admin_password
   ```
3. The tool prints a new temporary password
4. Login with the new password → change it immediately

### Database corruption
1. Stop the app
2. Restore from latest backup:
   ```bash
   ./bunun-mazen-pharmacy  # start app
   # Settings → Backup → Restore → select latest .enc file
   ```
3. If no backup, try PostgreSQL recovery:
   ```bash
   pg_dump pharmacy_db > pharmacy_dump.sql  # may fail
   # If pg_dump fails:
   createdb pharmacy_db_recovered
   psql pharmacy_db_recovered < pharmacy_dump.sql
   ```

### Compromised session tokens
All session tokens are invalidated by:
```sql
UPDATE user_sessions SET is_active = FALSE;
```
All users will be forced to re-login.

### Audit log tampering
Audit logs have BEFORE UPDATE / BEFORE DELETE triggers that prevent modification.
If you suspect tampering:
```sql
-- Check if triggers exist
SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass;

-- Verify row hashes (migration 0038)
SELECT * FROM verify_audit_log_integrity() WHERE is_valid = FALSE;
```

---

## Performance Tuning

### Slow queries
- Check `pg_stat_statements` for slow queries
- All critical queries have indexes (migrations 0034, 0036)
- Materialized views are refreshed on startup and after sales/refunds

### Large audit_logs table
- audit_logs is partitioned by month (migration 0044)
- Archive old partitions:
  ```sql
  SELECT detach_audit_partition('202401');
  -- Then backup/drop the detached table
  ```

### Database bloat
- Run VACUUM ANALYZE weekly:
  ```sql
  VACUUM ANALYZE;
  ```
- For partitioned tables, VACUUM only recent partitions (faster)

---

## Contact

For issues not covered in this runbook, contact the system administrator.
