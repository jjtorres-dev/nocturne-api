import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Multi-usuario — Fase B5 (mismo patrón que Servicios/Contactos/Cuentas/
// Ventas, Fase B1/B2/B3/B4). La arista extra de este módulo: el many-to-many
// `servicios` de un Combo debe pertenecer ENTERO al mismo dueño — no se
// puede mezclar catálogo de dos revendedores distintos en un mismo combo.
//
// userA/userB (y sus Servicios base) se crean UNA sola vez en beforeAll y se
// reusan en todos los `it` — mismo motivo de rate limit de POST /auth/login
// que en los módulos anteriores.
describe('Combos — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };
  let serviceA1: { id: string };
  let serviceA2: { id: string };
  let serviceB1: { id: string };
  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdComboIds: string[] = [];

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

    userA = await createRevendedor('combo-owner-a');
    userB = await createRevendedor('combo-owner-b');

    serviceA1 = await createService(userA.accessToken, `Servicio Combo A1 ${randomUUID()}`);
    serviceA2 = await createService(userA.accessToken, `Servicio Combo A2 ${randomUUID()}`);
    serviceB1 = await createService(userB.accessToken, `Servicio Combo B1 ${randomUUID()}`);
  });

  afterAll(async () => {
    if (createdComboIds.length > 0) {
      await dataSource.query('DELETE FROM combo_servicios WHERE combo_id = ANY($1)', [
        createdComboIds,
      ]);
      await dataSource.query('DELETE FROM combos WHERE id = ANY($1)', [
        createdComboIds,
      ]);
    }
    if (createdServiceIds.length > 0) {
      await dataSource.query('DELETE FROM services WHERE id = ANY($1)', [
        createdServiceIds,
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

  async function createService(accessToken: string, nombre: string) {
    const res = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nombre, tipo: 'SIN_PERFILES', duracionMeses: 1, precioBase: 10 })
      .expect(201);
    createdServiceIds.push(res.body.id);
    return res.body;
  }

  async function createCombo(
    accessToken: string,
    servicioIds: string[],
    expectStatus = 201,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/combos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nombre: `Combo E2E ${randomUUID()}`,
        servicioIds,
        precioCombo: 30,
      })
      .expect(expectStatus);
    if (res.body.id) {
      createdComboIds.push(res.body.id);
    }
    return res.body;
  }

  it('un REVENDEDOR no puede ver, editar ni desactivar un Combo ajeno (404), y su listado nunca lo incluye', async () => {
    const comboA = await createCombo(userA.accessToken, [serviceA1.id, serviceA2.id]);
    // POST no incluye `owner` poblado (mismo criterio que Servicios/
    // Contactos/Cuentas/Ventas: el join solo lo hacen findOneOwned/
    // findAllOwned), pero sí `ownerId`.
    expect(comboA.ownerId).toBe(userA.id);

    await request(app.getHttpServer())
      .get(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ precioCombo: 99 })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/combos/${comboA.id}/reactivate`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/api/combos')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(listB.body.some((c: { id: string }) => c.id === comboA.id)).toBe(false);

    // Control positivo.
    await request(app.getHttpServer())
      .get(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    // Admin puede editar y desactivar el combo de A.
    await request(app.getHttpServer())
      .patch(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ precioCombo: 35 })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
  });

  it('crear un combo mezclando un servicio propio con uno ajeno da 404, no se crea nada', async () => {
    const [{ count: antes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combos',
    );

    await createCombo(userA.accessToken, [serviceA1.id, serviceB1.id], 404);

    const [{ count: despues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combos',
    );
    expect(despues).toBe(antes);
  });

  it('update: reasignar un servicio ajeno da 404, sin importar quién edite (admin incluido)', async () => {
    const comboA = await createCombo(userA.accessToken, [serviceA1.id, serviceA2.id]);

    // El admin edita un combo de A intentando meterle un servicio de B: el
    // criterio de ownership es el dueño del COMBO (A), no quien edita.
    await request(app.getHttpServer())
      .patch(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ servicioIds: [serviceA1.id, serviceB1.id] })
      .expect(404);

    // El combo sigue con sus servicios originales.
    const detalle = await request(app.getHttpServer())
      .get(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(detalle.body.servicios.map((s: { id: string }) => s.id).sort()).toEqual(
      [serviceA1.id, serviceA2.id].sort(),
    );

    await request(app.getHttpServer())
      .delete(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('el admin ve los combos de ambos revendedores en el listado, con owner poblado', async () => {
    const comboA = await createCombo(userA.accessToken, [serviceA1.id, serviceA2.id]);

    const listAdmin = await request(app.getHttpServer())
      .get('/api/combos')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const encontrado = listAdmin.body.find(
      (c: { id: string; owner?: { id: string } }) => c.id === comboA.id,
    );
    expect(encontrado).toBeDefined();
    expect(encontrado.owner).toMatchObject({ id: userA.id });

    await request(app.getHttpServer())
      .delete(`/api/combos/${comboA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });
});
