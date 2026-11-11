import { Product, ProductCategory, Order, Customer, Conversation, Message, InventoryItem, InventoryMovement, User, Business, Integration } from '../types';

const API_BASE = '/api';

export interface WhatsAppStatus {
  platform: { manualAvailable: boolean; connectAvailable: boolean; webhookReady: boolean; appId: string | null; configId: string | null; graphVersion: string };
  connected: boolean;
  account: null | { display_phone: string | null; verified_name: string | null; mode: string; status: string; auto_reply: boolean; history_status: string | null; last_webhook_at: string | null; connected_at: string };
}

/** Parses a JSON API response and throws the server's user-safe message on failure. */
async function jsonOrThrow(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || fallback);
  return body;
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('shopmate_token');
  const bizId = localStorage.getItem('shopmate_current_biz_id');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (bizId) {
    headers['x-business-id'] = bizId;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function safeJson<T = any>(res: Response, fallbackError = 'Request failed'): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const err = await res.json().catch(() => ({ error: fallbackError }));
      throw new Error(err.error || fallbackError);
    }
    const text = await res.text().catch(() => '');
    throw new Error(text || `Server error (${res.status})`);
  }
  if (!contentType.includes('application/json')) {
    return {} as T;
  }
  return res.json().catch(() => ({} as T));
}

