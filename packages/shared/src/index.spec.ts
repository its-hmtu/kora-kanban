import { describe, expect, it } from 'vitest';
import * as shared from './index';

describe('@kora/shared entry', () => {
  it('exports VERSION', () => {
    expect(shared.VERSION).toBe('0.0.0');
  });
});
