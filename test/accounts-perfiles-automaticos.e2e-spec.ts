import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// POST /api/accounts con crearPerfiles: true (Bloque B, punto 4).
describe('Accounts — perfiles automáticos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;

  let servicioConPerfilesId: string;
  let servicioSinPerfilesId: string;
  const createdAccountIds: string[] = [];
  const createdServiceIds: string[] = [];

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

    const servicioConPerfiles = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: `Perfiles Auto E2E CON_PERFILES ${randomUUID()}`,
        tipo: 'CON_PERFILES',
        duracionMeses: 1,
        precioBase: 10,
        pantallasMax: 4,
      })
      .expect(201);
    servicioConPerfilesId = servicioConPerfiles.body.id;
    createdServiceIds.push(servicioConPerfilesId);

    const servicioSinPerfiles = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: `Perfiles Auto E2E SIN_PERFILES ${randomUUID()}`,
        tipo: 'SIN_PERFILES',
        duracionMeses: 1,
        precioBase: 10,
      })
      .expect(201);
    servicioSinPerfilesId = servicioSinPerfiles.body.id;
    createdServiceIds.push(servicioSinPerfilesId);
  });

  afterAll(async () => {
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
    if (createdServiceIds.length > 0) {
      await dataSource.query('DELETE FROM services WHERE id = ANY($1)', [
        createdServiceIds,
      ]);
    }
    await app.close();
  });

  async function createAccount(
    servicioId: string,
    extra: Record<string, unknown> = {},
    expectStatus = 201,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
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

  it('con crearPerfiles: true y el servicio con pantallasMax, crea "Perfil 1".."Perfil N" sin PIN', async () => {
    const cuenta = await createAccount(servicioConPerfilesId, {
      crearPerfiles: true,
    });

    const perfiles = await dataSource.query(
      'SELECT nombre, pin FROM profiles WHERE cuenta_id = $1 ORDER BY nombre',
      [cuenta.id],
    );
    expect(perfiles).toHaveLength(4);
    expect(perfiles.map((p: { nombre: string }) => p.nombre)).toEqual([
      'Perfil 1',
      'Perfil 2',
      'Perfil 3',
      'Perfil 4',
    ]);
    expect(perfiles.every((p: { pin: string | null }) => p.pin === null)).toBe(true);
  });

  it('con crearPerfiles: false (u omitido), no crea ningún perfil', async () => {
    const cuenta = await createAccount(servicioConPerfilesId, {
      crearPerfiles: false,
    });

    const [{ count }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM profiles WHERE cuenta_id = $1',
      [cuenta.id],
    );
    expect(count).toBe(0);
  });

  it('con crearPerfiles: true pero el servicio SIN pantallasMax, lo ignora en silencio (la cuenta se crea igual, sin perfiles)', async () => {
    const cuenta = await createAccount(servicioSinPerfilesId, {
      crearPerfiles: true,
    });

    expect(cuenta.id).toBeDefined();
    const [{ count }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM profiles WHERE cuenta_id = $1',
      [cuenta.id],
    );
    expect(count).toBe(0);
  });

  it('es atómica: si falla la creación de los perfiles, tampoco queda la cuenta (forzado con un CHECK real en Postgres)', async () => {
    const [{ count: cuentasAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM accounts WHERE servicio_id = $1',
      [servicioConPerfilesId],
    );
    const [{ count: perfilesAntes }] = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM profiles',
    );

    // Constraint temporal que hace fallar CUALQUIER insert en `profiles` —
    // simula una falla real de Postgres a mitad de la transacción sin
    // tocar el código de la app. NOT VALID: no revalida las filas ya
    // existentes (podría haber de otros tests), solo aplica a inserts
    // nuevos, que es lo único que nos interesa acá.
    await dataSource.query(
      'ALTER TABLE profiles ADD CONSTRAINT test_force_fail CHECK (false) NOT VALID',
    );

    try {
      await request(app.getHttpServer())
        .post('/api/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          servicioId: servicioConPerfilesId,
          correo: `${randomUUID()}@nocturne.dev`,
          claveServicio: 'clave-servicio',
          fechaInicio: '2026-01-01',
          fechaFin: '2026-02-01',
          costo: 10,
          metodoPago: 'transferencia',
          crearPerfiles: true,
        })
        .expect((res) => {
          expect(res.status).toBeGreaterThanOrEqual(400);
        });

      const [{ count: cuentasDespues }] = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM accounts WHERE servicio_id = $1',
        [servicioConPerfilesId],
      );
      const [{ count: perfilesDespues }] = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM profiles',
      );
      // Ni la cuenta (que se había insertado ANTES que los perfiles, dentro
      // de la misma transacción) ni ningún perfil quedaron persistidos.
      expect(cuentasDespues).toBe(cuentasAntes);
      expect(perfilesDespues).toBe(perfilesAntes);
    } finally {
      await dataSource.query('ALTER TABLE profiles DROP CONSTRAINT test_force_fail');
    }
  });
});
