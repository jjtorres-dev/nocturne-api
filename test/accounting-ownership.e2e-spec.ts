import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Multi-usuario — Fase B7. Mismo criterio de fecha fija que
// accounting.e2e-spec.ts (no por delta): cada escenario usa su propio día
// exacto, que ningún otro archivo toca, así los 4 reportes se pueden
// verificar por número exacto sin que le afecte que otros e2e corran
// alrededor (fileParallelism: false en vitest.config.e2e.ts, pero igual
// comparten la misma base compartida entre archivos).
const FECHA_SIMPLE = '2020-06-16';
const FECHA_COMBO = '2020-06-17';

interface AccountingSummary {
  ingresos: number;
  inversion: number;
  gastos: number;
  ganancia: number;
}

interface ServiceBreakdownRow {
  servicioId: string;
  nombre: string;
  inversion: number;
  ingresos: number;
  ganancia: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

describe('Accounting — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let adminId: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };

  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdContactIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdSaleIds: string[] = [];
  const createdExpenseIds: string[] = [];
  const createdComboIds: string[] = [];
  const createdComboSaleIds: string[] = [];

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
    const profileRes = await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    adminId = profileRes.body.id;

    userA = await createRevendedor('accounting-owner-a');
    userB = await createRevendedor('accounting-owner-b');
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
    if (createdComboIds.length > 0) {
      await dataSource.query('DELETE FROM combo_servicios WHERE combo_id = ANY($1)', [
        createdComboIds,
      ]);
      await dataSource.query('DELETE FROM combos WHERE id = ANY($1)', [
        createdComboIds,
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
    if (createdAccountIds.length > 0) {
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

  async function createService(accessToken: string, nombre: string) {
    const res = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nombre, tipo: 'SIN_PERFILES', duracionMeses: 1, precioBase: 10 })
      .expect(201);
    createdServiceIds.push(res.body.id);
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

  // costo -> "inversion". createdAt se backdatea a `fecha` a mano (la API
  // no lo expone, lo pone @CreateDateColumn) — mismo truco que
  // accounting.e2e-spec.ts.
  async function createAccount(
    accessToken: string,
    servicioId: string,
    costo: number,
    fecha: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        servicioId,
        correo: `${randomUUID()}@nocturne.dev`,
        claveServicio: 'clave-servicio',
        fechaInicio: fecha,
        fechaFin: fecha,
        costo,
        metodoPago: 'transferencia',
      })
      .expect(201);
    createdAccountIds.push(res.body.id);
    await dataSource.query('UPDATE accounts SET created_at = $1 WHERE id = $2', [
      fecha,
      res.body.id,
    ]);
    return res.body;
  }

  // precio -> "ingresos" (Payment venta_inicial, fecha=fechaInicio).
  async function createSale(
    accessToken: string,
    clienteId: string,
    cuentaId: string,
    precio: number,
    fecha: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        clienteId,
        cuentaId,
        fechaInicio: fecha,
        fechaFin: fecha,
        precio,
        moneda: 'PEN',
        metodoPago: 'Yape',
      })
      .expect(201);
    createdSaleIds.push(res.body.id);
    return res.body;
  }

