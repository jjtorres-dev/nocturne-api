import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Multi-usuario — Fase B5 (mismo patrón que Servicios/Contactos/Cuentas/
// Ventas/Combos, Fase B1/B2/B3/B4). Arista extra: la validación de
// exclusividad (assertAsignacionSigueLibre, dentro de reactivate) corre SIN
// scope de ownership a propósito — se prueba explícitamente que ni el
// propio dueño ni el admin se la saltan.
//
// userA/userB (y su Servicio/Combo/Contacto/Cuenta base) se crean UNA sola
// vez en beforeAll y se reusan en todos los `it` — mismo motivo de rate
// limit de POST /auth/login que en los módulos anteriores.
describe('ComboSales — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };
  let comboA: { id: string };
  let comboB: { id: string };
  let clienteA: { id: string };
  let clienteB: { id: string };
  let cuentaA1: { id: string; servicioId: string };
  let cuentaA2: { id: string; servicioId: string };
  let cuentaB1: { id: string; servicioId: string };
  let cuentaB2: { id: string; servicioId: string };
  let servicioA1Id: string;
  let servicioA2Id: string;
  let servicioB1Id: string;
  let servicioB2Id: string;
  // Fixtures aparte para el caso "perfilId de otro dueño" (requieren un
  // servicio CON_PERFILES, que el resto de este archivo no usa).
  let comboPerfilA: { id: string };
  let cuentaA3: { id: string; servicioId: string };
  let cuentaA4: { id: string; servicioId: string };
  let servicioA3Id: string;
  let servicioA4Id: string;
  let perfilB3: { id: string };

  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdContactIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdComboIds: string[] = [];
  const createdComboSaleIds: string[] = [];
  // Ventas sueltas (no de combo) creadas para ocupar una cuenta a
  // propósito — DELETE /api/sales es soft delete, no borra la fila, así
  // que hay que limpiarlas a mano antes de borrar accounts (FK).
  const createdLooseSaleIds: string[] = [];

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

    userA = await createRevendedor('combo-sale-owner-a');
    userB = await createRevendedor('combo-sale-owner-b');

    // CreateComboDto exige mínimo 2 servicios (ver Fase 6 en PROGRESS.md):
    // cada combo necesita 2 servicios + 2 cuentas (una por servicio) para
    // que las asignaciones de create() cubran el combo exactamente.
    const servicioA1 = await createService(userA.accessToken, `Servicio ComboSale A1 ${randomUUID()}`);
    servicioA1Id = servicioA1.id;
    const servicioA2 = await createService(userA.accessToken, `Servicio ComboSale A2 ${randomUUID()}`);
    servicioA2Id = servicioA2.id;
    const servicioB1 = await createService(userB.accessToken, `Servicio ComboSale B1 ${randomUUID()}`);
    servicioB1Id = servicioB1.id;
    const servicioB2 = await createService(userB.accessToken, `Servicio ComboSale B2 ${randomUUID()}`);
    servicioB2Id = servicioB2.id;

    comboA = await createCombo(userA.accessToken, [servicioA1Id, servicioA2Id]);
    comboB = await createCombo(userB.accessToken, [servicioB1Id, servicioB2Id]);

    clienteA = await createContact(userA.accessToken, `Cliente ComboSale A ${randomUUID()}`);
    clienteB = await createContact(userB.accessToken, `Cliente ComboSale B ${randomUUID()}`);

    cuentaA1 = await createAccount(userA.accessToken, servicioA1Id);
    cuentaA2 = await createAccount(userA.accessToken, servicioA2Id);
    cuentaB1 = await createAccount(userB.accessToken, servicioB1Id);
    cuentaB2 = await createAccount(userB.accessToken, servicioB2Id);

    // Fixtures para el caso "perfilId de otro dueño": un combo de A con un
    // servicio CON_PERFILES (servicioA3) + uno SIN_PERFILES (servicioA4,
    // solo para cumplir el mínimo de 2 servicios por combo), y un perfil
    // real de B (perfilB3, dentro de una cuenta de B) para intentar
    // colarlo en una asignación de A.
    const servicioA3 = await createService(
      userA.accessToken,
      `Servicio ComboSale A3 (perfiles) ${randomUUID()}`,
      'CON_PERFILES',
    );
    servicioA3Id = servicioA3.id;
    const servicioA4 = await createService(userA.accessToken, `Servicio ComboSale A4 ${randomUUID()}`);
    servicioA4Id = servicioA4.id;
    comboPerfilA = await createCombo(userA.accessToken, [servicioA3Id, servicioA4Id]);
    cuentaA3 = await createAccount(userA.accessToken, servicioA3Id);
    cuentaA4 = await createAccount(userA.accessToken, servicioA4Id);

    const servicioB3 = await createService(
      userB.accessToken,
      `Servicio ComboSale B3 (perfiles) ${randomUUID()}`,
      'CON_PERFILES',
    );
    const cuentaB3 = await createAccount(userB.accessToken, servicioB3.id);
    perfilB3 = await createProfile(userB.accessToken, cuentaB3.id, 'Perfil B3');
  });

  afterAll(async () => {
    if (createdLooseSaleIds.length > 0) {
      await dataSource.query('DELETE FROM payments WHERE venta_id = ANY($1)', [
        createdLooseSaleIds,
      ]);
      await dataSource.query('DELETE FROM sales WHERE id = ANY($1)', [
        createdLooseSaleIds,
      ]);
    }
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

  async function createCombo(accessToken: string, servicioIds: string[]) {
    const res = await request(app.getHttpServer())
      .post('/api/combos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nombre: `Combo ComboSale E2E ${randomUUID()}`, servicioIds, precioCombo: 20 })
      .expect(201);
    createdComboIds.push(res.body.id);
    return res.body;
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

  async function createAccount(accessToken: string, servicioId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        servicioId,
        correo: `${randomUUID()}@nocturne.dev`,
        claveServicio: 'clave-servicio',
        fechaInicio: isoDateOffset(-30),
        fechaFin: isoDateOffset(335),
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

  async function createComboSale(
    accessToken: string,
    extra: Record<string, unknown>,
    expectStatus = 201,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/combo-sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        clienteId: clienteA.id,
        comboId: comboA.id,
        fechaInicio: isoDateOffset(0),
        fechaFin: isoDateOffset(30),
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          { servicioId: servicioA1Id, cuentaId: cuentaA1.id },
          { servicioId: servicioA2Id, cuentaId: cuentaA2.id },
        ],
        ...extra,
      })
      .expect(expectStatus);
    if (res.body.id) {
      createdComboSaleIds.push(res.body.id);
    }
    return res.body;
  }

  async function desactivarComboSale(accessToken: string, id: string) {
    await request(app.getHttpServer())
      .delete(`/api/combo-sales/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  }

  it('un REVENDEDOR no puede ver, editar, desactivar ni reactivar una VentaCombo ajena (404), y su listado nunca la incluye', async () => {
    const ventaA = await createComboSale(userA.accessToken, {});
    expect(ventaA.ownerId).toBe(userA.id);

    await request(app.getHttpServer())
      .get(`/api/combo-sales/${ventaA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/combo-sales/${ventaA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ metodoPago: 'Plin' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/combo-sales/${ventaA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/combo-sales/${ventaA.id}/reactivate`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/combo-sales/${ventaA.id}/renew`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/api/combo-sales')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(listB.body.some((c: { id: string }) => c.id === ventaA.id)).toBe(false);

    // Control positivo.
    await request(app.getHttpServer())
      .get(`/api/combo-sales/${ventaA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    await desactivarComboSale(userA.accessToken, ventaA.id);
  });

  it('crear una VentaCombo con un clienteId ajeno da 404, rollback completo (no se crea nada)', async () => {
    const [{ count: comboSalesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );

    await createComboSale(userA.accessToken, { clienteId: clienteB.id }, 404);

    const [{ count: comboSalesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );
    expect(comboSalesDespues).toBe(comboSalesAntes);
    expect(salesDespues).toBe(salesAntes);
    expect(paymentsDespues).toBe(paymentsAntes);
  });

  it('crear una VentaCombo con un comboId ajeno da 404, rollback completo (no se crea nada)', async () => {
    const [{ count: comboSalesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );

    await createComboSale(
      userA.accessToken,
      {
        comboId: comboB.id,
        asignaciones: [
          { servicioId: servicioB1Id, cuentaId: cuentaB1.id },
          { servicioId: servicioB2Id, cuentaId: cuentaB2.id },
        ],
      },
      404,
    );

    const [{ count: comboSalesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    expect(comboSalesDespues).toBe(comboSalesAntes);
  });

  it('crear una VentaCombo con la cuenta de una asignación ajena da 404, rollback completo (no se crea nada)', async () => {
    const [{ count: comboSalesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );

    // cuentaB1 pertenece a B, no a A — falla dentro de validarAsignacion,
    // dentro de la transacción (después de validar la primera asignación,
    // que sí es de A).
    await createComboSale(
      userA.accessToken,
      {
        asignaciones: [
          { servicioId: servicioA1Id, cuentaId: cuentaA1.id },
          { servicioId: servicioA2Id, cuentaId: cuentaB1.id },
        ],
      },
      404,
    );

    const [{ count: comboSalesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );
    expect(comboSalesDespues).toBe(comboSalesAntes);
    expect(salesDespues).toBe(salesAntes);
    expect(paymentsDespues).toBe(paymentsAntes);

    // La cuenta de B, que ni siquiera pertenece al combo enviado, sigue sin
    // cliente asignado.
    const cuentaB1Detalle = await request(app.getHttpServer())
      .get(`/api/accounts/${cuentaB1.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(cuentaB1Detalle.body.clienteId).toBeNull();
  });

  it('crear una VentaCombo con un perfilId de la cuenta de otro dueño da 404, aunque la cuentaId enviada sea propia (rollback completo)', async () => {
    // Mismo nivel de asignación ya protegido en Cuentas/Perfiles (Fase B3):
    // acá cuentaA3 SÍ es de A (pasa el chequeo de ownership de la cuenta),
    // pero perfilB3 pertenece a una cuenta distinta, de B. La protección no
    // es un chequeo de ownership directo sobre el perfil (no tiene columna
    // ownerId propia) sino que la búsqueda de manager.findOne(Profile, {id:
    // perfilId, cuentaId: asignacion.cuentaId}) exige que el perfil
    // pertenezca A ESA cuenta puntual — perfilB3 pertenece a la cuenta de
    // B, no a cuentaA3, así que la búsqueda no encuentra nada y da 404.
    const [{ count: comboSalesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );

    await request(app.getHttpServer())
      .post('/api/combo-sales')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        clienteId: clienteA.id,
        comboId: comboPerfilA.id,
        fechaInicio: isoDateOffset(0),
        fechaFin: isoDateOffset(30),
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          { servicioId: servicioA3Id, cuentaId: cuentaA3.id, perfilId: perfilB3.id },
          { servicioId: servicioA4Id, cuentaId: cuentaA4.id },
        ],
      })
      .expect(404);

    const [{ count: comboSalesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );
    expect(comboSalesDespues).toBe(comboSalesAntes);
    expect(salesDespues).toBe(salesAntes);
    expect(paymentsDespues).toBe(paymentsAntes);

    // cuentaA3, que sí es de A, no quedó con ningún cliente asignado.
    const cuentaA3Detalle = await request(app.getHttpServer())
      .get(`/api/accounts/${cuentaA3.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(cuentaA3Detalle.body.clienteId).toBeNull();
  });

  it('el caso de exclusividad SIN scope: el admin (o el propio dueño) no puede reactivar una VentaCombo cuyo perfil/cuenta fue reocupado mientras tanto', async () => {
    const ventaA = await createComboSale(userA.accessToken, {});
    await desactivarComboSale(userA.accessToken, ventaA.id);

    // La cuenta A1 vuelve a ocuparse con una venta suelta nueva mientras
    // la VentaCombo estaba inactiva.
    const ventaOcupante = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        clienteId: clienteA.id,
        cuentaId: cuentaA1.id,
        fechaInicio: isoDateOffset(0),
        fechaFin: isoDateOffset(30),
        precio: 10,
        moneda: 'PEN',
        metodoPago: 'Yape',
      })
      .expect(201);
    createdLooseSaleIds.push(ventaOcupante.body.id);

    // Ni el propio dueño...
    await request(app.getHttpServer())
      .patch(`/api/combo-sales/${ventaA.id}/reactivate`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(409);

    // ...ni el admin se saltan la exclusividad: sigue siendo un recurso
    // físico compartido, no algo scopeado por dueño.
    await request(app.getHttpServer())
      .patch(`/api/combo-sales/${ventaA.id}/reactivate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/sales/${ventaOcupante.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('el rollback transaccional (Fase 6) sigue funcionando exactamente igual con el ownership de por medio', async () => {
    // Reproduce el caso clásico sobre comboA (2 servicios): la primera
    // asignación (cuentaA1) valida bien, la segunda (cuentaA2, ocupada de
    // antemano) choca por exclusividad — nada debe quedar creado.
    const ventaOcupante = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        clienteId: clienteA.id,
        cuentaId: cuentaA2.id,
        fechaInicio: isoDateOffset(0),
        fechaFin: isoDateOffset(30),
        precio: 10,
        moneda: 'PEN',
        metodoPago: 'Yape',
      })
      .expect(201);
    createdLooseSaleIds.push(ventaOcupante.body.id);

    const [{ count: comboSalesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );

    await createComboSale(userA.accessToken, {}, 409);

    const [{ count: comboSalesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );
    expect(comboSalesDespues).toBe(comboSalesAntes);
    expect(salesDespues).toBe(salesAntes);
    expect(paymentsDespues).toBe(paymentsAntes);

    const cuentaA1Detalle = await request(app.getHttpServer())
      .get(`/api/accounts/${cuentaA1.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(cuentaA1Detalle.body.clienteId).toBeNull();

    await request(app.getHttpServer())
      .delete(`/api/sales/${ventaOcupante.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
  });

  it('el admin ve las VentaCombo de ambos revendedores en el listado, con owner poblado', async () => {
    const ventaA = await createComboSale(userA.accessToken, {});

    const listAdmin = await request(app.getHttpServer())
      .get('/api/combo-sales')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const encontrada = listAdmin.body.find(
      (c: { id: string; owner?: { id: string } }) => c.id === ventaA.id,
    );
    expect(encontrada).toBeDefined();
    expect(encontrada.owner).toMatchObject({ id: userA.id });

    await desactivarComboSale(userA.accessToken, ventaA.id);
  });
});
