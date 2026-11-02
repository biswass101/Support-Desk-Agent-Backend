import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriageAgent } from '../src/modules/agent/triage-agent.js';
import { IGeminiProvider } from '../src/modules/agent/gemini.provider.js';
import { ToolExecutor } from '../src/modules/agent/tool-executor.js';
import { TraceService } from '../src/modules/agent/trace.service.js';
import { GenerateContentResponse } from '@google/genai';

describe('Triage Agent & Workflow', () => {
  let mockGemini: IGeminiProvider;
  let mockExecutor: ToolExecutor;
  let mockTracer: TraceService;
  let agent: TriageAgent;

  beforeEach(() => {
    mockGemini = {
      getModelName: vi.fn().mockReturnValue('gemini-2.5-flash'),
      generateContent: vi.fn(),
    };
    mockExecutor = new ToolExecutor();
    mockTracer = {
      getNextStep: vi.fn().mockReturnValue(1),
      recordEvent: vi.fn().mockResolvedValue({ id: 'trace-1', step: 1 }),
      recordDecision: vi.fn().mockResolvedValue({ id: 'trace-1', step: 1 }),
      recordToolCall: vi.fn().mockResolvedValue({ id: 'trace-2', step: 2 }),
      recordToolResult: vi.fn().mockResolvedValue({ id: 'trace-3', step: 3 }),
      recordAgentResponse: vi.fn().mockResolvedValue({ id: 'trace-4', step: 4 }),
      recordError: vi.fn().mockResolvedValue({ id: 'trace-err', step: 5 }),
      clearExecutionStep: vi.fn(),
    } as unknown as TraceService;

    agent = new TriageAgent(mockGemini, mockExecutor, mockTracer);
  });

  describe('Response parsing & schema validation', () => {
    it('should parse clean JSON correctly', () => {
      const json = JSON.stringify({
        customerResponse: 'Your package is on its way.',
        resolutionTag: 'AUTO_RESOLVE',
        summary: 'Order status provided.',
      });
      const result = agent.parseAndValidateResponse(json);
      expect(result.resolutionTag).toBe('AUTO_RESOLVE');
      expect(result.customerResponse).toBe('Your package is on its way.');
    });

    it('should strip markdown code fences', () => {
      const raw = '```json\n{"customerResponse": "Instructions", "resolutionTag": "AUTO_RESOLVE", "summary": "Done"}\n```';
      const result = agent.parseAndValidateResponse(raw);
      expect(result.resolutionTag).toBe('AUTO_RESOLVE');
      expect(result.customerResponse).toBe('Instructions');
    });

    it('should reject invalid resolutionTag', () => {
      const raw = JSON.stringify({
        customerResponse: 'Hello',
        resolutionTag: 'UNKNOWN_TAG',
        summary: 'Done',
      });
      expect(() => agent.parseAndValidateResponse(raw)).toThrow(/schema validation/);
    });

    it('should reject missing fields', () => {
      const raw = JSON.stringify({
        customerResponse: 'Hello',
      });
      expect(() => agent.parseAndValidateResponse(raw)).toThrow(/schema validation/);
    });
  });

  describe('TCK-001: Order status tool invocation & AUTO_RESOLVE', () => {
    it('should call get_order_status and synthesize final delivery response', async () => {
      const turn1Response = {
        functionCalls: [
          {
            name: 'get_order_status',
            args: { order_id: 'ORD-9012' },
          },
        ],
        candidates: [{ content: { parts: [{ functionCall: { name: 'get_order_status', args: { order_id: 'ORD-9012' } } }] } }],
        text: undefined,
      } as unknown as GenerateContentResponse;

      const turn2Response = {
        functionCalls: undefined,
        text: JSON.stringify({
          customerResponse: 'Hello! Your package for order #ORD-9012 is currently In Transit and is estimated to arrive tomorrow.',
          resolutionTag: 'AUTO_RESOLVE',
          summary: 'Checked order status for ORD-9012; parcel is in transit and arriving tomorrow.',
        }),
      } as unknown as GenerateContentResponse;

      (mockGemini.generateContent as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(turn1Response)
        .mockResolvedValueOnce(turn2Response);

      const result = await agent.executeTriage({
        executionId: 'exec-1',
        ticketNumber: 'TCK-001',
        customerExternalId: 'USR-101',
        customerTier: 'Free',
        orderId: 'ORD-9012',
        message: 'Where is my package #ORD-9012? It was supposed to arrive yesterday.',
      });

      expect(mockGemini.generateContent).toHaveBeenCalledTimes(2);
      expect(mockTracer.recordDecision).toHaveBeenCalledWith(
        'exec-1',
        expect.stringContaining('decided external data is needed. Invoking tools: [get_order_status]'),
        expect.any(Object)
      );
      expect(mockTracer.recordToolCall).toHaveBeenCalledWith(
        'exec-1',
        'get_order_status',
        { order_id: 'ORD-9012' }
      );
      expect(mockTracer.recordToolResult).toHaveBeenCalledWith(
        'exec-1',
        'get_order_status',
        expect.objectContaining({ order_id: 'ORD-9012', status: 'In Transit' }),
        expect.any(Number),
        true,
        undefined
      );
      expect(result.resolutionTag).toBe('AUTO_RESOLVE');
      expect(result.customerResponse).toContain('ORD-9012');
    });
  });

  describe('TCK-002: User tier tool invocation & ESCALATE_TO_SALES', () => {
    it('should call get_user_tier and synthesize escalation to sales', async () => {
      const turn1Response = {
        functionCalls: [
          {
            name: 'get_user_tier',
            args: { user_id: 'USR-204' },
          },
        ],
        candidates: [{ content: { parts: [{ functionCall: { name: 'get_user_tier', args: { user_id: 'USR-204' } } }] } }],
      } as unknown as GenerateContentResponse;

      const turn2Response = {
        functionCalls: undefined,
        text: JSON.stringify({
          customerResponse: 'We would love to help you upgrade to Enterprise tier. Our Enterprise team provides custom billing and dedicated support. An account manager has been notified and will reach out to you shortly.',
          resolutionTag: 'ESCALATE_TO_SALES',
          summary: 'Customer is on Free tier and requested Enterprise upgrade. Escalated ticket to sales team.',
        }),
      } as unknown as GenerateContentResponse;

      (mockGemini.generateContent as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(turn1Response)
        .mockResolvedValueOnce(turn2Response);

      const result = await agent.executeTriage({
        executionId: 'exec-2',
        ticketNumber: 'TCK-002',
        customerExternalId: 'USR-204',
        customerTier: 'Free',
        orderId: null,
        message: 'Can you upgrade my account to Enterprise tier?',
      });

      expect(mockGemini.generateContent).toHaveBeenCalledTimes(2);
      expect(result.resolutionTag).toBe('ESCALATE_TO_SALES');
      expect(mockTracer.recordToolCall).toHaveBeenCalledWith('exec-2', 'get_user_tier', { user_id: 'USR-204' });
    });
  });

  describe('TCK-003: No-tool invocation for general inquiry', () => {
    it('should directly synthesize profile picture instructions without calling any tool', async () => {
      const directResponse = {
        functionCalls: undefined,
        text: JSON.stringify({
          customerResponse: 'To update your profile picture, navigate to Account Settings > Profile, click on your current avatar, upload your new image, and click "Save Changes".',
          resolutionTag: 'AUTO_RESOLVE',
          summary: 'Provided step-by-step guidance for updating profile picture.',
        }),
      } as unknown as GenerateContentResponse;

      (mockGemini.generateContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(directResponse);

      const result = await agent.executeTriage({
        executionId: 'exec-3',
        ticketNumber: 'TCK-003',
        customerExternalId: 'USR-309',
        customerTier: 'Free',
        orderId: null,
        message: 'How do I update my profile picture?',
      });

      expect(mockGemini.generateContent).toHaveBeenCalledTimes(1);
      expect(mockTracer.recordDecision).toHaveBeenCalledWith(
        'exec-3',
        expect.stringContaining('no external tools are needed for this general inquiry'),
        expect.any(Object)
      );
      expect(mockTracer.recordToolCall).not.toHaveBeenCalled();
      expect(result.resolutionTag).toBe('AUTO_RESOLVE');
      expect(result.customerResponse).toContain('Account Settings');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should record ERROR trace when model produces unparseable garbage', async () => {
      const badResponse = {
        functionCalls: undefined,
        text: 'Sorry, I cannot answer right now...',
      } as unknown as GenerateContentResponse;

      (mockGemini.generateContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(badResponse);

      await expect(
        agent.executeTriage({
          executionId: 'exec-err',
          ticketNumber: 'TCK-999',
          customerExternalId: 'USR-101',
          customerTier: 'Free',
          orderId: null,
          message: 'Hello',
        })
      ).rejects.toThrow();

      expect(mockTracer.recordError).toHaveBeenCalledWith(
        'exec-err',
        expect.stringContaining('Agent execution failed: Failed to parse model output as JSON'),
        expect.any(Object)
      );
    });

    it('should enforce trusted customer context if model attempts to query another user_id', async () => {
      const turn1Response = {
        functionCalls: [
          {
            name: 'get_user_tier',
            args: { user_id: 'ATTACKER-999' },
          },
        ],
        candidates: [{ content: { parts: [{ functionCall: { name: 'get_user_tier', args: { user_id: 'ATTACKER-999' } } }] } }],
      } as unknown as GenerateContentResponse;

      const turn2Response = {
        functionCalls: undefined,
        text: JSON.stringify({
          customerResponse: 'Your tier is Free.',
          resolutionTag: 'AUTO_RESOLVE',
          summary: 'Verified user tier.',
        }),
      } as unknown as GenerateContentResponse;

      (mockGemini.generateContent as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(turn1Response)
        .mockResolvedValueOnce(turn2Response);

      await agent.executeTriage({
        executionId: 'exec-sec',
        ticketNumber: 'TCK-002',
        customerExternalId: 'USR-204',
        customerTier: 'Free',
        orderId: null,
        message: 'Upgrade please',
      });

      expect(mockTracer.recordToolResult).toHaveBeenCalledWith(
        'exec-sec',
        'get_user_tier',
        expect.objectContaining({ user_id: 'USR-204' }),
        expect.any(Number),
        true,
        undefined
      );
    });

    it('should gracefully handle tool execution failure and pass error back to model', async () => {
      const turn1Response = {
        functionCalls: [
          {
            name: 'get_order_status',
            args: { order_id: '' },
          },
        ],
        candidates: [{ content: { parts: [{ functionCall: { name: 'get_order_status', args: { order_id: '' } } }] } }],
      } as unknown as GenerateContentResponse;

      const turn2Response = {
        functionCalls: undefined,
        text: JSON.stringify({
          customerResponse: 'We could not locate your order details. Could you please provide a valid order ID?',
          resolutionTag: 'AUTO_RESOLVE',
          summary: 'Requested valid order number from customer.',
        }),
      } as unknown as GenerateContentResponse;

      (mockGemini.generateContent as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(turn1Response)
        .mockResolvedValueOnce(turn2Response);

      const result = await agent.executeTriage({
        executionId: 'exec-fail-tool',
        ticketNumber: 'TCK-001',
        customerExternalId: 'USR-101',
        customerTier: 'Free',
        orderId: null,
        message: 'Where is my order?',
      });

      expect(mockTracer.recordToolResult).toHaveBeenCalledWith(
        'exec-fail-tool',
        'get_order_status',
        undefined,
        expect.any(Number),
        false,
        expect.stringContaining('order_id cannot be empty')
      );
      expect(result.resolutionTag).toBe('AUTO_RESOLVE');
    });

    it('should enforce maximum tool-call limit of 3 rounds and force final synthesis', async () => {
      const loopingFunctionCall = {
        functionCalls: [
          {
            name: 'get_order_status',
            args: { order_id: 'ORD-9012' },
          },
        ],
        candidates: [{ content: { parts: [{ functionCall: { name: 'get_order_status', args: { order_id: 'ORD-9012' } } }] } }],
      } as unknown as GenerateContentResponse;

      const forcedFinalResponse = {
        functionCalls: undefined,
        text: JSON.stringify({
          customerResponse: 'Based on the available information, your order is currently In Transit.',
          resolutionTag: 'AUTO_RESOLVE',
          summary: 'Max iterations reached, synthesized final response.',
        }),
      } as unknown as GenerateContentResponse;

      (mockGemini.generateContent as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(loopingFunctionCall)
        .mockResolvedValueOnce(loopingFunctionCall)
        .mockResolvedValueOnce(loopingFunctionCall)
        .mockResolvedValueOnce(forcedFinalResponse);

      const result = await agent.executeTriage({
        executionId: 'exec-loop',
        ticketNumber: 'TCK-001',
        customerExternalId: 'USR-101',
        customerTier: 'Free',
        orderId: 'ORD-9012',
        message: 'Where is my package?',
      });

      expect(mockGemini.generateContent).toHaveBeenCalledTimes(4);
      expect(result.resolutionTag).toBe('AUTO_RESOLVE');
      expect(mockTracer.recordAgentResponse).toHaveBeenCalled();
    });
  });
});
