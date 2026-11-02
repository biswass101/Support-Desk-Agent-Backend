import { Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip,
      },
      `${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`
    );
  });

  next();
};

