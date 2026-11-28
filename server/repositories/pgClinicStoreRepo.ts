/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * PostgreSQL Repository: Standalone Clinic Store Module
 *  - Non-sellable supplies catalog & stock ledger (tissue, sanitizer, pens, clinical consumables)
 *  - Department / room supply requisitions, approval, atomic dispatch & receipt confirmation
 *  - Reusable clinical instruments custody, room assignment, return & repair tracking
 *  - Separate OPEX valuation & consumption analytics
 */

import crypto from 'node:crypto';
import type {
  InstrumentCondition,
  InstrumentCustodyStatus,
  StoreInstrument,
  StoreItem,
  StoreItemCategory,
  StoreItemUnit,
  StoreLedgerEntry,
  StoreLedgerSummary,
  StoreMovementType,
  StoreRequisition,
  StoreRequisitionItem,
  User,
  UserRole,
} from '../../src/types/index.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import { pgLogAuditEvent, pgRequireBranch, toDateOnly, toIsoString, toNumber } from './pgHelpers.ts';

function computeStoreItemStatus(currentStock: number, reorderLevel: number): StoreItem['status'] {
  if (currentStock <= 0) return 'out_of_stock';
  if (currentStock <= reorderLevel) return 'low_stock';
  return 'in_stock';
}

function mapStoreItemRow(row: Record<string, unknown>): StoreItem {
  const currentStock = toNumber(row.current_stock);
  const reorderLevel = toNumber(row.reorder_level, 5);
  return {
    id: String(row.id),
    itemCode: String(row.item_code),
    name: String(row.name),
    category: row.category as StoreItemCategory,
    subCategory: row.sub_category ? String(row.sub_category) : undefined,
    unit: (row.unit as StoreItemUnit) || 'pieces',
    currentStock,
    reorderLevel,
    unitCostBDT: toNumber(row.unit_cost_bdt),
    vendorName: row.vendor_name ? String(row.vendor_name) : undefined,
    storageLocation: row.storage_location ? String(row.storage_location) : undefined,
    isSellable: false,
    branchId: String(row.branch_id),
    branchName: String(row.branch_name || ''),
    status: (row.status as StoreItem['status']) || computeStoreItemStatus(currentStock, reorderLevel),
    isActive: row.is_active !== false,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapStoreRequisitionRow(row: Record<string, unknown>): StoreRequisition {
  return {
    id: String(row.id),
    reqNumber: String(row.req_number),
    department: String(row.department),
    roomNumber: row.room_number ? String(row.room_number) : undefined,
    priority: (row.priority as 'normal' | 'urgent') || 'normal',
    status: row.status as StoreRequisition['status'],
    requestedById: String(row.requested_by_id),
    requestedByName: String(row.requested_by_name),
    requestedByRole: row.requested_by_role as UserRole,
    approvedByName: row.approved_by_name ? String(row.approved_by_name) : undefined,
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : undefined,
    issuedByName: row.issued_by_name ? String(row.issued_by_name) : undefined,
    issuedAt: row.issued_at ? toIsoString(row.issued_at) : undefined,
    receivedByName: row.received_by_name ? String(row.received_by_name) : undefined,
    receivedAt: row.received_at ? toIsoString(row.received_at) : undefined,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    items: Array.isArray(row.items) ? (row.items as StoreRequisitionItem[]) : [],
    totalEstimatedCostBDT: toNumber(row.total_estimated_cost_bdt),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name || ''),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapStoreInstrumentRow(row: Record<string, unknown>): StoreInstrument {
  return {
    id: String(row.id),
    assetTag: String(row.asset_tag),
    itemId: row.item_id ? String(row.item_id) : undefined,
    name: String(row.name),
    category: String(row.category || 'Clinical Instruments & Tools'),
    serialNumber: row.serial_number ? String(row.serial_number) : undefined,
    condition: (row.condition as InstrumentCondition) || 'good',
    custodyStatus: (row.custody_status as InstrumentCustodyStatus) || 'in_store',
    assignedRoom: row.assigned_room ? String(row.assigned_room) : undefined,
    assignedToUserId: row.assigned_to_user_id ? String(row.assigned_to_user_id) : undefined,
    assignedToUserName: row.assigned_to_user_name ? String(row.assigned_to_user_name) : undefined,
    assignedAt: row.assigned_at ? toIsoString(row.assigned_at) : undefined,
    purchaseCostBDT: toNumber(row.purchase_cost_bdt),
    lastServiceDate: row.last_service_date ? toDateOnly(row.last_service_date) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    branchId: String(row.branch_id),
    branchName: String(row.branch_name || ''),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapStoreLedgerRow(row: Record<string, unknown>): StoreLedgerEntry {
  return {
    id: String(row.id),
    itemId: row.item_id ? String(row.item_id) : undefined,
    itemCode: row.item_code ? String(row.item_code) : undefined,
    itemName: String(row.item_name),
    category: String(row.category),
    movementType: row.movement_type as StoreMovementType,
    quantityDelta: toNumber(row.quantity_delta),
    balanceAfter: toNumber(row.balance_after),
    unitCostBDT: toNumber(row.unit_cost_bdt),
    totalValueBDT: toNumber(row.total_value_bdt),
    department: row.department ? String(row.department) : undefined,
    roomNumber: row.room_number ? String(row.room_number) : undefined,
    referenceNo: row.reference_no ? String(row.reference_no) : undefined,
    reason: String(row.reason || ''),
    performedByName: String(row.performed_by_name),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name || ''),
    createdAt: toIsoString(row.created_at),
  };
}

function buildError(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } {
  const err = new Error(message) as Error & { statusCode: number; code: string };
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export const pgClinicStoreRepo = {
  // ---------------------------------------------------------------------------
  // Store Items (Non-Sellable Catalog & Stock)
  // ---------------------------------------------------------------------------
  async listItems(filters: {
    branchId?: string;
    category?: string;
    status?: string;
    search?: string;
  }): Promise<StoreItem[]> {
    const clauses: string[] = ['is_active = TRUE'];
    const params: unknown[] = [];

    if (filters.branchId && filters.branchId !== 'all') {
      params.push(filters.branchId);
      clauses.push(`branch_id = $${params.length}`);
    }
    if (filters.category && filters.category !== 'all') {
      params.push(filters.category);
      clauses.push(`category = $${params.length}`);
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      const idx = params.length;
      clauses.push(
        `(name ILIKE $${idx} OR item_code ILIKE $${idx} OR COALESCE(sub_category, '') ILIKE $${idx} OR COALESCE(vendor_name, '') ILIKE $${idx})`
      );
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await pgQuery(
      `SELECT * FROM clinic_store_items ${whereSql} ORDER BY created_at DESC`,
      params
    );
    return res.rows.map((r) => mapStoreItemRow(r as Record<string, unknown>));
  },

  async createItem(
    input: {
      name: string;
      category: StoreItemCategory;
      subCategory?: string;
      unit: StoreItemUnit;
      currentStock: number;
      reorderLevel: number;
      unitCostBDT: number;
      vendorName?: string;
      storageLocation?: string;
      branchId?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<StoreItem> {
    return withPgTransaction(async (client) => {
      const branch = await pgRequireBranch(input.branchId || actor.branchId, client);
      const countRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM clinic_store_items');
      const seq = String(Number(countRes.rows[0]?.cnt || 0) + 1).padStart(3, '0');
      const catCode =
        input.category.includes('Instrument') ? 'INS' : input.category.includes('Office') ? 'OFC' : 'HYG';
      const itemCode = `STR-${catCode}-${seq}-${crypto.randomInt(10, 99)}`;
      const id = `str-item-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const status = computeStoreItemStatus(input.currentStock, input.reorderLevel);

      const ins = await client.query(
        `
        INSERT INTO clinic_store_items (
          id, item_code, name, category, sub_category, unit,
          current_stock, reorder_level, unit_cost_bdt, vendor_name, storage_location,
          is_sellable, branch_id, branch_name, status, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, $12, $13, $14, TRUE)
        RETURNING *
        `,
        [
          id,
          itemCode,
          input.name.trim(),
          input.category,
          input.subCategory?.trim() || null,
          input.unit,
          input.currentStock,
          input.reorderLevel,
          input.unitCostBDT,
          input.vendorName?.trim() || null,
          input.storageLocation?.trim() || null,
          branch.id,
          branch.name,
          status,
        ]
      );

      const created = mapStoreItemRow(ins.rows[0] as Record<string, unknown>);

      if (created.currentStock > 0) {
        const totalValue = Number((created.currentStock * created.unitCostBDT).toFixed(2));
        await client.query(
          `
          INSERT INTO clinic_store_ledger (
            id, item_id, item_code, item_name, category, movement_type,
            quantity_delta, balance_after, unit_cost_bdt, total_value_bdt,
            department, reference_no, reason, performed_by_name, branch_id, branch_name
          )
          VALUES ($1, $2, $3, $4, $5, 'stock_in', $6, $6, $7, $8, 'Central Store', $3, 'Initial Clinic Store opening stock', $9, $10, $11)
          `,
          [
            `str-ldg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            created.id,
            created.itemCode,
            created.name,
            created.category,
            created.currentStock,
            created.unitCostBDT,
            totalValue,
            actor.name,
            branch.id,
            branch.name,
          ]
        );
      }

      await pgLogAuditEvent(
        actor,
        'STORE_ITEM_CREATED',
        'clinic_store',
        created.id,
        `Added non-sellable Clinic Store item ${created.name} (${created.itemCode}) [${created.category}] with stock ${created.currentStock} ${created.unit}`,
        ipAddress,
        client
      );

      return created;
    });
  },

  async updateItem(
    id: string,
    patch: Partial<{
      name: string;
      category: StoreItemCategory;
      subCategory: string;
      unit: StoreItemUnit;
      reorderLevel: number;
      unitCostBDT: number;
      vendorName: string;
      storageLocation: string;
      isActive: boolean;
    }>,
    actor: User,
    ipAddress: string
  ): Promise<StoreItem | null> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_items WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) return null;
      const cur = mapStoreItemRow(res.rows[0] as Record<string, unknown>);
      const nextReorder = patch.reorderLevel ?? cur.reorderLevel;
      const nextStatus = computeStoreItemStatus(cur.currentStock, nextReorder);

      const upd = await client.query(
        `
        UPDATE clinic_store_items
        SET name = $2,
            category = $3,
            sub_category = $4,
            unit = $5,
            reorder_level = $6,
            unit_cost_bdt = $7,
            vendor_name = $8,
            storage_location = $9,
            is_active = $10,
            status = $11,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          patch.name ?? cur.name,
          patch.category ?? cur.category,
          patch.subCategory !== undefined ? patch.subCategory : cur.subCategory || null,
          patch.unit ?? cur.unit,
          nextReorder,
          patch.unitCostBDT ?? cur.unitCostBDT,
          patch.vendorName !== undefined ? patch.vendorName : cur.vendorName || null,
          patch.storageLocation !== undefined ? patch.storageLocation : cur.storageLocation || null,
          patch.isActive !== undefined ? patch.isActive : cur.isActive,
          nextStatus,
        ]
      );
      const updated = mapStoreItemRow(upd.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_ITEM_UPDATED',
        'clinic_store',
        updated.id,
        `Updated Clinic Store item ${updated.name} (${updated.itemCode})`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async stockInItem(
    id: string,
    input: {
      quantity: number;
      unitCostBDT?: number;
      vendorName?: string;
      referenceNo?: string;
      notes?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<{ item: StoreItem; ledgerEntry: StoreLedgerEntry }> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_items WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) throw buildError(404, 'NOT_FOUND', 'Clinic Store item not found');
      const cur = mapStoreItemRow(res.rows[0] as Record<string, unknown>);
      const nextStock = cur.currentStock + input.quantity;
      const effectiveCost = input.unitCostBDT !== undefined ? input.unitCostBDT : cur.unitCostBDT;
      const nextVendor = input.vendorName?.trim() || cur.vendorName || null;
      const nextStatus = computeStoreItemStatus(nextStock, cur.reorderLevel);

      const upd = await client.query(
        `
        UPDATE clinic_store_items
        SET current_stock = $2,
            unit_cost_bdt = $3,
            vendor_name = $4,
            status = $5,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, nextStock, effectiveCost, nextVendor, nextStatus]
      );
      const item = mapStoreItemRow(upd.rows[0] as Record<string, unknown>);

      const totalValue = Number((input.quantity * effectiveCost).toFixed(2));
      const ldgRes = await client.query(
        `
        INSERT INTO clinic_store_ledger (
          id, item_id, item_code, item_name, category, movement_type,
          quantity_delta, balance_after, unit_cost_bdt, total_value_bdt,
          department, reference_no, reason, performed_by_name, branch_id, branch_name
        )
        VALUES ($1, $2, $3, $4, $5, 'stock_in', $6, $7, $8, $9, 'Central Store', $10, $11, $12, $13, $14)
        RETURNING *
        `,
        [
          `str-ldg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          item.id,
          item.itemCode,
          item.name,
          item.category,
          input.quantity,
          nextStock,
          effectiveCost,
          totalValue,
          input.referenceNo?.trim() || `STK-IN-${Date.now().toString().slice(-4)}`,
          input.notes?.trim() || `Store purchase / restock from ${nextVendor || 'Vendor'}`,
          actor.name,
          item.branchId,
          item.branchName,
        ]
      );

      const ledgerEntry = mapStoreLedgerRow(ldgRes.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_STOCK_IN',
        'clinic_store',
        item.id,
        `Stocked in +${input.quantity} ${item.unit} of ${item.name}. Balance: ${nextStock}. Cost: BDT ${totalValue}`,
        ipAddress,
        client
      );
      return { item, ledgerEntry };
    });
  },

  async adjustItemStock(
    id: string,
    input: {
      adjustmentType: 'damaged' | 'expired' | 'wastage' | 'audit_correction';
      quantityDelta: number;
      reason: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<{ item: StoreItem; ledgerEntry: StoreLedgerEntry }> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_items WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) throw buildError(404, 'NOT_FOUND', 'Clinic Store item not found');
      const cur = mapStoreItemRow(res.rows[0] as Record<string, unknown>);
      const nextStock = cur.currentStock + input.quantityDelta;
      if (nextStock < 0) {
        throw buildError(
          422,
          'INSUFFICIENT_STOCK',
          `Cannot deduct ${Math.abs(input.quantityDelta)} ${cur.unit}. Available stock is ${cur.currentStock}.`
        );
      }
      const nextStatus = computeStoreItemStatus(nextStock, cur.reorderLevel);

      const upd = await client.query(
        `
        UPDATE clinic_store_items
        SET current_stock = $2, status = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, nextStock, nextStatus]
      );
      const item = mapStoreItemRow(upd.rows[0] as Record<string, unknown>);
      const totalValue = Number((Math.abs(input.quantityDelta) * item.unitCostBDT).toFixed(2));

      const ldgRes = await client.query(
        `
        INSERT INTO clinic_store_ledger (
          id, item_id, item_code, item_name, category, movement_type,
          quantity_delta, balance_after, unit_cost_bdt, total_value_bdt,
          department, reference_no, reason, performed_by_name, branch_id, branch_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Central Store', $11, $12, $13, $14, $15)
        RETURNING *
        `,
        [
          `str-ldg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          item.id,
          item.itemCode,
          item.name,
          item.category,
          input.adjustmentType,
          input.quantityDelta,
          nextStock,
          item.unitCostBDT,
          totalValue,
          `ADJ-${Date.now().toString().slice(-5)}`,
          input.reason.trim(),
          actor.name,
          item.branchId,
          item.branchName,
        ]
      );

      const ledgerEntry = mapStoreLedgerRow(ldgRes.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_STOCK_ADJUSTED',
        'clinic_store',
        item.id,
        `Adjusted ${item.name} by ${input.quantityDelta > 0 ? '+' : ''}${input.quantityDelta} (${input.adjustmentType}). Balance: ${nextStock}. Reason: ${input.reason}`,
        ipAddress,
        client
      );
      return { item, ledgerEntry };
    });
  },

  // ---------------------------------------------------------------------------
  // Requisitions & Atomic Store Dispatch
  // ---------------------------------------------------------------------------
  async listRequisitions(filters: {
    branchId?: string;
    status?: string;
    requestedById?: string;
  }): Promise<StoreRequisition[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.branchId && filters.branchId !== 'all') {
      params.push(filters.branchId);
      clauses.push(`branch_id = $${params.length}`);
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filters.requestedById) {
      params.push(filters.requestedById);
      clauses.push(`requested_by_id = $${params.length}`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await pgQuery(
      `SELECT * FROM clinic_store_requisitions ${whereSql} ORDER BY created_at DESC`,
      params
    );
    return res.rows.map((r) => mapStoreRequisitionRow(r as Record<string, unknown>));
  },

  async createRequisition(
    input: {
      department: string;
      roomNumber?: string;
      priority: 'normal' | 'urgent';
      notes?: string;
      branchId?: string;
      items: Array<{ itemId: string; requestedQty: number }>;
    },
    actor: User,
    ipAddress: string
  ): Promise<StoreRequisition> {
    return withPgTransaction(async (client) => {
      const branch = await pgRequireBranch(input.branchId || actor.branchId, client);
      const itemIds = input.items.map((i) => i.itemId);
      const itemRes = await client.query('SELECT * FROM clinic_store_items WHERE id = ANY($1::text[])', [itemIds]);
      const itemMap = new Map(
        itemRes.rows.map((r) => {
          const mapped = mapStoreItemRow(r as Record<string, unknown>);
          return [mapped.id, mapped];
        })
      );

      let totalEstimatedCost = 0;
      const reqItems: StoreRequisitionItem[] = input.items.map((line) => {
        const item = itemMap.get(line.itemId);
        if (!item) {
          throw buildError(404, 'NOT_FOUND', `Store item '${line.itemId}' not found`);
        }
        totalEstimatedCost += Number((line.requestedQty * item.unitCostBDT).toFixed(2));
        return {
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          category: item.category,
          unit: item.unit,
          requestedQty: line.requestedQty,
          approvedQty: line.requestedQty,
          issuedQty: 0,
          unitCostBDT: item.unitCostBDT,
        };
      });

      const cntRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM clinic_store_requisitions');
      const year = new Date().getFullYear();
      const seq = String(Number(cntRes.rows[0]?.cnt || 0) + 1).padStart(4, '0');
      const reqNumber = `REQ-${year}-${seq}-${crypto.randomInt(10, 99)}`;
      const id = `str-req-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

      const ins = await client.query(
        `
        INSERT INTO clinic_store_requisitions (
          id, req_number, department, room_number, priority, status,
          requested_by_id, requested_by_name, requested_by_role,
          notes, items, total_estimated_cost_bdt, branch_id, branch_name
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
        RETURNING *
        `,
        [
          id,
          reqNumber,
          input.department.trim(),
          input.roomNumber?.trim() || null,
          input.priority,
          actor.id,
          actor.name,
          actor.role,
          input.notes?.trim() || null,
          JSON.stringify(reqItems),
          Number(totalEstimatedCost.toFixed(2)),
          branch.id,
          branch.name,
        ]
      );

      const created = mapStoreRequisitionRow(ins.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_REQUISITION_CREATED',
        'clinic_store',
        created.id,
        `Submitted store requisition ${created.reqNumber} for ${created.department}${created.roomNumber ? ` (${created.roomNumber})` : ''} (${reqItems.length} item lines)`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async decideRequisition(
    id: string,
    input: {
      decision: 'approve' | 'reject';
      rejectionReason?: string;
      approvedQuantities?: Record<string, number>;
    },
    actor: User,
    ipAddress: string
  ): Promise<StoreRequisition> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_requisitions WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) throw buildError(404, 'NOT_FOUND', 'Store requisition not found');
      const reqRecord = mapStoreRequisitionRow(res.rows[0] as Record<string, unknown>);

      if (reqRecord.status !== 'pending') {
        throw buildError(422, 'INVALID_STATUS', `Requisition is already '${reqRecord.status}'`);
      }

      if (input.decision === 'reject') {
        const upd = await client.query(
          `
          UPDATE clinic_store_requisitions
          SET status = 'rejected',
              approved_by_name = $2,
              approved_at = NOW(),
              rejection_reason = $3,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [id, actor.name, input.rejectionReason?.trim() || 'Declined by Store Manager']
        );
        const updated = mapStoreRequisitionRow(upd.rows[0] as Record<string, unknown>);
        await pgLogAuditEvent(
          actor,
          'STORE_REQUISITION_REJECTED',
          'clinic_store',
          updated.id,
          `Rejected requisition ${updated.reqNumber}: ${updated.rejectionReason}`,
          ipAddress,
          client
        );
        return updated;
      }

      const updatedItems = reqRecord.items.map((line) => {
        const overrideQty = input.approvedQuantities?.[line.itemId];
        const approvedQty =
          overrideQty !== undefined ? Math.max(0, Math.min(line.requestedQty, overrideQty)) : line.requestedQty;
        return { ...line, approvedQty };
      });
      const updatedCost = updatedItems.reduce((sum, l) => sum + l.approvedQty * l.unitCostBDT, 0);

      const upd = await client.query(
        `
        UPDATE clinic_store_requisitions
        SET status = 'approved',
            approved_by_name = $2,
            approved_at = NOW(),
            items = $3::jsonb,
            total_estimated_cost_bdt = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, actor.name, JSON.stringify(updatedItems), Number(updatedCost.toFixed(2))]
      );
      const updated = mapStoreRequisitionRow(upd.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_REQUISITION_APPROVED',
        'clinic_store',
        updated.id,
        `Approved requisition ${updated.reqNumber} for ${updated.department}`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async issueRequisition(
    id: string,
    input: {
      issueQuantities?: Record<string, number>;
      notes?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<StoreRequisition> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_requisitions WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) throw buildError(404, 'NOT_FOUND', 'Store requisition not found');
      const reqRecord = mapStoreRequisitionRow(res.rows[0] as Record<string, unknown>);

      if (!['pending', 'approved', 'partially_issued'].includes(reqRecord.status)) {
        throw buildError(422, 'INVALID_STATUS', `Cannot issue requisition in '${reqRecord.status}' status`);
      }

      const nextItems: StoreRequisitionItem[] = [];
      let anyIssuedThisCall = false;

      for (const line of reqRecord.items) {
        const remaining = Math.max(0, (line.approvedQty || line.requestedQty) - line.issuedQty);
        const requestedIssue =
          input.issueQuantities && input.issueQuantities[line.itemId] !== undefined
            ? Math.max(0, Math.min(remaining, input.issueQuantities[line.itemId]))
            : remaining;

        if (requestedIssue > 0) {
          const itemRes = await client.query('SELECT * FROM clinic_store_items WHERE id = $1 FOR UPDATE', [line.itemId]);
          if (itemRes.rowCount === 0) {
            throw buildError(404, 'NOT_FOUND', `Store item '${line.itemName}' no longer exists`);
          }
          const storeItem = mapStoreItemRow(itemRes.rows[0] as Record<string, unknown>);
          if (storeItem.currentStock < requestedIssue) {
            throw buildError(
              422,
              'INSUFFICIENT_STOCK',
              `Insufficient stock for ${storeItem.name}. Available: ${storeItem.currentStock} ${storeItem.unit}, attempted issue: ${requestedIssue}.`
            );
          }

          const nextStock = storeItem.currentStock - requestedIssue;
          const nextStatus = computeStoreItemStatus(nextStock, storeItem.reorderLevel);
          await client.query(
            `UPDATE clinic_store_items SET current_stock = $2, status = $3, updated_at = NOW() WHERE id = $1`,
            [storeItem.id, nextStock, nextStatus]
          );

          const totalValue = Number((requestedIssue * storeItem.unitCostBDT).toFixed(2));
          await client.query(
            `
            INSERT INTO clinic_store_ledger (
              id, item_id, item_code, item_name, category, movement_type,
              quantity_delta, balance_after, unit_cost_bdt, total_value_bdt,
              department, room_number, reference_no, reason, performed_by_name, branch_id, branch_name
            )
            VALUES ($1, $2, $3, $4, $5, 'internal_issue', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `,
            [
              `str-ldg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
              storeItem.id,
              storeItem.itemCode,
              storeItem.name,
              storeItem.category,
              -requestedIssue,
              nextStock,
              storeItem.unitCostBDT,
              totalValue,
              reqRecord.department,
              reqRecord.roomNumber || null,
              reqRecord.reqNumber,
              input.notes?.trim() || `Issued against ${reqRecord.reqNumber} to ${reqRecord.department}${reqRecord.roomNumber ? ` (${reqRecord.roomNumber})` : ''}`,
              actor.name,
              storeItem.branchId,
              storeItem.branchName,
            ]
          );

          anyIssuedThisCall = true;
          nextItems.push({ ...line, issuedQty: line.issuedQty + requestedIssue });
        } else {
          nextItems.push(line);
        }
      }

      if (!anyIssuedThisCall) {
        throw buildError(422, 'NOTHING_TO_ISSUE', 'No positive quantity specified to issue');
      }

      const allIssued = nextItems.every((l) => l.issuedQty >= (l.approvedQty || l.requestedQty));
      const nextReqStatus = allIssued ? 'issued' : 'partially_issued';

      const upd = await client.query(
        `
        UPDATE clinic_store_requisitions
        SET status = $2,
            approved_by_name = COALESCE(approved_by_name, $3),
            approved_at = COALESCE(approved_at, NOW()),
            issued_by_name = $3,
            issued_at = NOW(),
            items = $4::jsonb,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, nextReqStatus, actor.name, JSON.stringify(nextItems)]
      );

      const updated = mapStoreRequisitionRow(upd.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_REQUISITION_ISSUED',
        'clinic_store',
        updated.id,
        `Dispatched ${updated.reqNumber} (${updated.status}) to ${updated.department}`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async confirmReceipt(id: string, actor: User, ipAddress: string): Promise<StoreRequisition> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_requisitions WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) throw buildError(404, 'NOT_FOUND', 'Store requisition not found');
      const reqRecord = mapStoreRequisitionRow(res.rows[0] as Record<string, unknown>);

      if (reqRecord.status !== 'issued' && reqRecord.status !== 'partially_issued') {
        throw buildError(422, 'INVALID_STATUS', 'Only issued requisitions can be confirmed as received');
      }

      const upd = await client.query(
        `
        UPDATE clinic_store_requisitions
        SET status = 'received',
            received_by_name = $2,
            received_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, actor.name]
      );
      const updated = mapStoreRequisitionRow(upd.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_REQUISITION_RECEIVED',
        'clinic_store',
        updated.id,
        `Confirmed receipt of ${updated.reqNumber} by ${actor.name}`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  // ---------------------------------------------------------------------------
  // Instruments & Reusable Asset Custody
  // ---------------------------------------------------------------------------
  async listInstruments(filters: {
    branchId?: string;
    custodyStatus?: string;
    condition?: string;
    search?: string;
  }): Promise<StoreInstrument[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.branchId && filters.branchId !== 'all') {
      params.push(filters.branchId);
      clauses.push(`branch_id = $${params.length}`);
    }
    if (filters.custodyStatus && filters.custodyStatus !== 'all') {
      params.push(filters.custodyStatus);
      clauses.push(`custody_status = $${params.length}`);
    }
    if (filters.condition && filters.condition !== 'all') {
      params.push(filters.condition);
      clauses.push(`condition = $${params.length}`);
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      const idx = params.length;
      clauses.push(
        `(name ILIKE $${idx} OR asset_tag ILIKE $${idx} OR COALESCE(serial_number, '') ILIKE $${idx} OR COALESCE(assigned_room, '') ILIKE $${idx} OR COALESCE(assigned_to_user_name, '') ILIKE $${idx})`
      );
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await pgQuery(
      `SELECT * FROM clinic_store_instruments ${whereSql} ORDER BY created_at DESC`,
      params
    );
    return res.rows.map((r) => mapStoreInstrumentRow(r as Record<string, unknown>));
  },

  async createInstrument(
    input: {
      name: string;
      category?: string;
      serialNumber?: string;
      purchaseCostBDT: number;
      assignedRoom?: string;
      assignedToUserName?: string;
      notes?: string;
      branchId?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<StoreInstrument> {
    return withPgTransaction(async (client) => {
      const branch = await pgRequireBranch(input.branchId || actor.branchId, client);
      const cntRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM clinic_store_instruments');
      const seq = String(Number(cntRes.rows[0]?.cnt || 0) + 1).padStart(3, '0');
      const assetTag = `AST-INS-${seq}-${crypto.randomInt(10, 99)}`;
      const id = `str-inst-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const isAssigned = Boolean(input.assignedRoom || input.assignedToUserName);

      const ins = await client.query(
        `
        INSERT INTO clinic_store_instruments (
          id, asset_tag, name, category, serial_number, condition, custody_status,
          assigned_room, assigned_to_user_name, assigned_at, purchase_cost_bdt, notes, branch_id, branch_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
        `,
        [
          id,
          assetTag,
          input.name.trim(),
          input.category?.trim() || 'Clinical Instruments & Tools',
          input.serialNumber?.trim() || null,
          isAssigned ? 'in_use' : 'good',
          isAssigned ? 'assigned' : 'in_store',
          input.assignedRoom?.trim() || null,
          input.assignedToUserName?.trim() || null,
          isAssigned ? new Date().toISOString() : null,
          input.purchaseCostBDT,
          input.notes?.trim() || null,
          branch.id,
          branch.name,
        ]
      );

      const created = mapStoreInstrumentRow(ins.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_INSTRUMENT_CREATED',
        'clinic_store',
        created.id,
        `Registered clinical instrument ${created.name} (${created.assetTag})`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async assignInstrument(
    id: string,
    input: {
      assignedRoom: string;
      assignedToUserId?: string;
      assignedToUserName: string;
      notes?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<StoreInstrument> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_instruments WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) throw buildError(404, 'NOT_FOUND', 'Instrument not found');
      const cur = mapStoreInstrumentRow(res.rows[0] as Record<string, unknown>);

      if (cur.condition === 'damaged' || cur.condition === 'retired' || cur.custodyStatus === 'maintenance') {
        throw buildError(422, 'INSTRUMENT_UNAVAILABLE', 'Cannot assign instrument currently damaged, retired, or under maintenance');
      }

      const upd = await client.query(
        `
        UPDATE clinic_store_instruments
        SET custody_status = 'assigned',
            condition = 'in_use',
            assigned_room = $2,
            assigned_to_user_id = $3,
            assigned_to_user_name = $4,
            assigned_at = NOW(),
            notes = COALESCE($5, notes),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, input.assignedRoom.trim(), input.assignedToUserId || null, input.assignedToUserName.trim(), input.notes?.trim() || null]
      );

      const updated = mapStoreInstrumentRow(upd.rows[0] as Record<string, unknown>);
      await client.query(
        `
        INSERT INTO clinic_store_ledger (
          id, item_code, item_name, category, movement_type,
          quantity_delta, balance_after, unit_cost_bdt, total_value_bdt,
          department, room_number, reference_no, reason, performed_by_name, branch_id, branch_name
        )
        VALUES ($1, $2, $3, $4, 'instrument_assign', -1, 0, $5, $5, $6, $7, $2, $8, $9, $10, $11)
        `,
        [
          `str-ldg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          updated.assetTag,
          updated.name,
          updated.category,
          updated.purchaseCostBDT,
          updated.assignedToUserName || 'Clinical Staff',
          updated.assignedRoom || null,
          `Assigned custody to ${updated.assignedToUserName} (${updated.assignedRoom})`,
          actor.name,
          updated.branchId,
          updated.branchName,
        ]
      );

      await pgLogAuditEvent(
        actor,
        'STORE_INSTRUMENT_ASSIGNED',
        'clinic_store',
        updated.id,
        `Assigned ${updated.name} (${updated.assetTag}) to ${updated.assignedRoom} (${updated.assignedToUserName})`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async returnInstrument(
    id: string,
    input: {
      condition: 'good' | 'under_repair' | 'damaged';
      notes?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<StoreInstrument> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_instruments WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) throw buildError(404, 'NOT_FOUND', 'Instrument not found');
      const cur = mapStoreInstrumentRow(res.rows[0] as Record<string, unknown>);
      const nextCustody: InstrumentCustodyStatus = input.condition === 'good' ? 'in_store' : 'maintenance';

      const upd = await client.query(
        `
        UPDATE clinic_store_instruments
        SET custody_status = $2,
            condition = $3,
            assigned_room = NULL,
            assigned_to_user_id = NULL,
            assigned_to_user_name = NULL,
            notes = COALESCE($4, notes),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, nextCustody, input.condition, input.notes?.trim() || null]
      );

      const updated = mapStoreInstrumentRow(upd.rows[0] as Record<string, unknown>);
      await client.query(
        `
        INSERT INTO clinic_store_ledger (
          id, item_code, item_name, category, movement_type,
          quantity_delta, balance_after, unit_cost_bdt, total_value_bdt,
          department, room_number, reference_no, reason, performed_by_name, branch_id, branch_name
        )
        VALUES ($1, $2, $3, $4, 'instrument_return', 1, 1, $5, $5, 'Central Store', $6, $2, $7, $8, $9, $10)
        `,
        [
          `str-ldg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          updated.assetTag,
          updated.name,
          updated.category,
          updated.purchaseCostBDT,
          cur.assignedRoom || null,
          `Returned to Store (${input.condition})${input.notes ? `: ${input.notes}` : ''}`,
          actor.name,
          updated.branchId,
          updated.branchName,
        ]
      );

      await pgLogAuditEvent(
        actor,
        'STORE_INSTRUMENT_RETURNED',
        'clinic_store',
        updated.id,
        `Returned ${updated.name} (${updated.assetTag}) to Store with condition '${input.condition}'`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async updateInstrumentStatus(
    id: string,
    input: {
      condition: InstrumentCondition;
      notes?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<StoreInstrument> {
    return withPgTransaction(async (client) => {
      const res = await client.query('SELECT * FROM clinic_store_instruments WHERE id = $1 FOR UPDATE', [id]);
      if (res.rowCount === 0) throw buildError(404, 'NOT_FOUND', 'Instrument not found');
      const cur = mapStoreInstrumentRow(res.rows[0] as Record<string, unknown>);

      let nextCustody: InstrumentCustodyStatus = cur.custodyStatus;
      if (input.condition === 'under_repair' || input.condition === 'damaged') {
        nextCustody = 'maintenance';
      } else if (input.condition === 'retired') {
        nextCustody = 'retired';
      } else if (input.condition === 'good') {
        nextCustody = cur.assignedRoom ? 'assigned' : 'in_store';
      }

      const upd = await client.query(
        `
        UPDATE clinic_store_instruments
        SET condition = $2,
            custody_status = $3,
            last_service_date = CASE WHEN $2 = 'good' THEN CURRENT_DATE ELSE last_service_date END,
            notes = COALESCE($4, notes),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, input.condition, nextCustody, input.notes?.trim() || null]
      );
      const updated = mapStoreInstrumentRow(upd.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'STORE_INSTRUMENT_STATUS_UPDATED',
        'clinic_store',
        updated.id,
        `Updated ${updated.name} (${updated.assetTag}) condition to '${updated.condition}'${input.notes ? ` — ${input.notes}` : ''}`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  // ---------------------------------------------------------------------------
  // Ledger & OPEX Summary
  // ---------------------------------------------------------------------------
  async listLedger(filters: {
    branchId?: string;
    movementType?: string;
    search?: string;
    limit?: number;
  }): Promise<StoreLedgerEntry[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.branchId && filters.branchId !== 'all') {
      params.push(filters.branchId);
      clauses.push(`branch_id = $${params.length}`);
    }
    if (filters.movementType && filters.movementType !== 'all') {
      params.push(filters.movementType);
      clauses.push(`movement_type = $${params.length}`);
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      const idx = params.length;
      clauses.push(
        `(item_name ILIKE $${idx} OR COALESCE(department, '') ILIKE $${idx} OR COALESCE(reference_no, '') ILIKE $${idx} OR reason ILIKE $${idx})`
      );
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit || 250, 1), 1000));
    const res = await pgQuery(
      `SELECT * FROM clinic_store_ledger ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.rows.map((r) => mapStoreLedgerRow(r as Record<string, unknown>));
  },

  async getSummary(branchId?: string): Promise<StoreLedgerSummary> {
    const [items, reqs, instruments, ledger] = await Promise.all([
      this.listItems({ branchId }),
      this.listRequisitions({ branchId }),
      this.listInstruments({ branchId }),
      this.listLedger({ branchId, limit: 500 }),
    ]);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthIso = monthStart.toISOString();

    const totalStockValuationBDT = Number(
      items.reduce((sum, it) => sum + it.currentStock * it.unitCostBDT, 0).toFixed(2)
    );

    const monthlyEntries = ledger.filter((e) => e.createdAt >= monthIso);
    const monthlyConsumptionBDT = Number(
      monthlyEntries
        .filter((e) => ['internal_issue', 'damaged', 'expired', 'wastage'].includes(e.movementType))
        .reduce((sum, e) => sum + e.totalValueBDT, 0)
        .toFixed(2)
    );
    const monthlyStockInBDT = Number(
      monthlyEntries
        .filter((e) => e.movementType === 'stock_in')
        .reduce((sum, e) => sum + e.totalValueBDT, 0)
        .toFixed(2)
    );

    const deptMap = new Map<string, { department: string; costBDT: number; issueCount: number }>();
    for (const e of monthlyEntries.filter((x) => x.movementType === 'internal_issue')) {
      const dept = e.department || 'General Clinic';
      const prev = deptMap.get(dept) || { department: dept, costBDT: 0, issueCount: 0 };
      prev.costBDT = Number((prev.costBDT + e.totalValueBDT).toFixed(2));
      prev.issueCount += 1;
      deptMap.set(dept, prev);
    }

    const catMap = new Map<string, { category: string; stockValueBDT: number; monthlyIssueBDT: number }>();
    for (const it of items) {
      const prev = catMap.get(it.category) || { category: it.category, stockValueBDT: 0, monthlyIssueBDT: 0 };
      prev.stockValueBDT = Number((prev.stockValueBDT + it.currentStock * it.unitCostBDT).toFixed(2));
      catMap.set(it.category, prev);
    }
    for (const e of monthlyEntries.filter((x) => ['internal_issue', 'damaged', 'expired', 'wastage'].includes(x.movementType))) {
      const prev = catMap.get(e.category) || { category: e.category, stockValueBDT: 0, monthlyIssueBDT: 0 };
      prev.monthlyIssueBDT = Number((prev.monthlyIssueBDT + e.totalValueBDT).toFixed(2));
      catMap.set(e.category, prev);
    }

    return {
      totalStockValuationBDT,
      monthlyConsumptionBDT,
      monthlyStockInBDT,
      totalItemsCount: items.length,
      lowStockCount: items.filter((i) => i.status === 'low_stock').length,
      outOfStockCount: items.filter((i) => i.status === 'out_of_stock').length,
      instrumentsTotalCount: instruments.length,
      instrumentsAssignedCount: instruments.filter((i) => i.custodyStatus === 'assigned').length,
      instrumentsUnderRepairCount: instruments.filter(
        (i) => i.condition === 'under_repair' || i.condition === 'damaged'
      ).length,
      pendingRequisitionsCount: reqs.filter((r) => r.status === 'pending' || r.status === 'approved').length,
      departmentCosts: Array.from(deptMap.values()).sort((a, b) => b.costBDT - a.costBDT),
      categoryCosts: Array.from(catMap.values()),
    };
  },
};
