import crypto from 'crypto';
import type {
  ProductCategoryDto,
  CreateProductCategoryRequest,
  ProductDto,
  CreateProductRequest,
  UpdateProductRequest,
  SupplierDto,
  CreateSupplierRequest,
  UpdateSupplierRequest,
  PurchaseDto,
  PurchaseItemDto,
  CreatePurchaseRequest,
  ProductBatchDto,
  StockMovementDto,
  RecordMovementInput,
  StockOnHandDto,
  ExpiringBatchDto,
  InventoryReportQuery,
  InventoryReportResultDto,
  InventoryReportType,
} from '@suoxi/shared-types';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
} from '../middleware/errorHandler.js';
import { logAudit } from './auditLogger.js';

export class InventoryService {
  private categories = new Map<string, ProductCategoryDto>();
  private products = new Map<string, ProductDto>();
  private suppliers = new Map<string, SupplierDto>();
  private purchases = new Map<string, PurchaseDto>();
  private purchaseItems = new Map<string, PurchaseItemDto>();
  private productBatches = new Map<string, ProductBatchDto>();
  private stockMovements = new Map<string, StockMovementDto>();

  // Deterministic sequences
  private purchaseSeq = 1;
  private movementSeq = 1;
  private supplierSeq = 1;

  // Concurrency Locks per (product_id:branch_id)
  private productLocks = new Map<string, Promise<void>>();

  constructor() {
    this.seedInitialData();
  }

  public resetData() {
    this.categories.clear();
    this.products.clear();
    this.suppliers.clear();
    this.purchases.clear();
    this.purchaseItems.clear();
    this.productBatches.clear();
    this.stockMovements.clear();
    this.productLocks.clear();
    this.purchaseSeq = 1;
    this.movementSeq = 1;
    this.supplierSeq = 1;
    this.seedInitialData();
  }

