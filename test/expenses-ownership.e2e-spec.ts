import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Multi-usuario — Fase B6: mismo patrón que Servicios/Contactos (Fase
// B1/B2) — módulo simple, sin referencias cruzadas a validar (a diferencia
// de Cuentas/Ventas/Combos). userA/userB se crean UNA sola vez en
// beforeAll y se reusan en todos los `it` — mismo motivo de rate limit de
// POST /auth/login que en los módulos anteriores.
describe('Expenses — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };
  const createdUserEmails: string[] = [];
  const createdExpenseIds: string[] = [];

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

    userA = await createRevendedor('expense-owner-a');
    userB = await createRevendedor('expense-owner-b');
  });

  afterAll(async () => {
    if (createdExpenseIds.length > 0) {
      await dataSource.query('DELETE FROM expenses WHERE id = ANY($1)', [
        createdExpenseIds,
      ]);
    }
    if (createdUserEmails.length > 0) {
      await dataSource.query(
        `DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [createdUserEmails],
      );
      await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [
        createdUserEmails,
      ]);
    }
    await app.close();
  });

  async function createRevendedor(
    prefix: string,
  ): Promise<{ id: string; name: string; email: string; accessToken: string }> {
    const email = `${prefix}-${randomUUID()}@nocturne.dev`;
    createdUserEmails.push(email);
    const createRes = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ email, password: 'password123', name: prefix, role: 'revendedor' })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    return {
      id: createRes.body.id,
      name: prefix,
      email,
      accessToken: loginRes.body.accessToken,
    };
  }

  async function createExpense(accessToken: string, descripcion: string) {
    const res = await request(app.getHttpServer())
      .post('/api/expenses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        descripcion,
        monto: 15,
        moneda: 'PEN',
        metodoPago: 'Yape',
        fecha: '2026-01-05',
      })
      .expect(201);
    createdExpenseIds.push(res.body.id);
    return res.body;
  }

  it('un REVENDEDOR no puede ver, editar, desactivar ni reactivar un gasto ajeno (404, no 403), y su listado nunca lo incluye', async () => {
    const gastoA = await createExpense(userA.accessToken, `Gasto de A ${randomUUID()}`);
    expect(gastoA.ownerId).toBe(userA.id);

    await request(app.getHttpServer())
      .get(`/api/expenses/${gastoA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/expenses/${gastoA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ descripcion: 'Intento de edición ajena' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/expenses/${gastoA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/expenses/${gastoA.id}/reactivate`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/api/expenses')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(listB.body.some((g: { id: string }) => g.id === gastoA.id)).toBe(false);

    // Control positivo: A sigue viendo y pudiendo tocar lo propio.
    await request(app.getHttpServer())
      .get(`/api/expenses/${gastoA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    const listA = await request(app.getHttpServer())
      .get('/api/expenses')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(listA.body.some((g: { id: string }) => g.id === gastoA.id)).toBe(true);
  });

  it('GET /:id y GET / siempre incluyen owner {id, name, email}, igual para el dueño y para el admin', async () => {
    const gastoA = await createExpense(userA.accessToken, `Gasto con owner ${randomUUID()}`);
    const ownerEsperado = { id: userA.id, name: userA.name, email: userA.email };

    const getComoDuenio = await request(app.getHttpServer())
      .get(`/api/expenses/${gastoA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(getComoDuenio.body.owner).toEqual(ownerEsperado);

    const getComoAdmin = await request(app.getHttpServer())
      .get(`/api/expenses/${gastoA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(getComoAdmin.body.owner).toEqual(ownerEsperado);

    // Nunca se filtra por acá el password_hash del dueño — solo id/name/email.
    expect(getComoAdmin.body.owner).not.toHaveProperty('passwordHash');
    expect(getComoAdmin.body.owner).not.toHaveProperty('password_hash');
    expect(getComoAdmin.body.owner).not.toHaveProperty('role');
  });

  it('el admin ve y puede tocar los gastos de ambos revendedores', async () => {
    const gastoA = await createExpense(userA.accessToken, `Gasto admin-view A ${randomUUID()}`);
    const gastoB = await createExpense(userB.accessToken, `Gasto admin-view B ${randomUUID()}`);

    const listAdmin = await request(app.getHttpServer())
      .get('/api/expenses')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const idsVistosPorAdmin = listAdmin.body.map((g: { id: string }) => g.id);
    expect(idsVistosPorAdmin).toContain(gastoA.id);
    expect(idsVistosPorAdmin).toContain(gastoB.id);

    await request(app.getHttpServer())
      .patch(`/api/expenses/${gastoA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ monto: 30 })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/expenses/${gastoB.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/expenses/${gastoB.id}/reactivate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
  });
});
