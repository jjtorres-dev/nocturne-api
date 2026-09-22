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

// PATCH /auth/change-password contra Postgres real. Se usa un usuario propio
// (REVENDEDOR, para probar de paso que no es solo-admin) en vez del admin
// del seed: cambiarle la contraseña al admin rompería el login de los demás
// e2e y del desarrollo local.
//
// El rate limit de este endpoint vive aparte
// (auth-change-password-throttle.e2e-spec.ts), y este archivo usa pocos
// intentos a propósito: los access tokens se firman con JwtService y las
// sesiones "de otros dispositivos" se crean con RefreshTokensService, en vez
// de pasar por POST /auth/login, para no consumir su cupo de 5/min ni el de
// change-password (4 usados acá).
describe('Auth — change-password (e2e)', () => {
  const OLD_PASSWORD = 'old-password-123';
  const NEW_PASSWORD = 'new-password-456';

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let refreshTokens: RefreshTokensService;
  let jwtService: JwtService;
  let userId: string;
  let authorization: string;
  const email = `change-password-${randomUUID()}@nocturne.dev`;

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
    jwtService = app.get(JwtService);

    const passwordHash = await bcrypt.hash(OLD_PASSWORD, 10);
    const [user] = await dataSource.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, 'Usuario Change Password', 'revendedor')
       RETURNING id`,
      [email, passwordHash],
    );
    userId = user.id;
    authorization = `Bearer ${await jwtService.signAsync({
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

  function login(password: string) {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
  }

  function refresh(refreshToken: string) {
    return request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken });
  }

  function changePassword(currentPassword: string, newPassword: string) {
    return request(app.getHttpServer())
      .patch('/api/auth/change-password')
      .set('Authorization', authorization)
      .send({ currentPassword, newPassword });
  }

  async function clearTokens() {
    await dataSource.query('DELETE FROM refresh_tokens WHERE user_id = $1', [
      userId,
    ]);
  }

  async function passwordHashInDb(): Promise<string> {
    const [row] = await dataSource.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    return row.password_hash;
  }

  async function activeTokensInDb(): Promise<number> {
    const [row] = await dataSource.query(
      'SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked = false',
      [userId],
    );
    return row.n;
  }

  it('sin access token da 401 (protegido con JwtAuthGuard)', async () => {
    await request(app.getHttpServer())
      .patch('/api/auth/change-password')
      .send({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
  });

  it('valida el body: newPassword de menos de 8 caracteres da 400 y no toca nada', async () => {
    await clearTokens();
    const session = await refreshTokens.create(userId);
    const before = await passwordHashInDb();

    await changePassword(OLD_PASSWORD, 'corta').expect(400);

    expect(await passwordHashInDb()).toBe(before);
    expect(await activeTokensInDb()).toBe(1);
    await refresh(session).expect(201);
  });

  it('con la contraseña actual incorrecta da 400 con mensaje claro y no revoca ni cambia nada', async () => {
    await clearTokens();
    const session = await refreshTokens.create(userId);
    const before = await passwordHashInDb();

    const res = await changePassword('no-es-la-actual', NEW_PASSWORD).expect(
      400,
    );

    expect(res.body.message).toBe('La contraseña actual no es correcta');
    expect(await passwordHashInDb()).toBe(before);
    expect(await activeTokensInDb()).toBe(1);
    // La sesión sigue funcionando y la contraseña vieja sigue siendo la válida.
    await refresh(session).expect(201);
    expect(await bcrypt.compare(OLD_PASSWORD, await passwordHashInDb())).toBe(
      true,
    );
  });

  it('si la revocación de tokens falla, la contraseña NO queda cambiada (rollback real de la transacción)', async () => {
    await clearTokens();
    const sessionA = await refreshTokens.create(userId);
    const sessionB = await refreshTokens.create(userId);
    const hashBefore = await passwordHashInDb();
    expect(await activeTokensInDb()).toBe(2);

    // El fallo ocurre DESPUÉS de que el UPDATE de la contraseña ya corrió
    // dentro de la transacción: si no hubiera transacción, quedaría cambiada.
    const revokeSpy = vi
      .spyOn(refreshTokens, 'revokeAllForUser')
      .mockRejectedValueOnce(new Error('fallo simulado en la revocación'));
    try {
      await changePassword(OLD_PASSWORD, NEW_PASSWORD).expect(500);
      expect(revokeSpy).toHaveBeenCalledTimes(1);
    } finally {
      revokeSpy.mockRestore();
    }

    // Ni la contraseña cambió ni algún token se tocó.
    expect(await passwordHashInDb()).toBe(hashBefore);
    expect(await bcrypt.compare(OLD_PASSWORD, hashBefore)).toBe(true);
    expect(await activeTokensInDb()).toBe(2);
    await refresh(sessionA).expect(201);
    await refresh(sessionB).expect(201);
  });

  it('un cambio exitoso revoca TODOS los refresh tokens previos y la nueva contraseña sirve para loguearse', async () => {
    // Arma 3 sesiones: una por login real y dos simuladas (otros dispositivos).
    await clearTokens();
    const loginRes = await login(OLD_PASSWORD).expect(201);
    const deviceB = await refreshTokens.create(userId);
    const deviceC = await refreshTokens.create(userId);
    expect(await activeTokensInDb()).toBe(3);

    const res = await changePassword(OLD_PASSWORD, NEW_PASSWORD).expect(200);
    expect(res.body).toEqual({ message: 'Contraseña actualizada' });

    // Ninguna de las tres sesiones (incluida la actual) puede renovarse.
    expect(await activeTokensInDb()).toBe(0);
    for (const token of [loginRes.body.refreshToken, deviceB, deviceC]) {
      const refreshRes = await refresh(token).expect(401);
      expect(refreshRes.body.message).toBe(
        'Sesión expirada, inicia sesión de nuevo',
      );
    }

    // La contraseña vieja ya no sirve; la nueva sí.
    await login(OLD_PASSWORD).expect(401);
    const newLogin = await login(NEW_PASSWORD).expect(201);
    expect(newLogin.body.user).toMatchObject({ email, role: 'revendedor' });
    expect(typeof newLogin.body.accessToken).toBe('string');
  });

  it('el hash guardado cambió y no es la contraseña en texto plano', async () => {
    const hash = await passwordHashInDb();

    expect(hash).not.toContain(NEW_PASSWORD);
    expect(await bcrypt.compare(NEW_PASSWORD, hash)).toBe(true);
    expect(await bcrypt.compare(OLD_PASSWORD, hash)).toBe(false);
  });
});
