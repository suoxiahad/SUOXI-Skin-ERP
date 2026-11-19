/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * PostgreSQL Repository: Inventory, Non-Destructive Stock Adjustments,
 * Suppliers, Purchase Orders & Goods Received Notes (GRN)
 */

import crypto from 'node:crypto';
import type {
  GoodsReceivedNote,
  GRNItem,
  InventoryItem,
  ProductBatch,
  PurchaseOrder,
  PurchaseOrderItem,
  StockAdjustment,
  Supplier,
  User,
} from '../../src/types/index.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import {
  pgLogAuditEvent,
  toDateOnly,
  toIsoString,
  toNumber,
} from './pgHelpers.ts';

function computeInventoryStatus(
  currentStock: number,
  reorderLevel: number,
  expiryDate?: string
): InventoryItem['status'] {
  if (expiryDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (expiryDate < today) {
      return 'expired';
    }
  }
  return currentStock <= reorderLevel ? 'low_stock' : 'in_stock';
}

function mapInventoryRow(row: Record<string, unknown>): InventoryItem {
  const currentStock = toNumber(row.current_stock);
  const reorderLevel = toNumber(row.reorder_level, 5);
  const expiryDate = toDateOnly(row.expiry_date);
  return {
    id: String(row.id),
    itemCode: String(row.item_code),
    name: String(row.name),
    category: row.category as InventoryItem['category'],
    brand: String(row.brand || ''),
    productType: (row.product_type as InventoryItem['productType']) || 'dual_use',
    barcode: row.barcode ? String(row.barcode) : undefined,
    sku: row.sku ? String(row.sku) : undefined,
    description: row.description ? String(row.description) : undefined,
    currentStock,
    unit: (row.unit as InventoryItem['unit']) || 'pieces',
    reorderLevel,
    unitCostBDT: toNumber(row.unit_cost_bdt),
    sellingPriceBDT: toNumber(row.selling_price_bdt),
    batchNumber: String(row.batch_number || ''),
    expiryDate,
    batches: Array.isArray(row.batches) ? (row.batches as ProductBatch[]) : [],
    usageProtocol: row.usage_protocol ? String(row.usage_protocol) : undefined,
    branchId: String(row.branch_id),
    branchName: String(row.branch_name || ''),
    status: (row.status as InventoryItem['status']) || computeInventoryStatus(currentStock, reorderLevel, expiryDate),
    isActive: row.is_active !== false,
  };
}

function mapStockAdjustmentRow(row: Record<string, unknown>): StockAdjustment {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    itemName: String(row.item_name),
    batchNumber: String(row.batch_number || ''),
    adjustmentType: row.adjustment_type as StockAdjustment['adjustmentType'],
    quantityDelta: toNumber(row.quantity_delta),
    balanceAfter: toNumber(row.balance_after),
    unitCostBDT: row.unit_cost_bdt !== null && row.unit_cost_bdt !== undefined ? toNumber(row.unit_cost_bdt) : undefined,
    reason: String(row.reason),
    adjustedBy: String(row.adjusted_by),
    adjustedAt: toIsoString(row.adjusted_at),
  };
}

function mapSupplierRow(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    contactPerson: String(row.contact_person || ''),
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    address: String(row.address || ''),
    brandsSupplied: Array.isArray(row.brands_supplied) ? (row.brands_supplied as string[]) : [],
    paymentTerms: (row.payment_terms as Supplier['paymentTerms']) || 'Net 30',
    balanceDueBDT: toNumber(row.balance_due_bdt),
    isActive: row.is_active !== false,
    createdAt: row.created_at ? toIsoString(row.created_at) : undefined,
  };
}

function mapPurchaseOrderRow(row: Record<string, unknown>): PurchaseOrder {
  return {
    id: String(row.id),
    poNumber: String(row.po_number),
    invoiceNo: row.invoice_no ? String(row.invoice_no) : undefined,
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    orderDate: toDateOnly(row.order_date),
    expectedDeliveryDate: toDateOnly(row.expected_delivery_date),
    items: Array.isArray(row.items) ? (row.items as PurchaseOrderItem[]) : [],
    subtotalBDT: toNumber(row.subtotal_bdt),
    discountBDT: toNumber(row.discount_bdt),
    taxBDT: toNumber(row.tax_bdt),
    totalBDT: toNumber(row.total_bdt),
    paidBDT: toNumber(row.paid_bdt),
    dueBDT: toNumber(row.due_bdt),
    status: row.status as PurchaseOrder['status'],
    paymentStatus: row.payment_status as PurchaseOrder['paymentStatus'],
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: toIsoString(row.created_at),
    createdBy: String(row.created_by || ''),
  };
}

