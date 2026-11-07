# ShopMate AI – Full-Stack AI-Powered Retail Commerce SaaS

ShopMate AI is a production-oriented, multi-tenant retail commerce and management SaaS. It turns hundreds of unstructured customer messages about products, colours, sizes, prices, and stock into instant, verified orders backed by an autonomous AI agent connected directly to a real relational inventory ledger.

---

## 🌟 Key Features

1. **Autonomous AI Shopping Assistant**:
   - Backend-controlled tool execution: `search_products`, `check_inventory`, `create_order`, `get_order_status`, `search_categories`.
   - Dual-Engine Intelligence: Primary model is **Gemini 3.8 Flash** via `@google/genai` SDK; automatic fallback to our deterministic retail engine when API keys are unconfigured or rate-limited.
   - Multi-turn conversation memory (combining filters across messages: e.g. "kurtis" &rarr; "below 1500" &rarr; "in red" &rarr; "size M").
2. **Variant-Aware Inventory & Audit Movement Ledger**:
   - Size and colour matrices with independent stock levels.
   - Atomic database transactions prevent overselling.
   - Reversible cancellations restore inventory safely and record `CANCELLATION` audit entries.
3. **Multi-Tenant SaaS Data Isolation**:
   - Complete data separation across tenants (`businesses`). One store can never access another store's catalogue, orders, or customers.
4. **Complete Order & Receipt Lifecycle**:
   - Status pipeline: `Pending` &rarr; `Confirmed` &rarr; `Processing` &rarr; `Packed` &rarr; `Shipped` &rarr; `Delivered`.
   - Printable Tax Invoice and order receipt generator with itemized price snapshots.
5. **Business Owner & Staff Portals**:
   - Real calculated financial KPIs, daily sales trends, best-selling products, category shares.
   - Employee dashboard for order processing and floor stock lookup.
   - Conversation management CRM with automated AI summary generation.
6. **Meta WhatsApp Webhook Simulator**:
   - Live endpoint `/webhooks/whatsapp` supporting GET verification challenge and POST payload simulations.

---

## 🔑 Demo Accounts (One-Click In Navigation Bar)

| Role | Email | Password | Business | Capabilities |
|---|---|---|---|---|
| **Store Owner** | `owner@shopmate.com` | `admin123` | KalaKriti Ethnic | Full financial & catalogue management |
| **Employee** | `priya@shopmate.com` | `employee123` | KalaKriti Ethnic | Order processing & stock lookups |
| **Customer** | `ananya@example.com` | `customer123` | KalaKriti Ethnic | AI shopping assistant & order tracking |
| **Super Admin** | `superadmin@shopmate.com` | `super123` | Platform Level | Multi-tenant tenant inspection & health |
| **Tenant #2 Owner** | `owner2@urbanvogue.com` | `urban123` | UrbanVogue | Independent tenant for isolation testing |

---

## 🚀 Quick Start (Local Execution)

### Running with Node.js & TypeScript
```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite
npx tsx server/test_suite.ts

# 3. Start full-stack application (Port 3000)
npm run dev
```

### Running with Docker Compose
```bash
cd deployment
docker-compose up --build
```

### Running Python FastAPI Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🧪 Automated Testing

Run the automated integration test suite:
```bash
npx tsx server/test_suite.ts
```
Results: **13/13 Passed** covering database seeding, multi-tenant isolation, inventory deductions, cancellations, and AI intent recognition.

---

## 🛡️ Security & Zero-Hallucination Guardrails
- **Zero Fake Inventory**: AI only displays items retrieved by database query tools.
- **Server Price Calculation**: Frontend prices are ignored during checkout; prices are snapshotted on the server.
- **Foreign Key Scoping**: Every query enforces `business_id = ?`.
