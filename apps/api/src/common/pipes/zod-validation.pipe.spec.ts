import { BadRequestException } from '@nestjs/common';
import { loginSchema } from '@erp/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe (Unit)', () => {
  const pipe = new ZodValidationPipe(loginSchema);

  it('normalizes valid input', () => {
    const out = pipe.transform({ email: '  OWNER@Company.com ', password: 'secret' });
    expect(out).toEqual({ email: 'owner@company.com', password: 'secret' });
  });

  it('throws structured fieldErrors on invalid input', () => {
    try {
      pipe.transform({ email: 'not-an-email', password: '' });
      fail('Expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const res: any = (err as BadRequestException).getResponse();
      expect(res.errorCode).toBe('VALIDATION_ERROR');
      expect(res.fieldErrors.email).toBeDefined();
      expect(res.fieldErrors.password).toBeDefined();
    }
  });
});