  // monto -> "gastos".
  async function createExpense(accessToken: string, monto: number, fecha: string) {
    const res = await request(app.getHttpServer())
      .post('/api/expenses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        descripcion: `Gasto ownership ${randomUUID()}`,
        monto,
        moneda: 'PEN',
        metodoPago: 'Yape',
        fecha,
      })
      .expect(201);
    createdExpenseIds.push(res.body.id);
    return res.body;
  }

  async function createCombo(accessToken: string, servicioIds: string[]) {
    const res = await request(app.getHttpServer())
      .post('/api/combos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nombre: `Combo Accounting E2E ${randomUUID()}`,
        servicioIds,
        precioCombo: 1,
      })
      .expect(201);
    createdComboIds.push(res.body.id);
    return res.body;
  }

  // precio -> "ingresos" (Payment venta_inicial ligado a venta_combo_id,
  // fecha=fechaInicio).
  async function createComboSale(
    accessToken: string,
    clienteId: string,
    comboId: string,
    asignaciones: { servicioId: string; cuentaId: string }[],
    precio: number,
    fecha: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/combo-sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        clienteId,
        comboId,
        fechaInicio: fecha,
        fechaFin: fecha,
        duracionMeses: 1,
        precio,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones,
      })
      .expect(201);
    createdComboSaleIds.push(res.body.id);
    return res.body;
  }

  async function getSummary(
    accessToken: string,
    fecha: string,
    viewOwnerId?: string,
  ): Promise<AccountingSummary> {
    const res = await request(app.getHttpServer())
      .get('/api/accounting/summary')
      .query({ desde: fecha, hasta: fecha, ...(viewOwnerId ? { viewOwnerId } : {}) })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body;
  }

  async function getByService(
    accessToken: string,
    fecha: string,
    viewOwnerId?: string,
  ): Promise<ServiceBreakdownRow[]> {
    const res = await request(app.getHttpServer())
      .get('/api/accounting/by-service')
      .query({ desde: fecha, hasta: fecha, ...(viewOwnerId ? { viewOwnerId } : {}) })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body;
  }

  describe('escenario simple (sin combos)', () => {
    // A: ingresos=50, inversion=100, gastos=20 -> ganancia=-70
    // B: ingresos=30, inversion=40,  gastos=10 -> ganancia=-20
    // admin: ingresos=2, inversion=5, gastos=1 -> ganancia=-4
    const A = { costo: 100, precio: 50, gasto: 20 };
    const B = { costo: 40, precio: 30, gasto: 10 };
    const ADMIN = { costo: 5, precio: 2, gasto: 1 };

    let servicioAId: string;
    let servicioBId: string;

    const esperadoA: AccountingSummary = {
      ingresos: A.precio,
      inversion: A.costo,
      gastos: A.gasto,
      ganancia: round2(A.precio - A.costo - A.gasto),
    };
    const esperadoB: AccountingSummary = {
      ingresos: B.precio,
      inversion: B.costo,
      gastos: B.gasto,
      ganancia: round2(B.precio - B.costo - B.gasto),
    };
    const esperadoAdmin: AccountingSummary = {
      ingresos: ADMIN.precio,
      inversion: ADMIN.costo,
      gastos: ADMIN.gasto,
      ganancia: round2(ADMIN.precio - ADMIN.costo - ADMIN.gasto),
    };
    const esperadoAll: AccountingSummary = {
      ingresos: round2(A.precio + B.precio + ADMIN.precio),
      inversion: round2(A.costo + B.costo + ADMIN.costo),
      gastos: round2(A.gasto + B.gasto + ADMIN.gasto),
      ganancia: round2(esperadoA.ganancia + esperadoB.ganancia + esperadoAdmin.ganancia),
    };

    beforeAll(async () => {
      const servicioA = await createService(userA.accessToken, `Servicio Accounting A ${randomUUID()}`);
      servicioAId = servicioA.id;
      const clienteA = await createContact(userA.accessToken, `Cliente Accounting A ${randomUUID()}`);
      const cuentaA = await createAccount(userA.accessToken, servicioAId, A.costo, FECHA_SIMPLE);
      await createSale(userA.accessToken, clienteA.id, cuentaA.id, A.precio, FECHA_SIMPLE);
      await createExpense(userA.accessToken, A.gasto, FECHA_SIMPLE);

      const servicioB = await createService(userB.accessToken, `Servicio Accounting B ${randomUUID()}`);
      servicioBId = servicioB.id;
      const clienteB = await createContact(userB.accessToken, `Cliente Accounting B ${randomUUID()}`);
      const cuentaB = await createAccount(userB.accessToken, servicioBId, B.costo, FECHA_SIMPLE);
      await createSale(userB.accessToken, clienteB.id, cuentaB.id, B.precio, FECHA_SIMPLE);
      await createExpense(userB.accessToken, B.gasto, FECHA_SIMPLE);

      const servicioAdmin = await createService(adminAccessToken, `Servicio Accounting Admin ${randomUUID()}`);
      const clienteAdmin = await createContact(adminAccessToken, `Cliente Accounting Admin ${randomUUID()}`);
      const cuentaAdmin = await createAccount(adminAccessToken, servicioAdmin.id, ADMIN.costo, FECHA_SIMPLE);
      await createSale(adminAccessToken, clienteAdmin.id, cuentaAdmin.id, ADMIN.precio, FECHA_SIMPLE);
      await createExpense(adminAccessToken, ADMIN.gasto, FECHA_SIMPLE);
    });

    it('GET /accounting/summary de A nunca incluye números de B (monto exacto)', async () => {
      const summaryA = await getSummary(userA.accessToken, FECHA_SIMPLE);
      expect(summaryA).toEqual(esperadoA);

      const summaryB = await getSummary(userB.accessToken, FECHA_SIMPLE);
      expect(summaryB).toEqual(esperadoB);
    });

    it('GET /accounting/by-service de A solo incluye su propio servicio, con números exactos', async () => {
      const byServiceA = await getByService(userA.accessToken, FECHA_SIMPLE);
      expect(byServiceA).toEqual([
        expect.objectContaining({
          servicioId: servicioAId,
          inversion: A.costo,
          ingresos: A.precio,
          ganancia: round2(A.precio - A.costo),
        }),
      ]);
      expect(byServiceA.some((r) => r.servicioId === servicioBId)).toBe(false);
    });

    it('un ADMIN sin viewOwnerId ve solo lo suyo, por defecto', async () => {
      const summaryAdmin = await getSummary(adminAccessToken, FECHA_SIMPLE);
      expect(summaryAdmin).toEqual(esperadoAdmin);
    });

    it('un ADMIN con viewOwnerId=<id de A> ve exactamente los números de A', async () => {
      const summary = await getSummary(adminAccessToken, FECHA_SIMPLE, userA.id);
      expect(summary).toEqual(esperadoA);
    });

    it('un ADMIN con viewOwnerId=all ve la suma de A + B + admin', async () => {
      const summary = await getSummary(adminAccessToken, FECHA_SIMPLE, 'all');
      expect(summary).toEqual(esperadoAll);
    });

    it('un REVENDEDOR mandando viewOwnerId (propio, ajeno, o "all") siempre ve solo lo suyo', async () => {
      const conElSuyo = await getSummary(userA.accessToken, FECHA_SIMPLE, userA.id);
      expect(conElSuyo).toEqual(esperadoA);

      const conElDeB = await getSummary(userA.accessToken, FECHA_SIMPLE, userB.id);
      expect(conElDeB).toEqual(esperadoA);

      const conAll = await getSummary(userA.accessToken, FECHA_SIMPLE, 'all');
      expect(conAll).toEqual(esperadoA);
    });

    it('sanity: adminId quedó resuelto correctamente en beforeAll (no es undefined)', () => {
      expect(adminId).toEqual(expect.any(String));
    });
  });

  describe('escenario con Venta de Combo', () => {
    // A (combo): ingresos=15 (Payment de la VentaCombo), inversion=8+6=14
    // (2 cuentas), gastos=0 -> ganancia=1. Ninguna cuenta del combo tiene
    // Payment propio (precio=0 en las ventas hijas, ver Fase 6), así que
    // por-servicio no debe atribuirle ingresos a ninguno de los 2
    // servicios del combo — solo inversion.
    const PRECIO_COMBO = 15;
    const COSTO_CUENTA_1 = 8;
    const COSTO_CUENTA_2 = 6;
    // B (no combo, mismo día): ingresos=4, inversion=3, gastos=0 -> control
    // de aislamiento cruzado en la misma fecha.
    const B = { costo: 3, precio: 4 };

    let servicioCombo1Id: string;
    let servicioCombo2Id: string;
    let servicioBId: string;

    const esperadoA: AccountingSummary = {
      ingresos: PRECIO_COMBO,
      inversion: round2(COSTO_CUENTA_1 + COSTO_CUENTA_2),
      gastos: 0,
      ganancia: round2(PRECIO_COMBO - COSTO_CUENTA_1 - COSTO_CUENTA_2),
    };
    const esperadoB: AccountingSummary = {
      ingresos: B.precio,
      inversion: B.costo,
      gastos: 0,
      ganancia: round2(B.precio - B.costo),
    };
    const esperadoAll: AccountingSummary = {
      ingresos: round2(esperadoA.ingresos + esperadoB.ingresos),
      inversion: round2(esperadoA.inversion + esperadoB.inversion),
      gastos: 0,
      ganancia: round2(esperadoA.ganancia + esperadoB.ganancia),
    };

    beforeAll(async () => {
      const servicio1 = await createService(userA.accessToken, `Servicio Combo Accounting 1 ${randomUUID()}`);
      servicioCombo1Id = servicio1.id;
      const servicio2 = await createService(userA.accessToken, `Servicio Combo Accounting 2 ${randomUUID()}`);
      servicioCombo2Id = servicio2.id;
      const combo = await createCombo(userA.accessToken, [servicioCombo1Id, servicioCombo2Id]);
      const cliente = await createContact(userA.accessToken, `Cliente Combo Accounting ${randomUUID()}`);
      const cuenta1 = await createAccount(userA.accessToken, servicioCombo1Id, COSTO_CUENTA_1, FECHA_COMBO);
      const cuenta2 = await createAccount(userA.accessToken, servicioCombo2Id, COSTO_CUENTA_2, FECHA_COMBO);
      await createComboSale(
        userA.accessToken,
        cliente.id,
        combo.id,
        [
          { servicioId: servicioCombo1Id, cuentaId: cuenta1.id },
          { servicioId: servicioCombo2Id, cuentaId: cuenta2.id },
        ],
        PRECIO_COMBO,
        FECHA_COMBO,
      );

      const servicioB = await createService(userB.accessToken, `Servicio Accounting B combo-day ${randomUUID()}`);
      servicioBId = servicioB.id;
      const clienteB = await createContact(userB.accessToken, `Cliente Accounting B combo-day ${randomUUID()}`);
      const cuentaB = await createAccount(userB.accessToken, servicioBId, B.costo, FECHA_COMBO);
      await createSale(userB.accessToken, clienteB.id, cuentaB.id, B.precio, FECHA_COMBO);
    });

    it('summary de A incluye el ingreso de la VentaCombo (vía venta_combo_id) y nunca los de B', async () => {
      const summaryA = await getSummary(userA.accessToken, FECHA_COMBO);
      expect(summaryA).toEqual(esperadoA);

      const summaryB = await getSummary(userB.accessToken, FECHA_COMBO);
      expect(summaryB).toEqual(esperadoB);
    });

    it('by-service de A: inversion por servicio del combo, sin ingresos atribuidos (el ingreso vive en la VentaCombo, no en una Sale con servicioId)', async () => {
      const byServiceA = await getByService(userA.accessToken, FECHA_COMBO);
      const porServicio = new Map(byServiceA.map((r) => [r.servicioId, r]));

      expect(porServicio.get(servicioCombo1Id)).toMatchObject({
        inversion: COSTO_CUENTA_1,
        ingresos: 0,
      });
      expect(porServicio.get(servicioCombo2Id)).toMatchObject({
        inversion: COSTO_CUENTA_2,
        ingresos: 0,
      });
      expect(porServicio.has(servicioBId)).toBe(false);
    });

    it('admin viewOwnerId=<id de A> ve exactamente los números del combo de A; viewOwnerId=all suma A + B', async () => {
      const comoA = await getSummary(adminAccessToken, FECHA_COMBO, userA.id);
      expect(comoA).toEqual(esperadoA);

      const todo = await getSummary(adminAccessToken, FECHA_COMBO, 'all');
      expect(todo).toEqual(esperadoAll);
    });
  });
});
