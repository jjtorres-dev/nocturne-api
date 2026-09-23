import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { BACKFILL_ACCOUNT_PAYMENTS_SQL } from '../src/database/migrations/1790145262908-AddAccountPayments.js';

// Bloque — Renovación con el proveedor: pagos al proveedor
// (account_payments), backfill de la migración, POST
// /accounts/:id/renew-provider, Contabilidad según la fecha del pago y
// rentabilidad con compra + renovaciones. Usuarios reales (2 revendedores
// creados por la API) y JWT real de /auth/login, contra Postgres.
//
// Las fechas parten de CURRENT_DATE de Postgres, igual que Bloque C. Cada
// revendedor es nuevo, así que los reportes de Contabilidad (acotados a
// "lo suyo") dan números exactos sin importar qué más haya en la BD.
describe('Renovación con el proveedor (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let hoyServidor: string;
  let userA: { id: string; accessToken: string };
  let userB: { id: string; accessToken: string };
  let servicioA: string;
  let servicioB: string;

  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdContactIds: string[] = [];
  const createdSaleIds: string[] = [];

  const TRIGGER = 'e2e_falla_renovacion_proveedor';

  function offset(days: number): string {
    const [y, m, d] = hoyServidor.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  // Primer y último día del mes `delta` meses respecto del de hoy.
  function mes(delta: number): { desde: string; hasta: string; dia: (n: number) => string } {
    const [y, m] = hoyServidor.split('-').map(Number);
    const primero = new Date(Date.UTC(y, m - 1 + delta, 1));
    const ultimo = new Date(Date.UTC(y, m + delta, 0));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return {
      desde: iso(primero),
      hasta: iso(ultimo),
      dia: (n) => iso(new Date(Date.UTC(y, m - 1 + delta, n))),
    };
  }

  function http() {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = app.get(DataSource);

    const [{ hoy }] = await dataSource.query('SELECT CURRENT_DATE::text AS hoy');
    hoyServidor = hoy;

    const loginRes = await http()
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(201);
    adminToken = loginRes.body.accessToken;

    userA = await createRevendedor('renov-prov-a');
    userB = await createRevendedor('renov-prov-b');
    servicioA = (await createService(userA.accessToken)).id;
    servicioB = (await createService(userB.accessToken)).id;
  });

  afterAll(async () => {
    await dataSource.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON accounts`);
    await dataSource.query(`DROP FUNCTION IF EXISTS ${TRIGGER}()`);
    if (createdSaleIds.length > 0) {
      await dataSource.query('DELETE FROM payments WHERE venta_id = ANY($1)', [
        createdSaleIds,
      ]);
      await dataSource.query('DELETE FROM sales WHERE id = ANY($1)', [createdSaleIds]);
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

  async function createRevendedor(prefix: string) {
    const email = `${prefix}-${randomUUID()}@nocturne.dev`;
    createdUserEmails.push(email);
    const createRes = await http()
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, password: 'password123', name: prefix, role: 'revendedor' })
      .expect(201);
    const loginRes = await http()
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    return {
      id: createRes.body.id as string,
      accessToken: loginRes.body.accessToken as string,
    };
  }

  async function createService(token: string) {
    const res = await http()
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: `Renov prov ${randomUUID()}`,
        tipo: 'SIN_PERFILES',
        duracionMeses: 1,
        precioBase: 15,
      })
      .expect(201);
    createdServiceIds.push(res.body.id);
    return res.body;
  }

  async function createAccount(
    token: string,
    servicioId: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; fechaFin: string; costo: number }> {
    const res = await http()
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        servicioId,
        correo: `${randomUUID()}@nocturne.dev`,
        claveServicio: 'clave-servicio',
        fechaInicio: offset(0),
        fechaFin: offset(30),
        costo: 40,
        metodoPago: 'transferencia',
        ...extra,
      })
      .expect(201);
    createdAccountIds.push(res.body.id);
    return res.body;
  }

  function renew(token: string, id: string, body: Record<string, unknown>, status = 201) {
    return http()
      .post(`/api/accounts/${id}/renew-provider`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(status);
  }

  async function pagosDe(cuentaId: string) {
    return dataSource.query(
      `SELECT tipo, fecha::text AS fecha, monto::float AS monto, moneda,
              tasa_cambio::float AS "tasaCambio", monto_pen::float AS "montoPEN",
              metodo_pago AS "metodoPago"
       FROM account_payments WHERE cuenta_id = $1 ORDER BY fecha, created_at`,
      [cuentaId],
    );
  }

  async function fechaFinDe(cuentaId: string): Promise<string> {
    const [row] = await dataSource.query(
      'SELECT fecha_fin::text AS "fechaFin" FROM accounts WHERE id = $1',
      [cuentaId],
    );
    return row.fechaFin;
  }

  async function summary(token: string, desde: string, hasta: string) {
    const res = await http()
      .get('/api/accounting/summary')
      .query({ desde, hasta })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as { ingresos: number; inversion: number; gastos: number; ganancia: number };
  }

  describe('backfill de la migración (AddAccountPayments)', () => {
    it('N cuentas sin pago → N pagos compra_inicial con los datos de la cuenta, y correrlo dos veces no duplica', async () => {
      const cuentas = [
        await createAccount(userA.accessToken, servicioA, {
          costo: 11.5,
          fechaInicio: offset(-40),
          metodoPago: 'Yape',
        }),
        await createAccount(userA.accessToken, servicioA, {
          costo: 22,
          fechaInicio: offset(-10),
          metodoPago: 'Plin',
        }),
        await createAccount(userA.accessToken, servicioA, {
          costo: 33.3,
          fechaInicio: offset(-5),
          metodoPago: 'transferencia',
        }),
      ];
      const ids = cuentas.map((c) => c.id);
      // Simula cuentas creadas antes de este bloque: sin pago propio.
      await dataSource.query('DELETE FROM account_payments WHERE cuenta_id = ANY($1)', [ids]);

      await dataSource.query(BACKFILL_ACCOUNT_PAYMENTS_SQL);
      const [{ total: totalTrasPrimera }] = await dataSource.query(
        'SELECT COUNT(*)::int AS total FROM account_payments',
      );
      await dataSource.query(BACKFILL_ACCOUNT_PAYMENTS_SQL);
      const [{ total: totalTrasSegunda }] = await dataSource.query(
        'SELECT COUNT(*)::int AS total FROM account_payments',
      );

      expect(totalTrasSegunda).toBe(totalTrasPrimera);
      expect(await pagosDe(cuentas[0].id)).toEqual([
        {
          tipo: 'compra_inicial',
          fecha: offset(-40),
          monto: 11.5,
          moneda: 'PEN',
          tasaCambio: 1,
          montoPEN: 11.5,
          metodoPago: 'Yape',
        },
      ]);
      expect(await pagosDe(cuentas[1].id)).toEqual([
        expect.objectContaining({ tipo: 'compra_inicial', fecha: offset(-10), montoPEN: 22, metodoPago: 'Plin' }),
      ]);
      expect(await pagosDe(cuentas[2].id)).toEqual([
        expect.objectContaining({ tipo: 'compra_inicial', fecha: offset(-5), montoPEN: 33.3 }),
      ]);
      // Y ninguna cuenta de la BD quedó sin su compra_inicial ni con dos.
      const [{ sinPago, conVarios }] = await dataSource.query(`
        SELECT
          (SELECT COUNT(*)::int FROM accounts a WHERE NOT EXISTS (
            SELECT 1 FROM account_payments p WHERE p.cuenta_id = a.id AND p.tipo = 'compra_inicial')) AS "sinPago",
          (SELECT COUNT(*)::int FROM (
            SELECT cuenta_id FROM account_payments WHERE tipo = 'compra_inicial'
            GROUP BY cuenta_id HAVING COUNT(*) > 1) x) AS "conVarios"
      `);
      expect({ sinPago, conVarios }).toEqual({ sinPago: 0, conVarios: 0 });
    });
  });

  describe('pago de compra al crear y editar la cuenta', () => {
    it('crear la cuenta crea su compra_inicial (PEN, tasa 1, fecha = fechaInicio)', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA, {
        costo: 45,
        fechaInicio: offset(-3),
        metodoPago: 'Yape',
      });

      expect(await pagosDe(cuenta.id)).toEqual([
        {
          tipo: 'compra_inicial',
          fecha: offset(-3),
          monto: 45,
          moneda: 'PEN',
          tasaCambio: 1,
          montoPEN: 45,
          metodoPago: 'Yape',
        },
      ]);
    });

    it('editar costo, fechaInicio o metodoPago actualiza ese mismo pago (no crea otro); editar otra cosa no lo toca', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA, { costo: 30 });

      await http()
        .patch(`/api/accounts/${cuenta.id}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ costo: 35, fechaInicio: offset(-20), metodoPago: 'Plin' })
        .expect(200);
      await http()
        .patch(`/api/accounts/${cuenta.id}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ correo: `${randomUUID()}@nocturne.dev` })
        .expect(200);

      expect(await pagosDe(cuenta.id)).toEqual([
        expect.objectContaining({
          tipo: 'compra_inicial',
          fecha: offset(-20),
          monto: 35,
          montoPEN: 35,
          metodoPago: 'Plin',
        }),
      ]);
    });
  });

  describe('Contabilidad según la fecha en que se pagó', () => {
    it('una cuenta registrada hoy con fecha de inicio el mes pasado cuenta su inversión en el mes pasado, no en este', async () => {
      const userC = await createRevendedor('renov-prov-c');
      const servicioC = (await createService(userC.accessToken)).id;
      const pasado = mes(-1);
      const actual = mes(0);
      await createAccount(userC.accessToken, servicioC, {
        costo: 60,
        fechaInicio: pasado.dia(10),
        fechaFin: offset(20),
      });

      expect((await summary(userC.accessToken, pasado.desde, pasado.hasta)).inversion).toBe(60);
      expect((await summary(userC.accessToken, actual.desde, actual.hasta)).inversion).toBe(0);

      const byService = await http()
        .get('/api/accounting/by-service')
        .query({ desde: pasado.desde, hasta: pasado.hasta })
        .set('Authorization', `Bearer ${userC.accessToken}`)
        .expect(200);
      expect(byService.body).toEqual([
        expect.objectContaining({ servicioId: servicioC, inversion: 60, ingresos: 0, ganancia: -60 }),
      ]);

      const timeline = await http()
        .get('/api/accounting/timeline')
        .query({ desde: pasado.desde, hasta: pasado.hasta, groupBy: 'month' })
        .set('Authorization', `Bearer ${userC.accessToken}`)
        .expect(200);
      expect(timeline.body).toEqual([
        { periodo: pasado.desde, ingresos: 0, inversion: 60, gastos: 0, ganancia: -60 },
      ]);
    });

    it('la renovación cuenta como inversión en el mes de su fecha de pago, con su propio monto', async () => {
      const userD = await createRevendedor('renov-prov-d');
      const servicioD = (await createService(userD.accessToken)).id;
      const pasado = mes(-1);
      const actual = mes(0);
      const cuenta = await createAccount(userD.accessToken, servicioD, {
        costo: 40,
        fechaInicio: pasado.dia(5),
        fechaFin: offset(1),
      });

      await renew(userD.accessToken, cuenta.id, {
        monto: 5,
        moneda: 'USD',
        tasaCambio: 3.8,
        metodoPago: 'Binance',
        fechaPago: actual.dia(1),
        nuevaFechaFin: offset(31),
      });

      expect((await summary(userD.accessToken, pasado.desde, pasado.hasta)).inversion).toBe(40);
      expect((await summary(userD.accessToken, actual.desde, actual.hasta)).inversion).toBe(19);
    });

    it('el admin con viewOwnerId de otro dueño ve la inversión de ese dueño (mismo scoping de siempre)', async () => {
      const pasado = mes(-1);
      const cuenta = await createAccount(userB.accessToken, servicioB, {
        costo: 70,
        fechaInicio: pasado.dia(12),
        fechaFin: offset(20),
      });
      expect(cuenta.id).toBeDefined();

      const res = await http()
        .get('/api/accounting/summary')
        .query({ desde: pasado.desde, hasta: pasado.hasta, viewOwnerId: userB.id })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.inversion).toBe(70);
      // A, pidiendo lo mismo, no ve la de B.
      const deA = await summary(userA.accessToken, pasado.desde, pasado.hasta);
      const cuentasDeAElMesPasado = await dataSource.query(
        `SELECT COALESCE(SUM(p.monto_pen), 0)::float AS total FROM account_payments p
         JOIN accounts a ON a.id = p.cuenta_id
         WHERE a.owner_id = $1 AND p.fecha BETWEEN $2 AND $3`,
        [userA.id, pasado.desde, pasado.hasta],
      );
      expect(deA.inversion).toBe(cuentasDeAElMesPasado[0].total);
    });
  });

  describe('POST /accounts/:id/renew-provider', () => {
    it('crea el pago renovacion y mueve la fecha de vencimiento', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA, { fechaFin: offset(2) });

      const res = await renew(userA.accessToken, cuenta.id, {
        monto: 42,
        moneda: 'PEN',
        metodoPago: 'Yape',
        nuevaFechaFin: offset(32),
      });

      expect(res.body.fechaFin).toBe(offset(32));
      expect(await fechaFinDe(cuenta.id)).toBe(offset(32));
      const pagos = await pagosDe(cuenta.id);
      expect(pagos).toHaveLength(2);
      // Sin fechaPago: hoy. Sin tasaCambio: 1.
      expect(pagos.find((p: { tipo: string }) => p.tipo === 'renovacion')).toEqual({
        tipo: 'renovacion',
        fecha: hoyServidor,
        monto: 42,
        moneda: 'PEN',
        tasaCambio: 1,
        montoPEN: 42,
        metodoPago: 'Yape',
      });
    });

    it('la renovación puede costar distinto que la compra (y en otra moneda)', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA, {
        costo: 40,
        fechaInicio: offset(-30),
        fechaFin: offset(2),
      });

      await renew(userA.accessToken, cuenta.id, {
        monto: 12.5,
        moneda: 'USD',
        tasaCambio: 3.75,
        metodoPago: 'Binance',
        fechaPago: offset(-1),
        nuevaFechaFin: offset(32),
      });

      expect(await pagosDe(cuenta.id)).toEqual([
        expect.objectContaining({ tipo: 'compra_inicial', monto: 40, montoPEN: 40 }),
        {
          tipo: 'renovacion',
          fecha: offset(-1),
          monto: 12.5,
          moneda: 'USD',
          tasaCambio: 3.75,
          montoPEN: 46.88,
          metodoPago: 'Binance',
        },
      ]);
    });

    it('es atómico: si falla el cambio de fecha, tampoco queda el pago', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA, { fechaFin: offset(2) });
      // Falla forzada DENTRO de la transacción: un trigger que rechaza el
      // UPDATE de fecha_fin de esta cuenta. El INSERT del pago ya corrió
      // cuando falla, así que solo un rollback real lo deja afuera.
      await dataSource.query(`
        CREATE OR REPLACE FUNCTION ${TRIGGER}() RETURNS trigger AS $$
        BEGIN
          IF NEW.id = '${cuenta.id}' AND NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin THEN
            RAISE EXCEPTION 'falla forzada por el e2e';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql
      `);
      await dataSource.query(
        `CREATE TRIGGER ${TRIGGER} BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION ${TRIGGER}()`,
      );
      try {
        await renew(
          userA.accessToken,
          cuenta.id,
          { monto: 20, moneda: 'PEN', metodoPago: 'Yape', nuevaFechaFin: offset(32) },
          500,
        );
      } finally {
        await dataSource.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON accounts`);
        await dataSource.query(`DROP FUNCTION IF EXISTS ${TRIGGER}()`);
      }

      expect(await fechaFinDe(cuenta.id)).toBe(offset(2));
      expect((await pagosDe(cuenta.id)).map((p: { tipo: string }) => p.tipo)).toEqual([
        'compra_inicial',
      ]);

      // Sin el trigger, la misma renovación pasa.
      await renew(userA.accessToken, cuenta.id, {
        monto: 20,
        moneda: 'PEN',
        metodoPago: 'Yape',
        nuevaFechaFin: offset(32),
      });
      expect(await fechaFinDe(cuenta.id)).toBe(offset(32));
    });

    it.each([
      ['igual a la actual', 0],
      ['anterior a la actual', -1],
    ])('da 400 si la nueva fecha de vencimiento es %s, sin crear pago', async (_caso, delta) => {
      const cuenta = await createAccount(userA.accessToken, servicioA, { fechaFin: offset(10) });

      await renew(
        userA.accessToken,
        cuenta.id,
        { monto: 20, moneda: 'PEN', metodoPago: 'Yape', nuevaFechaFin: offset(10 + delta) },
        400,
      );

      expect(await pagosDe(cuenta.id)).toHaveLength(1);
      expect(await fechaFinDe(cuenta.id)).toBe(offset(10));
    });

    it('da 400 sin monto, moneda, método de pago o nueva fecha', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA);
      const completo = { monto: 20, moneda: 'PEN', metodoPago: 'Yape', nuevaFechaFin: offset(60) };
      for (const campo of Object.keys(completo)) {
        const body: Record<string, unknown> = { ...completo };
        delete body[campo];
        await renew(userA.accessToken, cuenta.id, body, 400);
      }
      expect(await pagosDe(cuenta.id)).toHaveLength(1);
    });

    it('renovar una cuenta ajena da 404 y no toca nada; el admin sí puede', async () => {
      const cuentaB = await createAccount(userB.accessToken, servicioB, { fechaFin: offset(2) });
      const body = { monto: 20, moneda: 'PEN', metodoPago: 'Yape', nuevaFechaFin: offset(32) };

      await renew(userA.accessToken, cuentaB.id, body, 404);
      expect(await pagosDe(cuentaB.id)).toHaveLength(1);
      expect(await fechaFinDe(cuentaB.id)).toBe(offset(2));

      await renew(adminToken, cuentaB.id, body);
      expect(await fechaFinDe(cuentaB.id)).toBe(offset(32));
    });

    it('401 sin token', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA);
      await http()
        .post(`/api/accounts/${cuenta.id}/renew-provider`)
        .send({ monto: 20, moneda: 'PEN', metodoPago: 'Yape', nuevaFechaFin: offset(60) })
        .expect(401);
    });

    it('al renovarla, la cuenta sale de "por renovar con el proveedor"', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA, { fechaFin: offset(3) });
      const porRenovar = async () =>
        (
          await http()
            .get('/api/accounts/por-renovar')
            .set('Authorization', `Bearer ${userA.accessToken}`)
            .expect(200)
        ).body.map((c: { id: string }) => c.id);

      expect(await porRenovar()).toContain(cuenta.id);
      await renew(userA.accessToken, cuenta.id, {
        monto: 20,
        moneda: 'PEN',
        metodoPago: 'Yape',
        nuevaFechaFin: offset(33),
      });
      expect(await porRenovar()).not.toContain(cuenta.id);
    });
  });

  describe('GET /accounts/:id/provider-payments', () => {
    it('lista compra + renovaciones del más reciente al más antiguo; 404 si es ajena', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA, {
        costo: 40,
        fechaInicio: offset(-60),
        fechaFin: offset(-30),
      });
      await renew(userA.accessToken, cuenta.id, {
        monto: 41,
        moneda: 'PEN',
        metodoPago: 'Yape',
        fechaPago: offset(-30),
        nuevaFechaFin: offset(0),
      });
      await renew(userA.accessToken, cuenta.id, {
        monto: 43,
        moneda: 'PEN',
        metodoPago: 'Plin',
        fechaPago: offset(0),
        nuevaFechaFin: offset(30),
      });

      const res = await http()
        .get(`/api/accounts/${cuenta.id}/provider-payments`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(200);
      expect(
        res.body.map((p: { tipo: string; fecha: string; monto: number; metodoPago: string }) => [
          p.tipo,
          p.fecha,
          p.monto,
          p.metodoPago,
        ]),
      ).toEqual([
        ['renovacion', offset(0), 43, 'Plin'],
        ['renovacion', offset(-30), 41, 'Yape'],
        ['compra_inicial', offset(-60), 40, 'transferencia'],
      ]);

      await http()
        .get(`/api/accounts/${cuenta.id}/provider-payments`)
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .expect(404);
    });
  });

  describe('rentabilidad', () => {
    it('el costo suma compra + renovaciones, con el desglose, y la ganancia lo descuenta', async () => {
      const cuenta = await createAccount(userA.accessToken, servicioA, {
        costo: 40,
        fechaFin: offset(2),
      });
      const cliente = await http()
        .post('/api/contacts')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ nombre: `Cliente ${randomUUID()}`, whatsapp: '+51999999999', tipo: 'CLIENTE_FINAL' })
        .expect(201);
      createdContactIds.push(cliente.body.id);
      const venta = await http()
        .post('/api/sales')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({
          clienteId: cliente.body.id,
          cuentaId: cuenta.id,
          fechaInicio: offset(0),
          fechaFin: offset(30),
          precio: 100,
          moneda: 'PEN',
          metodoPago: 'Yape',
        })
        .expect(201);
      createdSaleIds.push(venta.body.id);

      await renew(userA.accessToken, cuenta.id, {
        monto: 5,
        moneda: 'USD',
        tasaCambio: 3.8,
        metodoPago: 'Binance',
        nuevaFechaFin: offset(32),
      });
      await renew(userA.accessToken, cuenta.id, {
        monto: 25,
        moneda: 'PEN',
        metodoPago: 'Yape',
        nuevaFechaFin: offset(62),
      });

      const res = await http()
        .get(`/api/accounts/${cuenta.id}/rentabilidad`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          // 40 (compra) + 19 (5 USD × 3.8) + 25
          costo: 84,
          desgloseCosto: { compraInicial: 40, renovaciones: 44, cantidadRenovaciones: 2 },
          ingresos: 100,
          ganancia: 16,
        }),
      );
    });
  });
});
