import { describe, it, expect } from 'vitest';
import { getOrderStatus } from '../src/tools/get-order-status.tool.js';
import { getUserTier } from '../src/tools/get-user-tier.tool.js';
import { toolRegistry } from '../src/tools/tool-registry.js';

describe('Mock Backend Tools', () => {
  describe('Tool 1: get_order_status', () => {
    it('should return correct order status for ORD-9012', async () => {
      const result = await getOrderStatus({ order_id: 'ORD-9012' });
      expect(result).toEqual({
        order_id: 'ORD-9012',
        status: 'In Transit',
        est_delivery: 'Tomorrow',
      });
    });

    it('should handle case insensitivity and trim spaces', async () => {
      const result = await getOrderStatus({ order_id: ' ord-9012 ' });
      expect(result.order_id).toBe('ORD-9012');
      expect(result.status).toBe('In Transit');
    });

    it('should return simulated fallback for other valid order IDs', async () => {
      const result = await getOrderStatus({ order_id: 'ORD-9999' });
      expect(result.order_id).toBe('ORD-9999');
      expect(result.status).toBeDefined();
      expect(result.est_delivery).toBeDefined();
    });

    it('should throw an error for missing order_id', async () => {
      await expect(getOrderStatus({})).rejects.toThrow(/order_id is required/);
    });

    it('should throw an error for empty order_id', async () => {
      await expect(getOrderStatus({ order_id: '   ' })).rejects.toThrow(/order_id cannot be empty/);
    });

    it('should throw an error for non-string order_id', async () => {
      await expect(getOrderStatus({ order_id: 12345 })).rejects.toThrow(/order_id must be a string/);
    });
  });

  describe('Tool 2: get_user_tier', () => {
    it('should return correct tier and eligibility for USR-204', async () => {
      const result = await getUserTier({ user_id: 'USR-204' });
      expect(result).toEqual({
        user_id: 'USR-204',
        current_tier: 'Free',
        eligible_for_upgrade: true,
      });
    });

    it('should return Enterprise tier for USR-999 with eligible_for_upgrade=false', async () => {
      const result = await getUserTier({ user_id: 'USR-999' });
      expect(result).toEqual({
        user_id: 'USR-999',
        current_tier: 'Enterprise',
        eligible_for_upgrade: false,
      });
    });

    it('should throw an error for missing user_id', async () => {
      await expect(getUserTier({})).rejects.toThrow(/user_id is required/);
    });

    it('should throw an error for empty user_id', async () => {
      await expect(getUserTier({ user_id: '   ' })).rejects.toThrow(/user_id cannot be empty/);
    });
  });

  describe('Tool Registry', () => {
    it('should register get_order_status and get_user_tier by default', () => {
      const toolNames = toolRegistry.getAllToolNames();
      expect(toolNames).toContain('get_order_status');
      expect(toolNames).toContain('get_user_tier');
    });

    it('should provide Gemini-compatible function declarations', () => {
      const declarations = toolRegistry.getFunctionDeclarations();
      expect(declarations.length).toBe(2);

      const orderToolDecl = declarations.find((d) => d.name === 'get_order_status');
      expect(orderToolDecl).toBeDefined();
      expect(orderToolDecl?.parameters?.required).toContain('order_id');

      const userTierToolDecl = declarations.find((d) => d.name === 'get_user_tier');
      expect(userTierToolDecl).toBeDefined();
      expect(userTierToolDecl?.parameters?.required).toContain('user_id');
    });

    it('should safely execute registered get_order_status', async () => {
      const res = await toolRegistry.executeTool('get_order_status', { order_id: 'ORD-9012' });
      expect(res.success).toBe(true);
      expect(res.output).toEqual({
        order_id: 'ORD-9012',
        status: 'In Transit',
        est_delivery: 'Tomorrow',
      });
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should safely execute registered get_user_tier', async () => {
      const res = await toolRegistry.executeTool('get_user_tier', { user_id: 'USR-204' });
      expect(res.success).toBe(true);
      expect(res.output).toEqual({
        user_id: 'USR-204',
        current_tier: 'Free',
        eligible_for_upgrade: true,
      });
    });

    it('should reject arbitrary unregistered tool names', async () => {
      const res = await toolRegistry.executeTool('drop_database_users', { secret: 'evil' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not registered or allowed/);
      expect(res.output).toBeUndefined();
    });

    it('should gracefully catch tool validation errors and report failure', async () => {
      const res = await toolRegistry.executeTool('get_order_status', {});
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/order_id is required/);
    });
  });
});

