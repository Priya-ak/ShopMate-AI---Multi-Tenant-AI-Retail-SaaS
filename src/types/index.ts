export type UserRole = 'SUPER_ADMIN' | 'BUSINESS_OWNER' | 'EMPLOYEE' | 'CUSTOMER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  business_id: string | null;
  phone?: string;
  created_at?: string;
  is_demo?: boolean;
  auth_provider?: string;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  category: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  ai_greeting: string;
  is_active: number;
  assistant_name?: string;
  suggested_questions?: string[] | null;
  is_demo?: number | boolean;
}

export interface ProductCategory {
  id: string;
  business_id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  product_count?: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  business_id: string;
  sku: string;
  size: string;
  colour: string;
  price: number;
  discount_price?: number | null;
  stock_quantity: number;
}

export interface Product {
  id: string;
  business_id: string;
  category_id?: string | null;
  category_name?: string;
  name: string;
  sku: string;
  description?: string;
  brand?: string;
  regular_price: number;
  discount_price?: number | null;
  colour?: string;
  sizes: string[];
  images: string[];
  is_archived: number;
  min_stock_threshold: number;
  totalStock?: number;
  variants?: ProductVariant[];
  created_at: string;
  updated_at: string;
}

export interface InventoryItem extends ProductVariant {
  product_name: string;
  min_stock_threshold: number;
  product_images: string[];
  category_name?: string;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

export interface InventoryMovement {
  id: string;
  business_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  size: string;
  colour: string;
  variant_sku: string;
  change_qty: number;
  balance_after: number;
  movement_type: 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'CANCELLATION';
  reference_order_id?: string;
  notes?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  user_id?: string | null;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  created_at: string;
  total_orders?: number;
  total_spent?: number;
}

export type OrderStatus = 'Pending' | 'Confirmed' | 'Processing' | 'Packed' | 'Shipped' | 'Delivered' | 'Cancelled';
export type PaymentStatus = 'Pending' | 'Paid' | 'Refunded';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_details: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Order {
  id: string;
  business_id: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  business_name?: string;
  business_phone?: string;
  business_address?: string;
  order_number: string;
  order_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  delivery_address: string;
  payment_method: string;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  notes?: string;
  items?: OrderItem[];
  itemCount?: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  business_id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  status: 'New' | 'Open' | 'Waiting' | 'Resolved' | 'Closed';
  channel: string;
  assigned_employee_id?: string;
  ai_summary?: string;
  message_count?: number;
  last_message?: string;
  last_message_time?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'CUSTOMER' | 'AI' | 'EMPLOYEE' | 'SYSTEM';
  sender_name: string;
  content: string;
  metadata?: string;
  created_at: string;
}

export interface Integration {
  id: string;
  business_id: string;
  provider: string;
  status: 'Connected' | 'Disconnected' | 'Pending';
  phone_number?: string;
  webhook_url?: string;
  settings_json?: string;
}

export interface CartItem {
  productId: string;
  variantId: string;
  productName: string;
  variantDetails: string;
  unitPrice: number;
  quantity: number;
  image: string;
  maxStock: number;
}
