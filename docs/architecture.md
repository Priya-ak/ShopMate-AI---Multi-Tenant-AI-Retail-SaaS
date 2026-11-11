# ShopMate AI - System Architecture

## 1. High-Level Architecture Overview

ShopMate AI is a multi-tenant retail SaaS platform engineered for apparel, saree, jewellery, footwear, and consumer retail businesses. It bridges real store inventory with an autonomous AI shopping agent that assists shoppers and creates verified orders.

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|  - Commercial Landing Page     - Business Owner Dashboard    - Customer Shopping   |
|  - Staff / Employee Portal     - Super Admin Platform View   - WhatsApp Simulator |
+-----------------------------------------------------------------------------------+
                                         |
                                (REST API / Bearer)
                                         v
+-----------------------------------------------------------------------------------+
|                                  BACKEND LAYER                                    |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | Multi-Tenant Auth  |   | AI Shopping Agent     |   | Order & Ledger Engine  |  |
|  | - JWT Session Auth |   | - Gemini 3.8 Flash    |   | - Atomic Transactions  |  |
|  | - RBAC Guard       |   | - Function Calling    |   | - Price Snapshots      |  |
|  | - Tenant Isolation |   | - Deterministic Engine|   | - Stock Ledger Audit   |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
+-----------------------------------------------------------------------------------+
                                         |
                               (Relational Transactions)
                                         v
+-----------------------------------------------------------------------------------+
|                                  DATABASE LAYER                                   |
|  - Businesses (Tenants)   - Product Categories   - Products & Variants            |
|  - Inventory Ledger       - Customers & Profiles - Orders & Items Snapshots       |
|  - Conversations & CRM    - Meta Webhooks & Logs - Password Reset Tokens          |
|                                                                                   |
|  Engine: SQLite / PostgreSQL Compatible Schema with Foreign Keys & ACID locks     |
+-----------------------------------------------------------------------------------+
```

## 2. Multi-Tenant Data Isolation Strategy

Data isolation is strictly enforced at the database and query layer using `business_id` scoping:
- Every table (`products`, `product_variants`, `inventory_movements`, `orders`, `customers`, `conversations`) contains a mandatory foreign key referencing `businesses(id)`.
- Backend endpoints automatically resolve `business_id` from the authenticated user token or the tenant header `x-business-id`.
- The AI agent's database tools (`search_products`, `check_inventory`, `create_order`, `get_order_status`) strictly inject `business_id = ?` into all SQL queries.
- Tenant #1 ("KalaKriti Ethnic") can never read or manipulate Tenant #2 ("UrbanVogue") data.

## 3. Autonomous AI Shopping Agent Architecture

The AI shopping assistant operates on a backend-controlled tool execution pipeline:
1. **User Message Ingestion**: Customer message arrives via `/api/ai/chat` or the signed WhatsApp webhook `/api/webhooks/whatsapp`.
2. **Intent Recognition**:
   - Primary: Gemini 3.8 Flash with structured function declarations.
   - Fallback: Deterministic Retail Intent Classifier if Gemini API key is missing or quota is exceeded.
3. **Tool Execution**: Tools (`search_products`, `check_inventory`, `get_order_status`, `search_categories`) query the SQLite database.
4. **Safety & Zero-Hallucination**:
   - Stock counts and prices are retrieved directly from database records.
   - Prices sent from the frontend are ignored during checkout; prices are snapshotted on the server.
5. **Multi-Turn Context**: History of previous filters (e.g., "red", "below 1500", "size M") are aggregated across turns.
