import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { app } from '../src/app.js';
import { Server } from 'http';
import { ticketService } from '../src/modules/tickets/ticket.service.js';
import { agentService } from '../src/modules/agent/agent.service.js';
import { NotFoundError, ConflictError } from '../src/common/errors/app-error.js';
import { TicketStatus, ExecutionStatus, ResolutionTag } from '@prisma/client';

describe('REST API Endpoints Integration', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('GET / and Health Probe', () => {
    it('GET / should return service info and doc links', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.service).toBe('SupportDesk Agent API');
      expect(json.docs).toBe('/api/docs');
      expect(json.health).toBe('/api/health');
    });

    it('GET /api/health should respond with health status', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect([200, 503]).toContain(res.status);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.status).toBeDefined();
    });
  });

  describe('GET /api/tickets', () => {
    it('should return 200 with list of tickets', async () => {
      const mockTickets = [
        {
          id: 't-1',
          ticketNumber: 'TCK-001',
          message: 'Where is order #ORD-9012?',
          status: TicketStatus.PENDING,
          customer: { externalId: 'USR-101' },
        },
      ];
      vi.spyOn(ticketService, 'getTickets').mockResolvedValue(mockTickets as any);

      const res = await fetch(`${baseUrl}/api/tickets?status=PENDING`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].ticketNumber).toBe('TCK-001');
    });

    it('should return 422 if invalid status query param is provided', async () => {
      const res = await fetch(`${baseUrl}/api/tickets?status=INVALID_STATUS`);
      expect(res.status).toBe(422);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('Request validation failed');
    });
  });

  describe('GET /api/tickets/:ticketNumber', () => {
    it('should return ticket details for valid ticketNumber', async () => {
      const mockTicket = {
        id: 't-1',
        ticketNumber: 'TCK-001',
        message: 'Where is order #ORD-9012?',
        status: TicketStatus.PENDING,
        customer: { externalId: 'USR-101' },
      };
      vi.spyOn(ticketService, 'getTicketByNumber').mockResolvedValue(mockTicket as any);

      const res = await fetch(`${baseUrl}/api/tickets/TCK-001`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.ticketNumber).toBe('TCK-001');
    });

    it('should return 404 when ticket is not found', async () => {
      vi.spyOn(ticketService, 'getTicketByNumber').mockRejectedValue(
        new NotFoundError("Ticket with number 'TCK-999' not found")
      );

      const res = await fetch(`${baseUrl}/api/tickets/TCK-999`);
      expect(res.status).toBe(404);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('not found');
    });
  });

  describe('POST /api/tickets/:ticketNumber/triage', () => {
    it('should execute triage and return execution with traces', async () => {
      const mockResult = {
        id: 'exec-1',
        ticketId: 't-1',
        status: ExecutionStatus.COMPLETED,
        resolutionTag: ResolutionTag.AUTO_RESOLVE,
        customerResponse: 'Your package is in transit.',
        summary: 'Looked up order status.',
        traces: [
          { step: 1, eventType: 'AGENT_DECISION' },
          { step: 2, eventType: 'TOOL_CALL', toolName: 'get_order_status' },
          { step: 3, eventType: 'TOOL_RESULT' },
          { step: 4, eventType: 'AGENT_RESPONSE' },
        ],
      };
      vi.spyOn(agentService, 'triageTicket').mockResolvedValue(mockResult as any);

      const res = await fetch(`${baseUrl}/api/tickets/TCK-001/triage`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.resolutionTag).toBe('AUTO_RESOLVE');
      expect(json.data.traces).toHaveLength(4);
    });

    it('should return 409 Conflict when ticket is already processing', async () => {
      vi.spyOn(agentService, 'triageTicket').mockRejectedValue(
        new ConflictError('Ticket is already being triaged')
      );

      const res = await fetch(`${baseUrl}/api/tickets/TCK-001/triage`, {
        method: 'POST',
      });
      expect(res.status).toBe(409);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('already being triaged');
    });
  });

  describe('GET /api/executions/:executionId', () => {
    it('should return full execution details for valid UUID', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockExec = {
        id: validUuid,
        status: ExecutionStatus.COMPLETED,
        resolutionTag: ResolutionTag.ESCALATE_TO_SALES,
        traces: [],
      };
      vi.spyOn(agentService, 'getExecutionDetails').mockResolvedValue(mockExec as any);

      const res = await fetch(`${baseUrl}/api/executions/${validUuid}`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(validUuid);
    });

    it('should return 422 if executionId is not a valid UUID', async () => {
      const res = await fetch(`${baseUrl}/api/executions/not-a-valid-uuid`);
      expect(res.status).toBe(422);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('Request validation failed');
    });
  });

  describe('404 catch-all handler', () => {
    it('should return 404 for undefined routes', async () => {
      const res = await fetch(`${baseUrl}/api/unknown-endpoint-xyz`);
      expect(res.status).toBe(404);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('not found');
    });
  });
});
