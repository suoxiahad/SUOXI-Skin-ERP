import assert from 'node:assert/strict';
import { createApiApp } from '../app.js';
import {
  ProductDto,
  SupplierDto,
  PurchaseDto,
  StockMovementDto,
  StockOnHandDto,
  ExpiringBatchDto,
  InventoryReportResultDto,
} from '@suoxi/shared-types';
import {
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
  ANON_COOKIE_NAME,
  parseCookies,
} from '../auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../auth/session.js';
import { seedSuperadmin } from '../scripts/seedSuperadmin.js';
import { inventoryService } from '../services/inventoryService.js';
import { getAuditStore } from '../services/auditLogger.js';

export async function runInventoryFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Inventory: Products, Movements, Batches & Purchases Tests (Prompt 13)...');

  inventoryService.resetData();

  const { username, oneTimePassword } = await seedSuperadmin({ silent: true });

  const app = createApiApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const standardOrigin = 'http://localhost:3000';

  try {
    // 1. Authenticate as Superadmin
    const csrfRes = await fetch(`${baseUrl}/auth/csrf`);
    assert.equal(csrfRes.status, 200);
    const csrfJson = (await csrfRes.json()) as { data: { csrfToken: string } };
    let csrfToken = csrfJson.data.csrfToken;
    const cookiesA = parseCookies(
      csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie().join('; ') : csrfRes.headers.get('set-cookie') || ''
    );
    const anonCookieHeader = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${ANON_COOKIE_NAME}=${cookiesA[ANON_COOKIE_NAME]}`;

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: anonCookieHeader,
      },
      body: JSON.stringify({
        username,
        password: oneTimePassword,
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = (await loginRes.json()) as { data: { csrfToken: string } };
    csrfToken = loginJson.data.csrfToken;
    const loginCookies = parseCookies(
      loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie().join('; ') : loginRes.headers.get('set-cookie') || ''
    );
    const authCookieHeader = `${SESSION_COOKIE_NAME}=${loginCookies[SESSION_COOKIE_NAME]}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`;
    console.log('  ✓ Inventory Manager / Superadmin authenticated with session and CSRF');

    // 2. DEV Sample Seed Verification (HA-030: Hyaluronic Acid Serum 30ml, Stock: 24, Reorder: 10)
    const seedProdRes = await fetch(`${baseUrl}/api/v1/inventory/products/prod-ha-030`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(seedProdRes.status, 200);
    const seedProdJson = (await seedProdRes.json()) as { data: ProductDto };
    assert.equal(seedProdJson.data.sku, 'HA-030');
    assert.equal(seedProdJson.data.name, 'Hyaluronic Acid Serum 30ml');
    assert.equal(seedProdJson.data.reorder_level, 10);
    assert.equal(seedProdJson.data.stock_on_hand, '24.00');
    assert.equal(seedProdJson.data.allow_negative_stock, false);
    console.log('  ✓ DEV Sample verified: SKU HA-030 (Stock 24.00, Reorder level 10, Batch HA-2026-09)');

    // 3. Concurrency Test: 20 parallel usages of 10 units on stock 15 (negative disallowed)
    // Create a new product with stock = 15
    const createProdRes = await fetch(`${baseUrl}/api/v1/inventory/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        sku: 'TEST-CONCUR-01',
        name: 'Concurrent Test Serum 15ml',
        category_id: 'cat-serum-01',
        unit: 'ml',
        cost_price: 300,
        sale_price: 600,
        reorder_level: 5,
        allow_negative_stock: false,
      }),
    });
    assert.equal(createProdRes.status, 201);
    const concurProd = ((await createProdRes.json()) as { data: ProductDto }).data;

    // Seed stock of exactly 15 units via purchase_receipt
    const seedStockRes = await fetch(`${baseUrl}/api/v1/inventory/movements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        product_id: concurProd.id,
        branch_id: 'br-dhk-01',
        movement_type: 'purchase_receipt',
        quantity_change: 15,
        reason: 'Initial stock for concurrency test',
      }),
    });
    assert.equal(seedStockRes.status, 201);

    // Verify initial stock = 15
    const stockCheck = await inventoryService.getProduct(concurProd.id, 'br-dhk-01');
    assert.equal(stockCheck.stock_on_hand, '15.00');

    // Fire 20 parallel requests attempting to deduct 10 units each
    const parallelRequests = Array.from({ length: 20 }).map((_, i) =>
      fetch(`${baseUrl}/api/v1/inventory/movements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: authCookieHeader,
        },
        body: JSON.stringify({
          product_id: concurProd.id,
          branch_id: 'br-dhk-01',
          movement_type: 'session_usage',
          quantity_change: 10, // Server converts to -10
          reason: `Parallel clinical usage attempt #${i + 1}`,
        }),
      })
    );

    const parallelResults = await Promise.all(parallelRequests);
    let successCount = 0;
    let rejectedCount = 0;

    for (const res of parallelResults) {
      if (res.status === 201) {
        successCount++;
      } else if (res.status === 422) {
        rejectedCount++;
      }
    }

    assert.equal(successCount, 1, 'Exactly one 10-unit deduction should succeed');
    assert.equal(rejectedCount, 19, '19 requests should be rejected with 422 due to insufficient stock');

    const finalConcurProd = await inventoryService.getProduct(concurProd.id, 'br-dhk-01');
    assert.equal(
      finalConcurProd.stock_on_hand,
      '5.00',
      'Stock after concurrency must be exactly 5.00 (never negative)'
    );
    console.log(
      '  ✓ Concurrency & negative stock guard verified: 20 parallel usages on stock 15 -> 1 passed, 19 rejected (Remaining: 5.00 ml, never negative)'
    );

    // 4. Multi-Stage Purchase Orders & Idempotent "Mark received"
    const createPoRes = await fetch(`${baseUrl}/api/v1/inventory/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        supplier_id: 'sup-001',
        branch_id: 'br-dhk-01',
        purchase_date: '2026-10-21',
        supplier_invoice_no: 'APEX-PO-2026-001',
        items: [
          {
            product_id: 'prod-ha-030',
            quantity: 50,
            unit_cost: 1150,
            batch_no: 'HA-2026-10',
            expiry_date: '2028-10-31',
          },
        ],
        notes: 'Clinical bulk order for Dhanmondi branch',
      }),
    });
    assert.equal(createPoRes.status, 201);
    const purchase = ((await createPoRes.json()) as { data: PurchaseDto }).data;
    assert.equal(purchase.status, 'ordered');
    assert.equal(purchase.total_cost, '57500.00');

    // First Mark Received -> 200 OK
    const receiveRes1 = await fetch(`${baseUrl}/api/v1/inventory/purchases/${purchase.id}/receive`, {
      method: 'POST',
      headers: {
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
    });
    assert.equal(receiveRes1.status, 200);
    const receivedPo = ((await receiveRes1.json()) as { data: PurchaseDto }).data;
    assert.equal(receivedPo.status, 'received');

    // Verify stock increased by 50 (24 + 50 = 74)
    const stockAfterReceive = await inventoryService.getProduct('prod-ha-030', 'br-dhk-01');
    assert.equal(stockAfterReceive.stock_on_hand, '74.00');

    // Second Mark Received -> 409 Conflict
    const receiveRes2 = await fetch(`${baseUrl}/api/v1/inventory/purchases/${purchase.id}/receive`, {
      method: 'POST',
      headers: {
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
    });
    assert.equal(receiveRes2.status, 409);
    console.log('  ✓ Idempotent Goods Receipt verified: Mark received once -> stock updated (+50.00); second call rejected with HTTP 409 Conflict');

    // 5. Supervised Adjustments: missing approver -> 422
    const adjNoApproverRes = await fetch(`${baseUrl}/api/v1/inventory/movements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        product_id: 'prod-ha-030',
        movement_type: 'adjustment',
        quantity_change: -2,
        reason: 'Broken vial during storage shelf audit',
        // Missing approved_by
      }),
    });
    assert.equal(adjNoApproverRes.status, 422);
    console.log('  ✓ Supervised adjustment verified: missing approver rejected with HTTP 422 Unprocessable Entity');

    // 6. Rule AS-2 Enforcement: Requester == Approver -> 422
    const myUserId = (loginJson as any).data?.user?.id || 'usr-101';
    const adjSelfApproveRes = await fetch(`${baseUrl}/api/v1/inventory/movements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        product_id: 'prod-ha-030',
        movement_type: 'adjustment',
        quantity_change: -2,
        reason: 'Self-approved count adjustment',
        approved_by: myUserId, // Requester attempting self-approval
      }),
    });
    assert.equal(adjSelfApproveRes.status, 422);
    const selfApproveErr = await adjSelfApproveRes.json();
    assert.match((selfApproveErr as any).error.message, /Rule AS-2 Violation/);
    console.log('  ✓ Rule AS-2 verified: Requester cannot self-approve adjustment/wastage (HTTP 422)');

    // Valid Supervised Adjustment with distinct approver
    const validAdjRes = await fetch(`${baseUrl}/api/v1/inventory/movements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        product_id: 'prod-ha-030',
        movement_type: 'adjustment',
        quantity_change: -4,
        reason: 'Physical count audit difference verified by manager',
        approved_by: 'usr-102', // Distinct supervisor
      }),
    });
    assert.equal(validAdjRes.status, 201);
    const validAdj = ((await validAdjRes.json()) as { data: StockMovementDto }).data;
    assert.equal(validAdj.quantity_change, '-4.00');

    // 7. Append-Only Immutability (Rule 6): Direct UPDATE / DELETE fails with 422
    const updateMovRes = await fetch(`${baseUrl}/api/v1/inventory/movements/${validAdj.id}`, {
      method: 'PUT',
      headers: {
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
    });
    assert.equal(updateMovRes.status, 422);

    const deleteMovRes = await fetch(`${baseUrl}/api/v1/inventory/movements/${validAdj.id}`, {
      method: 'DELETE',
      headers: {
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
    });
    assert.equal(deleteMovRes.status, 422);
    console.log('  ✓ Rule 6 Append-Only Immutability verified: Direct UPDATE / DELETE on stock_movements rejected with HTTP 422');

    // 8. Reversal Workflow: Restores on-hand stock exactly
    const stockBeforeReverse = await inventoryService.getProduct('prod-ha-030', 'br-dhk-01');
    assert.equal(stockBeforeReverse.stock_on_hand, '70.00'); // 74 - 4 = 70

    const reverseRes = await fetch(`${baseUrl}/api/v1/inventory/movements/${validAdj.id}/reverse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        reason: 'Recount confirmed original bottles were located in backup refrigerator',
        approved_by: 'usr-102',
      }),
    });
    assert.equal(reverseRes.status, 200);

    const stockAfterReverse = await inventoryService.getProduct('prod-ha-030', 'br-dhk-01');
    assert.equal(
      stockAfterReverse.stock_on_hand,
      '74.00',
      'Reversal must restore stock on hand exactly to previous level'
    );
    console.log('  ✓ Reversal workflow verified: Reversal row restored on-hand balance exactly (70.00 -> 74.00 ml)');

    // 9. Batch Expiry Boundary Chips (<30 days critical, <90 days warning)
    const expRes = await fetch(`${baseUrl}/api/v1/inventory/stock/expiring`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(expRes.status, 200);
    const expBatches = ((await expRes.json()) as { data: ExpiringBatchDto[] }).data;
    assert.ok(expBatches.length > 0);
    // Batch HA-2026-09 expires in 2028 (days > 90) -> 'good'
    const batchHA = expBatches.find((b) => b.batch_no === 'HA-2026-09');
    assert.ok(batchHA);
    assert.equal(batchHA.expiry_status, 'good');

    // Create critical batch (< 30 days) and warning batch (< 90 days)
    const criticalExpiry = new Date();
    criticalExpiry.setDate(criticalExpiry.getDate() + 15); // in 15 days
    const warningExpiry = new Date();
    warningExpiry.setDate(warningExpiry.getDate() + 45); // in 45 days

    const critBatchRes = await fetch(`${baseUrl}/api/v1/inventory/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        supplier_id: 'sup-001',
        branch_id: 'br-dhk-01',
        purchase_date: '2026-10-21',
        supplier_invoice_no: 'EXPIRY-TEST-INV',
        items: [
          {
            product_id: 'prod-ha-030',
            quantity: 5,
            unit_cost: 1100,
            batch_no: 'BATCH-CRIT-15D',
            expiry_date: criticalExpiry.toISOString().split('T')[0],
          },
          {
            product_id: 'prod-ha-030',
            quantity: 5,
            unit_cost: 1100,
            batch_no: 'BATCH-WARN-45D',
            expiry_date: warningExpiry.toISOString().split('T')[0],
          },
        ],
      }),
    });
    const critPo = ((await critBatchRes.json()) as { data: PurchaseDto }).data;
    await fetch(`${baseUrl}/api/v1/inventory/purchases/${critPo.id}/receive`, {
      method: 'POST',
      headers: { Origin: standardOrigin, [CSRF_HEADER_NAME]: csrfToken, Cookie: authCookieHeader },
    });

    const expRes2 = await fetch(`${baseUrl}/api/v1/inventory/stock/expiring`, {
      headers: { Cookie: authCookieHeader },
    });
    const expBatches2 = ((await expRes2.json()) as { data: ExpiringBatchDto[] }).data;
    const critFound = expBatches2.find((b) => b.batch_no === 'BATCH-CRIT-15D');
    const warnFound = expBatches2.find((b) => b.batch_no === 'BATCH-WARN-45D');

    assert.ok(critFound);
    assert.equal(critFound.expiry_status, 'critical', 'Expiry within 15 days must flag critical (<30d, red)');
    assert.ok(warnFound);
    assert.equal(warnFound.expiry_status, 'warning', 'Expiry within 45 days must flag warning (<90d, amber)');
    console.log('  ✓ Expiry boundary chips verified: < 30 days flagged critical (red), < 90 days flagged warning (amber)');

    // 10. Audited Report Generation
    const reportRes = await fetch(`${baseUrl}/api/v1/inventory/reports?report_type=stock`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(reportRes.status, 200);
    const report = ((await reportRes.json()) as { data: InventoryReportResultDto }).data;
    assert.equal(report.report_type, 'stock');
    assert.ok(report.total_records > 0);

    // Verify audit event exists
    const recentAudit = (getAuditStore() as any)
      .getEvents()
      .find((e: any) => e.action === 'inventory.report.generated');
    assert.ok(recentAudit, 'Report generation must record an audited event in audit_events');
    console.log('  ✓ Audited report generation verified: Stock report generated and logged to audit_events (Rule 7)');

    console.log('[PASS] Inventory: Products, Movements, Batches & Purchases Tests Passed!');
  } finally {
    server.close();
  }
}
