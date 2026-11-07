# ShopMate AI - Complete API Documentation

Base Endpoint: `/api`

## Authentication Endpoints
- `POST /api/auth/register` - Register a new store owner and business tenant or customer.
- `POST /api/auth/login` - Authenticate with email and password; returns user object and session token.
- `POST /api/auth/logout` - Invalidate current session token.
- `GET /api/auth/me` - Retrieve authenticated user profile and associated business details.
- `POST /api/auth/forgot-password` - Request a password recovery token.
- `POST /api/auth/reset-password` - Update password using recovery token.

## Product Catalogue & Inventory Endpoints
- `GET /api/products` - List products with filters: `search`, `category`, `colour`, `size`, `minPrice`, `maxPrice`, `sortBy`, `sortOrder`.
- `POST /api/products` - Create new product with variant-level stock.
- `GET /api/products/:id` - Retrieve full product detail including all variant sizes, colours, and stock.
- `PUT /api/products/:id` - Update product attributes.
- `DELETE /api/products/:id` - Soft-delete / archive product.
- `POST /api/products/bulk-csv` - Bulk import products from CSV array.
- `GET /api/products/export-csv` - Export full catalogue to CSV.

## Categories Endpoints
- `GET /api/categories` - List categories with active product counts.
- `POST /api/categories` - Create new product category.
- `DELETE /api/categories/:id` - Delete category (protected if active products exist).

## Inventory Ledger Endpoints
- `GET /api/inventory` - View variant stock matrix with low-stock alerts.
- `PUT /api/inventory/:id` - Adjust stock quantity (`adjustment_qty` or `new_stock_qty`) with ledger audit.
- `GET /api/inventory/movements` - View complete audit history of stock adjustments, sales, and cancellations.

## Order Management Endpoints
- `GET /api/orders` - List store orders with status and search filters.
- `POST /api/orders` - Transaction-safe order creation with inventory deduction and price snapshotting.
- `GET /api/orders/:id` - Retrieve order details and items.
- `PUT /api/orders/:id/status` - Advance order lifecycle: `Confirmed` -> `Processing` -> `Packed` -> `Shipped` -> `Delivered`.
- `POST /api/orders/:id/cancel` - Cancel order and restore stock into database ledger.

## AI Shopping Agent Endpoints
- `POST /api/ai/chat` - Process conversational shopping enquiry with Gemini 3.8 Flash or deterministic fallback.
- `POST /api/ai/search-products` - Structured database product search tool.
- `POST /api/ai/recommendations` - Recommend related products.
- `POST /api/ai/summarise` - Generate automated enquiry summary for store staff.

## Webhooks
- `GET /webhooks/whatsapp` - Meta WhatsApp Webhook verification challenge handler.
- `POST /webhooks/whatsapp` - Meta WhatsApp Webhook incoming message ingestion.
