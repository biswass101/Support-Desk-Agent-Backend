import { z } from 'zod';

export const getUserTierInputSchema = z.object({
  user_id: z
    .string({
      required_error: 'user_id is required',
      invalid_type_error: 'user_id must be a string',
    })
    .trim()
    .min(1, 'user_id cannot be empty'),
});

export type GetUserTierInput = z.infer<typeof getUserTierInputSchema>;

export interface UserTierResult {
  user_id: string;
  current_tier: string;
  eligible_for_upgrade: boolean;
}

const mockUserDatabase: Record<
  string,
  { current_tier: string; eligible_for_upgrade: boolean }
> = {
  'USR-204': {
    current_tier: 'Free',
    eligible_for_upgrade: true,
  },
  'USR-101': {
    current_tier: 'Free',
    eligible_for_upgrade: true,
  },
  'USR-309': {
    current_tier: 'Free',
    eligible_for_upgrade: true,
  },
  'USR-999': {
    current_tier: 'Enterprise',
    eligible_for_upgrade: false,
  },
};

export async function getUserTier(input: unknown): Promise<UserTierResult> {
  const parsed = getUserTierInputSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.errors.map((e) => e.message).join('; ');
    throw new Error(`Invalid arguments for get_user_tier: ${errorMsg}`);
  }

  const { user_id } = parsed.data;

  await new Promise((resolve) => setTimeout(resolve, 20));

  const normalizedId = user_id.toUpperCase();
  const found = mockUserDatabase[normalizedId];

  if (found) {
    return {
      user_id: normalizedId,
      current_tier: found.current_tier,
      eligible_for_upgrade: found.eligible_for_upgrade,
    };
  }

  return {
    user_id: normalizedId,
    current_tier: 'Free',
    eligible_for_upgrade: true,
  };
}
