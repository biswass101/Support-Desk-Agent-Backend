import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { app } from '../src/app.js';
import { Server } from 'http';
import { systemService } from '../src/modules/system/system.service.js';

describe('System and Database Management Endpoints', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/system/info should return system metadata and counts', async () => {
    vi.spyOn(systemService, 'getSystemInfo').mockResolvedValue({
      status: 'healthy',
      database: 'connected',
      geminiModel: 'gemini-3.5-flash-lite',
      nodeEnv: 'test',
      uptimeSeconds: 120,
      counts: {
        tickets: 3,
        executions: 5,
        customers: 3,
      },
    });

    const res = await fetch(`${baseUrl}/api/system/info`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('healthy');
    expect(json.data.geminiModel).toBe('gemini-3.5-flash-lite');
    expect(json.data.counts.tickets).toBe(3);
  });

  it('POST /api/system/reset-to-pending should reset tickets and clear traces', async () => {
    vi.spyOn(systemService, 'resetToPending').mockResolvedValue({
      message: 'Database reset to pending triage state successfully',
      ticketsCount: 3,
    });

    const res = await fetch(`${baseUrl}/api/system/reset-to-pending`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.ticketsCount).toBe(3);
    expect(json.data.message).toContain('reset to pending');
  });

  it('POST /api/system/reseed should recreate evaluation dataset', async () => {
    vi.spyOn(systemService, 'reseedDatabase').mockResolvedValue({
      message: 'Evaluation dataset re-seeded successfully',
      seededTickets: 3,
      seededCustomers: 3,
    });

    const res = await fetch(`${baseUrl}/api/system/reseed`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.seededTickets).toBe(3);
    expect(json.data.seededCustomers).toBe(3);
  });

  it('POST /api/system/clear-all should clear all database records', async () => {
    vi.spyOn(systemService, 'clearAllData').mockResolvedValue({
      message: 'All database records cleared successfully',
    });

    const res = await fetch(`${baseUrl}/api/system/clear-all`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.message).toContain('cleared successfully');
  });
});

