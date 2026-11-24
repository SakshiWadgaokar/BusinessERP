import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { StorageService } from './storage.service';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/business_erp';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_32_characters_long';
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test_csrf_secret_32_characters_long_xx';
process.env.STORAGE_SIGNED_URL_SECRET =
  process.env.STORAGE_SIGNED_URL_SECRET || 'test_storage_secret_32_characters_long';

describe('StorageService (Unit)', () => {
  const service = new StorageService();

  it('rejects disallowed MIME types and oversized files', () => {
    expect(() => service.validateUpload('application/x-msdownload', 1024)).toThrow(
      BadRequestException,
    );
    expect(() => service.validateUpload('application/pdf', 0)).toThrow(BadRequestException);
    expect(() => service.validateUpload('application/pdf', 20 * 1024 * 1024)).toThrow(
      BadRequestException,
    );
    expect(() => service.validateUpload('application/pdf', 2048)).not.toThrow();
  });

  it('generates and verifies short-lived HMAC signed URLs and rejects tampering or expiry', async () => {
    const signed = await service.createShortLivedDownloadUrl({
      documentId: 'doc-123',
      storageKey: 'invoices/2026/sample.pdf',
      fileName: 'INV-2627-000001.pdf',
      ttlSeconds: 120,
    });
    const urlObj = new URL(`http://localhost${signed.url}`);
    const exp = Number(urlObj.searchParams.get('exp'));
    const sig = urlObj.searchParams.get('sig') || '';

    expect(() => service.verifyLocalDownloadSignature('doc-123', exp, sig)).not.toThrow();
    expect(() => service.verifyLocalDownloadSignature('doc-999', exp, sig)).toThrow(
      UnauthorizedException,
    );
    expect(() => service.verifyLocalDownloadSignature('doc-123', exp - 999999, sig)).toThrow(
      UnauthorizedException,
    );
  });
});