function mapGrnRow(row: Record<string, unknown>): GoodsReceivedNote {
  return {
    id: String(row.id),
    grnNumber: String(row.grn_number),
    poId: row.po_id ? String(row.po_id) : undefined,
    poNumber: row.po_number ? String(row.po_number) : undefined,
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    receivedDate: toDateOnly(row.received_date),
    receivedBy: String(row.received_by),
    invoiceRefNumber: row.invoice_ref_number ? String(row.invoice_ref_number) : undefined,
    items: Array.isArray(row.items) ? (row.items as GRNItem[]) : [],
    totalCostBDT: toNumber(row.total_cost_bdt),
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: toIsoString(row.created_at),
  };
}

export const pgInventoryRepo = {
  // ---------------------------------------------------------------------------
  // Inventory Products
  // ---------------------------------------------------------------------------
  async listInventory(filters: {
    branchId?: string;
    category?: string;
    productType?: string;
    status?: string;
    search?: string;
  }): Promise<InventoryItem[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.branchId && filters.branchId !== 'all') {
      params.push(filters.branchId);
      clauses.push(`branch_id = $${params.length}`);
    }
    if (filters.category && filters.category !== 'all') {
      params.push(filters.category);
      clauses.push(`category = $${params.length}`);
    }
    if (filters.productType && filters.productType !== 'all') {
      params.push(filters.productType);
      clauses.push(`product_type = $${params.length}`);
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      const idx = params.length;
      clauses.push(
        `(name ILIKE $${idx} OR item_code ILIKE $${idx} OR brand ILIKE $${idx} OR COALESCE(barcode, '') ILIKE $${idx})`
      );
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await pgQuery(
      `SELECT * FROM inventory_items ${whereSql} ORDER BY created_at DESC`,
      params
    );
    return res.rows.map((r) => mapInventoryRow(r as Record<string, unknown>));
  },

  async createInventoryItem(
    input: {
      name: string;
      category: InventoryItem['category'];
      brand: string;
      productType: NonNullable<InventoryItem['productType']>;
      currentStock: number;
      unit: InventoryItem['unit'];
      reorderLevel: number;
      unitCostBDT: number;
      sellingPriceBDT: number;
      batchNumber: string;
      expiryDate: string;
      barcode?: string;
      sku?: string;
      description?: string;
      usageProtocol?: string;
      branchId: string;
      branchName: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<InventoryItem> {
    return withPgTransaction(async (client) => {
      const countRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM inventory_items');
      const seq = String(Number(countRes.rows[0]?.cnt || 0) + 1).padStart(3, '0');
      const catPrefix = input.category.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'GEN';
      const itemCode = `SKU-${catPrefix}-${seq}-${crypto.randomInt(10, 99)}`;
      const id = `inv-item-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const barcode = input.barcode || `890123${crypto.randomInt(1000, 9999)}`;
      const sku = input.sku || `${input.brand.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PRD'}-${seq}`;
      const status = computeInventoryStatus(input.currentStock, input.reorderLevel, input.expiryDate);

      let branchName = input.branchName;
      const brRes = await client.query<{ name: string }>('SELECT name FROM branches WHERE id = $1', [input.branchId]);
      if (brRes.rows[0]?.name) {
        branchName = brRes.rows[0].name;
      }

      const initialBatches: ProductBatch[] = [
        {
          batchNumber: input.batchNumber,
          expiryDate: input.expiryDate,
          quantity: input.currentStock,
          costPriceBDT: input.unitCostBDT,
          receivedDate: new Date().toISOString().slice(0, 10),
        },
      ];

      const ins = await client.query(
        `
        INSERT INTO inventory_items (
          id, item_code, name, category, brand, product_type, barcode, sku, description,
          current_stock, unit, reorder_level, unit_cost_bdt, selling_price_bdt,
          batch_number, expiry_date, batches, usage_protocol, branch_id, branch_name, status, is_active
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16::date, $17::jsonb, $18, $19, $20, $21, TRUE
        )
        RETURNING *
        `,
        [
          id,
          itemCode,
          input.name,
          input.category,
          input.brand,
          input.productType,
          barcode,
          sku,
          input.description || null,
          input.currentStock,
          input.unit,
          input.reorderLevel,
          input.unitCostBDT,
          input.sellingPriceBDT,
          input.batchNumber,
          input.expiryDate || null,
          JSON.stringify(initialBatches),
          input.usageProtocol || null,
          input.branchId,
          branchName,
          status,
        ]
      );

      const created = mapInventoryRow(ins.rows[0] as Record<string, unknown>);

      await pgLogAuditEvent(
        actor,
        'INVENTORY_ITEM_CREATED',
        'inventory',
        created.id,
        `Added product ${created.name} (${created.itemCode}) [${created.productType}] with initial stock of ${created.currentStock} ${created.unit}`,
        ipAddress,
        client
      );

      return created;
    });
  },

  async updateInventoryItem(
    id: string,
    patch: Partial<{
      name: string;
      category: InventoryItem['category'];
      brand: string;
      productType: InventoryItem['productType'];
      sellingPriceBDT: number;
      unitCostBDT: number;
      reorderLevel: number;
      usageProtocol: string;
      description: string;
      barcode: string;
      sku: string;
      isActive: boolean;
    }>,
    actor: User,
    ipAddress: string
  ): Promise<InventoryItem | null> {
    return withPgTransaction(async (client) => {
      const existingRes = await client.query('SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE', [id]);
      if (existingRes.rowCount === 0) return null;

      const current = mapInventoryRow(existingRes.rows[0] as Record<string, unknown>);
      const nextReorder = patch.reorderLevel ?? current.reorderLevel;
      const nextStatus = computeInventoryStatus(current.currentStock, nextReorder, current.expiryDate);

      const upd = await client.query(
        `
        UPDATE inventory_items
        SET
          name = $2,
          category = $3,
          brand = $4,
          product_type = $5,
          selling_price_bdt = $6,
          unit_cost_bdt = $7,
          reorder_level = $8,
          usage_protocol = $9,
          description = $10,
          barcode = $11,
          sku = $12,
          is_active = $13,
          status = $14,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          patch.name ?? current.name,
          patch.category ?? current.category,
          patch.brand ?? current.brand,
          patch.productType ?? current.productType ?? 'dual_use',
          patch.sellingPriceBDT ?? current.sellingPriceBDT,
          patch.unitCostBDT ?? current.unitCostBDT,
          nextReorder,
          patch.usageProtocol !== undefined ? patch.usageProtocol : current.usageProtocol || null,
          patch.description !== undefined ? patch.description : current.description || null,
          patch.barcode !== undefined ? patch.barcode : current.barcode || null,
          patch.sku !== undefined ? patch.sku : current.sku || null,
          patch.isActive !== undefined ? patch.isActive : current.isActive !== false,
          nextStatus,
        ]
      );

      const updated = mapInventoryRow(upd.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'INVENTORY_ITEM_UPDATED',
        'inventory',
        updated.id,
        `Updated product ${updated.name} (${updated.itemCode})`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  // ---------------------------------------------------------------------------
  // Non-Destructive Stock Adjustments (ACID Row-Locked)
  // ---------------------------------------------------------------------------
  async listAdjustments(limit = 200): Promise<StockAdjustment[]> {
    const res = await pgQuery(
      'SELECT * FROM stock_adjustments ORDER BY adjusted_at DESC LIMIT $1',
      [Math.min(Math.max(limit, 1), 1000)]
    );
    return res.rows.map((r) => mapStockAdjustmentRow(r as Record<string, unknown>));
  },

  async adjustStock(
    input: {
      itemId: string;
      adjustmentType: StockAdjustment['adjustmentType'];
      quantityDelta: number;
      reason: string;
      batchNumber?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<{ item: InventoryItem; adjustment: StockAdjustment }> {
    return withPgTransaction(async (client) => {
      const itemRes = await client.query('SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE', [input.itemId]);
      if (itemRes.rowCount === 0) {
        const err = new Error('Inventory item not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const item = mapInventoryRow(itemRes.rows[0] as Record<string, unknown>);
      const newStock = item.currentStock + input.quantityDelta;

      if (newStock < 0) {
        const err = new Error(
          `Cannot deduct ${Math.abs(input.quantityDelta)} units. Current stock is only ${item.currentStock}.`
        ) as Error & { statusCode?: number; code?: string };
        err.statusCode = 422;
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }

      const nextStatus = computeInventoryStatus(newStock, item.reorderLevel, item.expiryDate);
      const updRes = await client.query(
        `
        UPDATE inventory_items
        SET current_stock = $2, status = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [item.id, newStock, nextStatus]
      );

      const updatedItem = mapInventoryRow(updRes.rows[0] as Record<string, unknown>);
      const batchNumber = input.batchNumber || item.batchNumber || '';
      const adjId = `stk-adj-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

      const adjRes = await client.query(
        `
        INSERT INTO stock_adjustments (
          id, item_id, item_name, batch_number, adjustment_type,
          quantity_delta, balance_after, unit_cost_bdt, reason, adjusted_by, adjusted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *
        `,
        [
          adjId,
          item.id,
          item.name,
          batchNumber,
          input.adjustmentType,
          input.quantityDelta,
          newStock,
          item.unitCostBDT,
          input.reason,
          actor.name,
        ]
      );

      const adjustment = mapStockAdjustmentRow(adjRes.rows[0] as Record<string, unknown>);

      await pgLogAuditEvent(
        actor,
        'STOCK_ADJUSTMENT',
        'inventory',
        item.id,
        `Adjusted stock for ${item.name} (${batchNumber}) by ${input.quantityDelta > 0 ? '+' : ''}${input.quantityDelta} units. New balance: ${newStock}. Reason: ${input.reason}`,
        ipAddress,
        client
      );

      return { item: updatedItem, adjustment };
    });
  },

  // ---------------------------------------------------------------------------
  // Suppliers
  // ---------------------------------------------------------------------------
  async listSuppliers(): Promise<Supplier[]> {
    const res = await pgQuery('SELECT * FROM suppliers ORDER BY created_at DESC');
    return res.rows.map((r) => mapSupplierRow(r as Record<string, unknown>));
  },

  async createSupplier(
    input: {
      name: string;
      contactPerson: string;
      phone: string;
      email: string;
      address: string;
      brandsSupplied: string[];
      paymentTerms: Supplier['paymentTerms'];
      balanceDueBDT: number;
    },
    actor: User,
    ipAddress: string
  ): Promise<Supplier> {
    return withPgTransaction(async (client) => {
      const id = `sup-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const prefix = input.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'SUP';
      const code = `SUP-${prefix}-${crypto.randomInt(100, 999)}`;

      const ins = await client.query(
        `
        INSERT INTO suppliers (
          id, code, name, contact_person, phone, email, address,
          brands_supplied, payment_terms, balance_due_bdt, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, TRUE)
        RETURNING *
        `,
        [
          id,
          code,
          input.name,
          input.contactPerson,
          input.phone,
          input.email,
          input.address,
          JSON.stringify(input.brandsSupplied || []),
          input.paymentTerms,
          input.balanceDueBDT,
        ]
      );

      const created = mapSupplierRow(ins.rows[0] as Record<string, unknown>);

      await pgLogAuditEvent(
        actor,
        'SUPPLIER_CREATED',
        'inventory',
        created.id,
        `Registered supplier ${created.name} (${created.code})`,
        ipAddress,
        client
      );

      return created;
    });
  },

  // ---------------------------------------------------------------------------
  // Purchase Orders & Goods Received Notes (GRN)
  // ---------------------------------------------------------------------------
  async listPurchaseOrders(): Promise<PurchaseOrder[]> {
    const res = await pgQuery('SELECT * FROM purchase_orders ORDER BY created_at DESC');
    return res.rows.map((r) => mapPurchaseOrderRow(r as Record<string, unknown>));
  },

  async listGoodsReceivedNotes(): Promise<GoodsReceivedNote[]> {
    const res = await pgQuery('SELECT * FROM goods_received_notes ORDER BY created_at DESC');
    return res.rows.map((r) => mapGrnRow(r as Record<string, unknown>));
  },

  async createPurchaseOrder(
    input: {
      supplierId: string;
      expectedDeliveryDate: string;
      items: Array<{ itemId: string; orderedQty: number; unitCostBDT: number }>;
      notes?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<PurchaseOrder> {
    return withPgTransaction(async (client) => {
      const supRes = await client.query('SELECT * FROM suppliers WHERE id = $1', [input.supplierId]);
      if (supRes.rowCount === 0) {
        const err = new Error('Supplier not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
      const supplier = mapSupplierRow(supRes.rows[0] as Record<string, unknown>);

      const itemIds = input.items.map((i) => i.itemId);
      const invRes = await client.query<{ id: string; item_code: string; name: string }>(
        'SELECT id, item_code, name FROM inventory_items WHERE id = ANY($1::text[])',
        [itemIds]
      );
      const invMap = new Map(invRes.rows.map((r) => [r.id, r]));

      let subtotal = 0;
      const poItems: PurchaseOrderItem[] = input.items.map((it) => {
        const found = invMap.get(it.itemId);
        const total = Number((it.orderedQty * it.unitCostBDT).toFixed(2));
        subtotal += total;
        return {
          itemId: it.itemId,
          itemCode: found?.item_code || 'SKU-GEN',
          itemName: found?.name || 'Unknown Product',
          orderedQty: it.orderedQty,
          receivedQty: 0,
          unitCostBDT: it.unitCostBDT,
          totalBDT: total,
        };
      });

      const cntRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM purchase_orders');
      const year = new Date().getFullYear();
      const seq = String(Number(cntRes.rows[0]?.cnt || 0) + 1).padStart(4, '0');
      const poNumber = `PO-${year}-${seq}-${crypto.randomInt(10, 99)}`;
      const id = `po-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const orderDate = new Date().toISOString().slice(0, 10);

      const ins = await client.query(
        `
        INSERT INTO purchase_orders (
          id, po_number, supplier_id, supplier_name, order_date, expected_delivery_date,
          items, subtotal_bdt, discount_bdt, tax_bdt, total_bdt, paid_bdt, due_bdt,
          status, payment_status, notes, created_by
        )
        VALUES (
          $1, $2, $3, $4, $5::date, $6::date,
          $7::jsonb, $8, 0, 0, $8, 0, $8,
          'ordered', 'unpaid', $9, $10
        )
        RETURNING *
        `,
        [
          id,
          poNumber,
          supplier.id,
          supplier.name,
          orderDate,
          input.expectedDeliveryDate || null,
          JSON.stringify(poItems),
          subtotal,
          input.notes || null,
          actor.name,
        ]
      );

      const created = mapPurchaseOrderRow(ins.rows[0] as Record<string, unknown>);

      await pgLogAuditEvent(
        actor,
        'PURCHASE_ORDER_CREATED',
        'inventory',
        created.id,
        `Created PO ${created.poNumber} to ${supplier.name} totaling ৳ ${subtotal.toLocaleString()}`,
        ipAddress,
        client
      );

      return created;
    });
  },

  async receiveGRN(
    poId: string,
    input: {
      invoiceRefNumber?: string;
      notes?: string;
      items: Array<{
        itemId: string;
        batchNumber: string;
        expiryDate: string;
        receivedQty: number;
        condition: 'good' | 'damaged';
      }>;
    },
    actor: User,
    ipAddress: string
  ): Promise<{ po: PurchaseOrder; grn: GoodsReceivedNote }> {
    return withPgTransaction(async (client) => {
      const poRes = await client.query('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [poId]);
      if (poRes.rowCount === 0) {
        const err = new Error('Purchase order not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const po = mapPurchaseOrderRow(poRes.rows[0] as Record<string, unknown>);
      const poItems = [...po.items];
      const grnItems: GRNItem[] = [];
      let totalReceivedCost = 0;
      const today = new Date().toISOString().slice(0, 10);

      for (const rec of input.items) {
        const invRes = await client.query('SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE', [rec.itemId]);
        if (invRes.rowCount === 0) continue;

        const inv = mapInventoryRow(invRes.rows[0] as Record<string, unknown>);
        const poLine = poItems.find((line) => line.itemId === rec.itemId);
        const unitCost = poLine ? poLine.unitCostBDT : inv.unitCostBDT;

        if (rec.receivedQty > 0 && rec.condition === 'good') {
          const nextStock = inv.currentStock + rec.receivedQty;
          const nextStatus = computeInventoryStatus(nextStock, inv.reorderLevel, rec.expiryDate);
          const nextBatches: ProductBatch[] = [
            ...(inv.batches || []),
            {
              batchNumber: rec.batchNumber,
              expiryDate: rec.expiryDate,
              quantity: rec.receivedQty,
              costPriceBDT: unitCost,
              receivedDate: today,
            },
          ];

          await client.query(
            `
            UPDATE inventory_items
            SET
              current_stock = $2,
              status = $3,
              batch_number = $4,
              expiry_date = $5::date,
              batches = $6::jsonb,
              updated_at = NOW()
            WHERE id = $1
            `,
            [inv.id, nextStock, nextStatus, rec.batchNumber, rec.expiryDate || null, JSON.stringify(nextBatches)]
          );

          const adjId = `stk-adj-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
          await client.query(
            `
            INSERT INTO stock_adjustments (
              id, item_id, item_name, batch_number, adjustment_type,
              quantity_delta, balance_after, unit_cost_bdt, reason, adjusted_by, adjusted_at
            )
            VALUES ($1, $2, $3, $4, 'restock', $5, $6, $7, $8, $9, NOW())
            `,
            [
              adjId,
              inv.id,
              inv.name,
              rec.batchNumber,
              rec.receivedQty,
              nextStock,
              unitCost,
              `Goods Received Note for PO ${po.poNumber}. Supplier Invoice: ${input.invoiceRefNumber || 'N/A'}`,
              actor.name,
            ]
          );
        }

        if (poLine) {
          poLine.receivedQty = (poLine.receivedQty || 0) + rec.receivedQty;
        }

        totalReceivedCost += rec.receivedQty * unitCost;
        grnItems.push({
          itemId: inv.id,
          itemName: inv.name,
          batchNumber: rec.batchNumber,
          expiryDate: rec.expiryDate,
          receivedQty: rec.receivedQty,
          unitCostBDT: unitCost,
          condition: rec.condition,
        });
      }

      const allFulfilled = poItems.every((it) => it.receivedQty >= it.orderedQty);
      const nextPoStatus: PurchaseOrder['status'] = allFulfilled ? 'received' : 'partially_received';

      const updPoRes = await client.query(
        `
        UPDATE purchase_orders
        SET items = $2::jsonb, status = $3
        WHERE id = $1
        RETURNING *
        `,
        [po.id, JSON.stringify(poItems), nextPoStatus]
      );

      // Increase supplier payable balance for newly received goods
      if (totalReceivedCost > 0) {
        await client.query(
          `
          UPDATE suppliers
          SET balance_due_bdt = balance_due_bdt + $2
          WHERE id = $1
          `,
          [po.supplierId, totalReceivedCost]
        );
      }

      const grnCntRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM goods_received_notes');
      const year = new Date().getFullYear();
      const seq = String(Number(grnCntRes.rows[0]?.cnt || 0) + 1).padStart(4, '0');
      const grnNumber = `GRN-${year}-${seq}-${crypto.randomInt(10, 99)}`;
      const grnId = `grn-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

      const insGrnRes = await client.query(
        `
        INSERT INTO goods_received_notes (
          id, grn_number, po_id, po_number, supplier_id, supplier_name,
          received_date, received_by, invoice_ref_number, items, total_cost_bdt, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10::jsonb, $11, $12)
        RETURNING *
        `,
        [
          grnId,
          grnNumber,
          po.id,
          po.poNumber,
          po.supplierId,
          po.supplierName,
          today,
          actor.name,
          input.invoiceRefNumber || null,
          JSON.stringify(grnItems),
          totalReceivedCost,
          input.notes || null,
        ]
      );

      const updatedPo = mapPurchaseOrderRow(updPoRes.rows[0] as Record<string, unknown>);
      const grn = mapGrnRow(insGrnRes.rows[0] as Record<string, unknown>);

      await pgLogAuditEvent(
        actor,
        'GRN_RECEIVED',
        'inventory',
        grn.id,
        `Received GRN ${grn.grnNumber} for PO ${po.poNumber} from ${po.supplierName}. Total Cost: ৳ ${totalReceivedCost.toLocaleString()}`,
        ipAddress,
        client
      );

      return { po: updatedPo, grn };
    });
  },
};