  private seedInitialData() {
    // 1. Categories
    const catSerum: ProductCategoryDto = {
      id: 'cat-serum-01',
      category_code: 'CAT-SERUMS',
      name: 'Serums & Peels',
      name_bn: 'সিরাম ও পিলস',
      description: 'Active clinical serums, chemical peels, and micro-needling solutions',
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    const catInject: ProductCategoryDto = {
      id: 'cat-inject-01',
      category_code: 'CAT-INJECT',
      name: 'Injectables & Toxins',
      name_bn: 'ইনজেক্টেবল ও টক্সিন',
      description: 'Dermal fillers, Botulinum toxin, and skin boosters',
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    const catConsumable: ProductCategoryDto = {
      id: 'cat-consumable-01',
      category_code: 'CAT-CONSUMABLE',
      name: 'Clinical Consumables',
      name_bn: 'ক্লিনিক্যাল সরঞ্জাম',
      description: 'Sterile gauze, disposable tips, needles, and post-procedure soothing packs',
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    this.categories.set(catSerum.id, catSerum);
    this.categories.set(catInject.id, catInject);
    this.categories.set(catConsumable.id, catConsumable);

    // 2. Suppliers
    const supplier1: SupplierDto = {
      id: 'sup-001',
      supplier_code: 'SUP-000001',
      name: 'Apex Aesthetic Supplies Ltd',
      name_bn: 'অ্যাপেক্স নান্দনিক সরবরাহ লিমিটেড',
      contact_person: 'Md. Tareq Hasan',
      phone: '+8801711223344',
      email: 'orders@apexaesthetic.com.bd',
      address: 'House 42, Road 11, Banani, Dhaka-1213',
      payment_terms: 'Net 30',
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    this.suppliers.set(supplier1.id, supplier1);
    this.supplierSeq = 2;

    // 3. Products
    // Sample requested by Prompt 13: "Hyaluronic Acid Serum 30ml" SKU HA-030, reorder level 10, batch HA-2026-09, expiry 31 Aug 2028, stock 24 (DEV seed only)
    const prodHA: ProductDto = {
      id: 'prod-ha-030',
      sku: 'HA-030',
      name: 'Hyaluronic Acid Serum 30ml',
      name_bn: 'হায়ালুরোনিক অ্যাসিড সিরাম ৩০ মি.লি.',
      category_id: catSerum.id,
      category_name: catSerum.name,
      unit: 'ml',
      cost_price: '1200.00',
      sale_price: '2400.00',
      reorder_level: 10,
      allow_negative_stock: false,
      track_batches: true,
      track_expiry: true,
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    const prodGel: ProductDto = {
      id: 'prod-gel-01',
      sku: 'GEL-POST-01',
      name: 'Post-Laser Soothing Peptide Hydrogel',
      name_bn: 'পোস্ট-লেজার সুথিং পেপটাইড হাইড্রোজেল',
      category_id: catConsumable.id,
      category_name: catConsumable.name,
      unit: 'vial',
      cost_price: '450.00',
      sale_price: '850.00',
      reorder_level: 15,
      allow_negative_stock: false,
      track_batches: true,
      track_expiry: true,
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    this.products.set(prodHA.id, prodHA);
    this.products.set(prodGel.id, prodGel);

    // 4. Batches
    const batchHA: ProductBatchDto = {
      id: 'batch-ha-01',
      product_id: prodHA.id,
      product_name: prodHA.name,
      sku: prodHA.sku,
      branch_id: 'br-dhk-01',
      branch_name: 'Dhanmondi Branch',
      batch_no: 'HA-2026-09',
      expiry_date: '2028-08-31',
      cost_price: '1200.00',
      initial_quantity: '24.00',
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
    };
    this.productBatches.set(batchHA.id, batchHA);

    // 5. Initial Seed Movement (stock 24)
    const seedMov: StockMovementDto = {
      id: 'mov-seed-01',
      movement_code: 'STK-MOV-000001',
      product_id: prodHA.id,
      product_name: prodHA.name,
      sku: prodHA.sku,
      batch_id: batchHA.id,
      batch_no: batchHA.batch_no,
      branch_id: 'br-dhk-01',
      branch_name: 'Dhanmondi Branch',
      movement_type: 'purchase_receipt',
      quantity_change: '24.00',
      unit_cost: '1200.00',
      reference_type: 'purchase',
      reference_id: 'po-seed-01',
      requested_by: 'usr-101',
      requested_by_name: 'Super Admin',
      created_at: '2026-10-01T08:00:00.000Z',
    };
    this.stockMovements.set(seedMov.id, seedMov);
    this.movementSeq = 2;
  }

  // --- Concurrency Helpers ---
  private async acquireProductLock<T>(
    productId: string,
    branchId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${productId}:${branchId}`;
    while (this.productLocks.has(lockKey)) {
      await this.productLocks.get(lockKey);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((res) => {
      resolveLock = res;
    });
    this.productLocks.set(lockKey, lockPromise);

    try {
      return await operation();
    } finally {
      this.productLocks.delete(lockKey);
      resolveLock();
    }
  }

  // --- Category APIs ---
  public async listCategories(): Promise<ProductCategoryDto[]> {
    return Array.from(this.categories.values());
  }

  public async createCategory(req: CreateProductCategoryRequest): Promise<ProductCategoryDto> {
    const code = req.category_code.trim().toUpperCase();
    const existing = Array.from(this.categories.values()).find(
      (c) => c.category_code.toUpperCase() === code
    );
    if (existing) {
      throw new ConflictError(`Category code '${code}' already exists`);
    }

    const id = `cat-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const cat: ProductCategoryDto = {
      id,
      category_code: code,
      name: req.name.trim(),
      name_bn: req.name_bn?.trim(),
      description: req.description?.trim(),
      is_active: req.is_active !== undefined ? req.is_active : true,
      created_at: now,
      updated_at: now,
    };
    this.categories.set(id, cat);
    return cat;
  }

  // --- Product APIs ---
  public async listProducts(filters?: {
    categoryId?: string;
    search?: string;
    activeOnly?: boolean;
    branchId?: string;
  }): Promise<ProductDto[]> {
    const branch = filters?.branchId || 'br-dhk-01';
    let list = Array.from(this.products.values());

    if (filters?.categoryId && filters.categoryId !== 'all') {
      list = list.filter((p) => p.category_id === filters.categoryId);
    }
    if (filters?.activeOnly) {
      list = list.filter((p) => p.is_active);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.name_bn && p.name_bn.toLowerCase().includes(q))
      );
    }

    // Attach derived stock on hand for the branch
    return list.map((p) => {
      const stock = this.computeStockOnHand(p.id, branch);
      return {
        ...p,
        stock_on_hand: stock.toFixed(2),
      };
    });
  }

  public async getProduct(id: string, branchId = 'br-dhk-01'): Promise<ProductDto> {
    const product = this.products.get(id);
    if (!product) {
      throw new NotFoundError(`Product '${id}' not found`);
    }
    const stock = this.computeStockOnHand(product.id, branchId);
    return {
      ...product,
      stock_on_hand: stock.toFixed(2),
    };
  }

  public async createProduct(req: CreateProductRequest, actorUser?: any): Promise<ProductDto> {
    const sku = req.sku.trim().toUpperCase();
    const existing = Array.from(this.products.values()).find((p) => p.sku.toUpperCase() === sku);
    if (existing) {
      throw new ConflictError(`Product SKU '${sku}' already exists`);
    }

    const cat = this.categories.get(req.category_id);
    if (!cat) {
      throw new BadRequestError(`Invalid category ID '${req.category_id}'`);
    }

    const id = `prod-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const product: ProductDto = {
      id,
      sku,
      name: req.name.trim(),
      name_bn: req.name_bn?.trim(),
      category_id: req.category_id,
      category_name: cat.name,
      unit: req.unit.trim(),
      cost_price: Number(req.cost_price || 0).toFixed(2),
      sale_price: Number(req.sale_price || 0).toFixed(2),
      reorder_level: req.reorder_level !== undefined ? Number(req.reorder_level) : 10,
      allow_negative_stock: !!req.allow_negative_stock,
      track_batches: req.track_batches !== undefined ? req.track_batches : true,
      track_expiry: req.track_expiry !== undefined ? req.track_expiry : true,
      is_active: req.is_active !== undefined ? req.is_active : true,
      stock_on_hand: '0.00',
      created_at: now,
      updated_at: now,
    };
    this.products.set(id, product);

    if (actorUser) {
      await logAudit(null, {
        actorUserId: actorUser.id,
        action: 'inventory.product.created',
        entityType: 'product',
        entityId: id,
        branchId: actorUser.branchId || 'br-dhk-01',
        payloadAfter: { sku, name: product.name, unit: product.unit },
        ipAddress: '127.0.0.1',
      });
    }

    return product;
  }

  public async updateProduct(
    id: string,
    req: UpdateProductRequest,
    actorUser?: any
  ): Promise<ProductDto> {
    const product = this.products.get(id);
    if (!product) {
      throw new NotFoundError(`Product '${id}' not found`);
    }

    if (req.category_id) {
      const cat = this.categories.get(req.category_id);
      if (!cat) throw new BadRequestError(`Invalid category ID '${req.category_id}'`);
      product.category_id = req.category_id;
      product.category_name = cat.name;
    }

    if (req.name !== undefined) product.name = req.name.trim();
    if (req.name_bn !== undefined) product.name_bn = req.name_bn.trim();
    if (req.unit !== undefined) product.unit = req.unit.trim();
    if (req.cost_price !== undefined) product.cost_price = Number(req.cost_price).toFixed(2);
    if (req.sale_price !== undefined) product.sale_price = Number(req.sale_price).toFixed(2);
    if (req.reorder_level !== undefined) product.reorder_level = Number(req.reorder_level);
    if (req.allow_negative_stock !== undefined) product.allow_negative_stock = !!req.allow_negative_stock;
    if (req.track_batches !== undefined) product.track_batches = !!req.track_batches;
    if (req.track_expiry !== undefined) product.track_expiry = !!req.track_expiry;
    if (req.is_active !== undefined) product.is_active = !!req.is_active;

    product.updated_at = new Date().toISOString();
    this.products.set(id, product);

    return this.getProduct(id);
  }

  // --- Supplier APIs ---
  public async listSuppliers(): Promise<SupplierDto[]> {
    return Array.from(this.suppliers.values());
  }

  public async getSupplier(id: string): Promise<SupplierDto> {
    const s = this.suppliers.get(id);
    if (!s) throw new NotFoundError(`Supplier '${id}' not found`);
    return s;
  }

  public async createSupplier(req: CreateSupplierRequest): Promise<SupplierDto> {
    const code = `SUP-${String(this.supplierSeq++).padStart(6, '0')}`;
    const id = `sup-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const s: SupplierDto = {
      id,
      supplier_code: code,
      name: req.name.trim(),
      name_bn: req.name_bn?.trim(),
      contact_person: req.contact_person?.trim(),
      phone: req.phone.trim(),
      email: req.email?.trim(),
      address: req.address?.trim(),
      payment_terms: req.payment_terms?.trim() || 'Net 30',
      is_active: req.is_active !== undefined ? req.is_active : true,
      created_at: now,
      updated_at: now,
    };
    this.suppliers.set(id, s);
    return s;
  }

  public async updateSupplier(id: string, req: UpdateSupplierRequest): Promise<SupplierDto> {
    const s = this.suppliers.get(id);
    if (!s) throw new NotFoundError(`Supplier '${id}' not found`);

    if (req.name !== undefined) s.name = req.name.trim();
    if (req.name_bn !== undefined) s.name_bn = req.name_bn.trim();
    if (req.contact_person !== undefined) s.contact_person = req.contact_person.trim();
    if (req.phone !== undefined) s.phone = req.phone.trim();
    if (req.email !== undefined) s.email = req.email.trim();
    if (req.address !== undefined) s.address = req.address.trim();
    if (req.payment_terms !== undefined) s.payment_terms = req.payment_terms.trim();
    if (req.is_active !== undefined) s.is_active = !!req.is_active;

    s.updated_at = new Date().toISOString();
    this.suppliers.set(id, s);
    return s;
  }

  // --- Purchase APIs ---
  public async listPurchases(filters?: {
    branchId?: string;
    supplierId?: string;
    status?: string;
  }): Promise<PurchaseDto[]> {
    let list = Array.from(this.purchases.values());
    if (filters?.branchId && filters.branchId !== 'all') {
      list = list.filter((p) => p.branch_id === filters.branchId);
    }
    if (filters?.supplierId && filters.supplierId !== 'all') {
      list = list.filter((p) => p.supplier_id === filters.supplierId);
    }
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((p) => p.status === filters.status);
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public async getPurchase(id: string): Promise<PurchaseDto> {
    const p = this.purchases.get(id);
    if (!p) throw new NotFoundError(`Purchase '${id}' not found`);
    return p;
  }

  public async createPurchase(req: CreatePurchaseRequest, actorUser: any): Promise<PurchaseDto> {
    const supplier = this.suppliers.get(req.supplier_id);
    if (!supplier) throw new BadRequestError(`Invalid supplier ID '${req.supplier_id}'`);

    if (!req.items || req.items.length === 0) {
      throw new BadRequestError('Purchase order must have at least one line item');
    }

    const purchaseId = `po-${crypto.randomUUID()}`;
    const purchaseNo = `PO-${new Date().getFullYear()}-${String(this.purchaseSeq++).padStart(6, '0')}`;
    const now = new Date().toISOString();

    let totalCostNum = 0;
    const items: PurchaseItemDto[] = [];

    for (const itemInput of req.items) {
      const prod = this.products.get(itemInput.product_id);
      if (!prod) {
        throw new BadRequestError(`Product '${itemInput.product_id}' not found`);
      }
      if (itemInput.quantity <= 0) {
        throw new BadRequestError(`Quantity for product ${prod.name} must be > 0`);
      }
      const lineCost = Number(itemInput.quantity) * Number(itemInput.unit_cost);
      totalCostNum += lineCost;

      const itemId = `poi-${crypto.randomUUID()}`;
      const itemDto: PurchaseItemDto = {
        id: itemId,
        purchase_id: purchaseId,
        product_id: prod.id,
        product_name: prod.name,
        product_sku: prod.sku,
        quantity: Number(itemInput.quantity).toFixed(2),
        unit_cost: Number(itemInput.unit_cost).toFixed(2),
        total_cost: lineCost.toFixed(2),
        batch_no: itemInput.batch_no?.trim(),
        expiry_date: itemInput.expiry_date?.trim(),
        received_quantity: '0.00',
      };
      items.push(itemDto);
      this.purchaseItems.set(itemId, itemDto);
    }

    const purchase: PurchaseDto = {
      id: purchaseId,
      purchase_no: purchaseNo,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      branch_id: req.branch_id || 'br-dhk-01',
      branch_name: 'Dhanmondi Branch',
      purchase_date: req.purchase_date,
      supplier_invoice_no: req.supplier_invoice_no?.trim(),
      status: 'ordered',
      total_cost: totalCostNum.toFixed(2),
      document_file_id: req.document_file_id,
      notes: req.notes?.trim(),
      created_by: actorUser.id,
      created_by_name: actorUser.fullName || actorUser.email,
      items,
      created_at: now,
      updated_at: now,
    };
    this.purchases.set(purchaseId, purchase);

    await logAudit(null, {
      actorUserId: actorUser.id,
      action: 'inventory.purchase.created',
      entityType: 'purchase',
      entityId: purchaseId,
      branchId: purchase.branch_id,
      payloadAfter: { purchase_no: purchaseNo, total_cost: purchase.total_cost, items_count: items.length },
      ipAddress: '127.0.0.1',
    });

    return purchase;
  }

  /**
   * Mark purchase as received:
   * Status guard + unique key check: double-receive returns 409 Conflict.
   * Atomically records batches and purchase_receipt stock movements in ONE transaction.
   */
  public async markPurchaseReceived(id: string, actorUser: any): Promise<PurchaseDto> {
    const purchase = this.purchases.get(id);
    if (!purchase) {
      throw new NotFoundError(`Purchase '${id}' not found`);
    }

    // Status guard
    if (purchase.status === 'received') {
      throw new ConflictError(
        `Purchase '${purchase.purchase_no}' has already been marked received and cannot be received twice.`
      );
    }
    if (purchase.status === 'cancelled') {
      throw new ConflictError(`Cancelled purchase '${purchase.purchase_no}' cannot be marked received.`);
    }

    const now = new Date().toISOString();
    purchase.status = 'received';
    purchase.received_at = now;
    purchase.received_by = actorUser.id;
    purchase.received_by_name = actorUser.fullName || actorUser.email;
    purchase.updated_at = now;

    // Process each line item in one atomic transaction
    for (const it of purchase.items) {
      it.received_quantity = it.quantity;
      let batchId: string | undefined;

      // Create or update batch if batch number is provided
      if (it.batch_no && it.expiry_date) {
        const batchKey = `${it.product_id}:${purchase.branch_id}:${it.batch_no}`;
        const existingBatch = Array.from(this.productBatches.values()).find(
          (b) =>
            b.product_id === it.product_id &&
            b.branch_id === purchase.branch_id &&
            b.batch_no === it.batch_no
        );
        if (existingBatch) {
          batchId = existingBatch.id;
        } else {
          batchId = `batch-${crypto.randomUUID()}`;
          const newBatch: ProductBatchDto = {
            id: batchId,
            product_id: it.product_id,
            product_name: it.product_name,
            sku: it.product_sku,
            branch_id: purchase.branch_id,
            branch_name: purchase.branch_name,
            batch_no: it.batch_no,
            expiry_date: it.expiry_date,
            cost_price: it.unit_cost,
            initial_quantity: it.quantity,
            is_active: true,
            created_at: now,
          };
          this.productBatches.set(batchId, newBatch);
        }
      }

      // Record stock movement (purchase_receipt, positive quantity)
      const movCode = `STK-MOV-${String(this.movementSeq++).padStart(6, '0')}`;
      const movId = `mov-${crypto.randomUUID()}`;
      const movement: StockMovementDto = {
        id: movId,
        movement_code: movCode,
        product_id: it.product_id,
        product_name: it.product_name,
        sku: it.product_sku,
        batch_id: batchId,
        batch_no: it.batch_no,
        branch_id: purchase.branch_id,
        branch_name: purchase.branch_name,
        movement_type: 'purchase_receipt',
        quantity_change: Math.abs(Number(it.quantity)).toFixed(2),
        unit_cost: it.unit_cost,
        reference_type: 'purchase',
        reference_id: purchase.id,
        requested_by: actorUser.id,
        requested_by_name: actorUser.fullName || actorUser.email,
        created_at: now,
      };
      this.stockMovements.set(movId, movement);
    }

    this.purchases.set(id, purchase);

    await logAudit(null, {
      actorUserId: actorUser.id,
      action: 'inventory.purchase.received',
      entityType: 'purchase',
      entityId: purchase.id,
      branchId: purchase.branch_id,
      payloadAfter: { purchase_no: purchase.purchase_no, received_at: now },
      ipAddress: '127.0.0.1',
    });

    return purchase;
  }

  // --- Stock Movement APIs ---

  /**
   * Concurrency-controlled Stock Movement:
   * Acquires lock on (product_id:branch_id).
   * Verifies current balance.
   * If allow_negative_stock is false, rejects movements that would go below zero (HTTP 422).
   * Enforces AS-2: approver cannot be the requester for adjustments/wastage/reversals.
   */
  public async recordMovement(
    input: RecordMovementInput,
    actorUser: any
  ): Promise<StockMovementDto> {
    const product = this.products.get(input.product_id);
    if (!product) {
      throw new NotFoundError(`Product '${input.product_id}' not found`);
    }

    const branchId = input.branch_id || 'br-dhk-01';

    // Sign validations per movement type
    let signedChange = Number(input.quantity_change);
    if (input.movement_type === 'session_usage' || input.movement_type === 'wastage') {
      signedChange = -Math.abs(signedChange);
    } else if (input.movement_type === 'purchase_receipt') {
      signedChange = Math.abs(signedChange);
    }

    if (signedChange === 0) {
      throw new BadRequestError('Quantity change cannot be zero');
    }

    // Supervised movement validations (reason & approver)
    if (['adjustment', 'wastage', 'reversal'].includes(input.movement_type)) {
      if (!input.reason || !input.reason.trim()) {
        throw new UnprocessableEntityError(
          `Reason is mandatory for stock movement of type '${input.movement_type}'`
        );
      }
      if (!input.approved_by || !input.approved_by.trim()) {
        throw new UnprocessableEntityError(
          `Approved by is mandatory for stock movement of type '${input.movement_type}'`
        );
      }

      // AS-2 Enforcement: Approver cannot be the requester
      if (actorUser.id === input.approved_by.trim()) {
        throw new UnprocessableEntityError(
          'Rule AS-2 Violation: Stock adjustment/wastage approver cannot be the same staff user as the requester.'
        );
      }
    }

    // Pessimistic Concurrency Lock on (product_id:branch_id)
    return await this.acquireProductLock(product.id, branchId, async () => {
      const currentStock = this.computeStockOnHand(product.id, branchId);
      const newStock = currentStock + signedChange;

      if (!product.allow_negative_stock && newStock < 0) {
        throw new UnprocessableEntityError(
          `Movement rejected: Insufficient stock for '${product.name}' (Current: ${currentStock}, Requested change: ${signedChange}). Negative stock disallowed.`
        );
      }

      let batchNo: string | undefined;
      if (input.batch_id) {
        const batch = this.productBatches.get(input.batch_id);
        if (batch) {
          batchNo = batch.batch_no;
        }
      }

      const now = new Date().toISOString();
      const movCode = `STK-MOV-${String(this.movementSeq++).padStart(6, '0')}`;
      const movId = `mov-${crypto.randomUUID()}`;

      const movement: StockMovementDto = {
        id: movId,
        movement_code: movCode,
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        batch_id: input.batch_id,
        batch_no: batchNo,
        branch_id: branchId,
        branch_name: 'Dhanmondi Branch',
        movement_type: input.movement_type,
        quantity_change: signedChange.toFixed(2),
        unit_cost: input.unit_cost !== undefined ? Number(input.unit_cost).toFixed(2) : product.cost_price,
        reference_type: input.reference_type || 'none',
        reference_id: input.reference_id,
        original_movement_id: input.original_movement_id,
        reason: input.reason?.trim(),
        requested_by: actorUser.id,
        requested_by_name: actorUser.fullName || actorUser.email,
        approved_by: input.approved_by,
        approved_at: input.approved_by ? now : undefined,
        created_at: now,
      };

      this.stockMovements.set(movId, movement);

      await logAudit(null, {
        actorUserId: actorUser.id,
        action: `inventory.movement.${input.movement_type}`,
        entityType: 'stock_movement',
        entityId: movId,
        branchId,
        payloadAfter: {
          movement_code: movCode,
          product_id: product.id,
          sku: product.sku,
          change: signedChange,
          balance_after: newStock,
        },
        ipAddress: '127.0.0.1',
      });

      return movement;
    });
  }

  /**
   * Reverse an existing movement:
   * Creates an append-only reversal row pointing to original_movement_id with inverted sign.
   */
  public async reverseMovement(
    originalMovementId: string,
    reason: string,
    approvedBy: string,
    actorUser: any
  ): Promise<StockMovementDto> {
    const original = this.stockMovements.get(originalMovementId);
    if (!original) {
      throw new NotFoundError(`Original stock movement '${originalMovementId}' not found`);
    }

    // Check if already reversed
    const alreadyReversed = Array.from(this.stockMovements.values()).some(
      (m) => m.original_movement_id === originalMovementId
    );
    if (alreadyReversed) {
      throw new ConflictError(
        `Movement '${original.movement_code}' has already been reversed.`
      );
    }

    const invertedChange = -Number(original.quantity_change);

    return this.recordMovement(
      {
        product_id: original.product_id,
        batch_id: original.batch_id,
        branch_id: original.branch_id,
        movement_type: 'reversal',
        quantity_change: invertedChange,
        reference_type: original.reference_type,
        reference_id: original.reference_id,
        original_movement_id: original.id,
        reason,
        approved_by: approvedBy,
      },
      actorUser
    );
  }

  /**
   * Block UPDATE/DELETE on stock_movements (Rule 6).
   */
  public blockMovementMutation(action: 'UPDATE' | 'DELETE') {
    throw new UnprocessableEntityError(
      `Rule 6 Violation: stock_movements is strictly append-only. ${action} operations are forbidden by trigger.`
    );
  }

  // --- Views & Reports ---

  public computeStockOnHand(productId: string, branchId?: string): number {
    let movements = Array.from(this.stockMovements.values()).filter(
      (m) => m.product_id === productId
    );
    if (branchId && branchId !== 'all') {
      movements = movements.filter((m) => m.branch_id === branchId);
    }
    return movements.reduce((sum, m) => sum + Number(m.quantity_change), 0);
  }

  public computeBatchStock(batchId: string): number {
    const movements = Array.from(this.stockMovements.values()).filter(
      (m) => m.batch_id === batchId
    );
    return movements.reduce((sum, m) => sum + Number(m.quantity_change), 0);
  }

  public async getStockOnHandView(branchId = 'br-dhk-01'): Promise<StockOnHandDto[]> {
    const products = Array.from(this.products.values());
    return products.map((p) => {
      const stock = this.computeStockOnHand(p.id, branchId);
      const isLow = stock <= p.reorder_level;
      return {
        product_id: p.id,
        sku: p.sku,
        product_name: p.name,
        product_name_bn: p.name_bn,
        category_id: p.category_id,
        category_name: p.category_name,
        unit: p.unit,
        cost_price: p.cost_price,
        sale_price: p.sale_price,
        reorder_level: p.reorder_level,
        allow_negative_stock: p.allow_negative_stock,
        track_batches: p.track_batches,
        track_expiry: p.track_expiry,
        branch_id: branchId,
        branch_name: 'Dhanmondi Branch',
        stock_on_hand: stock.toFixed(2),
        is_low_stock: isLow,
      };
    });
  }

  public async getLowStockView(branchId = 'br-dhk-01'): Promise<StockOnHandDto[]> {
    const all = await this.getStockOnHandView(branchId);
    return all.filter((s) => s.is_low_stock);
  }

  public async getExpiringBatchesView(branchId = 'br-dhk-01'): Promise<ExpiringBatchDto[]> {
    const batches = Array.from(this.productBatches.values()).filter(
      (b) => b.branch_id === branchId && b.is_active
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return batches.map((b) => {
      const expDate = new Date(b.expiry_date);
      expDate.setHours(0, 0, 0, 0);
      const diffMs = expDate.getTime() - today.getTime();
      const daysToExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const stock = this.computeBatchStock(b.id);

      let expiry_status: 'good' | 'warning' | 'critical' | 'expired' = 'good';
      if (daysToExpiry < 0) {
        expiry_status = 'expired';
      } else if (daysToExpiry <= 30) {
        expiry_status = 'critical';
      } else if (daysToExpiry <= 90) {
        expiry_status = 'warning';
      }

      return {
        batch_id: b.id,
        product_id: b.product_id,
        sku: b.sku || '',
        product_name: b.product_name || '',
        branch_id: b.branch_id,
        branch_name: b.branch_name,
        batch_no: b.batch_no,
        expiry_date: b.expiry_date,
        days_to_expiry: daysToExpiry,
        batch_stock_on_hand: stock.toFixed(2),
        expiry_status,
      };
    });
  }

  public async listMovements(filters?: {
    productId?: string;
    branchId?: string;
    movementType?: string;
  }): Promise<StockMovementDto[]> {
    let list = Array.from(this.stockMovements.values());
    if (filters?.productId && filters.productId !== 'all') {
      list = list.filter((m) => m.product_id === filters.productId);
    }
    if (filters?.branchId && filters.branchId !== 'all') {
      list = list.filter((m) => m.branch_id === filters.branchId);
    }
    if (filters?.movementType && filters.movementType !== 'all') {
      list = list.filter((m) => m.movement_type === filters.movementType);
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Reports: stock, movements, purchases, usage, low_stock, expiry, wastage with date filters and export.
   * Audited generation.
   */
  public async generateReport(
    query: InventoryReportQuery,
    actorUser: any
  ): Promise<InventoryReportResultDto> {
    const reportType = query.report_type;
    const branch = query.branch_id || 'br-dhk-01';

    let title = 'Inventory Report';
    let data: any[] = [];

    switch (reportType) {
      case 'stock':
        title = 'Stock on Hand Inventory Valuation Report';
        data = await this.getStockOnHandView(branch);
        break;
      case 'low_stock':
        title = 'Low Stock & Reorder Deficit Alert Report';
        data = await this.getLowStockView(branch);
        break;
      case 'expiry':
        title = 'Batch Expiry Boundary Report (< 30d critical, < 90d warning)';
        data = await this.getExpiringBatchesView(branch);
        break;
      case 'movements':
        title = 'Stock Movements Master Ledger Report';
        data = await this.listMovements({ branchId: branch, productId: query.product_id });
        break;
      case 'usage':
        title = 'Clinical Session Consumables Usage Report';
        data = Array.from(this.stockMovements.values()).filter(
          (m) => m.movement_type === 'session_usage'
        );
        break;
      case 'wastage':
        title = 'Stock Wastage & Damage Accounting Report';
        data = Array.from(this.stockMovements.values()).filter(
          (m) => m.movement_type === 'wastage'
        );
        break;
      case 'purchases':
        title = 'Purchase Orders & Receipt Valuation Report';
        data = await this.listPurchases({ branchId: branch });
        break;
      default:
        throw new BadRequestError(`Unknown report type '${reportType}'`);
    }

    const result: InventoryReportResultDto = {
      title,
      report_type: reportType,
      generated_at: new Date().toISOString(),
      generated_by: actorUser.fullName || actorUser.email || 'Staff',
      filters: query,
      total_records: data.length,
      data,
    };

    // Audited report generation (Rule 7)
    await logAudit(null, {
      actorUserId: actorUser.id,
      action: 'inventory.report.generated',
      entityType: 'inventory_report',
      entityId: reportType,
      branchId: branch,
      payloadAfter: {
        report_type: reportType,
        total_records: data.length,
        filters: query,
      },
      ipAddress: '127.0.0.1',
    });

    return result;
  }
}

export const inventoryService = new InventoryService();
