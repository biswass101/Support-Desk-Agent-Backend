import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { errorResponse } from '../types/api-response.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { Prisma } from '@prisma/client';

export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error(
    {
      err: {
        message: err.message,
        stack: env.NODE_ENV === 'development' ? err.stack : undefined,
        name: err.name,
      },
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    },
    'Handled Application Error'
  );

  if (err instanceof AppError) {
    res.status(err.statusCode).json(errorResponse(err.message, err.details));
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      res.status(409).json(errorResponse(`Unique constraint violation on ${target}`, { code: err.code }));
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json(errorResponse('Requested resource was not found in the database', { code: err.code }));
      return;
    }
    res.status(400).json(errorResponse('Database operation failed', { code: err.code }));
    return;
  }

  if ('type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json(errorResponse('Malformed JSON in request body'));
    return;
  }

  const message = env.NODE_ENV === 'production' ? 'An unexpected internal server error occurred' : err.message;
  res.status(500).json(errorResponse(message));
};
