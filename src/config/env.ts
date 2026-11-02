import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required').default(() => {
    if (process.env.NODE_ENV === 'test') {
      return 'test-mock-gemini-key';
    }
    return '';
  }),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse({
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    FRONTEND_URL: process.env.FRONTEND_URL,
    DATABASE_URL: process.env.DATABASE_URL || (process.env.NODE_ENV === 'test' ? 'postgresql://test:test@localhost:5432/test?schema=public' : undefined),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || (process.env.NODE_ENV === 'test' ? 'test-mock-gemini-key' : undefined),
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    const errorDetails = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
    throw new Error(`Invalid environment configuration: ${errorDetails}`);
  }
  throw error;
}

export const env = parsedEnv;
