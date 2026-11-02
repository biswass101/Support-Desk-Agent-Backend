import { toolRegistry, ToolExecutionResult } from '../../tools/tool-registry.js';
import { logger } from '../../config/logger.js';

export interface TrustedTicketContext {
  ticketNumber: string;
  customerExternalId: string;
  orderId?: string | null;
  message: string;
}

export class ToolExecutor {
  public sanitizeAndValidateArguments(
    toolName: string,
    rawArgs: Record<string, unknown>,
    context: TrustedTicketContext
  ): Record<string, unknown> {
    const sanitizedArgs = { ...rawArgs };

    if (toolName === 'get_user_tier') {
      const requestedUserId = (sanitizedArgs.user_id as string | undefined)?.trim();
      const trustedUserId = context.customerExternalId.trim();

      if (!requestedUserId || requestedUserId.toUpperCase() !== trustedUserId.toUpperCase()) {
        logger.warn(
          {
            toolName,
            requestedUserId,
            trustedUserId,
            ticketNumber: context.ticketNumber,
          },
          'Model provided mismatched or missing user_id; enforcing trusted ticket customer ID'
        );
        sanitizedArgs.user_id = trustedUserId;
      }
    }

    if (toolName === 'get_order_status') {
      const requestedOrderId = (sanitizedArgs.order_id as string | undefined)?.trim();
      const trustedOrderId = context.orderId?.trim();

      if (trustedOrderId && requestedOrderId && requestedOrderId.toUpperCase() !== trustedOrderId.toUpperCase()) {
        logger.warn(
          {
            toolName,
            requestedOrderId,
            trustedOrderId,
            ticketNumber: context.ticketNumber,
          },
          'Model provided divergent order_id; enforcing trusted ticket orderId'
        );
        sanitizedArgs.order_id = trustedOrderId;
      } else if (trustedOrderId && !requestedOrderId) {
        sanitizedArgs.order_id = trustedOrderId;
      }
    }

    return sanitizedArgs;
  }

  public async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: TrustedTicketContext
  ): Promise<ToolExecutionResult> {
    const sanitizedArgs = this.sanitizeAndValidateArguments(toolName, args, context);
    return await toolRegistry.executeTool(toolName, sanitizedArgs);
  }
}

export const toolExecutor = new ToolExecutor();
