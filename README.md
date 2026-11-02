# SupportDesk Agent Backend

Autonomous customer support ticket triage service built with Node.js, Express, TypeScript, PostgreSQL, Prisma ORM, and Google Gemini Function Calling using the official @google/genai SDK.

---

## Table of Contents

- [1. Architecture and Design](#1-architecture-and-design)
- [2. Technology Stack](#2-technology-stack)
- [3. Project Structure](#3-project-structure)
- [4. Database Design and Seed Data](#4-database-design-and-seed-data)
- [5. Gemini Function Calling and Autonomous Triage](#5-gemini-function-calling-and-autonomous-triage)
- [6. Observability and Real-Time Execution Tracing](#6-observability-and-real-time-execution-tracing)
- [7. API Documentation and Endpoints](#7-api-documentation-and-endpoints)
- [8. Quickstart and Local Setup](#8-quickstart-and-local-setup)
- [9. Example API Requests and Responses](#9-example-api-requests-and-responses)
- [10. Testing Suite](#10-testing-suite)

---

## 1. Architecture and Design

SupportDesk Agent implements a clean architecture with layer separation:

```
[ Client / Postman / Frontend ]
               │
               ▼
   [ REST API (Express + Zod) ]
               │
               ▼
      [ Ticket Service ]  ◄─── (Concurrency Guard & State Machine)
               │
               ▼
       [ Triage Agent ]
        │            │
        │ Multi-Turn │ Tool Execution
        ▼            ▼
[ Google Gemini ]  [ Tool Registry ]
(LLM Decision)     ├─ get_order_status
                   └─ get_user_tier
        │                   │
        └─────────┬─────────┘
                  │ Real-Time Tracing
                  ▼
         [ Execution Trace ] ──► [ PostgreSQL (Prisma ORM) ]
```

### Core Architecture Highlights

1. Autonomous LLM Decisions: The Gemini model dynamically decides whether external tools are needed based on ticket context. Ticket IDs and decisions are never hardcoded.
2. Provider Multi-Turn Function Calling: Supports multi-turn tool loops with up to 3 execution rounds to prevent runaway iterations, allowing the model to gather information and synthesize the final answer.
3. Context Security and Anti-Spoofing: Validates arguments against trusted ticket and customer metadata in PostgreSQL before running any tool to prevent hallucination or cross-tenant privilege escalation.
4. Real-Time Step-by-Step Tracing: Trace events (AGENT_DECISION, TOOL_CALL, TOOL_RESULT, AGENT_RESPONSE, ERROR) are persisted sequentially into PostgreSQL as they occur.
5. State Machine and Concurrency Control: Prevents duplicate concurrent triage on tickets using database transactions and strict status transitions (PENDING -> PROCESSING -> RESOLVED / FAILED).
6. Strict Type Safety: TypeScript strict mode enabled throughout, runtime request validation with Zod, and structured agent response schemas.

---

## 2. Technology Stack

- Runtime & Language: Node.js (v20+ / v22+ / v24+) & TypeScript 5 (Strict Mode, ESM)
- Framework: Express.js
- Database: PostgreSQL 16
- ORM: Prisma ORM v6
- AI / LLM SDK: Official Google Gen AI SDK (@google/genai)
- Runtime Validation: Zod
- Structured Logging: Pino & Pino-Pretty
- API Documentation: OpenAPI 3.0 & Swagger UI
- Testing: Vitest (6 test suites, 54 tests)
- Containerization: Docker & Docker Compose

---

## 3. Project Structure

```
backend/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   └── logger.ts
│   │
│   ├── common/
│   │   ├── errors/
│   │   ├── middleware/
│   │   └── types/
│   │
│   ├── docs/
│   │   ├── swagger.doc.ts
│   │   └── swagger.json
│   │
│   ├── modules/
│   │   ├── tickets/
│   │   ├── customers/
│   │   ├── agent/
│   │   │   ├── triage-agent.ts
│   │   │   ├── gemini.provider.ts
│   │   │   ├── tool-executor.ts
│   │   │   ├── tool-definitions.ts
│   │   │   ├── trace.service.ts
│   │   │   ├── agent.schema.ts
│   │   │   ├── agent.service.ts
│   │   │   ├── agent.controller.ts
│   │   │   └── agent.routes.ts
│   │   └── system/
│   │       ├── system.service.ts
│   │       ├── system.controller.ts
│   │       └── system.routes.ts
│   │
│   ├── routes/
│   │   └── index.ts
│   │
│   └── tools/
│       ├── get-order-status.tool.ts
│       ├── get-user-tier.tool.ts
│       └── tool-registry.ts
│
└── tests/
    ├── tools.test.ts
    ├── agent.test.ts
    ├── ticket.service.test.ts
    ├── agent.service.test.ts
    ├── system.test.ts
    └── api.test.ts
```

---

## 4. Database Design and Seed Data

### Relational Schema

- Customer (customers table):
  - id (UUID, Primary Key)
  - externalId (Unique String, e.g., USR-101)
  - name (Optional String)
  - currentTier (String, default: "Free")
  - createdAt, updatedAt (DateTime)

- Ticket (tickets table):
  - id (UUID, Primary Key)
  - ticketNumber (Unique String, e.g., TCK-001)
  - customerId (UUID, Foreign Key -> Customer, Cascade Delete)
  - orderId (Nullable String, e.g., ORD-9012)
  - message (Text)
  - status (Enum: PENDING, PROCESSING, RESOLVED, FAILED)
  - createdAt, updatedAt (DateTime)
  - Indexes: ticketNumber, customerId, status

- AgentExecution (agent_executions table):
  - id (UUID, Primary Key)
  - ticketId (UUID, Foreign Key -> Ticket, Cascade Delete)
  - status (Enum: RUNNING, COMPLETED, FAILED)
  - resolutionTag (Nullable Enum: AUTO_RESOLVE, ESCALATE_TO_SALES)
  - customerResponse (Nullable Text)
  - summary (Nullable Text)
  - errorMessage (Nullable Text)
  - startedAt, completedAt, createdAt (DateTime)

- ExecutionTrace (execution_traces table):
  - id (UUID, Primary Key)
  - executionId (UUID, Foreign Key -> AgentExecution, Cascade Delete)
  - step (Integer, sequential: 1, 2, 3...)
  - eventType (Enum: AGENT_DECISION, TOOL_CALL, TOOL_RESULT, AGENT_RESPONSE, ERROR)
  - toolName (Nullable String)
  - message (Text)
  - parameters (Nullable JSON)
  - output (Nullable JSON)
  - durationMs (Nullable Integer)
  - createdAt (DateTime)
  - Indexes: executionId, [executionId, step]

### Idempotent Seed Records

Running npm run prisma:seed creates or updates without duplicates:

| Ticket Number | Customer ID | Tier | Order ID | Ticket Message | Expected Behavior |
|---|---|---|---|---|---|
| TCK-001 | USR-101 | Free | ORD-9012 | "Where is my package #ORD-9012? It was supposed to arrive yesterday." | Calls get_order_status, returns shipping info -> AUTO_RESOLVE |
| TCK-002 | USR-204 | Free | null | "Can you upgrade my account to Enterprise tier?" | Calls get_user_tier, returns upgrade instructions -> ESCALATE_TO_SALES |
| TCK-003 | USR-309 | Free | null | "How do I update my profile picture?" | Calls no tools, provides instructions -> AUTO_RESOLVE |

---

## 5. Gemini Function Calling and Autonomous Triage

The agent communicates with Gemini using the official @google/genai SDK:

```typescript
import { GoogleGenAI, Type } from '@google/genai';
```

### Registered Tools

1. get_order_status:
   - Input: { "order_id": "ORD-9012" }
   - Output: { "order_id": "ORD-9012", "status": "In Transit", "est_delivery": "Tomorrow" }
2. get_user_tier:
   - Input: { "user_id": "USR-204" }
   - Output: { "user_id": "USR-204", "current_tier": "Free", "eligible_for_upgrade": true }

### Structured Agent Output Schema

Validated at runtime using Zod (agentResponseSchema):

```json
{
  "customerResponse": "string",
  "resolutionTag": "AUTO_RESOLVE | ESCALATE_TO_SALES",
  "summary": "string"
}
```

---

## 6. Observability and Real-Time Execution Tracing

Traces are written to PostgreSQL as events happen:

1. AGENT_DECISION: Logs ticket intake, whether external data is needed, and reasoning summary.
2. TOOL_CALL: Logs exact tool name, arguments, and invocation timestamp.
3. TOOL_RESULT: Logs mock response payload, duration in milliseconds, and status.
4. AGENT_RESPONSE: Logs final synthesized customer response, resolution tag, and internal summary.
5. ERROR: Logs any model, validation, or tool errors.

---

## 7. API Documentation and Endpoints

Swagger UI is available interactively at http://localhost:5000/api/docs.

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/health | Health check and database connection probe |
| GET | /api/tickets | List tickets (supports ?status= and ?search=) |
| GET | /api/tickets/:ticketNumber | Get ticket details and customer metadata |
| POST | /api/tickets/:ticketNumber/triage | Start autonomous triage execution |
| GET | /api/tickets/:ticketNumber/executions | View execution history for a ticket |
| GET | /api/executions | List all agent triage executions across the system |
| GET | /api/executions/:executionId | View full execution details with traces |
| GET | /api/system/info | System metadata, active model, uptime, entity counts |
| POST | /api/system/reset-pending | Reset all tickets to pending and clear test runs |
| POST | /api/system/reseed | Reseed and restore the customer sample dataset |
| POST | /api/system/clear | Clear all triage execution records |

---

## 8. Quickstart and Local Setup

### Prerequisites

- Node.js 20+ (v22 or v24 recommended)
- Docker & Docker Compose
- Google Gemini API key

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

### Step 2: Configure Environment Variables

```bash
cp .env.example .env
```

Edit .env and set your GEMINI_API_KEY:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supportdesk?schema=public"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
```

### Step 3: Start PostgreSQL with Docker

```bash
docker compose up -d
```

### Step 4: Run Prisma Migrations and Seed Database

```bash
npm run prisma:migrate
npm run prisma:seed
```

### Step 5: Start Development Server

```bash
npm run dev
```

The server will start at http://localhost:5000.
- Swagger UI: http://localhost:5000/api/docs
- Health check: http://localhost:5000/api/health

---

## 9. Example API Requests and Responses

### 1. Health Check

```bash
curl -X GET http://localhost:5000/api/health
```

Response (200 OK):
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "uptimeSeconds": 42,
    "timestamp": "2026-11-02T08:30:00.000Z",
    "service": "SupportDesk Agent Backend"
  }
}
```

---

### 2. Triage Ticket TCK-001 (Calls get_order_status -> AUTO_RESOLVE)

```bash
curl -X POST http://localhost:5000/api/tickets/TCK-001/triage
```

Response (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "e4a2d890-781e-4519-86ab-d249f05ef912",
    "ticketId": "f723ad91-0e12-4299-9231-10cbf1708abc",
    "status": "COMPLETED",
    "resolutionTag": "AUTO_RESOLVE",
    "customerResponse": "Hello John, I checked your order #ORD-9012. It is currently In Transit and scheduled to arrive Tomorrow. Thank you for your patience!",
    "summary": "Looked up order ORD-9012 status; informed customer package is in transit arriving tomorrow.",
    "startedAt": "2026-11-02T08:31:00.000Z",
    "completedAt": "2026-11-02T08:31:02.150Z",
    "traces": [
      {
        "step": 1,
        "eventType": "AGENT_DECISION",
        "message": "Agent analyzed ticket TCK-001 and decided external data is needed. Invoking tools: [get_order_status].",
        "parameters": {
          "round": 1,
          "functionCalls": [{ "name": "get_order_status", "args": { "order_id": "ORD-9012" } }]
        }
      },
      {
        "step": 2,
        "eventType": "TOOL_CALL",
        "toolName": "get_order_status",
        "message": "Agent requested tool execution: get_order_status",
        "parameters": { "order_id": "ORD-9012" }
      },
      {
        "step": 3,
        "eventType": "TOOL_RESULT",
        "toolName": "get_order_status",
        "message": "Tool 'get_order_status' executed successfully in 24ms.",
        "output": {
          "order_id": "ORD-9012",
          "status": "In Transit",
          "est_delivery": "Tomorrow"
        },
        "durationMs": 24
      },
      {
        "step": 4,
        "eventType": "AGENT_RESPONSE",
        "message": "Final resolution synthesized: [AUTO_RESOLVE] - Looked up order ORD-9012 status; informed customer package is in transit arriving tomorrow."
      }
    ]
  }
}
```

---

### 3. Triage Ticket TCK-002 (Calls get_user_tier -> ESCALATE_TO_SALES)

```bash
curl -X POST http://localhost:5000/api/tickets/TCK-002/triage
```

Response (200 OK):
```json
{
  "success": true,
  "data": {
    "status": "COMPLETED",
    "resolutionTag": "ESCALATE_TO_SALES",
    "customerResponse": "Hello Sarah! We would be delighted to assist you with upgrading to our Enterprise tier. I have escalated your request to our dedicated Enterprise Sales team. A sales representative will be in touch shortly.",
    "summary": "Customer requested Enterprise upgrade from Free tier. Escalated ticket to Enterprise sales team."
  }
}
```

---

### 4. Triage Ticket TCK-003 (No Tools Required -> AUTO_RESOLVE)

```bash
curl -X POST http://localhost:5000/api/tickets/TCK-003/triage
```

Response (200 OK):
```json
{
  "success": true,
  "data": {
    "status": "COMPLETED",
    "resolutionTag": "AUTO_RESOLVE",
    "customerResponse": "To update your profile picture: 1. Click your avatar in the upper right. 2. Select 'Account Settings'. 3. Click 'Upload Photo'. 4. Select your file and click 'Save'.",
    "summary": "Provided step-by-step instructions for updating profile picture."
  }
}
```

---

### 5. System Status and Database Diagnostics

```bash
curl http://localhost:5000/api/system/info
```

Response (200 OK):
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "geminiModel": "gemini-3.5-flash-lite",
    "nodeEnv": "development",
    "uptimeSeconds": 1420,
    "counts": {
      "tickets": 3,
      "executions": 5,
      "customers": 3
    }
  }
}
```

---

### 6. Reset Tickets to Pending for Clean Demo Re-Runs

```bash
curl -X POST http://localhost:5000/api/system/reset-pending
```

Response (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Reset all tickets to PENDING and purged test executions.",
    "ticketsReset": 3,
    "executionsCleared": 5
  }
}
```

---

## 10. Testing Suite

The repository contains 54 automated tests across 6 test suites. Tests run offline with mocked Gemini responses without incurring API charges.

```bash
npm test
npm run test:watch
npm run typecheck
npm run build
```

### Test Coverage Summary

- tests/tools.test.ts (16 tests):
  - get_order_status: valid orders, trims, fallbacks, parameter validations.
  - get_user_tier: tier lookups, enterprise check, parameter validations.
  - toolRegistry: registration, declaration schemas, safety checks, rejection of arbitrary tools.
- tests/agent.test.ts (11 tests):
  - TCK-001 tool call flow (get_order_status -> AUTO_RESOLVE).
  - TCK-002 user tier lookup flow (get_user_tier -> ESCALATE_TO_SALES).
  - TCK-003 general FAQ flow (no tools -> AUTO_RESOLVE).
  - Anti-spoofing context enforcement against parameter tampering.
  - Graceful tool execution error handling.
  - Maximum tool-call limit (3 rounds) prevention.
  - Malformed model output handling and markdown code fence stripping.
- tests/ticket.service.test.ts (5 tests):
  - Filtering by status and search terms.
  - Lookup by ticket number and execution retrieval.
  - Proper 404 NotFoundError handling.
- tests/agent.service.test.ts (6 tests):
  - Concurrency lock: prevents duplicate executions when ticket is PROCESSING.
  - State machine transitions (PENDING -> PROCESSING -> RESOLVED).
  - Error state handling (FAILED ticket & execution, allowing retry).
  - Execution history lookup with traces.
- tests/system.test.ts (4 tests):
  - System metadata and record count retrieval.
  - Ticket reset to pending status and execution cleanup.
  - Idempotent customer dataset re-seeding.
  - Execution log clearing and database verification.
- tests/api.test.ts (12 tests):
  - HTTP server integration tests on ephemeral port.
  - Request validation middleware (422 Unprocessable Entity).
  - Health check endpoint probe.
  - Full triage endpoint routing and error handlers.
