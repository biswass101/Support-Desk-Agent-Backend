import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface IGeminiProvider {
  generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
  getModelName(): string;
}

export class GeminiProvider implements IGeminiProvider {
  private client: GoogleGenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey || env.GEMINI_API_KEY;
    this.modelName = modelName || env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!key) {
      logger.warn('GeminiProvider initialized without API key');
    }

    this.client = new GoogleGenAI({
      apiKey: key,
    });
  }

  public getModelName(): string {
    return this.modelName;
  }

  public async generateContent(
    params: GenerateContentParameters,
    retries = 2,
    delayMs = 1500
  ): Promise<GenerateContentResponse> {
    const targetModel = params.model || this.modelName;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.models.generateContent({
          ...params,
          model: targetModel,
        });
        return response;
      } catch (error: unknown) {
        const errObj = error as { status?: number; message?: string };
        const isTransient =
          errObj?.status === 503 ||
          (typeof errObj?.message === 'string' && errObj.message.includes('503'));

        if (isTransient && attempt < retries) {
          logger.warn({ attempt: attempt + 1, delayMs }, 'Transient 503 detected; retrying');
          await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
          continue;
        }
        logger.error({ err: error, model: targetModel }, 'Gemini API call failed');
        throw error;
      }
    }
    throw new Error('Exhausted retries calling Gemini API');
  }
}

export const geminiProvider = new GeminiProvider();

