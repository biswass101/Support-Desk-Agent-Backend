import { TraceEventType, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

export interface TraceRecord {
  id?: string;
  executionId: string;
  step: number;
  eventType: TraceEventType;
  toolName?: string | null;
  message: string;
  parameters?: unknown;
  output?: unknown;
  durationMs?: number | null;
  createdAt?: Date;
}

export class TraceService {
  private prisma: PrismaClient;
  private stepCounters: Map<string, number> = new Map();

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  public getNextStep(executionId: string): number {
    const current = this.stepCounters.get(executionId) || 0;
    const next = current + 1;
    this.stepCounters.set(executionId, next);
    return next;
  }

  public async recordEvent(
    executionId: string,
    eventType: TraceEventType,
    message: string,
    options?: {
      toolName?: string | null;
      parameters?: Record<string, unknown> | null;
      output?: Record<string, unknown> | null;
      durationMs?: number | null;
    }
  ): Promise<TraceRecord> {
    const step = this.getNextStep(executionId);

    const record: TraceRecord = {
      executionId,
      step,
      eventType,
      toolName: options?.toolName || null,
      message,
      parameters: options?.parameters ? (options.parameters as any) : null,
      output: options?.output ? (options.output as any) : null,
      durationMs: options?.durationMs ?? null,
    };

    logger.debug(
      {
        executionId,
        step,
        eventType,
        toolName: options?.toolName,
      },
      `Trace: ${message}`
    );

    try {
      const persisted = await this.prisma.executionTrace.create({
        data: {
          executionId,
          step,
          eventType,
          toolName: options?.toolName || null,
          message,
          parameters: options?.parameters ? (options.parameters as any) : undefined,
          output: options?.output ? (options.output as any) : undefined,
          durationMs: options?.durationMs,
        },
      });
      return persisted;
    } catch (err) {
      logger.error(
        { err, executionId, step, eventType },
        'Failed to persist execution trace to database'
      );
      return {
        ...record,
        id: `mock-trace-${Date.now()}-${step}`,
        createdAt: new Date(),
      };
    }
  }

  public async recordDecision(
    executionId: string,
    decisionSummary: string,
    context?: Record<string, unknown>
  ): Promise<TraceRecord> {
    return this.recordEvent(
      executionId,
      TraceEventType.AGENT_DECISION,
      decisionSummary,
      { parameters: context }
    );
  }

  public async recordToolCall(
    executionId: string,
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<TraceRecord> {
    return this.recordEvent(
      executionId,
      TraceEventType.TOOL_CALL,
      `Agent requested tool execution: ${toolName}`,
      {
        toolName,
        parameters,
      }
    );
  }

  public async recordToolResult(
    executionId: string,
    toolName: string,
    output: unknown,
    durationMs: number,
    success: boolean,
    errorMessage?: string
  ): Promise<TraceRecord> {
    const message = success
      ? `Tool '${toolName}' executed successfully in ${durationMs}ms.`
      : `Tool '${toolName}' failed after ${durationMs}ms: ${errorMessage}`;

    return this.recordEvent(
      executionId,
      TraceEventType.TOOL_RESULT,
      message,
      {
        toolName,
        output: typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : { result: output },
        durationMs,
      }
    );
  }

  public async recordAgentResponse(
    executionId: string,
    response: { customerResponse: string; resolutionTag: string; summary: string }
  ): Promise<TraceRecord> {
    return this.recordEvent(
      executionId,
      TraceEventType.AGENT_RESPONSE,
      `Final resolution synthesized: [${response.resolutionTag}] - ${response.summary}`,
      {
        output: {
          customerResponse: response.customerResponse,
          resolutionTag: response.resolutionTag,
          summary: response.summary,
        },
      }
    );
  }

  public async recordError(
    executionId: string,
    errorMessage: string,
    details?: unknown
  ): Promise<TraceRecord> {
    return this.recordEvent(
      executionId,
      TraceEventType.ERROR,
      errorMessage,
      {
        output: typeof details === 'object' && details !== null ? (details as Record<string, unknown>) : { error: details },
      }
    );
  }

  public clearExecutionStep(executionId: string): void {
    this.stepCounters.delete(executionId);
  }
}

export const traceService = new TraceService();
