import { api } from './client.js';
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
  CreatePurchaseRequest,
  StockOnHandDto,
  ExpiringBatchDto,
  StockMovementDto,
  RecordMovementInput,
  InventoryReportQuery,
  InventoryReportResultDto,
} from '@suoxi/shared-types';

export const inventoryApi = {
  // Categories
  getCategories: () => api.get<ProductCategoryDto[]>('/inventory/categories'),
  createCategory: (data: CreateProductCategoryRequest) =>
    api.post<ProductCategoryDto>('/inventory/categories', data),

  // Products
  getProducts: (params?: { categoryId?: string; search?: string; activeOnly?: boolean; branchId?: string }) => {
    const q = new URLSearchParams();
    if (params?.categoryId) q.set('categoryId', params.categoryId);
    if (params?.search) q.set('search', params.search);
    if (params?.activeOnly !== undefined) q.set('activeOnly', String(params.activeOnly));
    if (params?.branchId) q.set('branchId', params.branchId);
    const qs = q.toString();
    return api.get<ProductDto[]>(qs ? `/inventory/products?${qs}` : '/inventory/products');
  },
  getProduct: (id: string, branchId?: string) =>
    api.get<ProductDto>(branchId ? `/inventory/products/${id}?branchId=${branchId}` : `/inventory/products/${id}`),
  createProduct: (data: CreateProductRequest) =>
    api.post<ProductDto>('/inventory/products', data),
  updateProduct: (id: string, data: UpdateProductRequest) =>
    api.patch<ProductDto>(`/inventory/products/${id}`, data),

  // Suppliers
  getSuppliers: () => api.get<SupplierDto[]>('/inventory/suppliers'),
  getSupplier: (id: string) => api.get<SupplierDto>(`/inventory/suppliers/${id}`),
  createSupplier: (data: CreateSupplierRequest) =>
    api.post<SupplierDto>('/inventory/suppliers', data),
  updateSupplier: (id: string, data: UpdateSupplierRequest) =>
    api.patch<SupplierDto>(`/inventory/suppliers/${id}`, data),

  // Purchases
  getPurchases: (params?: { branchId?: string; supplierId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.supplierId) q.set('supplierId', params.supplierId);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return api.get<PurchaseDto[]>(qs ? `/inventory/purchases?${qs}` : '/inventory/purchases');
  },
  getPurchase: (id: string) => api.get<PurchaseDto>(`/inventory/purchases/${id}`),
  createPurchase: (data: CreatePurchaseRequest) =>
    api.post<PurchaseDto>('/inventory/purchases', data),
  markPurchaseReceived: (id: string) =>
    api.post<PurchaseDto>(`/inventory/purchases/${id}/receive`, {}),

  // Stock Views
  getStockOnHand: (branchId?: string) =>
    api.get<StockOnHandDto[]>(branchId ? `/inventory/stock?branchId=${branchId}` : '/inventory/stock'),
  getLowStock: (branchId?: string) =>
    api.get<StockOnHandDto[]>(branchId ? `/inventory/stock/low?branchId=${branchId}` : '/inventory/stock/low'),
  getExpiringBatches: (branchId?: string) =>
    api.get<ExpiringBatchDto[]>(branchId ? `/inventory/stock/expiring?branchId=${branchId}` : '/inventory/stock/expiring'),

  // Stock Movements Ledger
  getMovements: (params?: { productId?: string; branchId?: string; movementType?: string }) => {
    const q = new URLSearchParams();
    if (params?.productId) q.set('productId', params.productId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.movementType) q.set('movementType', params.movementType);
    const qs = q.toString();
    return api.get<StockMovementDto[]>(qs ? `/inventory/movements?${qs}` : '/inventory/movements');
  },
  recordMovement: (data: RecordMovementInput) =>
    api.post<StockMovementDto>('/inventory/movements', data),
  reverseMovement: (id: string, reason: string, approved_by: string) =>
    api.post<StockMovementDto>(`/inventory/movements/${id}/reverse`, { reason, approved_by }),

  // Reports
  getReport: (query: InventoryReportQuery) => {
    const q = new URLSearchParams();
    q.set('report_type', query.report_type);
    if (query.from_date) q.set('from_date', query.from_date);
    if (query.to_date) q.set('to_date', query.to_date);
    if (query.branch_id) q.set('branch_id', query.branch_id);
    if (query.category_id) q.set('category_id', query.category_id);
    if (query.product_id) q.set('product_id', query.product_id);
    return api.get<InventoryReportResultDto>(`/inventory/reports?${q.toString()}`);
  },
};
