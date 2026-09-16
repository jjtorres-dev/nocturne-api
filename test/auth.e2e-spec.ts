import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Cubre POST /auth/login, /auth/refresh y /auth/logout. El rate limit de
// login vive aparte (test/auth-throttle.e2e-spec.ts) para no competir por
// la misma ventana de 5 intentos/minuto con los logins que este archivo
// necesita para preparar cada caso.
describe('Auth — refresh tokens (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    dataSource = app.get(DataSource);

    const [user] = await dataSource.query(
      'SELECT id FROM users WHERE email = $1',
      [process.env.ADMIN_EMAIL],
    );
    userId = user.id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM refresh_tokens WHERE user_id = $1', [
      userId,
    ]);
    await app.close();
  });

  it('POST /auth/login devuelve accessToken, refreshToken y user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(201);

    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken).toContain(':');
    expect(res.body.user).toMatchObject({ email: process.env.ADMIN_EMAIL });
  });

  it('POST /auth/refresh rota el refresh token — el viejo deja de servir', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(201);
    const oldRefreshToken = loginRes.body.refreshToken as string;

    const refreshRes = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(201);

    expect(typeof refreshRes.body.accessToken).toBe('string');
    expect(typeof refreshRes.body.refreshToken).toBe('string');
    expect(refreshRes.body.refreshToken).not.toBe(oldRefreshToken);

    // El refresh token viejo ya fue rotado (revocado): reusarlo (el caso de
    // un token "ya usado") tiene que dar 401, no volver a rotar.
    const reuseRes = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
    expect(reuseRes.body.message).toBe(
      'Sesión expirada, inicia sesión de nuevo',
    );
  });

  it('POST /auth/refresh con un token vencido da 401', async () => {
    const secret = randomBytes(48).toString('hex');
    const tokenHash = await bcrypt.hash(secret, 10);
    const [{ id }] = await dataSource.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked)
       VALUES ($1, $2, now() - interval '1 hour', false)
       RETURNING id`,
      [userId, tokenHash],
    );

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: `${id}:${secret}` })
      .expect(401);
    expect(res.body.message).toBe('Sesión expirada, inicia sesión de nuevo');
  });

  it('POST /auth/logout revoca el refresh token — ya no sirve para refresh', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(201);
    const { accessToken, refreshToken } = loginRes.body;

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);
    expect(res.body.message).toBe('Sesión expirada, inicia sesión de nuevo');
  });

  it('POST /auth/logout sin access token válido da 401 (protegido con JwtAuthGuard)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({ refreshToken: 'cualquier-cosa' })
      .expect(401);
  });
});
