import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { SequenceService } from '../src/common/services/sequence.service';
import { getEnv } from '../src/common/config/env';

jest.setTimeout(30000);

describe('Phase 2 Foundation (E2E)', () => {
  let app: INestApplication;
  const env = getEnv();
  const prefix = `/${env.API_PREFIX}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix(env.API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health and /health/ready confirm live API and PostgreSQL connection', async () => {
    const live = await request(app.getHttpServer()).get(`${prefix}/health`).expect(200);
    expect(live.body.status).toBe('ok');

    const ready = await request(app.getHttpServer()).get(`${prefix}/health/ready`).expect(200);
    expect(ready.body.database).toBe('up');
  });

  it('rejects unauthenticated access to protected endpoints', async () => {
    await request(app.getHttpServer()).get(`${prefix}/users`).expect(401);
  });

  it('authenticates seeded Super Admin, rotates refresh session, and writes audit log', async () => {
    const email = process.env.SEED_SUPER_ADMIN_EMAIL || 'owner@businesserp.local';
    const password = process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe@2026!';

    const loginRes = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email, password })
      .expect(200);

    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.user.roles).toContain('SUPER_ADMIN');
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Access /auth/me with Bearer token
    const meRes = await request(app.getHttpServer())
      .get(`${prefix}/auth/me`)
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);
    expect(meRes.body.email).toBe(email.toLowerCase());

    // Refresh session with CSRF header
    const refreshRes = await request(app.getHttpServer())
      .post(`${prefix}/auth/refresh`)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', loginRes.body.csrfToken)
      .expect(200);
    expect(refreshRes.body.accessToken).toBeDefined();

    // Verify audit logs contain AUTH_LOGIN_SUCCESS
    const logsRes = await request(app.getHttpServer())
      .get(`${prefix}/audit-logs?action=AUTH_LOGIN_SUCCESS`)
      .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
      .expect(200);
    expect(logsRes.body.data.length).toBeGreaterThan(0);
  });

  it('generates strictly unique document sequences under concurrent requests', async () => {
    const seq = app.get(SequenceService);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => seq.next('SCRAP', undefined, { yearOnly: true })),
    );
    const unique = new Set(results);
    expect(unique.size).toBe(10);
    for (const code of results) {
      expect(code).toMatch(/^SCRAP-\d{4}-\d{6}$/);
    }
  });
});
