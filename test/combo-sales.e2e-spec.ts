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

// Mismo criterio que addMonthsToDate (src/sales/date.util.ts) para
// duracionMeses=1 (entero, sin parte fraccionaria): mes calendario, no "+30
// días fijos" (que rompería en meses de distinta longitud).
function addOneMonthUTC(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// Fecha fija en el pasado que ningún otro test o uso manual toca, igual
// técnica que test/accounting.e2e-spec.ts: así el ingreso del combo se
// puede verificar con un número exacto en /accounting/summary, sin que le
// afecte que otros e2e corran en paralelo sobre la misma BD compartida.
const FECHA_TEST = '2020-07-20';

describe('Combo sales (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;

  let servicioAId: string;
  let servicioBId: string;
  let comboId: string;
  let clienteId: string;
  let cuentaAId: string;
  let cuentaBId: string;

  const createdComboSaleIds: string[] = [];
  const createdSaleIds: string[] = [];

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
        nombre: 'Combo E2E Servicio A',
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
        nombre: 'Combo E2E Servicio B',
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
        nombre: 'Combo E2E A+B',
        servicioIds: [servicioAId, servicioBId],
        precioCombo: 30,
      })
      .expect(201);
    comboId = comboRes.body.id;

    const clienteRes = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Cliente Combo E2E',
        whatsapp: '+51922222222',
        tipo: 'CLIENTE_FINAL',
      })
      .expect(201);
    clienteId = clienteRes.body.id;

    const cuentaA = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        servicioId: servicioAId,
        correo: 'combo-a@test.com',
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
        correo: 'combo-b@test.com',
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
    for (const id of createdComboSaleIds) {
      await dataSource.query('DELETE FROM payments WHERE venta_combo_id = $1', [id]);
      await dataSource.query('DELETE FROM sales WHERE venta_combo_id = $1', [id]);
      await dataSource.query('DELETE FROM combo_sales WHERE id = $1', [id]);
    }
    for (const id of createdSaleIds) {
      await dataSource.query('DELETE FROM payments WHERE venta_id = $1', [id]);
      await dataSource.query('DELETE FROM sales WHERE id = $1', [id]);
    }
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

  // La creación (camino feliz + rollback) se cubre en
  // test/combo-sales-create.e2e-spec.ts.

  it('bloquea acciones directas (deactivate/reactivate/renew) sobre una venta hija', async () => {
    const combo = await request(app.getHttpServer())
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
    createdComboSaleIds.push(combo.body.id);

    const detail = await request(app.getHttpServer())
      .get(`/api/combo-sales/${combo.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const hijaId = detail.body.ventas[0].id;

    await request(app.getHttpServer())
      .delete(`/api/sales/${hijaId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/sales/${hijaId}/reactivate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/sales/${hijaId}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    // Desactivar el combo primero para no dejar cta-a/cta-b ocupadas para
    // los tests siguientes.
    await request(app.getHttpServer())
      .delete(`/api/combo-sales/${combo.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('renew extiende fechaFin del wrapper y sincroniza las ventas hijas', async () => {
    const combo = await request(app.getHttpServer())
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
    createdComboSaleIds.push(combo.body.id);

    const renewRes = await request(app.getHttpServer())
      .post(`/api/combo-sales/${combo.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const fechaFinEsperada = addOneMonthUTC(isoDateOffset(30));
    expect(renewRes.body.fechaFin).toBe(fechaFinEsperada);
    expect(renewRes.body.ventas.every((v: { fechaFin: string }) => v.fechaFin === fechaFinEsperada)).toBe(true);

    const payments = await dataSource.query(
      "SELECT * FROM payments WHERE venta_combo_id = $1 AND tipo = 'renovacion'",
      [combo.body.id],
    );
    expect(payments).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/combo-sales/${combo.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('deactivate libera cuentas y desactiva wrapper + hijas', async () => {
    const combo = await request(app.getHttpServer())
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
    createdComboSaleIds.push(combo.body.id);

    await request(app.getHttpServer())
      .delete(`/api/combo-sales/${combo.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/combo-sales/${combo.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.activo).toBe(false);
    expect(detail.body.ventas.every((v: { activo: boolean }) => !v.activo)).toBe(true);

    const cuentaA = await request(app.getHttpServer())
      .get(`/api/accounts/${cuentaAId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cuentaA.body.clienteId).toBeNull();
  });

  // El rollback (caso crítico) se cubre en
  // test/combo-sales-create.e2e-spec.ts.

  it('/accounting/summary suma el ingreso de un combo vendido (exacto, fecha aislada)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/combo-sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId,
        comboId,
        fechaInicio: FECHA_TEST,
        fechaFin: FECHA_TEST,
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          { servicioId: servicioAId, cuentaId: cuentaAId },
          { servicioId: servicioBId, cuentaId: cuentaBId },
        ],
      })
      .expect(201);
    createdComboSaleIds.push(res.body.id);

    const summary = await request(app.getHttpServer())
      .get('/api/accounting/summary')
      .query({ desde: FECHA_TEST, hasta: FECHA_TEST })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(summary.body.ingresos).toBe(30);

    await request(app.getHttpServer())
      .delete(`/api/combo-sales/${res.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
