import { describe, it, expect } from 'vitest';
import { createApiConfig } from '../../index.js';

describe('createApiConfig', () => {
  it('applies defaults', () => {
    const config = createApiConfig({}, {});

    expect(config.port).toBe(3001);
    expect(config.nodeEnv).toBe('development');
    expect(config.appName).toBe('api');
    expect(config.appVersion).toBe('0.0.0');
    expect(config.enableRequestLogging).toBe(true);
  });

  it('applies env values', () => {
    const config = createApiConfig(
      {},
      {
        PORT: '4010',
        NODE_ENV: 'test',
        APP_NAME: 'env-api',
        APP_VERSION: '1.2.3',
        ENABLE_REQUEST_LOGGING: 'false',
      },
    );

    expect(config.port).toBe(4010);
    expect(config.nodeEnv).toBe('test');
    expect(config.appName).toBe('env-api');
    expect(config.appVersion).toBe('1.2.3');
    expect(config.enableRequestLogging).toBe(false);
  });

  it('applies overrides with highest precedence and freezes result', () => {
    const config = createApiConfig(
      { port: 4999, appName: 'override-api' },
      { PORT: '4010', APP_NAME: 'env-api' },
    );

    expect(config.port).toBe(4999);
    expect(config.appName).toBe('override-api');
    expect(Object.isFrozen(config)).toBe(true);
  });
});
