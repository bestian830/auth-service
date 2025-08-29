import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const counters = {
  authorize_success: new client.Counter({ 
    name: 'tymoe_authorize_success', 
    help: 'authorize success',
    registers: [registry]
  }),
  authorize_failed: new client.Counter({ 
    name: 'tymoe_authorize_failed', 
    help: 'authorize failed',
    registers: [registry]
  }),
  token_success: new client.Counter({ 
    name: 'tymoe_token_success', 
    help: 'token success',
    registers: [registry]
  }),
  token_failed: new client.Counter({ 
    name: 'tymoe_token_failed', 
    help: 'token failed',
    registers: [registry]
  }),
  refresh_success: new client.Counter({ 
    name: 'tymoe_refresh_success', 
    help: 'refresh success',
    registers: [registry]
  }),
  refresh_failed: new client.Counter({ 
    name: 'tymoe_refresh_failed', 
    help: 'refresh failed',
    registers: [registry]
  }),
};