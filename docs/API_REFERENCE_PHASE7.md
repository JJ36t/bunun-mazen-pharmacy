# Tauri Commands API Reference (Phase 7 — Updated)

> This document lists all Tauri commands exposed by the Rust backend,
> their parameters, return types, required permissions, and side effects.
>
> **Authentication**: Commands marked with 🔒 require a valid `session_token`
> parameter. The token is verified via `verify_session_token()` which checks
> both sliding (8h) and absolute (24h) expiry.

## Table of Contents
- [Authentication](#authentication)
- [Inventory](#inventory)
- [POS / Sales](#pos--sales)
- [Accounting](#accounting)
- [Reporting](#reporting)
- [Settings](#settings)
- [Backup & Restore](#backup--restore)
- [Licensing](#licensing)
- [Printing](#printing)
- [Mobile Scanner](#mobile-scanner)
- [Health](#health)
- [RBAC](#rbac)

---

## Authentication

### `login(username, password) → LoginResult`
- **Permission**: None (public)
- **Side effects**: Creates session in `user_sessions`, logs to `audit_logs`
- **Rate limit**: 5 failed attempts per 5 minutes per username
- **Returns**: `{ username, role, sessionToken, userId, mustChangePassword }`
- **Security**: Session token stored as SHA-256 hash in DB (migration 0039)

### `logout_db(session_token) → ()` 🔒
- **Side effects**: Sets `is_active = FALSE` on the session
- **Matches**: `token_hash = hash_session_token($1) OR token = $1` (backward compat)

### `verify_admin_password_db(password) → bool` 🔒
- **Rate limit**: 5 attempts per 5 minutes (separate counter)
- **Use case**: Confirm admin action (delete user, reset password)

### `get_users_db() → User[]` 🔒
- **Permission**: `system.users`
- **Returns**: All users (without password hashes)

### `add_user_db(username, password, role) → String` 🔒
- **Permission**: `system.users`
- **Side effects**: bcrypt hashes password (cost 12), logs to audit
- **Returns**: New user ID

### `reset_user_password_db(userId, newPassword) → ()` 🔒
- **Permission**: `system.users`
- **Side effects**: bcrypt hashes new password, invalidates all sessions for user

### `toggle_user_status_db(userId, isActive) → ()` 🔒
- **Permission**: `system.users`
- **Side effects**: If deactivating, invalidates all active sessions for user

### `delete_user_db(userId) → ()` 🔒
- **Permission**: `system.users`
- **Side effects**: Soft-deletes user (sets `deleted_at`), invalidates sessions
- **Note**: Super Admin cannot be deleted

### `must_change_password_db(userId) → bool` 🔒
- **Returns**: Whether user must change password on next login

### `change_own_password_db(userId, oldPassword, newPassword) → ()` 🔒
- **Side effects**: Verifies old password, hashes new, clears `must_change_password`

---

## Inventory

### `get_medicines_db() → Medicine[]` 🔒
- **Permission**: `inventory.view`
- **Returns**: All medicines (including deleted for audit)
- **Cache**: 30s TTL in frontend MemoryCache

### `add_medicine_db(...) → String` 🔒
- **Permission**: `inventory.add`
- **Side effects**: Inserts medicine, auto-generates EAN-13 barcode if missing
- **Validation**: `nameAr` required, `price >= 0`, `quantity >= 0`

### `update_medicine_db(...) → ()` 🔒
- **Permission**: `inventory.edit`
- **Side effects**: Updates medicine fields

### `adjust_stock_db(medicineId, amount, sessionToken) → ()` 🔒
- **Permission**: `inventory.adjust`
- **Side effects**: Adjusts quantity (can be negative for reductions)
- **Fraud detection**: `fraudDetector.checkInventoryAdjustment()` runs first

### `soft_delete_medicine_db(medicineId, userRole, medName, sessionToken) → ()` 🔒
- **Permission**: `inventory.delete`
- **Side effects**: Sets `is_deleted = TRUE` (preserves data for audit)
- **Fraud detection**: `fraudDetector.checkDeletion()` runs first

### `bulk_update_prices_db(updateType, value, userRole, sessionToken) → ()` 🔒
- **Permission**: `inventory.edit`
- **Parameters**: `updateType` = "percentage" | "amount"
- **Side effects**: Updates all non-deleted medicines' prices

### `link_barcode_to_medicine_db(medicineId, barcode, sessionToken) → ()` 🔒
- **Permission**: `inventory.edit`
- **Side effects**: Inserts into `medicine_barcodes` table

---

## POS / Sales

### `record_sale_db(discountPercentage, itemsJson, userRole, sessionToken, operationId?, discountAmount?) → SaleResult` 🔒
- **Permission**: `pos.use`
- **Side effects**:
  - Deducts stock via FEFO (First Expire First Out)
  - Records invoice + invoice_items (with batch_id for FEFO tracking)
  - Records 4 ledger entries (sales, COGS, inventory, profit)
  - Records cash drawer event if shift active
- **Validation**: `qty > 0`, `price >= 0`, items JSON ≤ 100KB
- **Idempotency**: `operationId` prevents duplicate sales on crash recovery
- **Returns**: `{ invoiceId, dailyReceiptNumber, total, profit }`

### `record_refund_db(totalAmount, itemsJson, userRole, sessionToken) → ()` 🔒
- **Permission**: `pos.refund`
- **Side effects**:
  - Restores stock to nearest-expiry batch (FEFO)
  - Records negative-amount invoice
  - Records reversing ledger entries
- **Validation**: `totalAmount > 0`

### `reverse_refund_db(invoiceId, userRole, sessionToken) → ()` 🔒
- **Permission**: `pos.refund`
- **Side effects**: Re-deducts stock, marks refund as reversed

---

## Accounting

### `get_accounting_summary_db(sessionToken?) → AccountingSummary` 🔒
- **Permission**: `accounting.view`
- **Returns**: `{ totalSales, totalRefunds, totalExpenses, netProfit, debtsTotal, ... }`
- **Cache**: 30s TTL
- **Decimal fix**: All `Decimal` values converted via `decimal_to_f64()`

### `add_expense_db(description, amount, userRole, sessionToken) → ()` 🔒
- **Permission**: `accounting.expenses`
- **Validation**: `amount > 0`, description non-empty

### `reset_daily_db(userRole, sessionToken) → ()` 🔒
- **Permission**: `accounting.close`
- **Side effects**: Archives daily data (does NOT delete — uses archival tables)

---

## Reporting

### `get_filtered_sales_report(startDate, endDate, userFilter, sessionToken) → FilteredSalesReport` 🔒
- **Permission**: `reports.view`
- **Returns**: Aggregated sales by day and by user

### `get_invoice_details_report(startDate, endDate, userFilter, sessionToken) → InvoiceDetailsReport` 🔒
- **Permission**: `reports.view`
- **Returns**: Detailed invoice list with items

### `get_top_medicines_db() → TopMedicine[]` 🔒
- **Permission**: `reports.view`
- **Cache**: 5min TTL (uses materialized view `mv_top_medicines`)

### `get_dashboard_stats() → DashboardStats`
- **Permission**: Any authenticated user
- **Cache**: 30s TTL

### `get_weekly_sales_stats() → WeeklySales[]`
- **Permission**: Any authenticated user
- **Cache**: 5min TTL

---

## Settings

### `get_settings_db() → Record<string, string>`
- **Permission**: Any authenticated user
- **Cache**: 5min TTL

### `save_settings_db(settingsJson, sessionToken) → ()` 🔒
- **Permission**: `system.settings`
- **Side effects**: Upserts all settings

---

## Backup & Restore

### `create_backup(data, password, sessionToken?) → String` 🔒
- **Permission**: `system.backup`
- **Side effects**:
  - Encrypts data with AES-256-GCM (PBKDF2 600k iterations)
  - Saves to Desktop as `Pharmacy_Backup_YYYYMMDD_HHMMSS.enc`
  - Replicates to offsite path if `PHARMACY_OFFSITE_BACKUP_PATH` set
  - Prunes offsite backups older than 30 days
  - Logs to `audit_logs` (BACKUP_OFFSITE / BACKUP_OFFSITE_FAILED)
- **Returns**: Primary backup file path

### `restore_backup(filePath, password) → String`
- **Permission**: None (file decryption only, no DB write)
- **Returns**: Decrypted plaintext

### `restore_backup_to_db(filePath, password, sessionToken) → RestoreResult` 🔒
- **Permission**: `system.backup`
- **Side effects**:
  - TRUNCATES all business tables (FK order respected)
  - Inserts data from backup
  - Preserves: users, roles, permissions, audit_logs
- **Validation**: Backup version must match (2.3.0 or "unknown")
- **Returns**: `{ success, restored: { medicines: N, invoices: N, ... } }`

### `check_auto_backup() → bool`
- **Permission**: Any (called on startup)
- **Side effects**: If 24h since last backup, updates `last_backup` setting

---

## Licensing

### `check_license() → bool`
- **Permission**: None (public)
- **Side effects**: Reads `license.dat`, verifies with Ed25519

### `activate_license(activationKey) → bool`
- **Permission**: None (public)
- **Rate limit**: 10 attempts per hour
- **Side effects**: Saves key to `license.dat`
- **Security**: Ed25519 verification first, HMAC fallback only if `legacy_enabled`

### `get_device_id() → String`
- **Permission**: None (public)
- **Returns**: SHA-256 of CPU brand + hostname (uppercase hex)

---

## Printing

### `get_available_printers() → String[]`
- **Permission**: Any authenticated user
- **Platform**: Windows (wmic), macOS/Linux (lpstat)

### `print_receipt_direct(printerName, pharmacyName, invoiceNum, itemsJson, total) → ()`
- **Permission**: Any authenticated user
- **Side effects**: Sends ESC/POS commands to printer
- **Arabic shaping**: Uses `arabic_reshaper::shape_arabic_for_print()` (proper initial/medial/final forms)

---

## Mobile Scanner

### WebSocket server (port 9192 HTTPS, 9193 WSS)
- **Binding**: Specific LAN IP (not 0.0.0.0)
- **TLS**: Self-signed certificate (auto-generated, persisted)
- **Rate limit**: Scan messages require pairing first
- **Idle timeout**: 60s
- **Message size limit**: 64KB

### `lookup_barcode_db(barcode) → BarcodeLookupResult`
- **Permission**: Any authenticated user
- **Side effects**: Searches local DB → OpenFoodFacts (cached 7 days) → GS1 prefix

---

## Health

### HTTP endpoint (port 9191, configurable via `PHARMACY_HEALTH_PORT`)

#### `GET /health`
- **Returns**: `{ status, version, db_ok, db_latency_ms, active_sessions, uptime_s, error }`
- **Side effects**: Inserts row to `app_health` table
- **Status**: "ok" if DB ok and not stale; "degraded" otherwise

#### `GET /ready`
- **Returns**: `{ ready, db_latency_ms }`
- **Simpler probe** for Kubernetes readiness checks

#### `GET /`
- **Returns**: Service info + available endpoints

---

## RBAC

### `get_roles_db() → Role[]` 🔒
- **Permission**: `system.users`
- **Returns**: 8 system roles

### `get_permissions_db() → Permission[]` 🔒
- **Permission**: `system.users`
- **Returns**: 22 permissions across 6 categories

### `get_role_permissions_db(roleId) → Permission[]` 🔒
- **Permission**: `system.users`

### `assign_permission_to_role_db(roleId, permissionId, sessionToken) → ()` 🔒
- **Permission**: `system.users`
- **Note**: System roles have fixed permissions (cannot be modified)

---

## Audit

### `log_action_db(userRole, actionType, description, sessionToken) → ()` 🔒
- **Permission**: Any authenticated user
- **Side effects**: Inserts to `audit_logs` (partitioned by month)
- **Tamper-proof**: BEFORE DELETE/UPDATE triggers prevent modification

### `get_audit_logs_db(sessionToken?) → AuditLog[]` 🔒
- **Permission**: `system.audit`
- **Returns**: Recent audit entries (newest first)

---

## Session Security Details

- **Token format**: UUID v4
- **Storage**: SHA-256 hash in `token_hash` column (migration 0039)
- **Lookup**: `WHERE token_hash = hash_session_token($1)` (constant-time via unique index)
- **Sliding expiry**: 8 hours of inactivity → session invalidated
- **Absolute max lifetime**: 24 hours → forced re-login
- **Cleanup**: `cleanup_expired_sessions()` runs on startup
- **Rate limit**: 5 failed logins per 5 minutes per username

## Encryption Details

- **Backup encryption**: AES-256-GCM
- **KDF**: PBKDF2-HMAC-SHA256, 600,000 iterations (OWASP 2023)
- **Salt**: 16 bytes random per backup
- **Format**: `v2:iterations:salt:nonce:ciphertext` (versioned for backward compat)
- **Password hashing**: bcrypt cost 12

## Migration Summary (44 migrations)

| Range | Description |
|-------|-------------|
| 0001–0023 | Initial schema + features (pre-existing) |
| 0024–0038 | Security hardening (Phase 1–5) |
| 0039 | Session token hashing (SHA-256) |
| 0040 | Race-safe daily receipt number (advisory lock) |
| 0041 | App health table |
| 0042 | OpenFoodFacts cache (7-day TTL) |
| 0043 | TIMESTAMP → TIMESTAMPTZ conversion |
| 0044 | Audit logs monthly partitioning |
