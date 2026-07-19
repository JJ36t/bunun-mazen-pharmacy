# API Documentation — Bunun Mazen Pharmacy

## Authentication Commands

### `login(username, password) → LoginResult`
- **Purpose:** تسجيل دخول مع rate-limiting
- **Returns:** `{ username, role, sessionToken, userId }`
- **Rate limit:** 5 failed attempts / 5 minutes
- **Side effects:** Creates session in `user_sessions`, logs to `audit_logs`

### `check_license() → bool`
### `get_device_id() → String`
### `activate_license(activation_key) → bool`
- **Rate limit:** 10 attempts / hour

## Sales Commands

### `record_sale_db(discount_percentage, items_json, user_role, operation_id, discount_amount, session_token) → SaleResult`
- **Returns:** `{ invoiceId, replayed }`
- **Idempotency:** `operation_id` prevents duplicates
- **Validation:** discount ≤ subtotal, quantity available (FOR UPDATE)
- **Side effects:** INSERT invoices + items, UPDATE medicines + batches (FEFO), INSERT audit_logs

### `record_refund_db(total_amount, items_json, user_role, session_token) → ()`
### `reverse_refund_db(invoice_id, user_role, session_token) → ()`
- **Permission:** Super Admin / Pharmacy Owner

## Inventory Commands

### `get_medicines_db() → Medicine[]`
### `add_medicine_db(...) → String` — auto-generates EAN-13 barcode
### `update_medicine_db(...) → ()`
### `adjust_stock_db(medicine_id, amount, user_role, session_token) → ()` — FOR UPDATE + CHECK
### `soft_delete_medicine_db(...) → ()`
### `bulk_update_prices_db(update_type, value, user_role, session_token) → ()`

## Accounting Commands

### `add_expense_db(description, amount, user_role, session_token) → ()`
### `get_accounting_summary_db() → AccountingSummary`
- **Returns:** `{ totalSales, totalProfits, totalDiscounts, totalExpenses, cashbox, expenses[] }`
### `reset_daily_db(user_role, session_token) → ()` — soft archive, no DELETE

## Backup Commands

### `create_backup(data, password, session_token) → String` — AES-256-GCM + PBKDF2
### `restore_backup(file_path, password) → String`
### `create_auto_backup_db(user_role) → String` — keeps last 7

## Error Format

```json
{ "kind": "Validation|Database|InsufficientStock|Unauthorized|InvalidSession|NotFound|Internal", "message": "..." }
```
