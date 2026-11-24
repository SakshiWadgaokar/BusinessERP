import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getEnv } from '../config/env';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]);

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export interface StoredFileResult {
  storageKey: string;
  storageBucket: string;
  fileSizeBytes: number;
  checksumSha256: string;
}

@Injectable()
export class StorageService {
  private readonly env = getEnv();
  private readonly s3Client: S3Client | null;

  constructor() {
    if (this.env.STORAGE_DRIVER === 's3') {
      this.s3Client = new S3Client({
        region: this.env.S3_REGION,
        endpoint: this.env.S3_ENDPOINT || undefined,
        forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
        credentials:
          this.env.S3_ACCESS_KEY_ID && this.env.S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: this.env.S3_ACCESS_KEY_ID,
                secretAccessKey: this.env.S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
    } else {
      this.s3Client = null;
    }
  }

  validateUpload(mimeType: string, sizeBytes: number) {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
    if (sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('File size must be between 1 byte and 15 MB.');
    }
  }

  async putPrivateObject(params: {
    folder: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  }): Promise<StoredFileResult> {
    this.validateUpload(params.mimeType, params.buffer.length);

    const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniquePrefix = crypto.randomBytes(12).toString('hex');
    const storageKey = `${params.folder}/${new Date().getUTCFullYear()}/${uniquePrefix}-${safeName}`;
    const checksumSha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');

    if (this.env.STORAGE_DRIVER === 's3' && this.s3Client) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: storageKey,
          Body: params.buffer,
          ContentType: params.mimeType,
          ServerSideEncryption: 'AES256',
        }),
      );
      return {
        storageKey,
        storageBucket: this.env.S3_BUCKET,
        fileSizeBytes: params.buffer.length,
        checksumSha256,
      };
    }

    // Local private storage driver (never served statically; requires HMAC-signed token)
    const rootDir = this.getLocalRootDir();
    const fullPath = path.resolve(rootDir, storageKey);
    if (!fullPath.startsWith(rootDir)) {
      throw new BadRequestException('Invalid storage path.');
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.buffer);

    return {
      storageKey,
      storageBucket: 'local_private',
      fileSizeBytes: params.buffer.length,
      checksumSha256,
    };
  }

  private getLocalRootDir(): string {
    if (process.env.VERCEL && !path.isAbsolute(this.env.STORAGE_LOCAL_DIR)) {
      return path.resolve('/tmp', 'erp-storage');
    }
    return path.resolve(this.env.STORAGE_LOCAL_DIR);
  }

  async createShortLivedDownloadUrl(params: {
    documentId: string;
    storageKey: string;
    fileName: string;
    ttlSeconds?: number;
  }): Promise<{ url: string; expiresAt: string }> {
    const ttl = params.ttlSeconds ?? this.env.STORAGE_SIGNED_URL_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    if (this.env.STORAGE_DRIVER === 's3' && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: params.storageKey,
        ResponseContentDisposition: `inline; filename="${params.fileName.replace(/"/g, '')}"`,
      });
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: ttl });
      return { url, expiresAt: expiresAt.toISOString() };
    }

    const expUnix = Math.floor(expiresAt.getTime() / 1000);
    const sig = this.signLocalToken(params.documentId, expUnix);
    const baseApi = `/${this.env.API_PREFIX}/documents/${params.documentId}/stream?exp=${expUnix}&sig=${sig}`;
    return { url: baseApi, expiresAt: expiresAt.toISOString() };
  }

  verifyLocalDownloadSignature(documentId: string, expUnix: number, sig: string): void {
    if (!expUnix || expUnix < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Download link has expired.');
    }
    const expected = this.signLocalToken(documentId, expUnix);
    const sigBuf = Buffer.from(sig || '', 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid download signature.');
    }
  }

  async readLocalPrivateObject(storageKey: string): Promise<Buffer> {
    const rootDir = this.getLocalRootDir();
    const fullPath = path.resolve(rootDir, storageKey);
    if (!fullPath.startsWith(rootDir)) {
      throw new BadRequestException('Invalid storage path.');
    }
    return fs.readFile(fullPath);
  }

  private signLocalToken(documentId: string, expUnix: number): string {
    return crypto
      .createHmac('sha256', this.env.STORAGE_SIGNED_URL_SECRET)
      .update(`${documentId}:${expUnix}`)
      .digest('hex');
  }
}
