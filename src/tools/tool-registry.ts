import { FunctionDeclaration, Type } from '@google/genai';
import { getOrderStatus, getOrderStatusInputSchema, OrderStatusResult } from './get-order-status.tool.js';
import { getUserTier, getUserTierInputSchema, UserTierResult } from './get-user-tier.tool.js';

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  declaration: FunctionDeclaration;
  execute: (args: TInput) => Promise<TOutput>;
}

export interface ToolExecutionResult {
  toolName: string;
  parameters: Record<string, unknown>;
  output?: unknown;
  error?: string;
  success: boolean;
  durationMs: number;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.registerTool<unknown, OrderStatusResult>({
      name: 'get_order_status',
      description: 'Fetch the real-time shipping status and estimated delivery date for a specific customer order ID (e.g. ORD-9012).',
      declaration: {
        name: 'get_order_status',
        description: 'Fetch the real-time shipping status and estimated delivery date for a specific customer order ID (e.g. ORD-9012).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            order_id: {
              type: Type.STRING,
              description: 'The unique alphanumeric order identifier, such as ORD-9012.',
            },
          },
          required: ['order_id'],
        },
      },
      execute: async (args: unknown) => {
        const validated = getOrderStatusInputSchema.parse(args);
        return await getOrderStatus(validated);
      },
    });

    this.registerTool<unknown, UserTierResult>({
      name: 'get_user_tier',
      description: 'Retrieve a customer account subscription tier (Free, Pro, Enterprise) and upgrade eligibility using their user identifier (e.g. USR-204).',
      declaration: {
        name: 'get_user_tier',
        description: 'Retrieve a customer account subscription tier (Free, Pro, Enterprise) and upgrade eligibility using their user identifier (e.g. USR-204).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            user_id: {
              type: Type.STRING,
              description: 'The unique customer identifier, such as USR-204.',
            },
          },
          required: ['user_id'],
        },
      },
      execute: async (args: unknown) => {
        const validated = getUserTierInputSchema.parse(args);
        return await getUserTier(validated);
      },
    });
  }

  public registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name '${tool.name}' is already registered.`);
    }
    this.tools.set(tool.name, tool as ToolDefinition);
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  public getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  public getFunctionDeclarations(): FunctionDeclaration[] {
    return Array.from(this.tools.values()).map((t) => t.declaration);
  }

  public async executeTool(
    toolName: string,
    rawArgs: unknown
  ): Promise<ToolExecutionResult> {
    const start = Date.now();
    const parameters = typeof rawArgs === 'object' && rawArgs !== null ? (rawArgs as Record<string, unknown>) : { input: rawArgs };

    if (!this.hasTool(toolName)) {
      const durationMs = Date.now() - start;
      return {
        toolName,
        parameters,
        error: `Tool '${toolName}' is not registered or allowed. Permitted tools: [${this.getAllToolNames().join(', ')}]`,
        success: false,
        durationMs,
      };
    }

    const tool = this.tools.get(toolName)!;

    try {
      const output = await tool.execute(rawArgs);
      const durationMs = Date.now() - start;
      return {
        toolName,
        parameters,
        output,
        success: true,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        toolName,
        parameters,
        error: errorMsg,
        success: false,
        durationMs,
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();
