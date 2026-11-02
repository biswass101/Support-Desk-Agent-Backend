import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ValidationError } from '../errors/app-error.js';

interface RequestValidationSchema {
  params?: AnyZodObject;
  query?: AnyZodObject;
  body?: AnyZodObject;
}

export const validateRequest = (schema: RequestValidationSchema) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorDetails = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        next(new ValidationError('Request validation failed', errorDetails));
        return;
      }
      next(error);
    }
  };
};

