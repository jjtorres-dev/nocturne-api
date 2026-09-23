import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Multi-usuario — Fase B4 (mismo patrón que Servicios/Contactos/Cuentas,
// Fase B1/B2/B3). La arista extra de este módulo: Ventas referencia 4
// recursos (clienteId, cuentaId, perfilId, servicioId) y extiende el
// scoping más allá del CRUD básico (vencimiento, summary, renew).
//
// Nota sobre servicioId como referencia "ajena": a diferencia de
// clienteId/cuentaId/perfilId, `servicioId` no viene en el body —
// SalesService lo deriva de `cuenta.servicioId`. Por el invariante que ya
// garantiza Fase B3 (AccountsService.assertReferencesOwnedBy), una cuenta
// SIEMPRE tiene un servicio del mismo dueño, así que "cuentaId propia pero
// servicioId ajeno" no es un estado alcanzable por la API real — no hay
// forma de construir ese escenario acá. El chequeo defensivo de
// `servicioId` en SalesService.assertReferencesOwnedBy sí está probado,
// pero con repositorio mockeado en sales.service.spec.ts (el único lugar
// donde se puede forzar esa combinación inconsistente).
//
// userA/userB (y su Contacto/Servicio/Cuenta/Perfil base) se crean UNA
// sola vez en beforeAll y se reusan en todos los `it` — mismo motivo de
// rate limit de POST /auth/login que en los módulos anteriores.
describe('Sales — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };
  let contactA: { id: string; ownerId: string };
  let contactB: { id: string; ownerId: string };
  let accountA: { id: string; ownerId: string; servicioId: string };
  let accountB: { id: string; ownerId: string; servicioId: string };
  let profileA1: { id: string };
  let profileB1: { id: string };
  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdContactIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdSaleIds: string[] = [];

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

    userA = await createRevendedor('sale-owner-a');
    userB = await createRevendedor('sale-owner-b');

    contactA = await createContact(userA.accessToken, `Cliente A ${randomUUID()}`);
    contactB = await createContact(userB.accessToken, `Cliente B ${randomUUID()}`);

    const serviceA = await createService(userA.accessToken, `Servicio Venta A ${randomUUID()}`);
    const serviceB = await createService(userB.accessToken, `Servicio Venta B ${randomUUID()}`);

    accountA = await createAccount(userA.accessToken, serviceA.id);
    accountB = await createAccount(userB.accessToken, serviceB.id);

    profileA1 = await createProfile(userA.accessToken, accountA.id, 'Perfil A1');
    profileB1 = await createProfile(userB.accessToken, accountB.id, 'Perfil B1');
  });

  afterAll(async () => {
    if (createdSaleIds.length > 0) {
      await dataSource.query('DELETE FROM payments WHERE venta_id = ANY($1)', [
        createdSaleIds,
      ]);
      await dataSource.query('DELETE FROM sales WHERE id = ANY($1)', [
        createdSaleIds,
      ]);
    }
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

  async function createContact(accessToken: string, nombre: string) {
    const res = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nombre, whatsapp: '+51999999999', tipo: 'CLIENTE_FINAL' })
      .expect(201);
    createdContactIds.push(res.body.id);
    return res.body;
  }

  async function createService(accessToken: string, nombre: string) {
    const res = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nombre, tipo: 'CON_PERFILES', duracionMeses: 1, precioBase: 10 })
      .expect(201);
    createdServiceIds.push(res.body.id);
    return res.body;
  }

  async function createAccount(accessToken: string, servicioId: string) {
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
      })
      .expect(201);
    createdAccountIds.push(res.body.id);
    return res.body;
  }

  async function createProfile(accessToken: string, accountId: string, nombre: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/accounts/${accountId}/profiles`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nombre })
      .expect(201);
    return res.body;
  }

  async function createSale(
    accessToken: string,
    extra: Record<string, unknown>,
    expectStatus = 201,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        clienteId: contactA.id,
        cuentaId: accountA.id,
        perfilId: profileA1.id,
        fechaInicio: '2026-01-05',
        fechaFin: '2026-02-05',
        precio: 10,
        moneda: 'PEN',
        metodoPago: 'Yape',
        ...extra,
      })
      .expect(expectStatus);
    if (res.body.id) {
      createdSaleIds.push(res.body.id);
    }
    return res.body;
  }

  it('un REVENDEDOR no puede ver, editar ni desactivar una Venta ajena (404), y su listado nunca la incluye', async () => {
    const saleA = await createSale(userA.accessToken, {});
    expect(saleA.ownerId).toBe(userA.id);

    await request(app.getHttpServer())
      .get(`/api/sales/${saleA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/sales/${saleA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ metodoPago: 'Plin' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/sales/${saleA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/api/sales')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(listB.body.some((s: { id: string }) => s.id === saleA.id)).toBe(false);

    // Control positivo.
    await request(app.getHttpServer())
      .get(`/api/sales/${saleA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    // Se desactiva para no interferir con otros tests de exclusividad.
    await request(app.getHttpServer())
      .delete(`/api/sales/${saleA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('POST /:id/renew sobre una venta ajena da 404', async () => {
    const saleA = await createSale(userA.accessToken, {});

    await request(app.getHttpServer())
      .post(`/api/sales/${saleA.id}/renew`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/sales/${saleA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('crear una venta referenciando un clienteId ajeno da 404, no se crea nada', async () => {
    await createSale(userA.accessToken, { clienteId: contactB.id }, 404);
  });

  it('crear una venta referenciando una cuentaId ajena da 404, no se crea nada', async () => {
    await createSale(
      userA.accessToken,
      { cuentaId: accountB.id, perfilId: profileB1.id },
      404,
    );
  });

  it('crear una venta referenciando un perfilId que no pertenece a esa cuenta (ajeno) da 404', async () => {
    // cuentaId propia de A, pero perfilId es de la cuenta de B: el perfil
    // no existe DENTRO de la cuenta de A, así que da 404 igual (mismo
    // motivo por el que ya daba 404 antes de Fase B4 con cualquier
    // perfilId que no matcheara la cuenta, ahora también cubre el caso
    // "de otro dueño").
    await createSale(userA.accessToken, { perfilId: profileB1.id }, 404);
  });

  it('GET /sales?vencimiento=vencida y GET /sales/summary nunca mezclan datos entre usuarios', async () => {
    // Venta vencida real: fechaFin en el pasado.
    const saleVencidaA = await createSale(userA.accessToken, {
      fechaFin: '2020-01-01',
    });

    const listVencidasB = await request(app.getHttpServer())
      .get('/api/sales?vencimiento=vencida')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(
      listVencidasB.body.some((s: { id: string }) => s.id === saleVencidaA.id),
    ).toBe(false);

    const listVencidasA = await request(app.getHttpServer())
      .get('/api/sales?vencimiento=vencida')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(
      listVencidasA.body.some((s: { id: string }) => s.id === saleVencidaA.id),
    ).toBe(true);

    const summaryB = await request(app.getHttpServer())
      .get('/api/sales/summary')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    const summaryAntesDeA = summaryB.body.vencidas;

    // El summary de B no cambia por la venta vencida de A.
    expect(summaryB.body.vencidas).toBe(summaryAntesDeA);

    const summaryA = await request(app.getHttpServer())
      .get('/api/sales/summary')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(summaryA.body.vencidas).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .delete(`/api/sales/${saleVencidaA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('la exclusividad de un perfil sigue funcionando sin importar quién pregunta: el admin no puede reactivar una venta cuyo perfil ya está ocupado por otra', async () => {
    const primeraVenta = await createSale(userA.accessToken, {});
    await request(app.getHttpServer())
      .delete(`/api/sales/${primeraVenta.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    // Perfil vuelve a ocuparse con una venta nueva.
    const segundaVenta = await createSale(userA.accessToken, {});

    // El admin intenta reactivar la primera venta (inactiva): el perfil ya
    // no está libre (lo ocupa la segunda venta) → 409, no 200 ni 404. El
    // admin ve la venta (no le da 404 por ownership) pero la regla de
    // negocio de exclusividad lo frena igual que a cualquiera.
    await request(app.getHttpServer())
      .patch(`/api/sales/${primeraVenta.id}/reactivate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/sales/${segundaVenta.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('el admin ve las ventas de ambos revendedores en el listado, con owner poblado', async () => {
    const saleA = await createSale(userA.accessToken, {});

    const listAdmin = await request(app.getHttpServer())
      .get('/api/sales')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const encontrada = listAdmin.body.find(
      (s: { id: string; owner?: { id: string } }) => s.id === saleA.id,
    );
    expect(encontrada).toBeDefined();
    expect(encontrada.owner).toMatchObject({ id: userA.id });

    await request(app.getHttpServer())
      .delete(`/api/sales/${saleA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });
});
