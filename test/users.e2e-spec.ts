import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// CRUD de /api/users y las reglas de permiso que un test unitario con
// repositorio mockeado no puede probar de verdad: que RolesGuard bloquea a
// un REVENDEDOR contra el JWT real (con su rol real en el payload), y que
// el guard de admin-only cubre todo el módulo, no solo la escritura.
describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  const createdEmails: string[] = [];

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

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(201);
    adminAccessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      // Los usuarios de prueba que se loguearon dejaron refresh_tokens con
      // FK hacia ellos (mismo motivo por el que auth.e2e-spec.ts limpia
      // refresh_tokens antes de intentar borrar filas relacionadas).
      await dataSource.query(
        `DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [createdEmails],
      );
      await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [
        createdEmails,
      ]);
    }
    await app.close();
  });

  function uniqueEmail(prefix: string): string {
    const email = `${prefix}-${randomUUID()}@nocturne.dev`;
    createdEmails.push(email);
    return email;
  }

  it('CRUD completo: crear, listar sin password_hash, editar, desactivar, reactivar', async () => {
    const email = uniqueEmail('revendedor');

    const createRes = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ email, password: 'password123', name: 'Revendedor Test', role: 'revendedor' })
      .expect(201);
    expect(createRes.body).not.toHaveProperty('passwordHash');
    expect(createRes.body).not.toHaveProperty('password_hash');
    expect(createRes.body).toMatchObject({ email, role: 'revendedor', isActive: true });
    const userId = createRes.body.id;

    const listRes = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const listed = listRes.body.find((u: { id: string }) => u.id === userId);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty('passwordHash');
    expect(listed).not.toHaveProperty('password_hash');

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ name: 'Revendedor Editado' })
      .expect(200);
    expect(updateRes.body.name).toBe('Revendedor Editado');

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(deleteRes.body.isActive).toBe(false);

    const reactivateRes = await request(app.getHttpServer())
      .patch(`/api/users/${userId}/reactivate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(reactivateRes.body.isActive).toBe(true);
  });

  it('POST /api/users con email duplicado da 409', async () => {
    const email = uniqueEmail('duplicado');
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ email, password: 'password123', name: 'Uno', role: 'revendedor' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ email, password: 'otrapassword123', name: 'Dos', role: 'admin' })
      .expect(409);
  });

  it('un usuario REVENDEDOR recién creado puede loguearse y usar el token', async () => {
    const email = uniqueEmail('login-revendedor');
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ email, password: 'password123', name: 'Login Test', role: 'revendedor' })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    expect(loginRes.body.user).toMatchObject({ email, role: 'revendedor' });
  });

  describe('un REVENDEDOR no puede acceder a ningún endpoint de /api/users (403)', () => {
    let revendedorAccessToken: string;
    let revendedorId: string;

    beforeAll(async () => {
      const email = uniqueEmail('bloqueado');
      const createRes = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ email, password: 'password123', name: 'Bloqueado', role: 'revendedor' })
        .expect(201);
      revendedorId = createRes.body.id;

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);
      revendedorAccessToken = loginRes.body.accessToken;
    });

    it('GET /api/users → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${revendedorAccessToken}`)
        .expect(403);
    });

    it('GET /api/users/:id → 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/users/${revendedorId}`)
        .set('Authorization', `Bearer ${revendedorAccessToken}`)
        .expect(403);
    });

    it('POST /api/users → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${revendedorAccessToken}`)
        .send({ email: uniqueEmail('intruso'), password: 'password123', name: 'Intruso', role: 'admin' })
        .expect(403);
    });

    it('PATCH /api/users/:id → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/users/${revendedorId}`)
        .set('Authorization', `Bearer ${revendedorAccessToken}`)
        .send({ name: 'Intento de edición' })
        .expect(403);
    });

    it('DELETE /api/users/:id → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/api/users/${revendedorId}`)
        .set('Authorization', `Bearer ${revendedorAccessToken}`)
        .expect(403);
    });

    it('PATCH /api/users/:id/reactivate → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/users/${revendedorId}/reactivate`)
        .set('Authorization', `Bearer ${revendedorAccessToken}`)
        .expect(403);
    });
  });

  describe('auto-bloqueo: un admin no puede cambiarse su propio rol ni desactivarse', () => {
    it('PATCH /api/users/:propio-id con role → 403', async () => {
      const meRes = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const adminId = meRes.body.id;

      await request(app.getHttpServer())
        .patch(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'revendedor' })
        .expect(403);

      // El propio nombre sí se puede editar: el bloqueo es específico de `role`.
      await request(app.getHttpServer())
        .patch(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: meRes.body.name })
        .expect(200);
    });

    it('DELETE /api/users/:propio-id → 403', async () => {
      const meRes = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const adminId = meRes.body.id;

      await request(app.getHttpServer())
        .delete(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(403);
    });
  });
});
