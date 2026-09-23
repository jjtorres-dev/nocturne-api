import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Buscador global — mismo patrón de fixtures multi-usuario que el resto de
// los *-ownership.e2e-spec.ts. Ventas y VentasCombo no aceptan un término
// arbitrario (codigoVenta se genera desde una secuencia, V-00001/C-00001),
// así que su aislamiento se prueba buscando el código real ya generado en
// vez de un término compartido.
//
// userA/userB se crean UNA sola vez en beforeAll y se reusan en todos los
// `it` — mismo motivo de rate limit de POST /auth/login que en los módulos
// anteriores.
describe('Search — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };

  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdContactIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdComboIds: string[] = [];
  const createdComboSaleIds: string[] = [];
  const createdSaleIds: string[] = [];
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

    userA = await createRevendedor('search-owner-a');
    userB = await createRevendedor('search-owner-b');
  });

  afterAll(async () => {
    if (createdComboSaleIds.length > 0) {
      await dataSource.query('DELETE FROM payments WHERE venta_combo_id = ANY($1)', [
        createdComboSaleIds,
      ]);
      await dataSource.query('DELETE FROM sales WHERE venta_combo_id = ANY($1)', [
        createdComboSaleIds,
      ]);
      await dataSource.query('DELETE FROM combo_sales WHERE id = ANY($1)', [
        createdComboSaleIds,
      ]);
    }
    if (createdSaleIds.length > 0) {
      await dataSource.query('DELETE FROM payments WHERE venta_id = ANY($1)', [
        createdSaleIds,
      ]);
      await dataSource.query('DELETE FROM sales WHERE id = ANY($1)', [
        createdSaleIds,
      ]);
    }
    if (createdExpenseIds.length > 0) {
      await dataSource.query('DELETE FROM expenses WHERE id = ANY($1)', [
        createdExpenseIds,
      ]);
    }
    if (createdComboIds.length > 0) {
      await dataSource.query('DELETE FROM combo_servicios WHERE combo_id = ANY($1)', [
        createdComboIds,
      ]);
      await dataSource.query('DELETE FROM combos WHERE id = ANY($1)', [
        createdComboIds,
      ]);
    }
    if (createdAccountIds.length > 0) {
      await dataSource.query('DELETE FROM profiles WHERE cuenta_id = ANY($1)', [
        createdAccountIds,
      ]);
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

  async function createService(
    accessToken: string,
    nombre: string,
    tipo: 'SIN_PERFILES' | 'CON_PERFILES' = 'SIN_PERFILES',
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nombre,
        tipo,
        duracionMeses: 1,
        precioBase: 10,
        ...(tipo === 'CON_PERFILES' ? { pantallasMax: 4 } : {}),
      })
      .expect(201);
    createdServiceIds.push(res.body.id);
    return res.body;
  }

  async function createAccount(
    accessToken: string,
    servicioId: string,
    correo: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        servicioId,
        correo,
        claveServicio: 'super-secreta-no-debe-salir',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-02-01',
        costo: 10,
        metodoPago: 'transferencia',
      })
      .expect(201);
    createdAccountIds.push(res.body.id);
    return res.body;
  }

  async function createCombo(accessToken: string, nombre: string, servicioIds: string[]) {
    const res = await request(app.getHttpServer())
      .post('/api/combos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nombre, servicioIds, precioCombo: 20 })
      .expect(201);
    createdComboIds.push(res.body.id);
    return res.body;
  }

  async function createExpense(accessToken: string, descripcion: string) {
    const res = await request(app.getHttpServer())
      .post('/api/expenses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        descripcion,
        monto: 15,
        moneda: 'PEN',
        metodoPago: 'transferencia',
        fecha: '2026-01-10',
      })
      .expect(201);
    createdExpenseIds.push(res.body.id);
    return res.body;
  }

  async function createSale(accessToken: string, clienteId: string, cuentaId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        clienteId,
        cuentaId,
        fechaInicio: '2026-01-05',
        fechaFin: '2026-02-05',
        precio: 10,
        moneda: 'PEN',
        metodoPago: 'Yape',
      })
      .expect(201);
    createdSaleIds.push(res.body.id);
    return res.body;
  }

  async function createComboSale(
    accessToken: string,
    clienteId: string,
    comboId: string,
    asignaciones: Array<{ servicioId: string; cuentaId: string }>,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/combo-sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        clienteId,
        comboId,
        fechaInicio: '2026-01-05',
        fechaFin: '2026-02-05',
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones,
      })
      .expect(201);
    createdComboSaleIds.push(res.body.id);
    return res.body;
  }

  it('sin token da 401', async () => {
    await request(app.getHttpServer()).get('/api/search?q=algo').expect(401);
  });

  it('q ausente o con menos de 2 caracteres da 400', async () => {
    await request(app.getHttpServer())
      .get('/api/search')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/search?q=a')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/search?q=ab')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('contactos, cuentas, servicios, combos y gastos: cada categoría filtra por ownerId (A no ve resultados de B)', async () => {
    const term = `zzbuscador${randomUUID().slice(0, 8)}`;

    const contactoA = await createContact(userA.accessToken, `Cliente ${term} A`);
    const contactoB = await createContact(userB.accessToken, `Cliente ${term} B`);

    const servicioA = await createService(userA.accessToken, `Servicio ${term} A`);
    const servicioB = await createService(userB.accessToken, `Servicio ${term} B`);

    const cuentaA = await createAccount(
      userA.accessToken,
      servicioA.id,
      `${term}-a@nocturne.dev`,
    );
    const cuentaB = await createAccount(
      userB.accessToken,
      servicioB.id,
      `${term}-b@nocturne.dev`,
    );

    const servicioA2 = await createService(userA.accessToken, `Servicio2 ${term} A`);
    const servicioB2 = await createService(userB.accessToken, `Servicio2 ${term} B`);
    const comboA = await createCombo(userA.accessToken, `Combo ${term} A`, [
      servicioA.id,
      servicioA2.id,
    ]);
    const comboB = await createCombo(userB.accessToken, `Combo ${term} B`, [
      servicioB.id,
      servicioB2.id,
    ]);

    const gastoA = await createExpense(userA.accessToken, `Gasto ${term} A`);
    const gastoB = await createExpense(userB.accessToken, `Gasto ${term} B`);

    const resA = await request(app.getHttpServer())
      .get(`/api/search?q=${term}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(resA.body.contactos.map((r: { id: string }) => r.id)).toContain(contactoA.id);
    expect(resA.body.contactos.map((r: { id: string }) => r.id)).not.toContain(contactoB.id);

    expect(resA.body.servicios.map((r: { id: string }) => r.id)).toContain(servicioA.id);
    expect(resA.body.servicios.map((r: { id: string }) => r.id)).not.toContain(servicioB.id);

    expect(resA.body.cuentas.map((r: { id: string }) => r.id)).toContain(cuentaA.id);
    expect(resA.body.cuentas.map((r: { id: string }) => r.id)).not.toContain(cuentaB.id);

    expect(resA.body.combos.map((r: { id: string }) => r.id)).toContain(comboA.id);
    expect(resA.body.combos.map((r: { id: string }) => r.id)).not.toContain(comboB.id);

    expect(resA.body.gastos.map((r: { id: string }) => r.id)).toContain(gastoA.id);
    expect(resA.body.gastos.map((r: { id: string }) => r.id)).not.toContain(gastoB.id);

    const resB = await request(app.getHttpServer())
      .get(`/api/search?q=${term}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(resB.body.contactos.map((r: { id: string }) => r.id)).toContain(contactoB.id);
    expect(resB.body.contactos.map((r: { id: string }) => r.id)).not.toContain(contactoA.id);
  });

  it('cuentas: la clave cifrada nunca aparece en la respuesta del buscador', async () => {
    const term = `zzclave${randomUUID().slice(0, 8)}`;
    const servicio = await createService(userA.accessToken, `Servicio clave ${term}`);
    const cuenta = await createAccount(
      userA.accessToken,
      servicio.id,
      `${term}@nocturne.dev`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/search?q=${term}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    const encontrada = res.body.cuentas.find((r: { id: string }) => r.id === cuenta.id);
    expect(encontrada).toBeDefined();
    expect(Object.keys(encontrada).sort()).toEqual(['id', 'label']);
    expect(encontrada.label).toContain(cuenta.correo);

    const rawBody = JSON.stringify(res.body);
    expect(rawBody).not.toContain('super-secreta-no-debe-salir');
    expect(rawBody.toLowerCase()).not.toContain('claveservicio');
    expect(rawBody.toLowerCase()).not.toContain('clavecorreo');
  });

  it('ventas y ventasCombo: cada categoría filtra por ownerId, buscando por el codigoVenta ya generado', async () => {
    const term = `zzventas${randomUUID().slice(0, 8)}`;

    const contactoA = await createContact(userA.accessToken, `Cliente venta ${term} A`);
    const contactoB = await createContact(userB.accessToken, `Cliente venta ${term} B`);
    const servicioA = await createService(userA.accessToken, `Servicio venta ${term} A`);
    const servicioB = await createService(userB.accessToken, `Servicio venta ${term} B`);
    const cuentaA = await createAccount(userA.accessToken, servicioA.id, `venta-${term}-a@nocturne.dev`);
    const cuentaB = await createAccount(userB.accessToken, servicioB.id, `venta-${term}-b@nocturne.dev`);

    const ventaA = await createSale(userA.accessToken, contactoA.id, cuentaA.id);
    const ventaB = await createSale(userB.accessToken, contactoB.id, cuentaB.id);

    const resVentaComoA = await request(app.getHttpServer())
      .get(`/api/search?q=${ventaA.codigoVenta}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(resVentaComoA.body.ventas.map((r: { id: string }) => r.id)).toContain(ventaA.id);

    const resVentaAjenaComoB = await request(app.getHttpServer())
      .get(`/api/search?q=${ventaA.codigoVenta}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(resVentaAjenaComoB.body.ventas.map((r: { id: string }) => r.id)).not.toContain(
      ventaA.id,
    );

    const resVentaBComoB = await request(app.getHttpServer())
      .get(`/api/search?q=${ventaB.codigoVenta}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(resVentaBComoB.body.ventas.map((r: { id: string }) => r.id)).toContain(ventaB.id);

    // VentaCombo: CreateComboDto exige mínimo 2 servicios. Cuentas nuevas
    // (no cuentaA/cuentaB, ya ocupadas por ventaA/ventaB): una cuenta con
    // venta activa no se puede reasignar (409).
    const servicioA2 = await createService(userA.accessToken, `Servicio venta2 ${term} A`);
    const servicioB2 = await createService(userB.accessToken, `Servicio venta2 ${term} B`);
    const cuentaA3 = await createAccount(userA.accessToken, servicioA.id, `venta3-${term}-a@nocturne.dev`);
    const cuentaA4 = await createAccount(userA.accessToken, servicioA2.id, `venta4-${term}-a@nocturne.dev`);
    const cuentaB3 = await createAccount(userB.accessToken, servicioB.id, `venta3-${term}-b@nocturne.dev`);
    const cuentaB4 = await createAccount(userB.accessToken, servicioB2.id, `venta4-${term}-b@nocturne.dev`);
    const comboA = await createCombo(userA.accessToken, `Combo venta ${term} A`, [
      servicioA.id,
      servicioA2.id,
    ]);
    const comboB = await createCombo(userB.accessToken, `Combo venta ${term} B`, [
      servicioB.id,
      servicioB2.id,
    ]);

    const ventaComboA = await createComboSale(userA.accessToken, contactoA.id, comboA.id, [
      { servicioId: servicioA.id, cuentaId: cuentaA3.id },
      { servicioId: servicioA2.id, cuentaId: cuentaA4.id },
    ]);
    const ventaComboB = await createComboSale(userB.accessToken, contactoB.id, comboB.id, [
      { servicioId: servicioB.id, cuentaId: cuentaB3.id },
      { servicioId: servicioB2.id, cuentaId: cuentaB4.id },
    ]);

    const resComboComoA = await request(app.getHttpServer())
      .get(`/api/search?q=${ventaComboA.codigoVenta}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(resComboComoA.body.ventasCombo.map((r: { id: string }) => r.id)).toContain(
      ventaComboA.id,
    );

    const resComboAjenaComoB = await request(app.getHttpServer())
      .get(`/api/search?q=${ventaComboA.codigoVenta}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(
      resComboAjenaComoB.body.ventasCombo.map((r: { id: string }) => r.id),
    ).not.toContain(ventaComboA.id);

    const resComboBComoB = await request(app.getHttpServer())
      .get(`/api/search?q=${ventaComboB.codigoVenta}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(resComboBComoB.body.ventasCombo.map((r: { id: string }) => r.id)).toContain(
      ventaComboB.id,
    );
  });

  it('el admin ve resultados de ambos revendedores en la misma búsqueda', async () => {
    const term = `zzadmin${randomUUID().slice(0, 8)}`;
    const contactoA = await createContact(userA.accessToken, `Cliente ${term} A`);
    const contactoB = await createContact(userB.accessToken, `Cliente ${term} B`);

    const resAdmin = await request(app.getHttpServer())
      .get(`/api/search?q=${term}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    const ids = resAdmin.body.contactos.map((r: { id: string }) => r.id);
    expect(ids).toContain(contactoA.id);
    expect(ids).toContain(contactoB.id);
  });

  it('el resultado trae ownerName como campo aparte, y SOLO cuando busca el admin', async () => {
    const term = `zzowner${randomUUID().slice(0, 8)}`;
    const contactoA = await createContact(userA.accessToken, `Cliente ${term} A`);

    const resAdmin = await request(app.getHttpServer())
      .get(`/api/search?q=${term}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const encontradoAdmin = resAdmin.body.contactos.find(
      (r: { id: string }) => r.id === contactoA.id,
    );
    expect(encontradoAdmin.label).toBe(`Cliente ${term} A`);
    expect(encontradoAdmin.ownerName).toBe(userA.name);

    const resA = await request(app.getHttpServer())
      .get(`/api/search?q=${term}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    const encontradoA = resA.body.contactos.find(
      (r: { id: string }) => r.id === contactoA.id,
    );
    expect(encontradoA.label).toBe(`Cliente ${term} A`);
    expect(encontradoA.ownerName).toBeUndefined();
  });
});
