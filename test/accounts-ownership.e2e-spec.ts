import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Multi-usuario — Fase B3 (mismo patrón que Servicios/Contactos, Fase
// B1/B2), con la arista extra de este módulo: Cuentas referencia
// Servicio/Proveedor por FK, y esas referencias tienen que pertenecer al
// mismo dueño que la Cuenta — nunca se puede "importar" catálogo ajeno.
// Perfiles no tiene ownerId propio: su scoping deriva de la Cuenta padre.
//
// userA/userB (y sus Servicios/Contactos base) se crean UNA sola vez en
// beforeAll y se reusan en todos los `it` — ver el mismo comentario en
// services-ownership.e2e-spec.ts sobre el rate limit de POST /auth/login.
describe('Accounts + Profiles — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };
  let serviceA: { id: string; ownerId: string };
  let serviceA2: { id: string; ownerId: string };
  let serviceB: { id: string; ownerId: string };
  let contactB: { id: string; ownerId: string };
  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdContactIds: string[] = [];
  const createdAccountIds: string[] = [];

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

    userA = await createRevendedor('acc-owner-a');
    userB = await createRevendedor('acc-owner-b');
    serviceA = await createService(userA.accessToken, `Servicio A ${randomUUID()}`);
    serviceA2 = await createService(userA.accessToken, `Servicio A2 ${randomUUID()}`);
    serviceB = await createService(userB.accessToken, `Servicio B ${randomUUID()}`);
    contactB = await createContact(userB.accessToken, `Proveedor B ${randomUUID()}`);
  });

  afterAll(async () => {
    if (createdAccountIds.length > 0) {
      await dataSource.query(
        'DELETE FROM profiles WHERE cuenta_id = ANY($1)',
        [createdAccountIds],
      );
      await dataSource.query('DELETE FROM account_payments WHERE cuenta_id = ANY($1)', [
        createdAccountIds,
      ]);
      await dataSource.query('DELETE FROM accounts WHERE id = ANY($1)', [
        createdAccountIds,
      ]);
    }
    if (createdContactIds.length > 0) {
      await dataSource.query('DELETE FROM contacts WHERE id = ANY($1)', [
        createdContactIds,
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
      .send({
        email,
        password: 'password123',
        name: prefix,
        role: 'revendedor',
      })
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

  async function createService(
    accessToken: string,
    nombre: string,
    pantallasMax?: number,
  ): Promise<{ id: string; ownerId: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nombre,
        tipo: 'CON_PERFILES',
        duracionMeses: 1,
        precioBase: 10,
        ...(pantallasMax !== undefined ? { pantallasMax } : {}),
      })
      .expect(201);
    createdServiceIds.push(res.body.id);
    return res.body;
  }

  async function createContact(
    accessToken: string,
    nombre: string,
  ): Promise<{ id: string; ownerId: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nombre, whatsapp: '+51999999999', tipo: 'PROVEEDOR' })
      .expect(201);
    createdContactIds.push(res.body.id);
    return res.body;
  }

  async function createAccount(
    accessToken: string,
    servicioId: string,
    extra: Record<string, unknown> = {},
    expectStatus = 201,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        servicioId,
        correo: `${randomUUID()}@nocturne.dev`,
        claveServicio: 'clave-servicio',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 10,
        metodoPago: 'transferencia',
        ...extra,
      })
      .expect(expectStatus);
    if (res.body.id) {
      createdAccountIds.push(res.body.id);
    }
    return res.body;
  }

  it('un REVENDEDOR no puede ver, editar ni desactivar una Cuenta ajena (404), y su listado nunca la incluye', async () => {
    const accountA = await createAccount(userA.accessToken, serviceA.id);
    expect(accountA.ownerId).toBe(userA.id);

    await request(app.getHttpServer())
      .get(`/api/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ costo: 999 })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/api/accounts')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(listB.body.some((a: { id: string }) => a.id === accountA.id)).toBe(
      false,
    );

    // Control positivo: A sigue viendo lo propio, y el admin ve todo.
    await request(app.getHttpServer())
      .get(`/api/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    const getComoAdmin = await request(app.getHttpServer())
      .get(`/api/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(getComoAdmin.body.owner).toMatchObject({ id: userA.id });
  });

  it('un REVENDEDOR no puede ver ni editar un Perfil dentro de una Cuenta ajena (404)', async () => {
    const accountA = await createAccount(userA.accessToken, serviceA.id);
    const profileRes = await request(app.getHttpServer())
      .post(`/api/accounts/${accountA.id}/profiles`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ nombre: 'Perfil de A' })
      .expect(201);
    const profileId = profileRes.body.id;

    await request(app.getHttpServer())
      .get(`/api/accounts/${accountA.id}/profiles/${profileId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/accounts/${accountA.id}/profiles/${profileId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ nombre: 'Hackeado' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/accounts/${accountA.id}/profiles`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    // Control positivo: A sigue viendo su propio perfil.
    await request(app.getHttpServer())
      .get(`/api/accounts/${accountA.id}/profiles/${profileId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('un REVENDEDOR no puede crear una Cuenta referenciando un Servicio o Proveedor de otro dueño (404, no se crea nada)', async () => {
    const correoIntentoServicio = `intento-servicio-${randomUUID()}@nocturne.dev`;
    await createAccount(
      userA.accessToken,
      serviceB.id,
      { correo: correoIntentoServicio },
      404,
    );
    const [{ count: countServicio }] = await dataSource.query(
      'SELECT count(*)::int FROM accounts WHERE correo = $1',
      [correoIntentoServicio],
    );
    expect(countServicio).toBe(0);

    const correoIntentoProveedor = `intento-proveedor-${randomUUID()}@nocturne.dev`;
    await createAccount(
      userA.accessToken,
      serviceA.id,
      { proveedorId: contactB.id, correo: correoIntentoProveedor },
      404,
    );
    const [{ count: countProveedor }] = await dataSource.query(
      'SELECT count(*)::int FROM accounts WHERE correo = $1',
      [correoIntentoProveedor],
    );
    expect(countProveedor).toBe(0);
  });

  it('el admin puede reasignar el servicio de una Cuenta a otro servicio del MISMO dueño, pero no a uno de otro dueño', async () => {
    const accountA = await createAccount(userA.accessToken, serviceA.id);

    // Mismo dueño (A): funciona.
    const okRes = await request(app.getHttpServer())
      .patch(`/api/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ servicioId: serviceA2.id })
      .expect(200);
    expect(okRes.body.servicioId).toBe(serviceA2.id);
    expect(okRes.body.ownerId).toBe(userA.id);

    // Otro dueño (B): 404, la cuenta sigue siendo de A con su servicio anterior.
    await request(app.getHttpServer())
      .patch(`/api/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ servicioId: serviceB.id })
      .expect(404);

    const getRes = await request(app.getHttpServer())
      .get(`/api/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(getRes.body.servicioId).toBe(serviceA2.id);
    expect(getRes.body.ownerId).toBe(userA.id);
  });

  it('el límite de pantallasMax sigue funcionando igual tras agregar ownership', async () => {
    const serviceLimitado = await createService(
      userA.accessToken,
      `Servicio limitado ${randomUUID()}`,
      1,
    );
    const accountLimitada = await createAccount(userA.accessToken, serviceLimitado.id);

    await request(app.getHttpServer())
      .post(`/api/accounts/${accountLimitada.id}/profiles`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ nombre: 'Perfil 1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/accounts/${accountLimitada.id}/profiles`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ nombre: 'Perfil 2' })
      .expect(409);
  });
});
