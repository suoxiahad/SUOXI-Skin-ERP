export interface ProductCategoryDto {
  id: string;
  category_code: string;
  name: string;
  name_bn?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProductCategoryRequest {
  category_code: string;
  name: string;
  name_bn?: string;
  description?: string;
  is_active?: boolean;
}

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  name_bn?: string;
  category_id: string;
  category_name?: string;
  unit: string;
  cost_price: string;
  sale_price: string;
  reorder_level: number;
  allow_negative_stock: boolean;
  track_batches: boolean;
  track_expiry: boolean;
  is_active: boolean;
  stock_on_hand?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProductRequest {
  sku: string;
  name: string;
  name_bn?: string;
  category_id: string;
  unit: string;
  cost_price: number | string;
  sale_price: number | string;
  reorder_level?: number;
  allow_negative_stock?: boolean;
  track_batches?: boolean;
  track_expiry?: boolean;
  is_active?: boolean;
}

export interface UpdateProductRequest {
  name?: string;
  name_bn?: string;
  category_id?: string;
  unit?: string;
  cost_price?: number | string;
  sale_price?: number | string;
  reorder_level?: number;
  allow_negative_stock?: boolean;
  track_batches?: boolean;
  track_expiry?: boolean;
  is_active?: boolean;
}

export interface SupplierDto {
  id: string;
  supplier_code: string;
  name: string;
  name_bn?: string;
  contact_person?: string;
  phone: string;
  email?: string;
  address?: string;
  payment_terms?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierRequest {
  name: string;
  name_bn?: string;
  contact_person?: string;
  phone: string;
  email?: string;
  address?: string;
  payment_terms?: string;
  is_active?: boolean;
}

export interface UpdateSupplierRequest {
  name?: string;
  name_bn?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_terms?: string;
  is_active?: boolean;
}

export type PurchaseStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseItemDto {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: string;
  unit_cost: string;
  total_cost: string;
  batch_no?: string;
  expiry_date?: string;
  received_quantity: string;
}

export interface PurchaseDto {
  id: string;
  purchase_no: string;
  supplier_id: string;
  supplier_name?: string;
  branch_id: string;
  branch_name?: string;
  purchase_date: string;
  supplier_invoice_no?: string;
  status: PurchaseStatus;
  total_cost: string;
  document_file_id?: string;
  document_url?: string;
  notes?: string;
  created_by: string;
  created_by_name?: string;
  received_at?: string;
  received_by?: string;
  received_by_name?: string;
  items: PurchaseItemDto[];
  created_at: string;
  updated_at: string;
}

export interface CreatePurchaseItemInput {
  product_id: string;
  quantity: number;
  unit_cost: number;
  batch_no?: string;
  expiry_date?: string;
}

export interface CreatePurchaseRequest {
  supplier_id: string;
  branch_id: string;
  purchase_date: string;
  supplier_invoice_no?: string;
  items: CreatePurchaseItemInput[];
  notes?: string;
  document_file_id?: string;
}

export interface ProductBatchDto {
  id: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  branch_id: string;
  branch_name?: string;
  batch_no: string;
  expiry_date: string;
  cost_price: string;
  initial_quantity: string;
  current_quantity?: string;
  days_to_expiry?: number;
  expiry_status?: 'good' | 'warning' | 'critical' | 'expired';
  is_active: boolean;
  created_at: string;
}

export type StockMovementType =
  | 'purchase_receipt'
  | 'session_usage'
  | 'adjustment'
  | 'wastage'
  | 'reversal'
  | 'transfer_in'
  | 'transfer_out';

export type StockReferenceType =
  | 'purchase'
  | 'session_consumable'
  | 'manual_adjustment'
  | 'prescription'
  | 'none';

export interface StockMovementDto {
  id: string;
  movement_code: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  batch_id?: string;
  batch_no?: string;
  branch_id: string;
  branch_name?: string;
  movement_type: StockMovementType;
  quantity_change: string;
  unit_cost?: string;
  reference_type: StockReferenceType;
  reference_id?: string;
  original_movement_id?: string;
  reason?: string;
  requested_by: string;
  requested_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  created_at: string;
}

export interface RecordMovementInput {
  product_id: string;
  batch_id?: string;
  branch_id: string;
  movement_type: StockMovementType;
  quantity_change: number;
  unit_cost?: number;
  reference_type?: StockReferenceType;
  reference_id?: string;
  original_movement_id?: string;
  reason?: string;
  approved_by?: string;
}

export interface StockOnHandDto {
  product_id: string;
  sku: string;
  product_name: string;
  product_name_bn?: string;
  category_id: string;
  category_name?: string;
  unit: string;
  cost_price: string;
  sale_price: string;
  reorder_level: number;
  allow_negative_stock: boolean;
  track_batches: boolean;
  track_expiry: boolean;
  branch_id?: string;
  branch_name?: string;
  stock_on_hand: string;
  last_movement_at?: string;
  is_low_stock: boolean;
}

export interface ExpiringBatchDto {
  batch_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  branch_id: string;
  branch_name?: string;
  batch_no: string;
  expiry_date: string;
  days_to_expiry: number;
  batch_stock_on_hand: string;
  expiry_status: 'good' | 'warning' | 'critical' | 'expired';
}

export type InventoryReportType =
  | 'stock'
  | 'movements'
  | 'purchases'
  | 'usage'
  | 'low_stock'
  | 'expiry'
  | 'wastage';

export interface InventoryReportQuery {
  report_type: InventoryReportType;
  from_date?: string;
  to_date?: string;
  branch_id?: string;
  category_id?: string;
  product_id?: string;
}

export interface InventoryReportResultDto {
  title: string;
  report_type: InventoryReportType;
  generated_at: string;
  generated_by: string;
  filters: Record<string, any>;
  total_records: number;
  data: any[];
}
