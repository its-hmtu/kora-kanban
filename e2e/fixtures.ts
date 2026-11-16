import { test as base, expect } from '@playwright/test';

// Stub: custom fixtures (auth, seeded boards, ...) are added in T046.
export const test = base.extend({});
export { expect };
