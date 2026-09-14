import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// A diferencia de sales-vencimiento.e2e-spec.ts (que compara por delta
// contra "ahora"), acá se usa una fecha fija en el pasado que ningún otro
// test o uso manual toca: los 4 reportes se filtran a exactamente ese día
// (desde=hasta=FECHA_TEST), así que el número esperado es exacto y no le
// afecta que otros archivos de e2e corran en paralelo sobre la misma BD.
const FECHA_TEST = '2020-06-15';

// Payment de renovación usa la fecha "de hoy" del servidor (no viene del
// body de renew, ver SalesService.renew) y Account.createdAt es siempre
// "ahora": ambos se corrigen acá con un UPDATE directo para que caigan
// dentro de FECHA_TEST también.
async function backdate(
  dataSource: DataSource,
  table: string,
  column: string,
  id: string,
): Promise<void> {
  await dataSource.query(
    `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
    [FECHA_TEST, id],
  );
}

interface AccountingSummary {
  ingresos: number;
  inversion: number;
  gastos: number;
  ganancia: number;
}

describe('Accounting (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;

  // Método de pago único: no lo usa ninguna otra venta/gasto, así que
  // by-payment-method también se puede filtrar por valor exacto.
  const METODO_PAGO = `E2E-Accounting-${Date.now()}`;

  let servicioId: string;
  let clienteId: string;
  let cuentaId: string;
  let ventaId: string;
  let gastoId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = app.get(DataSource);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(201);
    token = loginRes.body.accessToken as string;

    const servicioRes = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Contabilidad E2E',
        tipo: 'SIN_PERFILES',
        duracionMeses: 1,
        precioBase: 10,
      })
      .expect(201);
    servicioId = servicioRes.body.id;

    const clienteRes = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Cliente Contabilidad E2E',
        whatsapp: '+51900000003',
        tipo: 'CLIENTE_FINAL',
      })
      .expect(201);
    clienteId = clienteRes.body.id;

    // costo=100 -> "inversion" esperada. createdAt se backdatea a
    // FECHA_TEST porque la API no lo expone (lo pone @CreateDateColumn).
    const cuentaRes = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        servicioId,
        correo: 'contabilidad-e2e@test.com',
        claveServicio: 'clave',
        fechaInicio: FECHA_TEST,
        fechaFin: FECHA_TEST,
        costo: 100,
        metodoPago: METODO_PAGO,
      })
      .expect(201);
    cuentaId = cuentaRes.body.id;
    await backdate(dataSource, 'accounts', 'created_at', cuentaId);

    // Venta con fechaInicio=FECHA_TEST -> Payment venta_inicial queda con
    // fecha=FECHA_TEST directo (SalesService.create usa fechaInicio).
    // precio=50 -> montoPEN=50.
    const ventaRes = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId,
        cuentaId,
        fechaInicio: FECHA_TEST,
        fechaFin: FECHA_TEST,
        precio: 50,
        moneda: 'PEN',
        metodoPago: METODO_PAGO,
      })
      .expect(201);
    ventaId = ventaRes.body.id;

    // Renovación precio=30 -> Payment renovacion montoPEN=30, con fecha de
    // hoy (SalesService.renew): se backdatea a FECHA_TEST después.
    await request(app.getHttpServer())
      .post(`/api/sales/${ventaId}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ precio: 30, metodoPago: METODO_PAGO })
      .expect(201);
    await dataSource.query(
      'UPDATE payments SET fecha = $1 WHERE venta_id = $2 AND tipo = $3',
      [FECHA_TEST, ventaId, 'renovacion'],
    );

    // Gasto=20, fecha=FECHA_TEST directo (sí viene en el body).
    const gastoRes = await request(app.getHttpServer())
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        descripcion: 'Gasto E2E Contabilidad',
        monto: 20,
        moneda: 'PEN',
        metodoPago: METODO_PAGO,
        fecha: FECHA_TEST,
      })
      .expect(201);
    gastoId = gastoRes.body.id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM payments WHERE venta_id = $1', [
      ventaId,
    ]);
    await dataSource.query('DELETE FROM expenses WHERE id = $1', [gastoId]);
    await dataSource.query('DELETE FROM sales WHERE id = $1', [ventaId]);
    await dataSource.query('DELETE FROM accounts WHERE id = $1', [cuentaId]);
    await dataSource.query('DELETE FROM contacts WHERE id = $1', [clienteId]);
    await dataSource.query('DELETE FROM services WHERE id = $1', [
      servicioId,
    ]);
    await app.close();
  });

  it('summary: ingresos=80, inversion=100, gastos=20, ganancia=-40 en FECHA_TEST (exacto)', async () => {
    const res: { body: AccountingSummary } = await request(app.getHttpServer())
      .get('/api/accounting/summary')
      .query({ desde: FECHA_TEST, hasta: FECHA_TEST })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      ingresos: 80,
      inversion: 100,
      gastos: 20,
      ganancia: -40,
    });
  });

  it('by-service: ingresos=80, inversion=100, ganancia=-20 para el servicio de este test (exacto)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/accounting/by-service')
      .query({ desde: FECHA_TEST, hasta: FECHA_TEST })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      {
        servicioId,
        nombre: 'Contabilidad E2E',
        inversion: 100,
        ingresos: 80,
        ganancia: -20,
      },
    ]);
  });

  it('by-payment-method: ingresos=80, gastos=20, neto=60 para el método de este test (exacto)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/accounting/by-payment-method')
      .query({ desde: FECHA_TEST, hasta: FECHA_TEST })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      { metodoPago: METODO_PAGO, ingresos: 80, gastos: 20, neto: 60 },
    ]);
  });

  it('timeline (groupBy=day): un único punto en FECHA_TEST con ingresos=80, gastos=20, ganancia=60', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/accounting/timeline')
      .query({ desde: FECHA_TEST, hasta: FECHA_TEST, groupBy: 'day' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      { periodo: FECHA_TEST, ingresos: 80, gastos: 20, ganancia: 60 },
    ]);
  });
});
