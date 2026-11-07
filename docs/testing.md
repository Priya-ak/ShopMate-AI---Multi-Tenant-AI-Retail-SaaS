# ShopMate AI - Verification & Testing Guide

## Automated Integration Test Suite

A complete automated integration test suite is located at `server/test_suite.ts`.
It executes real database transactions, tests SKU constraints, verifies multi-tenant isolation boundaries, and tests the AI agent's tool execution.

### To Run The Integration Test Suite:
```bash
npx tsx server/test_suite.ts
```

### Verified Scenarios:
1. **Database Seed Verification**: Confirms >= 30 products are present in the catalogue.
2. **Multi-Tenant Data Isolation**: Confirms Tenant #2 cannot query or access Tenant #1 products or orders.
3. **Natural Language Search Tool**: Tests search query "red kurtis below ₹1,500" and verifies price boundaries.
4. **Variant-Aware Inventory**: Tests size/colour specific quantities against database records.
5. **Atomic Order Creation**: Validates transaction locking and verifies immediate stock deduction.
6. **Inventory Movement Ledger**: Verifies that a `SALE` entry is recorded with negative change quantity.
7. **Order Status Tracking**: Validates lookup by generated order number.
8. **Cancellation & Stock Restoration**: Verifies that cancelling an order restores stock to original balance with a `CANCELLATION` audit entry.
9. **Deterministic Fallback Engine**: Tests intent recognition when Gemini API key is absent.
10. **Multi-turn Memory**: Tests contextual filtering across multiple messages.
