import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  forgotSchema,
  loginSchema,
  registerSchema,
  resetSchema,
  updateMeSchema,
} from './auth';

const good = { email: 'A@Example.com', password: 'correct-horse-1', name: 'Ada' };

describe('registerSchema', () => {
  it('lowercases the email and accepts valid input', () => {
    expect(registerSchema.parse(good)).toEqual({ ...good, email: 'a@example.com' });
  });
  it('enforces password 10..200', () => {
    expect(registerSchema.safeParse({ ...good, password: 'x'.repeat(9) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...good, password: 'x'.repeat(10) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...good, password: 'x'.repeat(200) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...good, password: 'x'.repeat(201) }).success).toBe(false);
  });
  it('enforces name 1..100', () => {
    expect(registerSchema.safeParse({ ...good, name: '' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...good, name: 'n'.repeat(100) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...good, name: 'n'.repeat(101) }).success).toBe(false);
  });
  it('rejects invalid email', () => {
    expect(registerSchema.safeParse({ ...good, email: 'nope' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('trims and lowercases email, does not enforce PASSWORD_MIN', () => {
    expect(loginSchema.parse({ email: '  A@Example.com ', password: 'x' })).toEqual({
      email: 'a@example.com',
      password: 'x',
    });
  });
  it('rejects empty or over-long password', () => {
    expect(loginSchema.safeParse({ email: 'a@example.com', password: '' }).success).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'a@example.com', password: 'x'.repeat(201) }).success,
    ).toBe(false);
  });
});

describe('forgotSchema', () => {
  it('normalises the email', () => {
    expect(forgotSchema.parse({ email: 'A@Example.com' })).toEqual({ email: 'a@example.com' });
  });
});

describe('resetSchema', () => {
  it('requires token and a valid new password', () => {
    expect(resetSchema.safeParse({ token: 't', password: 'correct-horse-1' }).success).toBe(true);
    expect(resetSchema.safeParse({ token: '', password: 'correct-horse-1' }).success).toBe(false);
    expect(resetSchema.safeParse({ token: 't', password: 'short' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('applies register rules to newPassword only', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'correct-horse-1' })
        .success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'correct-horse-1' })
        .success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'short' }).success,
    ).toBe(false);
  });
});

describe('updateMeSchema', () => {
  it('accepts an empty object and each field', () => {
    expect(updateMeSchema.safeParse({}).success).toBe(true);
    expect(
      updateMeSchema.safeParse({
        name: 'Ada',
        avatarUrl: 'https://example.com/a.png',
        locale: 'zh-CN',
        theme: 'dark',
        timezone: 'Europe/Paris',
      }).success,
    ).toBe(true);
    expect(updateMeSchema.safeParse({ avatarUrl: null }).success).toBe(true);
  });
  it('rejects unknown keys', () => {
    expect(updateMeSchema.safeParse({ email: 'a@example.com' }).success).toBe(false);
  });
  it('rejects bad values', () => {
    expect(updateMeSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ avatarUrl: 'http://example.com/a.png' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ avatarUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ locale: 'xx' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ theme: 'neon' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ timezone: '' }).success).toBe(false);
  });
});
