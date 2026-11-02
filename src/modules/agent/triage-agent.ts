import {
  Content,
  Part,
  createPartFromFunctionResponse,
} from '@google/genai';
import { IGeminiProvider, geminiProvider } from './gemini.provider.js';
import { getAgentToolConfig } from './tool-definitions.js';
import { ToolExecutor, toolExecutor, TrustedTicketContext } from './tool-executor.js';
import { TraceService, traceService } from './trace.service.js';
import {
  AgentResponse,
  agentResponseSchema,
  geminiAgentResponseSchema,
} from './agent.schema.js';
import { logger } from '../../config/logger.js';

export interface TicketTriageInput {
  executionId: string;
  ticketNumber: string;
  customerExternalId: string;
  customerTier: string;
  orderId?: string | null;
  message: string;
}

export class TriageAgent {
  private gemini: IGeminiProvider;
  private executor: ToolExecutor;
  private tracer: TraceService;
  private readonly MAX_ROUNDS = 3;

  constructor(
    gemini: IGeminiProvider = geminiProvider,
    executor: ToolExecutor = toolExecutor,
    tracer: TraceService = traceService
  ) {
    this.gemini = gemini;
    this.executor = executor;
    this.tracer = tracer;
  }

  private buildSystemPrompt(): string {
    return `You are an expert autonomous Customer Support Triage Agent for SupportDesk.
Your job is to analyze customer support tickets, determine if additional information is needed from available backend tools, execute necessary lookups, and synthesize a structured resolution.

Available Tools:
1. get_order_status(order_id: string): Look up shipping status, delivery estimates for orders (e.g. ORD-9012).
2. get_user_tier(user_id: string): Look up customer account tier and upgrade eligibility (e.g. USR-204).

Rules for Decision Making:
- ORDER STATUS: If the user is asking about order tracking, package arrival, or shipping status, invoke 'get_order_status' with the order_id. Once the result is retrieved, inform the user about the status and estimated delivery, and set resolutionTag to 'AUTO_RESOLVE'.
- ACCOUNT UPGRADE / SALES: If the user is requesting to upgrade their subscription (e.g., to Enterprise tier) or asking about pricing/plans, invoke 'get_user_tier' with the user_id. Provide helpful upgrade details and inform them a sales account representative will assist with their enterprise onboarding, and set resolutionTag to 'ESCALATE_TO_SALES'.
- GENERAL INQUIRIES: If the user is asking a general how-to or FAQ question (e.g., how to update their profile picture, account preferences, password reset) that requires no backend lookups, DO NOT invoke any tools. Answer directly as a valid JSON object, and set resolutionTag to 'AUTO_RESOLVE'.
- SECURITY & CONTEXT: Never invent order IDs or customer IDs. Rely on the trusted context provided in the user prompt.

Output Requirements:
Whenever you respond with text (either when no tools are needed, or after receiving tool results), you MUST respond ONLY with a valid JSON object matching this schema:
{
  "customerResponse": "A clear, empathetic, and complete response addressed directly to the customer.",
  "resolutionTag": "AUTO_RESOLVE" | "ESCALATE_TO_SALES",
  "summary": "A concise 1-2 sentence internal summary of the ticket triage outcome."
}`;
  }

  private buildUserMessage(input: TicketTriageInput): string {
    return `CUSTOMER SUPPORT TICKET:
- Ticket Number: ${input.ticketNumber}
- Customer ID: ${input.customerExternalId}
- Current Customer Tier: ${input.customerTier}
- Associated Order ID: ${input.orderId || 'None'}
- Customer Message: "${input.message}"

Please triage this ticket according to your system instructions.`;
  }

