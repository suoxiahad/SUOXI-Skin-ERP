# SUOXI Skin ERP — Financial, Inventory & Concurrency Integrity

## 1. Numeric Precision & Server-Derived Totals

- All monetary columns in PostgreSQL use `NUMERIC(12, 2)` (`BDT`). Floating-point types (`REAL`, `DOUBLE PRECISION`) are prohibited.
- `pgBillingPackageRepo.createInvoice()` computes every line total, invoice subtotal, VAT amount, and grand total strictly on the server:
  - Quantities clamped `>= 0.01`, unit prices `>= 0`, line discounts clamped to `[0, quantity * unitPrice]`.
  - All intermediate and final amounts rounded deterministically to 2 decimal places (`Number(...toFixed(2))`).
  - Normalized rows written atomically into both `invoices` and `invoice_items` inside a single `withPgTransaction()` boundary.

---

## 2. Payments, Allocations & Immutable Refunds

### Payment Recording (`recordInvoicePayment`, `recordPackagePayment`)
1. Acquires row lock on target invoice (`SELECT ... FROM invoices WHERE id = $1 FOR UPDATE`).
2. Rejects payments against `void` or `cancelled` invoices and rejects amounts exceeding remaining due.
3. Inserts an immutable row into `payment_records` (`currency = 'BDT'`) and a normalized row into `payment_allocations`.
4. Updates invoice `paid_amount_bdt`, `due_amount_bdt`, and `status` (`partial` / `paid`).
5. Inserts a transactional outbox event (`payment.recorded`) into `domain_outbox_events` with deterministic `dedupe_key` **in the same ACID transaction**.

### Non-Destructive Refunds (`createRefund`)
1. Locks both `invoices` and `payment_records` rows (`FOR UPDATE`).
2. Sums all non-rejected refunds already issued against that payment:
   $$\text{alreadyRefunded} + \text{requestedRefund} \le \text{payment.amount\_bdt}$$
   Violations return `HTTP 422 REFUND_EXCEEDS_PAID`.
3. **Never deletes or mutates** the original `payment_records` row; inserts an immutable `payment_refunds` row instead.
4. Emits a transactional outbox event (`payment.refunded`) into `domain_outbox_events` so referral commissions are reversed proportionally.

---

## 3. Transactional Outbox → Referral Commissions & Reversals

- `server/worker.ts` (and `POST /api/v1/commissions/process-outbox`) invokes `pgCallCenterReferralsRepo.processCommissionOutbox()`.
- Pending `domain_outbox_events` rows are claimed atomically via `SELECT ... FROM domain_outbox_events WHERE status = 'pending' ... FOR UPDATE SKIP LOCKED`.
- For each `payment.recorded` or `payment.refunded` event:
  - Looks up the patient's active `patient_referrals` attribution and matching `commission_rules` row.
  - Inserts into `referral_commissions` (`kind = 'accrual'` positive on payment; `kind = 'reversal'` negative on refund) with deterministic `accrual_key` and:
    ```sql
    ON CONFLICT (accrual_key) WHERE accrual_key IS NOT NULL DO NOTHING
    ```
  - Guarantees **exactly-once** commission accrual and reversal even across worker retries or restarts.

---

## 4. Payment Gateway Webhook Protection (`processPaymentWebhook`)

1. **HMAC-SHA256 Verification:** Validates `rawPayload` against `signatureHeader` using constant-time `crypto.timingSafeEqual` (`401 INVALID_WEBHOOK_SIGNATURE` on mismatch).
2. **Currency & Amount Validation:** Enforces `currency === 'BDT'` (`422 CURRENCY_MISMATCH`) and `amountBDT > 0`.
3. **Database Deduplication:** Inserts into `payment_webhook_events` with `UNIQUE (provider, provider_event_id)` (`ON CONFLICT DO NOTHING`); duplicate replays return `{ deduplicated: true }` without double-crediting.
4. **Terminal-State Protection:** Locks target invoice (`FOR UPDATE`). If the invoice is already `void`, `cancelled`, or `paid` (due `<= 0`), the late callback is safely logged and returned as `{ deduplicated: false, ignored: true }` without reopening or overpaying the invoice.

---

## 5. Inventory & Scheduling Concurrency Invariants

### Inventory Anti-Overselling (`pgInventoryRepo.ts`)
- Every stock deduction (`adjustStock`) locks `inventory_items` (`FOR UPDATE`), verifies `current_stock + quantityDelta >= 0` (`422 INSUFFICIENT_STOCK`), updates `inventory_items`, and appends immutable rows to `stock_adjustments` and `stock_movements`.
- Database-level `CHECK (current_stock >= 0)` on `inventory_items`, `CHECK (quantity_on_hand >= 0)` on `product_batches`, and `CHECK (balance_after >= 0)` on `stock_movements` provide defense-in-depth against negative stock.
- Verified under 4 parallel deductions of 2 units against 5 units in stock: **exactly 2 succeed, 2 reject (`422`), final stock = 1**.

### Appointment Anti-Double-Booking (`pgPatientClinicalRepo.ts`)
- Database partial unique index:
  ```sql
  CREATE UNIQUE INDEX uq_appointments_active_doctor_slot
    ON appointments(branch_id, doctor_id, appointment_date, appointment_time)
    WHERE status NOT IN ('cancelled', 'no_show', 'rescheduled');
  ```
- PostgreSQL unique violation (`23505`) is mapped to `HTTP 409 SLOT_CONFLICT`.
- Verified under 3 concurrent booking attempts for the exact same doctor/date/time: **exactly 1 succeeds, 2 reject with `409 SLOT_CONFLICT`**.
