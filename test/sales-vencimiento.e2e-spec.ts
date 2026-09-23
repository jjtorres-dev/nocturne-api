import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Las fechas se calculan relativas a "hoy" dentro del test (nunca fijas):
// si se hardcodearan, el test se rompería solo con el paso del tiempo.
function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('Sales vencimiento (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;

  let servicioId: string;
  let clienteId: string;
  let cuentaId: string;
  const perfilIds: string[] = [];
  const ventaIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Replica el bootstrap real de main.ts: sin esto, los @Transform de
    // los query DTOs (diasAlerta, activo) nunca se ejecutan.
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
        nombre: 'Vencimientos E2E',
        tipo: 'CON_PERFILES',
        duracionMeses: 1,
        precioBase: 5,
      })
      .expect(201);
    servicioId = servicioRes.body.id;

    const clienteRes = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Cliente Vencimientos E2E',
        whatsapp: '+51900000002',
        tipo: 'CLIENTE_FINAL',
      })
      .expect(201);
    clienteId = clienteRes.body.id;

    const cuentaRes = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        servicioId,
        correo: 'vencimientos-e2e@test.com',
        claveServicio: 'clave',
        fechaInicio: isoDateOffset(-365),
        fechaFin: isoDateOffset(365),
        costo: 5,
        metodoPago: 'Yape',
      })
      .expect(201);
    cuentaId = cuentaRes.body.id;

    // Una venta por cada borde relevante: vencida, justo hoy (borde
    // inferior de por_vencer), justo hoy+3 (borde superior, default
    // diasAlerta), hoy+4 (ya al_dia con el default) y una lejana.
    const fechas = [
      isoDateOffset(-5),
      isoDateOffset(0),
      isoDateOffset(3),
      isoDateOffset(4),
      isoDateOffset(100),
    ];

    for (const fechaFin of fechas) {
      const perfilRes = await request(app.getHttpServer())
        .post(`/api/accounts/${cuentaId}/profiles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: `Perfil ${fechaFin}` })
        .expect(201);
      perfilIds.push(perfilRes.body.id);

      const ventaRes = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clienteId,
          cuentaId,
          perfilId: perfilRes.body.id,
          fechaInicio: isoDateOffset(-30),
          fechaFin,
          precio: 10,
          moneda: 'PEN',
          metodoPago: 'Yape',
        })
        .expect(201);
      ventaIds.push(ventaRes.body.id);
    }
  });

  afterAll(async () => {
    // Fase 5: cada Sale creada acá genera su Payment inicial automático
    // (ver SalesService.create), así que hay que borrarlo antes que la
    // venta o la FK payments.venta_id lo impide.
    await dataSource.query(
      'DELETE FROM payments WHERE venta_id IN (SELECT id FROM sales WHERE cuenta_id = $1)',
      [cuentaId],
    );
    await dataSource.query('DELETE FROM sales WHERE cuenta_id = $1', [
      cuentaId,
    ]);
    await dataSource.query('DELETE FROM profiles WHERE cuenta_id = $1', [
      cuentaId,
    ]);
    await dataSource.query('DELETE FROM account_payments WHERE cuenta_id = $1', [cuentaId]);
    await dataSource.query('DELETE FROM accounts WHERE id = $1', [cuentaId]);
    await dataSource.query('DELETE FROM contacts WHERE id = $1', [clienteId]);
    await dataSource.query('DELETE FROM services WHERE id = $1', [
      servicioId,
    ]);
    await app.close();
  });

  it('vencimiento=vencida devuelve solo fechaFin < hoy', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sales')
      .query({ servicioId, vencimiento: 'vencida' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const fechas: string[] = res.body.map((v: { fechaFin: string }) => v.fechaFin);
    expect(fechas).toEqual([isoDateOffset(-5)]);
  });

  it('vencimiento=por_vencer (default diasAlerta=3) incluye ambos bordes inclusive', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sales')
      .query({ servicioId, vencimiento: 'por_vencer' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const fechas: string[] = res.body
      .map((v: { fechaFin: string }) => v.fechaFin)
      .sort();
    expect(fechas).toEqual([isoDateOffset(0), isoDateOffset(3)].sort());
  });

  it('vencimiento=al_dia (default diasAlerta=3) empieza en hoy+4', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sales')
      .query({ servicioId, vencimiento: 'al_dia' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const fechas: string[] = res.body
      .map((v: { fechaFin: string }) => v.fechaFin)
      .sort();
    expect(fechas).toEqual([isoDateOffset(4), isoDateOffset(100)].sort());
  });

  it('diasAlerta explícito corre el borde entre por_vencer y al_dia', async () => {
    const porVencer = await request(app.getHttpServer())
      .get('/api/sales')
      .query({ servicioId, vencimiento: 'por_vencer', diasAlerta: 4 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const alDia = await request(app.getHttpServer())
      .get('/api/sales')
      .query({ servicioId, vencimiento: 'al_dia', diasAlerta: 4 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const fechasPorVencer: string[] = porVencer.body
      .map((v: { fechaFin: string }) => v.fechaFin)
      .sort();
    const fechasAlDia: string[] = alDia.body.map(
      (v: { fechaFin: string }) => v.fechaFin,
    );

    expect(fechasPorVencer).toEqual(
      [isoDateOffset(0), isoDateOffset(3), isoDateOffset(4)].sort(),
    );
    expect(fechasAlDia).toEqual([isoDateOffset(100)]);
  });

  it('summary: el delta antes/después coincide con lo creado en cada balde', async () => {
    // La BD es compartida (dev local), así que se compara por delta en
    // vez de por conteo absoluto.
    const antes = (
      await request(app.getHttpServer())
        .get('/api/sales/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body;

    // Desactivamos temporalmente todo lo de OTRAS cuentas no es viable
    // acá; en su lugar, comparamos contra un summary ya influenciado por
    // los datos de este mismo test (creados en beforeAll) usando otra
    // cuenta de control con una venta adicional conocida, y verificando
    // el delta que produce esa única venta extra.
    const perfilExtraRes = await request(app.getHttpServer())
      .post(`/api/accounts/${cuentaId}/profiles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Perfil extra summary' })
      .expect(201);

    const ventaExtraRes = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId,
        cuentaId,
        perfilId: perfilExtraRes.body.id,
        fechaInicio: isoDateOffset(-30),
        fechaFin: isoDateOffset(-1),
        precio: 10,
        moneda: 'PEN',
        metodoPago: 'Yape',
      })
      .expect(201);

    const despues = (
      await request(app.getHttpServer())
        .get('/api/sales/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body;

    expect(despues.vencidas).toBe(antes.vencidas + 1);
    expect(despues.porVencer).toBe(antes.porVencer);
    expect(despues.alDia).toBe(antes.alDia);

    await request(app.getHttpServer())
      .delete(`/api/sales/${ventaExtraRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    ventaIds.push(ventaExtraRes.body.id);
    perfilIds.push(perfilExtraRes.body.id);
  });
});
