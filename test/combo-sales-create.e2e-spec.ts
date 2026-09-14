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

// Cubre únicamente POST /api/combo-sales (lo único que existe en este
// punto de la historia): camino feliz y el caso crítico de rollback. El
// resto de endpoints (GET/PATCH/DELETE/reactivate/renew) se testean en
// test/combo-sales.e2e-spec.ts una vez que existen.
describe('Combo sales — create (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;

  let servicioAId: string;
  let servicioBId: string;
  let comboId: string;
  let clienteId: string;
  let cuentaAId: string;
  let cuentaBId: string;

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

    const servicioA = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Combo Create E2E Servicio A',
        tipo: 'SIN_PERFILES',
        duracionMeses: 1,
        precioBase: 20,
      })
      .expect(201);
    servicioAId = servicioA.body.id;

    const servicioB = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Combo Create E2E Servicio B',
        tipo: 'SIN_PERFILES',
        duracionMeses: 1,
        precioBase: 15,
      })
      .expect(201);
    servicioBId = servicioB.body.id;

    const comboRes = await request(app.getHttpServer())
      .post('/api/combos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Combo Create E2E A+B',
        servicioIds: [servicioAId, servicioBId],
        precioCombo: 30,
      })
      .expect(201);
    comboId = comboRes.body.id;

    const clienteRes = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Cliente Combo Create E2E',
        whatsapp: '+51955555551',
        tipo: 'CLIENTE_FINAL',
      })
      .expect(201);
    clienteId = clienteRes.body.id;

    const cuentaA = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        servicioId: servicioAId,
        correo: 'combo-create-a@test.com',
        claveServicio: 'clave',
        fechaInicio: isoDateOffset(-30),
        fechaFin: isoDateOffset(335),
        costo: 5,
        metodoPago: 'Yape',
      })
      .expect(201);
    cuentaAId = cuentaA.body.id;

    const cuentaB = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        servicioId: servicioBId,
        correo: 'combo-create-b@test.com',
        claveServicio: 'clave',
        fechaInicio: isoDateOffset(-30),
        fechaFin: isoDateOffset(335),
        costo: 4,
        metodoPago: 'Yape',
      })
      .expect(201);
    cuentaBId = cuentaB.body.id;
  });

  afterAll(async () => {
    // Orden importa por las FK: payments -> sales -> combo_sales -> combos.
    // Cubre tanto las ventas hijas del combo como la venta "ocupante" del
    // test de rollback (esa se desactivó por API, no se borró).
    await dataSource.query(
      'DELETE FROM payments WHERE venta_id IN (SELECT id FROM sales WHERE cuenta_id IN ($1, $2))',
      [cuentaAId, cuentaBId],
    );
    await dataSource.query('DELETE FROM payments WHERE venta_combo_id IN (SELECT id FROM combo_sales WHERE combo_id = $1)', [comboId]);
    await dataSource.query('DELETE FROM sales WHERE cuenta_id IN ($1, $2)', [
      cuentaAId,
      cuentaBId,
    ]);
    await dataSource.query('DELETE FROM combo_sales WHERE combo_id = $1', [comboId]);
    await dataSource.query('DELETE FROM combos WHERE id = $1', [comboId]);
    await dataSource.query('DELETE FROM accounts WHERE id IN ($1, $2)', [
      cuentaAId,
      cuentaBId,
    ]);
    await dataSource.query('DELETE FROM contacts WHERE id = $1', [clienteId]);
    await dataSource.query('DELETE FROM services WHERE id IN ($1, $2)', [
      servicioAId,
      servicioBId,
    ]);
    await app.close();
  });

  it('crea la VentaCombo, sus 2 ventas hijas (precio=0) y un único Payment ligado al wrapper', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/combo-sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId,
        comboId,
        fechaInicio: isoDateOffset(0),
        fechaFin: isoDateOffset(30),
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          { servicioId: servicioAId, cuentaId: cuentaAId },
          { servicioId: servicioBId, cuentaId: cuentaBId },
        ],
      })
      .expect(201);

    expect(res.body.codigoVenta).toMatch(/^C-\d{5}$/);
    expect(res.body.precio).toBe(30);
    expect(res.body.precioPEN).toBe(30);
    expect(res.body.ventas).toHaveLength(2);
    for (const venta of res.body.ventas) {
      expect(venta.precio).toBe(0);
      expect(venta.ventaComboId).toBe(res.body.id);
    }

    const payments = await dataSource.query(
      'SELECT * FROM payments WHERE venta_combo_id = $1',
      [res.body.id],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].venta_id).toBeNull();
    expect(Number(payments[0].monto_pen)).toBe(30);
    expect(payments[0].tipo).toBe('venta_inicial');

    // Sin DELETE /combo-sales todavía (llega en el próximo commit): se
    // libera todo a mano por SQL para dejar las cuentas libres para el
    // siguiente test.
    await dataSource.query('UPDATE sales SET activo = false WHERE venta_combo_id = $1', [
      res.body.id,
    ]);
    await dataSource.query('UPDATE accounts SET cliente_id = NULL WHERE id IN ($1, $2)', [
      cuentaAId,
      cuentaBId,
    ]);
  });

  it('CRÍTICO — rollback: si la 2da asignación falla por exclusividad, no queda NADA creado', async () => {
    const otroClienteRes = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Otro Cliente Rollback Create E2E',
        whatsapp: '+51955555552',
        tipo: 'CLIENTE_FINAL',
      })
      .expect(201);

    const ventaOcupanteRes = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId: otroClienteRes.body.id,
        cuentaId: cuentaBId,
        fechaInicio: isoDateOffset(0),
        fechaFin: isoDateOffset(30),
        precio: 15,
        moneda: 'PEN',
        metodoPago: 'Yape',
      })
      .expect(201);

    const [{ count: comboSalesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );

    const res = await request(app.getHttpServer())
      .post('/api/combo-sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId,
        comboId,
        fechaInicio: isoDateOffset(0),
        fechaFin: isoDateOffset(30),
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          { servicioId: servicioAId, cuentaId: cuentaAId }, // libre, pasaría
          { servicioId: servicioBId, cuentaId: cuentaBId }, // OCUPADA
        ],
      })
      .expect(409);

    expect(res.body.message).toContain('Combo Create E2E Servicio B');

    const [{ count: comboSalesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM combo_sales',
    );
    const [{ count: salesDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM sales',
    );
    const [{ count: paymentsDespues }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM payments',
    );

    // La aserción central: ni la VentaCombo, ni la Sale de la primera
    // asignación (que sí había validado bien), ni ningún Payment quedaron
    // creados — el rollback deshizo todo.
    expect(comboSalesDespues).toBe(comboSalesAntes);
    expect(salesDespues).toBe(salesAntes);
    expect(paymentsDespues).toBe(paymentsAntes);

    // Y la cuenta A (que sí había pasado su validación) no quedó marcada
    // con un cliente asignado.
    const cuentaA = await request(app.getHttpServer())
      .get(`/api/accounts/${cuentaAId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cuentaA.body.clienteId).toBeNull();

    await request(app.getHttpServer())
      .delete(`/api/sales/${ventaOcupanteRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
