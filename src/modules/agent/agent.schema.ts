import { z } from 'zod';
import { Type } from '@google/genai';

export const ResolutionTagEnum = z.enum(['AUTO_RESOLVE', 'ESCALATE_TO_SALES']);
export type ResolutionTag = z.infer<typeof ResolutionTagEnum>;

export const agentResponseSchema = z.object({
  customerResponse: z
    .string({
      required_error: 'customerResponse is required',
    })
    .min(1, 'customerResponse cannot be empty'),
  resolutionTag: ResolutionTagEnum,
  summary: z
    .string({
      required_error: 'summary is required',
    })
    .min(1, 'summary cannot be empty'),
});

export type AgentResponse = z.infer<typeof agentResponseSchema>;

export const geminiAgentResponseSchema = {
  type: Type.OBJECT,
  properties: {
    customerResponse: {
      type: Type.STRING,
      description:
        'The complete, polite, and helpful response text to send directly to the customer.',
    },
    resolutionTag: {
      type: Type.STRING,
      enum: ['AUTO_RESOLVE', 'ESCALATE_TO_SALES'],
      description:
        'Resolution tag. AUTO_RESOLVE for directly answered/resolved issues; ESCALATE_TO_SALES for upgrade/enterprise sales requests.',
    },
    summary: {
      type: Type.STRING,
      description:
        'A concise 1-2 sentence internal summary of how the ticket was triaged and resolved.',
    },
  },
  required: ['customerResponse', 'resolutionTag', 'summary'],
};
