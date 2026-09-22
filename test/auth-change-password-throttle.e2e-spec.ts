import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { RefreshTokensService } from '../src/auth/refresh-tokens.service.js';

// Aparte de auth-change-password.e2e-spec.ts por la misma razón que
// auth-throttle.e2e-spec.ts: tener su propia instancia de app (y por lo tanto
// su propio ThrottlerStorage en memoria), para que agotar el cupo de 5/min
// acá no afecte a los demás e2e.
describe('Auth — rate limit de change-password (e2e)', () => {
  const PASSWORD = 'throttle-password-123';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let refreshTokens: RefreshTokensService;
  let userId: string;
  let bearer: string;
  const email = `change-password-throttle-${randomUUID()}@nocturne.dev`;

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
    refreshTokens = app.get(RefreshTokensService);

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const [user] = await dataSource.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, 'Usuario Throttle', 'revendedor')
       RETURNING id`,
      [email, passwordHash],
    );
    userId = user.id;
    bearer = `Bearer ${await app.get(JwtService).signAsync({
      sub: userId,
      email,
      role: 'revendedor',
    })}`;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM refresh_tokens WHERE user_id = $1', [
      userId,
    ]);
    await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    await app.close();
  });

  function attempt(currentPassword: string) {
    return request(app.getHttpServer())
      .patch('/api/auth/change-password')
      .set('Authorization', bearer)
      .send({ currentPassword, newPassword: 'otra-password-456' });
  }

  it('permite 5 intentos por minuto por IP y bloquea el 6to con 429, sin cambiar nada', async () => {
    const session = await refreshTokens.create(userId);
    const [{ password_hash: hashBefore }] = await dataSource.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );

    // Las requests sin token (401) no consumen cupo: JwtAuthGuard va antes
    // que el throttler, así que tráfico anónimo no agota el de nadie.
    for (let i = 0; i < 8; i++) {
      await request(app.getHttpServer())
        .patch('/api/auth/change-password')
        .send({ currentPassword: 'x', newPassword: 'otra-password-456' })
        .expect(401);
    }

    for (let i = 0; i < 5; i++) {
      const res = await attempt('contraseña-equivocada');
      expect(res.status).toBe(400);
    }

    // El 6to lleva la contraseña actual CORRECTA: si llegara al servicio la
    // cambiaría. El rate limit tiene que cortarlo antes.
    const res = await attempt(PASSWORD).expect(429);
    expect(res.body.message).toMatch(/intentos de cambio de contraseña/i);

    const [{ password_hash: hashAfter }] = await dataSource.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    expect(hashAfter).toBe(hashBefore);
    // Y la sesión sigue viva: no se revocó nada.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: session })
      .expect(201);
  });

  it('el contador es independiente del de login: agotar change-password no bloquea el login', async () => {
    // El test anterior ya agotó el cupo de change-password de esta instancia.
    await attempt(PASSWORD).expect(429);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
  });
});
