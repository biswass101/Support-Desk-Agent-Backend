import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { requestLogger } from './common/middleware/request-logger.middleware.js';
import { errorHandler } from './common/middleware/error.middleware.js';
import { appRouter } from './routes/index.js';
import { NotFoundError } from './common/errors/app-error.js';
import { swaggerDocument } from './docs/swagger.doc.js';

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(requestLogger);

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'SupportDesk Agent API',
      version: '1.0.0',
      docs: '/api/docs',
      health: '/api/health',
    });
  });

  app.use('/api', appRouter);

  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Resource '${req.method} ${req.originalUrl}' not found`));
  });

  app.use(errorHandler);

  return app;
}

export const app = createApp();
