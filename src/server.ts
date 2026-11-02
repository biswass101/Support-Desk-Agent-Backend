import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { Server } from 'http';

let server: Server;

async function startServer(): Promise<void> {
  try {
    logger.info('Initializing SupportDesk Agent backend...');

    await connectDatabase();

    server = app.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          env: env.NODE_ENV,
          docsUrl: `http://localhost:${env.PORT}/api/docs`,
          healthUrl: `http://localhost:${env.PORT}/api/health`,
        },
        `SupportDesk Agent server running on port ${env.PORT}`
      );
    });

    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Graceful shutdown initiated...');
      if (server) {
        server.close(async () => {
          logger.info('HTTP server closed');
          await disconnectDatabase();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        });

        setTimeout(() => {
          logger.error('Forced shutdown due to timeout');
          process.exit(1);
        }, 10000);
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (err: Error) => {
      logger.fatal({ err }, 'Uncaught Exception detected');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.fatal({ reason }, 'Unhandled Promise Rejection detected');
      process.exit(1);
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
