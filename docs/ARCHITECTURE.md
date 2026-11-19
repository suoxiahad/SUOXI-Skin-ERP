# SUOXI CRM — System Architecture & Standards

## 1. Monorepo Workspaces & Tiers

```
+-------------------------------------------------------------+
|                          apps/web                           |
|       React 19 + TypeScript + Vite + Tailwind CSS v4        |
|    Desktop/Tablet Clinical UI & Mobile-First Patient Portal |
+-------------------------------------------------------------+
                              |
                              v /api/v1 (Typed Client)
+-------------------------------------------------------------+
|                          apps/api                           |
|           Node.js 24 LTS + Express + Zod Validation         |
|  - Health/Readiness Probes (/api/v1/health, /api/v1/ready)  |
|  - CSRF Protection (x-csrf-token)                           |
|  - Idempotency-Key Caching (Money, Stock, Package mutations)|
|  - Role-Based Access Control (RBAC) & Branch Scoping        |
+-------------------------------------------------------------+
          |                                       |
          v Parameterized SQL                     v Job Queues
+-----------------------+              +-----------------------+
|        MySQL 8        |              |      apps/worker      |
|    InnoDB, utf8mb4    |              |  Node.js 24 Worker    |
| (Host port 3308:3306) |              |  - SMS gateway poll   |
+-----------------------+              |  - Call tasks queue   |
                                       +-----------------------+
```

## 2. Shared Packages

- **`packages/shared-types`**:
  Canonical TypeScript contracts consumed across workspaces:
  - API Envelopes (`ApiResponse<T>`, `ApiError`)
  - Health Contracts (`HealthCheckResponse`, `ReadinessCheckResponse`)

## 3. Database & Migrations (Rule 11 Schema Gate)

- Database engine: MySQL 8 (InnoDB, `utf8mb4_unicode_ci`).
- Migrations directory: `db/migrations/`.
- **SCHEMA GATE ENFORCED**: Zero DDL generated until user confirms the formal MySQL schema.