export const api = {
  // Auth
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(err.error || 'Login failed');
    }
    return res.json();
  },

  async loginDemoPersona(persona: 'OWNER' | 'EMPLOYEE' | 'CUSTOMER') {
    const res = await fetch(`${API_BASE}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to login demo persona' }));
      throw new Error(err.error || 'Failed to login demo persona');
    }
    return res.json();
  },

  async register(data: { name: string; email: string; password: string; businessName?: string; businessCategory?: string; phone?: string }) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(err.error || 'Registration failed');
    }
    return res.json();
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Session expired');
    return res.json();
  },

  async forgotPassword(email: string) {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return res.json();
  },

  async getAuthConfig(): Promise<{ googleClientId: string | null }> {
    try {
      const res = await fetch(`${API_BASE}/auth/config`);
      if (!res.ok) return { googleClientId: null };
      const data = await res.json();
      return { googleClientId: data.googleClientId || null };
    } catch {
      return { googleClientId: null };
    }
  },

  /** Sign in / register with a Google ID token (verified server-side). */
  async googleAuth(body: {
    credential: string;
    mode: 'login' | 'register';
    name?: string;
    phone?: string;
    businessName?: string;
    businessCategory?: string;
  }) {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Google sign-in failed' }));
      const e: any = new Error(err.error || 'Google sign-in failed');
      e.code = err.code;
      throw e;
    }
    return res.json();
  },

  /** Public "ShopMate AI" help assistant (no store, no login). */
  async askAppAssistant(message: string, history: Array<{ role: string; content: string }>) {
    const res = await fetch(`${API_BASE}/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    return safeJson<{ reply: string; engine: string }>(res, 'The assistant is unavailable right now');
  },

  // Business
  async getBusinessMe(): Promise<Business> {
    const res = await fetch(`${API_BASE}/businesses/me`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load business');
    return res.json();
  },

  async updateBusiness(data: Partial<Business>) {
    const res = await fetch(`${API_BASE}/businesses/me`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return safeJson(res, 'Failed to update store settings');
  },

  async getSuperAdminBusinesses() {
    const res = await fetch(`${API_BASE}/businesses`, { headers: getAuthHeaders() });
    return res.json();
  },

  // Products
  async getProducts(params?: Record<string, any>): Promise<{ products: Product[]; pagination: any }> {
    const url = new URL(`${window.location.origin}${API_BASE}/products`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, String(v));
        }
      });
    }
    const res = await fetch(url.toString(), { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load products');
    return res.json();
  },

  async getProduct(id: string): Promise<Product> {
    const res = await fetch(`${API_BASE}/products/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Product not found');
    return res.json();
  },

  async createProduct(data: any) {
    const res = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create product' }));
      throw new Error(err.error || 'Failed to create product');
    }
    return res.json();
  },

  async updateProduct(id: string, data: any) {
    const res = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update product');
    return res.json();
  },

  async deleteProduct(id: string) {
    return jsonOrThrow(await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE', headers: getAuthHeaders() }), 'Failed to delete product');
  },

  async bulkImportCsv(items: any[]) {
    const res = await fetch(`${API_BASE}/products/bulk-csv`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items }),
    });
    return res.json();
  },

  async exportProductsCsv() {
    const res = await fetch(`${API_BASE}/products/export-csv`, { headers: getAuthHeaders() });
    return res.json();
  },

  // Categories
  async getCategories(): Promise<ProductCategory[]> {
    const res = await fetch(`${API_BASE}/categories`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load categories');
    return res.json();
  },

  async createCategory(data: { name: string; description?: string; image_url?: string }) {
    const res = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create category' }));
      throw new Error(err.error);
    }
    return res.json();
  },

  async deleteCategory(id: string) {
    const res = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete' }));
      throw new Error(err.error);
    }
    return res.json();
  },

  // Inventory
  async getInventory(): Promise<InventoryItem[]> {
    const res = await fetch(`${API_BASE}/inventory`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load inventory');
    return res.json();
  },

  async updateInventory(variantId: string, data: { adjustment_qty?: number; new_stock_qty?: number; notes?: string }) {
    const res = await fetch(`${API_BASE}/inventory/${variantId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Stock adjustment failed' }));
      throw new Error(err.error);
    }
    return res.json();
  },

  async getInventoryMovements(): Promise<InventoryMovement[]> {
    const res = await fetch(`${API_BASE}/inventory/movements`, { headers: getAuthHeaders() });
    return res.json();
  },

  // Orders
  async getOrders(params?: { status?: string; search?: string }): Promise<Order[]> {
    const url = new URL(`${window.location.origin}${API_BASE}/orders`);
    if (params?.status) url.searchParams.set('status', params.status);
    if (params?.search) url.searchParams.set('search', params.search);

    const res = await fetch(url.toString(), { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load orders');
    return res.json();
  },

  async getOrder(id: string): Promise<Order> {
    const res = await fetch(`${API_BASE}/orders/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Order not found');
    return res.json();
  },

  async createOrder(data: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    deliveryAddress: string;
    paymentMethod?: string;
    items: Array<{ productId: string; variantId: string; quantity: number }>;
    notes?: string;
  }) {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Order creation failed' }));
      throw new Error(err.error || 'Failed to create order');
    }
    return res.json();
  },

  async updateOrderStatus(id: string, status: string, payment_status?: string) {
    const res = await fetch(`${API_BASE}/orders/${id}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status, payment_status }),
    });
    return res.json();
  },

  async cancelOrder(id: string) {
    const res = await fetch(`${API_BASE}/orders/${id}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Cancellation failed' }));
      throw new Error(err.error);
    }
    return res.json();
  },

  // Customers
  async getCustomers(): Promise<Customer[]> {
    const res = await fetch(`${API_BASE}/customers`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load customers');
    return res.json();
  },

  async getCustomer(id: string): Promise<{ customer: Customer; orders: Order[] }> {
    const res = await fetch(`${API_BASE}/customers/${id}`, { headers: getAuthHeaders() });
    return res.json();
  },

  async createCustomer(data: { name: string; phone: string; email?: string; address?: string; city?: string }) {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create customer' }));
      throw new Error(err.error || 'Failed to create customer');
    }
    return res.json();
  },

  // AI Shopping Agent
  async sendAiMessage(params: {
    message: string;
    conversationId?: string;
    history?: Array<{ role: string; content: string }>;
    customerName?: string;
    customerPhone?: string;
  }) {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return safeJson(res, 'Failed to process AI chat');
  },

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    const res = await fetch(`${API_BASE}/conversations`, { headers: getAuthHeaders() });
    return res.json();
  },

  async getConversationMessages(id: string): Promise<Message[]> {
    const res = await fetch(`${API_BASE}/conversations/${id}/messages`, { headers: getAuthHeaders() });
    return res.json();
  },

  async summariseConversation(conversationId: string) {
    const res = await fetch(`${API_BASE}/ai/summarise`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ conversationId }),
    });
    return res.json();
  },

  // Employees
  async getEmployees(): Promise<User[]> {
    const res = await fetch(`${API_BASE}/employees`, { headers: getAuthHeaders() });
    return res.json();
  },

  async createEmployee(data: { name: string; email: string; password: string; phone?: string }) {
    const res = await fetch(`${API_BASE}/employees`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create employee' }));
      throw new Error(err.error);
    }
    return res.json();
  },

  // Analytics
  async getAnalyticsOverview() {
    const res = await fetch(`${API_BASE}/analytics/overview`, { headers: getAuthHeaders() });
    return res.json();
  },

  async getSalesAnalytics() {
    const res = await fetch(`${API_BASE}/analytics/sales`, { headers: getAuthHeaders() });
    return res.json();
  },

  // Integrations
  async getIntegrations(): Promise<Integration[]> {
    const res = await fetch(`${API_BASE}/integrations`, { headers: getAuthHeaders() });
    return res.json();
  },

  async updateIntegration(id: string, data: any) {
    const res = await fetch(`${API_BASE}/integrations/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // WhatsApp (coexistence) -------------------------------------------------
  async getWhatsAppStatus(): Promise<WhatsAppStatus> {
    return jsonOrThrow(await fetch(`${API_BASE}/whatsapp/status`, { headers: getAuthHeaders() }), 'Failed to load WhatsApp status');
  },

  async connectWhatsApp(data: { code: string; phone_number_id: string; waba_id: string }) {
    return jsonOrThrow(await fetch(`${API_BASE}/whatsapp/connect`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) }), 'Failed to connect WhatsApp');
  },

  async connectWhatsAppManual(data: { phone_number_id: string; waba_id: string; access_token: string }) {
    return jsonOrThrow(await fetch(`${API_BASE}/whatsapp/connect-manual`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) }), 'Failed to connect WhatsApp');
  },

  async disconnectWhatsApp() {
    return jsonOrThrow(await fetch(`${API_BASE}/whatsapp/connection`, { method: 'DELETE', headers: getAuthHeaders() }), 'Failed to disconnect WhatsApp');
  },

  async setWhatsAppAutoReply(auto_reply: boolean) {
    return jsonOrThrow(await fetch(`${API_BASE}/whatsapp/settings`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ auto_reply }) }), 'Failed to update the setting');
  },

  async replyOnWhatsApp(conversationId: string, text: string) {
    return jsonOrThrow(await fetch(`${API_BASE}/whatsapp/conversations/${conversationId}/reply`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ text }) }), 'Failed to send the message');
  },

  async simulateWhatsAppWebhook(message: string, phone: string = '') {
    return jsonOrThrow(await fetch(`${API_BASE}/whatsapp/simulate`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ message, phone: phone || undefined }) }), 'Simulator failed');
  },

  // Deletes ----------------------------------------------------------------
  async deleteCustomer(id: string) {
    return jsonOrThrow(await fetch(`${API_BASE}/customers/${id}`, { method: 'DELETE', headers: getAuthHeaders() }), 'Failed to delete customer');
  },

  async deleteEmployee(id: string) {
    return jsonOrThrow(await fetch(`${API_BASE}/employees/${id}`, { method: 'DELETE', headers: getAuthHeaders() }), 'Failed to remove team member');
  },

  async deleteConversation(id: string) {
    return jsonOrThrow(await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE', headers: getAuthHeaders() }), 'Failed to delete conversation');
  },
};