  public parseAndValidateResponse(rawText: string): AgentResponse {
    let cleanText = rawText.trim();

    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanText);
    } catch (err) {
      throw new Error(`Failed to parse model output as JSON: ${rawText}`);
    }

    const validation = agentResponseSchema.safeParse(parsed);
    if (!validation.success) {
      const errMsgs = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Model response failed schema validation: ${errMsgs}`);
    }

    return validation.data;
  }

  public async executeTriage(input: TicketTriageInput): Promise<AgentResponse> {
    const { executionId } = input;
    const ticketContext: TrustedTicketContext = {
      ticketNumber: input.ticketNumber,
      customerExternalId: input.customerExternalId,
      orderId: input.orderId,
      message: input.message,
    };

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserMessage(input);

    const contents: Content[] = [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ];

    let rounds = 0;

    try {
      while (rounds < this.MAX_ROUNDS) {
        rounds++;
        logger.debug({ executionId, round: rounds }, 'Agent starting execution round');

        const response = await this.gemini.generateContent({
          model: this.gemini.getModelName(),
          contents,
          config: {
            systemInstruction: systemPrompt,
            tools: getAgentToolConfig(),
          },
        });

        const functionCalls = response.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
          const toolNames = functionCalls.map((fc) => fc.name).join(', ');
          await this.tracer.recordDecision(
            executionId,
            `Agent analyzed ticket ${input.ticketNumber} and decided external data is needed. Invoking tools: [${toolNames}].`,
            {
              round: rounds,
              functionCalls: functionCalls.map((fc) => ({ name: fc.name, args: fc.args })),
            }
          );

          const modelParts: Part[] =
            response.candidates?.[0]?.content?.parts && response.candidates[0].content.parts.length > 0
              ? response.candidates[0].content.parts
              : functionCalls.map((fc) => ({ functionCall: fc }));

          contents.push({
            role: 'model',
            parts: modelParts,
          });

          const toolResponseParts: Part[] = [];

          for (const call of functionCalls) {
            const toolName = call.name || '';
            const rawArgs = (call.args || {}) as Record<string, unknown>;

            await this.tracer.recordToolCall(executionId, toolName, rawArgs);

            const execResult = await this.executor.execute(toolName, rawArgs, ticketContext);

            await this.tracer.recordToolResult(
              executionId,
              toolName,
              execResult.output,
              execResult.durationMs,
              execResult.success,
              execResult.error
            );

            const toolResponsePayload: Record<string, unknown> = execResult.success
              ? typeof execResult.output === 'object' && execResult.output !== null
                ? (execResult.output as Record<string, unknown>)
                : { result: execResult.output }
              : { error: execResult.error };

            toolResponseParts.push(
              createPartFromFunctionResponse(
                call.id || '',
                toolName,
                toolResponsePayload
              )
            );
          }

          contents.push({
            role: 'user',
            parts: toolResponseParts,
          });

          continue;
        }

        if (rounds === 1) {
          await this.tracer.recordDecision(
            executionId,
            `Agent analyzed ticket ${input.ticketNumber} and determined no external tools are needed for this general inquiry.`,
            { round: rounds, externalDataNeeded: false }
          );
        }

        const rawText = response.text || '';
        const validatedResponse = this.parseAndValidateResponse(rawText);

        await this.tracer.recordAgentResponse(executionId, validatedResponse);

        return validatedResponse;
      }

      logger.warn({ executionId }, 'Max tool execution rounds reached; requesting final synthesis');

      const finalSynthesisResponse = await this.gemini.generateContent({
        model: this.gemini.getModelName(),
        contents: [
          ...contents,
          {
            role: 'user',
            parts: [
              {
                text: 'Maximum tool lookup iterations reached. Please synthesize your final response now as a valid JSON object.',
              },
            ],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: geminiAgentResponseSchema,
        },
      });

      const validatedFinal = this.parseAndValidateResponse(finalSynthesisResponse.text || '');
      await this.tracer.recordAgentResponse(executionId, validatedFinal);
      return validatedFinal;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, executionId }, 'Triage agent execution failed');
      await this.tracer.recordError(executionId, `Agent execution failed: ${errorMsg}`, {
        error: errorMsg,
        rounds,
      });
      throw error;
    }
  }
}

export const triageAgent = new TriageAgent();
