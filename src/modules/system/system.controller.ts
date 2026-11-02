import { Request, Response, NextFunction } from 'express';
import { SystemService, systemService } from './system.service.js';
import { successResponse } from '../../common/types/api-response.js';

export class SystemController {
  private service: SystemService;

  constructor(service: SystemService = systemService) {
    this.service = service;
  }

  public getSystemInfo = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const info = await this.service.getSystemInfo();
      res.status(200).json(successResponse(info));
    } catch (error) {
      next(error);
    }
  };

  public resetToPending = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.resetToPending();
      res.status(200).json(successResponse(result));
    } catch (error) {
      next(error);
    }
  };

  public reseedDatabase = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.reseedDatabase();
      res.status(200).json(successResponse(result));
    } catch (error) {
      next(error);
    }
  };

  public clearAllData = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.clearAllData();
      res.status(200).json(successResponse(result));
    } catch (error) {
      next(error);
    }
  };
}

export const systemController = new SystemController();

