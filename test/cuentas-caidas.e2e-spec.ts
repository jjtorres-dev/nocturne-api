import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Bloque — Cuentas caídas y reposición del proveedor: POST
// /accounts/:id/mark-down y /restore, `cuentaCaida` en /sales, GET
// /accounts/caidas y el historial de ajustes. Usuarios reales (2
// revendedores creados por la API) y JWT real de /auth/login, contra
// Postgres.
//
// Las fechas parten de CURRENT_DATE de Postgres, igual que Renovación con el
// proveedor. Cada test arma su propia cuenta con `escenario()`, así ninguno
// depende de lo que dejó el anterior.
describe('Cuentas caídas y reposición del proveedor (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let hoyServidor: string;
  let userA: { id: string; accessToken: string };
  let userB: { id: string; accessToken: string };
  // Por perfiles (4) y cuenta completa: los dos servicios del combo.
  let servicioPerfiles: string;
  let servicioCompleta: string;
  let comboId: string;

  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdContactIds: string[] = [];
  // Combos creados dentro de un test (además de `comboId`).
  const combosExtra: string[] = [];

  const TRIGGER = 'e2e_falla_reposicion';

  function offset(days: number): string {
    const [y, m, d] = hoyServidor.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  function http() {
    return request(app.getHttpServer());
  }

  function post(token: string, url: string, body: Record<string, unknown>, status = 201) {
    return http().post(url).set('Authorization', `Bearer ${token}`).send(body).expect(status);
  }

  function get(token: string, url: string, status = 200) {
    return http().get(url).set('Authorization', `Bearer ${token}`).expect(status);
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

    userA = await createRevendedor('caidas-a');
    userB = await createRevendedor('caidas-b');
    servicioPerfiles = await createService(userA.accessToken, {
      tipo: 'CON_PERFILES',
      pantallasMax: 4,
    });
    servicioCompleta = await createService(userA.accessToken, { tipo: 'SIN_PERFILES' });
    const comboRes = await post(userA.accessToken, '/api/combos', {
      nombre: `Combo caídas ${randomUUID()}`,
      servicioIds: [servicioPerfiles, servicioCompleta],
      precioCombo: 25,
    });
    comboId = comboRes.body.id;
  });

  afterAll(async () => {
    await quitarFalla();
    // Orden por las FK: ajustes y pagos → ventas → combos → perfiles/cuentas.
    if (createdAccountIds.length > 0) {
      const ids = [createdAccountIds];
      await dataSource.query('DELETE FROM sale_adjustments WHERE cuenta_id = ANY($1)', ids);
      const comboSales = await dataSource.query(
        'SELECT DISTINCT venta_combo_id AS id FROM sales WHERE cuenta_id = ANY($1) AND venta_combo_id IS NOT NULL',
        ids,
      );
      const comboSaleIds = [comboSales.map((row: { id: string }) => row.id)];
      await dataSource.query('DELETE FROM payments WHERE venta_combo_id = ANY($1)', comboSaleIds);
      await dataSource.query(
        'DELETE FROM payments WHERE venta_id IN (SELECT id FROM sales WHERE cuenta_id = ANY($1))',
        ids,
      );
      await dataSource.query('DELETE FROM sales WHERE cuenta_id = ANY($1)', ids);
      await dataSource.query('DELETE FROM combo_sales WHERE id = ANY($1)', comboSaleIds);
      await dataSource.query('DELETE FROM profiles WHERE cuenta_id = ANY($1)', ids);
      await dataSource.query('DELETE FROM account_payments WHERE cuenta_id = ANY($1)', ids);
      await dataSource.query('DELETE FROM accounts WHERE id = ANY($1)', ids);
    }
    const comboIds = [comboId, ...combosExtra].filter(Boolean);
    await dataSource.query('DELETE FROM combo_servicios WHERE combo_id = ANY($1)', [comboIds]);
    await dataSource.query('DELETE FROM combos WHERE id = ANY($1)', [comboIds]);
    if (createdContactIds.length > 0) {
      await dataSource.query('DELETE FROM contacts WHERE id = ANY($1)', [createdContactIds]);
    }
    if (createdServiceIds.length > 0) {
      await dataSource.query('DELETE FROM services WHERE id = ANY($1)', [createdServiceIds]);
    }
    if (createdUserEmails.length > 0) {
      await dataSource.query(
        `DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [createdUserEmails],
      );
      await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [createdUserEmails]);
    }
    await app.close();
  });

  async function createRevendedor(prefix: string) {
    const email = `${prefix}-${randomUUID()}@nocturne.dev`;
    createdUserEmails.push(email);
    const createRes = await post(adminToken, '/api/users', {
      email,
      password: 'password123',
      name: prefix,
      role: 'revendedor',
    });
    const loginRes = await http()
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    return {
      id: createRes.body.id as string,
      accessToken: loginRes.body.accessToken as string,
    };
  }

  async function createService(token: string, extra: Record<string, unknown>): Promise<string> {
    const res = await post(token, '/api/services', {
      nombre: `Caídas ${randomUUID()}`,
      duracionMeses: 1,
      precioBase: 15,
      ...extra,
    });
    createdServiceIds.push(res.body.id);
    return res.body.id;
  }

  async function createCliente(token: string): Promise<string> {
    const res = await post(token, '/api/contacts', {
      nombre: `Cliente caídas ${randomUUID()}`,
      whatsapp: '+51955555000',
      tipo: 'CLIENTE_FINAL',
    });
    createdContactIds.push(res.body.id);
    return res.body.id;
  }

  async function createAccount(
    token: string,
    servicioId: string,
    crearPerfiles = false,
  ): Promise<{ id: string; correo: string }> {
    const res = await post(token, '/api/accounts', {
      servicioId,
      correo: `${randomUUID()}@nocturne.dev`,
      claveServicio: 'clave-vieja',
      claveCorreo: 'correo-viejo',
      fechaInicio: offset(-20),
      fechaFin: offset(40),
      costo: 40,
      metodoPago: 'transferencia',
      crearPerfiles,
    });
    createdAccountIds.push(res.body.id);
    return res.body;
  }

  async function perfilesDe(token: string, cuentaId: string): Promise<{ id: string; nombre: string }[]> {
    const res = await get(token, `/api/accounts/${cuentaId}/profiles`);
    return [...res.body].sort((a: { nombre: string }, b: { nombre: string }) =>
      a.nombre.localeCompare(b.nombre),
    );
  }

  async function createSale(
    token: string,
    cuentaId: string,
    perfilId: string | undefined,
    fechaFin: string,
  ): Promise<{ id: string }> {
    const res = await post(token, '/api/sales', {
      clienteId: await createCliente(token),
      cuentaId,
      perfilId,
      fechaInicio: offset(-10),
      fechaFin,
      precio: 15,
      moneda: 'PEN',
      metodoPago: 'Yape',
    });
    return res.body;
  }

  // Una cuenta por perfiles de A con 4 perfiles. `perfiles[n]` = "Perfil n+1".
  async function escenario() {
    const cuenta = await createAccount(userA.accessToken, servicioPerfiles, true);
    const perfiles = await perfilesDe(userA.accessToken, cuenta.id);
    return { cuenta, perfiles };
  }

  function markDown(token: string, id: string, body: Record<string, unknown> = {}, status = 201) {
    return post(token, `/api/accounts/${id}/mark-down`, body, status);
  }

  function restore(token: string, id: string, body: Record<string, unknown> = {}, status = 201) {
    return post(
      token,
      `/api/accounts/${id}/restore`,
      { correo: `repuesta-${randomUUID()}@nocturne.dev`, ...body },
      status,
    );
  }

  async function fechaFinVenta(id: string): Promise<string> {
    const [row] = await dataSource.query('SELECT fecha_fin::text AS f FROM sales WHERE id = $1', [id]);
    return row.f;
  }

  async function fechaFinCombo(id: string): Promise<string> {
    const [row] = await dataSource.query(
      'SELECT fecha_fin::text AS f FROM combo_sales WHERE id = $1',
      [id],
    );
    return row.f;
  }

  function ajustesDeCuenta(cuentaId: string) {
    return dataSource.query(
      `SELECT venta_id AS "ventaId", venta_combo_id AS "ventaComboId", tipo, dias,
              fecha_caida::text AS "fechaCaida", fecha_reposicion::text AS "fechaReposicion"
       FROM sale_adjustments WHERE cuenta_id = $1 ORDER BY created_at, id`,
      [cuentaId],
    );
  }

  // Columnas crudas de la cuenta: las claves salen cifradas, tal como están
  // guardadas.
  async function cuentaCruda(id: string) {
    const [row] = await dataSource.query(
      `SELECT correo, clave_servicio AS "claveServicio", clave_correo AS "claveCorreo",
              fecha_caida::text AS "fechaCaida"
       FROM accounts WHERE id = $1`,
      [id],
    );
    return row;
  }

  // Falla forzada DENTRO de la transacción de restore: rechaza el INSERT de
  // los ajustes de esta cuenta, que es lo último que escribe — para
  // entonces ya corrieron los UPDATE de credenciales, perfiles y fechas.
  async function forzarFalla(cuentaId: string) {
    await dataSource.query(`
      CREATE OR REPLACE FUNCTION ${TRIGGER}() RETURNS trigger AS $$
      BEGIN
        IF NEW.cuenta_id = '${cuentaId}' THEN
          RAISE EXCEPTION 'falla forzada por el e2e';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql
    `);
    await dataSource.query(
      `CREATE TRIGGER ${TRIGGER} BEFORE INSERT ON sale_adjustments FOR EACH ROW EXECUTE FUNCTION ${TRIGGER}()`,
    );
  }

  async function quitarFalla() {
    await dataSource.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON sale_adjustments`);
    await dataSource.query(`DROP FUNCTION IF EXISTS ${TRIGGER}()`);
  }

  describe('POST /accounts/:id/mark-down', () => {
    it('marca la cuenta como caída desde la fecha indicada (hoy si no se manda)', async () => {
      const { cuenta } = await escenario();
      const conFecha = await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-5) });
      expect(conFecha.body.fechaCaida).toBe(offset(-5));

      const otra = await createAccount(userA.accessToken, servicioCompleta);
      const sinFecha = await markDown(userA.accessToken, otra.id);
      expect(sinFecha.body.fechaCaida).toBe(new Date().toISOString().slice(0, 10));

      const detalle = await get(userA.accessToken, `/api/accounts/${cuenta.id}`);
      expect(detalle.body.fechaCaida).toBe(offset(-5));
      const listado = await get(userA.accessToken, '/api/accounts');
      expect(
        listado.body.find((item: { id: string }) => item.id === cuenta.id).fechaCaida,
      ).toBe(offset(-5));
    });

    it('400 con una fecha futura o inválida; 404 si la cuenta es ajena; 401 sin token', async () => {
      const { cuenta } = await escenario();
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(3) }, 400);
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: 'ayer' }, 400);
      await markDown(userB.accessToken, cuenta.id, { fechaCaida: offset(-1) }, 404);
      await http().post(`/api/accounts/${cuenta.id}/mark-down`).send({}).expect(401);
      expect((await cuentaCruda(cuenta.id)).fechaCaida).toBeNull();

      // El admin sí puede (ve todas las cuentas).
      await markDown(adminToken, cuenta.id, { fechaCaida: offset(-1) });
      expect((await cuentaCruda(cuenta.id)).fechaCaida).toBe(offset(-1));
    });

    it('las ventas de la cuenta salen con cuentaCaida y la cuenta aparece en /accounts/caidas', async () => {
      const { cuenta, perfiles } = await escenario();
      const venta = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(1));
      const otraCuenta = await createAccount(userA.accessToken, servicioCompleta);
      const ventaSana = await createSale(userA.accessToken, otraCuenta.id, undefined, offset(1));

      const cuentaCaidaDe = async (url: string) => {
        const res = await get(userA.accessToken, url);
        return new Map(
          res.body.map((v: { id: string; cuentaCaida: boolean }) => [v.id, v.cuentaCaida]),
        );
      };
      let ventas = await cuentaCaidaDe('/api/sales');
      expect(ventas.get(venta.id)).toBe(false);

      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-4) });

      ventas = await cuentaCaidaDe('/api/sales');
      expect(ventas.get(venta.id)).toBe(true);
      expect(ventas.get(ventaSana.id)).toBe(false);
      // También en el listado de Vencimientos y en el detalle.
      const porVencer = await cuentaCaidaDe('/api/sales?vencimiento=por_vencer&diasAlerta=3');
      expect(porVencer.get(venta.id)).toBe(true);
      expect(porVencer.get(ventaSana.id)).toBe(false);
      const detalle = await get(userA.accessToken, `/api/sales/${venta.id}`);
      expect(detalle.body.cuentaCaida).toBe(true);

      const caidas = await get(userA.accessToken, '/api/accounts/caidas');
      const fila = caidas.body.find((c: { id: string }) => c.id === cuenta.id);
      expect(fila).toMatchObject({
        correo: cuenta.correo,
        servicioId: servicioPerfiles,
        fechaCaida: offset(-4),
        diasCaida: 4,
        clientesAfectados: 1,
      });
      expect(caidas.body.some((c: { id: string }) => c.id === otraCuenta.id)).toBe(false);
      // Otro revendedor no ve las cuentas caídas de A.
      const caidasB = await get(userB.accessToken, '/api/accounts/caidas');
      expect(caidasB.body.some((c: { id: string }) => c.id === cuenta.id)).toBe(false);
    });
  });

  describe('POST /accounts/:id/restore', () => {
    it('suma los días a cada venta activa de la cuenta, registra el ajuste y actualiza credenciales y perfiles', async () => {
      const { cuenta, perfiles } = await escenario();
      const v1 = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(10));
      const v2 = await createSale(userA.accessToken, cuenta.id, perfiles[1].id, offset(-2));
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-6) });

      // Sin diasCompensacion: fechaReposicion - fechaCaida = 4.
      const res = await restore(userA.accessToken, cuenta.id, {
        correo: 'nueva@nocturne.dev',
        claveServicio: 'clave-nueva',
        claveCorreo: 'correo-nuevo',
        perfiles: [
          { id: perfiles[0].id, nombre: 'Sala', pin: '4321' },
          { id: perfiles[1].id, pin: '9999' },
        ],
        fechaReposicion: offset(-2),
      });

      expect(res.body.compensacion).toEqual({
        dias: 4,
        fechaCaida: offset(-6),
        fechaReposicion: offset(-2),
        ventas: 2,
        combos: 0,
        clientes: 2,
      });
      expect(res.body).toMatchObject({
        id: cuenta.id,
        correo: 'nueva@nocturne.dev',
        claveServicio: 'clave-nueva',
        claveCorreo: 'correo-nuevo',
        fechaCaida: null,
      });

      expect(await fechaFinVenta(v1.id)).toBe(offset(14));
      expect(await fechaFinVenta(v2.id)).toBe(offset(2));
      const ajustes = await ajustesDeCuenta(cuenta.id);
      expect(ajustes).toHaveLength(2);
      expect(ajustes.map((a: { ventaId: string }) => a.ventaId).sort()).toEqual(
        [v1.id, v2.id].sort(),
      );
      for (const ajuste of ajustes) {
        expect(ajuste).toMatchObject({
          ventaComboId: null,
          tipo: 'compensacion',
          dias: 4,
          fechaCaida: offset(-6),
          fechaReposicion: offset(-2),
        });
      }

      // Cifradas en reposo, como siempre: el texto plano no está en la tabla.
      const cruda = await cuentaCruda(cuenta.id);
      expect(cruda.correo).toBe('nueva@nocturne.dev');
      expect(cruda.claveServicio).not.toContain('clave-nueva');
      expect(cruda.claveCorreo).not.toContain('correo-nuevo');
      const [pinCrudo] = await dataSource.query('SELECT pin FROM profiles WHERE id = $1', [
        perfiles[0].id,
      ]);
      expect(pinCrudo.pin).not.toContain('4321');

      const despues = await get(userA.accessToken, `/api/accounts/${cuenta.id}/profiles`);
      const porId = new Map(
        despues.body.map((p: { id: string; nombre: string; pin: string | null }) => [p.id, p]),
      );
      expect(porId.get(perfiles[0].id)).toMatchObject({ nombre: 'Sala', pin: '4321' });
      expect(porId.get(perfiles[1].id)).toMatchObject({ nombre: 'Perfil 2', pin: '9999' });
      expect(porId.get(perfiles[2].id)).toMatchObject({ nombre: 'Perfil 3', pin: null });

      // La venta deja de estar marcada y su historial muestra el ajuste.
      const venta = await get(userA.accessToken, `/api/sales/${v1.id}`);
      expect(venta.body).toMatchObject({ cuentaCaida: false, fechaFin: offset(14) });
      const historial = await get(userA.accessToken, `/api/sales/${v1.id}/adjustments`);
      expect(historial.body).toHaveLength(1);
      expect(historial.body[0]).toMatchObject({
        ventaId: v1.id,
        cuentaId: cuenta.id,
        tipo: 'compensacion',
        dias: 4,
        fechaCaida: offset(-6),
        fechaReposicion: offset(-2),
      });
      await get(userB.accessToken, `/api/sales/${v1.id}/adjustments`, 404);
      const caidas = await get(userA.accessToken, '/api/accounts/caidas');
      expect(caidas.body.some((c: { id: string }) => c.id === cuenta.id)).toBe(false);
    });

    it('diasCompensacion es editable; con 0 repone la cuenta sin tocar fechas ni registrar ajustes', async () => {
      const { cuenta, perfiles } = await escenario();
      const venta = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(10));
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-6) });
      const res = await restore(userA.accessToken, cuenta.id, { diasCompensacion: 10 });
      expect(res.body.compensacion).toMatchObject({ dias: 10, ventas: 1, clientes: 1 });
      expect(await fechaFinVenta(venta.id)).toBe(offset(20));
      // Lo que no se manda queda como estaba.
      expect(res.body.claveServicio).toBe('clave-vieja');
      expect(res.body.claveCorreo).toBe('correo-viejo');

      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-3) });
      await dataSource.query(`UPDATE profiles SET pin = 'x' WHERE id = $1`, [perfiles[0].id]);
      const sinDias = await restore(userA.accessToken, cuenta.id, {
        diasCompensacion: 0,
        // Un PIN en null lo borra (el perfil nuevo no tiene PIN).
        perfiles: [{ id: perfiles[0].id, pin: null }],
      });
      const [sinPin] = await dataSource.query('SELECT pin FROM profiles WHERE id = $1', [
        perfiles[0].id,
      ]);
      expect(sinPin.pin).toBeNull();
      expect(sinDias.body.compensacion).toMatchObject({ dias: 0, ventas: 0, combos: 0, clientes: 0 });
      expect(sinDias.body.fechaCaida).toBeNull();
      expect(await fechaFinVenta(venta.id)).toBe(offset(20));
      expect(await ajustesDeCuenta(cuenta.id)).toHaveLength(1);
    });

    it('las ventas finalizadas no se compensan', async () => {
      const { cuenta, perfiles } = await escenario();
      const vigente = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(10));
      const finalizada = await createSale(userA.accessToken, cuenta.id, perfiles[1].id, offset(10));
      await http()
        .delete(`/api/sales/${finalizada.id}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(200);
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-3) });

      const res = await restore(userA.accessToken, cuenta.id, { fechaReposicion: offset(0) });

      expect(res.body.compensacion).toMatchObject({ dias: 3, ventas: 1, clientes: 1 });
      expect(await fechaFinVenta(vigente.id)).toBe(offset(13));
      expect(await fechaFinVenta(finalizada.id)).toBe(offset(10));
      const ajustes = await ajustesDeCuenta(cuenta.id);
      expect(ajustes.map((a: { ventaId: string }) => a.ventaId)).toEqual([vigente.id]);
      const historial = await get(userA.accessToken, `/api/sales/${finalizada.id}/adjustments`);
      expect(historial.body).toEqual([]);
    });

    async function createComboSale(cuentaId: string, perfilId: string, cuentaCompletaId: string) {
      const res = await post(userA.accessToken, '/api/combo-sales', {
        clienteId: await createCliente(userA.accessToken),
        comboId,
        fechaInicio: offset(-10),
        fechaFin: offset(20),
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          { servicioId: servicioPerfiles, cuentaId, perfilId },
          { servicioId: servicioCompleta, cuentaId: cuentaCompletaId },
        ],
      });
      const hijas = res.body.ventas as { id: string; cuentaId: string }[];
      return {
        id: res.body.id as string,
        hijaEnCuenta: hijas.find((h) => h.cuentaId === cuentaId)!.id,
        hijaEnOtra: hijas.find((h) => h.cuentaId === cuentaCompletaId)!.id,
      };
    }

    it('un combo con una hija en la cuenta: se mueven el combo y TODAS sus hijas, con un solo ajuste del combo', async () => {
      const { cuenta, perfiles } = await escenario();
      const otraCuenta = await createAccount(userA.accessToken, servicioCompleta);
      const suelta = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(5));
      const combo = await createComboSale(cuenta.id, perfiles[1].id, otraCuenta.id);
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-5) });

      const listado = await get(userA.accessToken, '/api/combo-sales');
      expect(
        listado.body.find((c: { id: string }) => c.id === combo.id).cuentaCaida,
      ).toBe(true);

      const res = await restore(userA.accessToken, cuenta.id, { fechaReposicion: offset(0) });

      expect(res.body.compensacion).toMatchObject({ dias: 5, ventas: 1, combos: 1, clientes: 2 });
      expect(await fechaFinVenta(suelta.id)).toBe(offset(10));
      expect(await fechaFinCombo(combo.id)).toBe(offset(25));
      expect(await fechaFinVenta(combo.hijaEnCuenta)).toBe(offset(25));
      // La hija de la otra cuenta también: el combo vence en una sola fecha.
      expect(await fechaFinVenta(combo.hijaEnOtra)).toBe(offset(25));

      const ajustes = await ajustesDeCuenta(cuenta.id);
      expect(ajustes).toHaveLength(2);
      expect(ajustes.filter((a: { ventaComboId: string }) => a.ventaComboId === combo.id)).toEqual([
        {
          ventaId: null,
          ventaComboId: combo.id,
          tipo: 'compensacion',
          dias: 5,
          fechaCaida: offset(-5),
          fechaReposicion: offset(0),
        },
      ]);

      const detalle = await get(userA.accessToken, `/api/combo-sales/${combo.id}`);
      expect(detalle.body).toMatchObject({ cuentaCaida: false, fechaFin: offset(25) });
      const historial = await get(userA.accessToken, `/api/combo-sales/${combo.id}/adjustments`);
      expect(historial.body).toHaveLength(1);
      expect(historial.body[0]).toMatchObject({ ventaComboId: combo.id, dias: 5 });
      // La venta hija muestra el ajuste de su combo.
      const historialHija = await get(
        userA.accessToken,
        `/api/sales/${combo.hijaEnCuenta}/adjustments`,
      );
      expect(historialHija.body).toHaveLength(1);
      await get(userB.accessToken, `/api/combo-sales/${combo.id}/adjustments`, 404);
    });

    it('un combo con dos hijas en la cuenta se compensa UNA sola vez', async () => {
      const { cuenta, perfiles } = await escenario();
      const otraCuenta = await createAccount(userA.accessToken, servicioCompleta);
      const combo = await createComboSale(cuenta.id, perfiles[0].id, otraCuenta.id);
      // Por la API un combo lleva una cuenta por servicio; el caso de dos
      // hijas en la misma cuenta se arma moviendo la segunda por SQL (es lo
      // que queda si la cuenta cambia de servicio después de vender).
      await dataSource.query('UPDATE sales SET cuenta_id = $1, perfil_id = $2 WHERE id = $3', [
        cuenta.id,
        perfiles[1].id,
        combo.hijaEnOtra,
      ]);
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-7) });

      const res = await restore(userA.accessToken, cuenta.id, { fechaReposicion: offset(0) });

      // +7, no +14.
      expect(res.body.compensacion).toMatchObject({ dias: 7, ventas: 0, combos: 1, clientes: 1 });
      expect(await fechaFinCombo(combo.id)).toBe(offset(27));
      expect(await fechaFinVenta(combo.hijaEnCuenta)).toBe(offset(27));
      expect(await fechaFinVenta(combo.hijaEnOtra)).toBe(offset(27));
      expect(await ajustesDeCuenta(cuenta.id)).toEqual([
        {
          ventaId: null,
          ventaComboId: combo.id,
          tipo: 'compensacion',
          dias: 7,
          fechaCaida: offset(-7),
          fechaReposicion: offset(0),
        },
      ]);
    });

    it('es atómico: si falla a mitad, no cambia ninguna fecha, credencial, perfil ni ajuste', async () => {
      const { cuenta, perfiles } = await escenario();
      const otraCuenta = await createAccount(userA.accessToken, servicioCompleta);
      const suelta = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(5));
      const combo = await createComboSale(cuenta.id, perfiles[1].id, otraCuenta.id);
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-5) });
      const antes = await cuentaCruda(cuenta.id);
      const body = {
        correo: 'atomica@nocturne.dev',
        claveServicio: 'clave-nueva',
        claveCorreo: 'correo-nuevo',
        perfiles: [{ id: perfiles[0].id, nombre: 'Cambiado', pin: '1111' }],
        fechaReposicion: offset(0),
      };

      await forzarFalla(cuenta.id);
      try {
        await restore(userA.accessToken, cuenta.id, body, 500);
      } finally {
        await quitarFalla();
      }

      expect(await cuentaCruda(cuenta.id)).toEqual(antes);
      expect(antes.fechaCaida).toBe(offset(-5));
      const detalle = await get(userA.accessToken, `/api/accounts/${cuenta.id}`);
      expect(detalle.body).toMatchObject({
        correo: cuenta.correo,
        claveServicio: 'clave-vieja',
        claveCorreo: 'correo-viejo',
        fechaCaida: offset(-5),
      });
      const [perfil] = await perfilesDe(userA.accessToken, cuenta.id);
      expect(perfil).toMatchObject({ id: perfiles[0].id, nombre: 'Perfil 1', pin: null });
      expect(await fechaFinVenta(suelta.id)).toBe(offset(5));
      expect(await fechaFinCombo(combo.id)).toBe(offset(20));
      expect(await fechaFinVenta(combo.hijaEnCuenta)).toBe(offset(20));
      expect(await fechaFinVenta(combo.hijaEnOtra)).toBe(offset(20));
      expect(await ajustesDeCuenta(cuenta.id)).toEqual([]);

      // Sin la falla, la misma reposición pasa.
      const res = await restore(userA.accessToken, cuenta.id, body);
      expect(res.body.compensacion).toMatchObject({ dias: 5, ventas: 1, combos: 1 });
      expect(await fechaFinVenta(suelta.id)).toBe(offset(10));
      expect(await fechaFinCombo(combo.id)).toBe(offset(25));
      expect(await ajustesDeCuenta(cuenta.id)).toHaveLength(2);
    });

    it('400 si la cuenta no está caída (también al reponerla dos veces); 404 si es ajena', async () => {
      const { cuenta, perfiles } = await escenario();
      const venta = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(5));
      await restore(userA.accessToken, cuenta.id, {}, 400);

      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-2) });
      await restore(userB.accessToken, cuenta.id, {}, 404);
      await http().post(`/api/accounts/${cuenta.id}/restore`).send({ correo: 'a@b.pe' }).expect(401);
      expect((await cuentaCruda(cuenta.id)).fechaCaida).toBe(offset(-2));
      expect(await fechaFinVenta(venta.id)).toBe(offset(5));

      await restore(userA.accessToken, cuenta.id, { fechaReposicion: offset(0) });
      // Ya repuesta: un segundo intento no vuelve a sumar días.
      await restore(userA.accessToken, cuenta.id, { fechaReposicion: offset(0) }, 400);
      expect(await fechaFinVenta(venta.id)).toBe(offset(7));
      expect(await ajustesDeCuenta(cuenta.id)).toHaveLength(1);
    });

    it('400 con datos inválidos y 404 con un perfil de otra cuenta, sin reponer nada', async () => {
      const { cuenta, perfiles } = await escenario();
      const { perfiles: perfilesAjenos } = await escenario();
      const venta = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(5));
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-4) });
      const url = `/api/accounts/${cuenta.id}/restore`;

      await post(userA.accessToken, url, {}, 400); // sin correo
      await restore(userA.accessToken, cuenta.id, { diasCompensacion: -1 }, 400);
      await restore(userA.accessToken, cuenta.id, { diasCompensacion: 1.5 }, 400);
      await restore(userA.accessToken, cuenta.id, { fechaReposicion: offset(-5) }, 400);
      await restore(userA.accessToken, cuenta.id, { fechaReposicion: offset(2) }, 400);
      await restore(
        userA.accessToken,
        cuenta.id,
        { perfiles: [{ id: perfilesAjenos[0].id, nombre: 'Ajeno' }] },
        404,
      );

      const cruda = await cuentaCruda(cuenta.id);
      expect(cruda).toMatchObject({ correo: cuenta.correo, fechaCaida: offset(-4) });
      expect(await fechaFinVenta(venta.id)).toBe(offset(5));
      expect(await ajustesDeCuenta(cuenta.id)).toEqual([]);
      const [ajeno] = await dataSource.query('SELECT nombre FROM profiles WHERE id = $1', [
        perfilesAjenos[0].id,
      ]);
      expect(ajeno.nombre).toBe('Perfil 1');
    });

    it('no crea ningún pago al proveedor ni de cliente, y Contabilidad no cambia', async () => {
      const { cuenta, perfiles } = await escenario();
      const otraCuenta = await createAccount(userA.accessToken, servicioCompleta);
      await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(5));
      await createComboSale(cuenta.id, perfiles[1].id, otraCuenta.id);

      const rango = `desde=${offset(-400)}&hasta=${offset(400)}`;
      const contabilidad = async () => ({
        summary: (await get(userA.accessToken, `/api/accounting/summary?${rango}`)).body,
        byService: (await get(userA.accessToken, `/api/accounting/by-service?${rango}`)).body,
        byPaymentMethod: (
          await get(userA.accessToken, `/api/accounting/by-payment-method?${rango}`)
        ).body,
        timeline: (
          await get(userA.accessToken, `/api/accounting/timeline?${rango}&groupBy=month`)
        ).body,
      });
      const pagos = async () => ({
        proveedor: await dataSource.query(
          `SELECT ap.id, ap.cuenta_id, ap.fecha::text, ap.monto_pen, ap.tipo
           FROM account_payments ap JOIN accounts a ON a.id = ap.cuenta_id
           WHERE a.owner_id = $1 ORDER BY ap.id`,
          [userA.id],
        ),
        clientes: await dataSource.query(
          `SELECT p.id, p.fecha::text, p.monto_pen, p.tipo FROM payments p
           LEFT JOIN sales s ON s.id = p.venta_id
           LEFT JOIN combo_sales c ON c.id = p.venta_combo_id
           WHERE COALESCE(s.owner_id, c.owner_id) = $1 ORDER BY p.id`,
          [userA.id],
        ),
        rentabilidad: (await get(userA.accessToken, `/api/accounts/${cuenta.id}/rentabilidad`)).body,
      });
      const contabilidadAntes = await contabilidad();
      const pagosAntes = await pagos();
      expect(contabilidadAntes.summary.inversion).toBeGreaterThan(0);
      expect(pagosAntes.proveedor.length).toBeGreaterThan(0);
      expect(pagosAntes.clientes.length).toBeGreaterThan(0);

      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-5) });
      const res = await restore(userA.accessToken, cuenta.id, { fechaReposicion: offset(0) });
      expect(res.body.compensacion).toMatchObject({ dias: 5, ventas: 1, combos: 1 });

      expect(await pagos()).toEqual(pagosAntes);
      expect(await contabilidad()).toEqual(contabilidadAntes);
    });
  });

  describe('una cuenta caída no se vende', () => {
    async function comboSaleBody(cuentaId: string, perfilId: string, cuentaCompletaId: string) {
      return {
        clienteId: await createCliente(userA.accessToken),
        comboId,
        fechaInicio: offset(0),
        fechaFin: offset(30),
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          { servicioId: servicioPerfiles, cuentaId, perfilId },
          { servicioId: servicioCompleta, cuentaId: cuentaCompletaId },
        ],
      };
    }

    async function ventasDe(cuentaIds: string[]): Promise<number> {
      const [{ n }] = await dataSource.query(
        'SELECT COUNT(*)::int AS n FROM sales WHERE cuenta_id = ANY($1)',
        [cuentaIds],
      );
      return n;
    }

    it('400 al crear una venta sobre un perfil de una cuenta caída o sobre una cuenta completa caída; repuesta, se vende', async () => {
      const { cuenta, perfiles } = await escenario();
      const completa = await createAccount(userA.accessToken, servicioCompleta);
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-2) });
      await markDown(userA.accessToken, completa.id, { fechaCaida: offset(-2) });
      const venta = async (cuentaId: string, perfilId?: string) => ({
        clienteId: await createCliente(userA.accessToken),
        cuentaId,
        perfilId,
        fechaInicio: offset(0),
        fechaFin: offset(30),
        precio: 15,
        moneda: 'PEN',
        metodoPago: 'Yape',
      });

      const conPerfil = await post(
        userA.accessToken,
        '/api/sales',
        await venta(cuenta.id, perfiles[0].id),
        400,
      );
      expect(conPerfil.body.message).toContain('La cuenta está caída');
      const sinPerfil = await post(userA.accessToken, '/api/sales', await venta(completa.id), 400);
      expect(sinPerfil.body.message).toContain('La cuenta está caída');
      expect(await ventasDe([cuenta.id, completa.id])).toBe(0);
      // No quedó nada a medias: ni pago ni perfil/cuenta ocupados.
      const [perfil] = await dataSource.query('SELECT cliente_id FROM profiles WHERE id = $1', [
        perfiles[0].id,
      ]);
      expect(perfil.cliente_id).toBeNull();

      await restore(userA.accessToken, cuenta.id, { diasCompensacion: 0 });
      await post(userA.accessToken, '/api/sales', await venta(cuenta.id, perfiles[0].id));
      expect(await ventasDe([cuenta.id])).toBe(1);
    });

    it('400 al crear una venta de combo si alguna de sus cuentas está caída, sin crear nada', async () => {
      const { cuenta, perfiles } = await escenario();
      const completa = await createAccount(userA.accessToken, servicioCompleta);
      const contar = async () => {
        const [row] = await dataSource.query(
          `SELECT (SELECT COUNT(*)::int FROM combo_sales WHERE owner_id = $1) AS combos,
                  (SELECT COUNT(*)::int FROM sales WHERE owner_id = $1) AS ventas`,
          [userA.id],
        );
        return row;
      };
      const antes = await contar();

      // Caída la cuenta por perfiles (1ra asignación).
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-2) });
      const res1 = await post(
        userA.accessToken,
        '/api/combo-sales',
        await comboSaleBody(cuenta.id, perfiles[0].id, completa.id),
        400,
      );
      expect(res1.body.message).toContain('la cuenta está caída');
      await post(userA.accessToken, `/api/accounts/${cuenta.id}/unmark-down`, {});

      // Caída la cuenta completa (2da asignación: la 1ra ya había validado).
      await markDown(userA.accessToken, completa.id, { fechaCaida: offset(-2) });
      await post(
        userA.accessToken,
        '/api/combo-sales',
        await comboSaleBody(cuenta.id, perfiles[0].id, completa.id),
        400,
      );
      expect(await contar()).toEqual(antes);

      await post(userA.accessToken, `/api/accounts/${completa.id}/unmark-down`, {});
      await post(
        userA.accessToken,
        '/api/combo-sales',
        await comboSaleBody(cuenta.id, perfiles[0].id, completa.id),
      );
      expect(await contar()).toEqual({ combos: antes.combos + 1, ventas: antes.ventas + 2 });
    });

    it('400 al reactivar una venta finalizada (por perfil o de cuenta completa) si la cuenta está caída; repuesta, se reactiva', async () => {
      const { cuenta, perfiles } = await escenario();
      const completa = await createAccount(userA.accessToken, servicioCompleta);
      const conPerfil = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(20));
      const sinPerfil = await createSale(userA.accessToken, completa.id, undefined, offset(20));
      const estado = async (id: string) => {
        const [row] = await dataSource.query('SELECT activo FROM sales WHERE id = $1', [id]);
        return row.activo;
      };
      const reactivate = (id: string, status = 200) =>
        http()
          .patch(`/api/sales/${id}/reactivate`)
          .set('Authorization', `Bearer ${userA.accessToken}`)
          .expect(status);
      for (const venta of [conPerfil, sinPerfil]) {
        await http()
          .delete(`/api/sales/${venta.id}`)
          .set('Authorization', `Bearer ${userA.accessToken}`)
          .expect(200);
      }
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-2) });
      await markDown(userA.accessToken, completa.id, { fechaCaida: offset(-2) });

      const res1 = await reactivate(conPerfil.id, 400);
      expect(res1.body.message).toContain('La cuenta está caída');
      const res2 = await reactivate(sinPerfil.id, 400);
      expect(res2.body.message).toContain('La cuenta está caída');
      // No quedó nada a medias: siguen finalizadas y el perfil y la cuenta, libres.
      expect(await estado(conPerfil.id)).toBe(false);
      expect(await estado(sinPerfil.id)).toBe(false);
      const [perfil] = await dataSource.query('SELECT cliente_id FROM profiles WHERE id = $1', [
        perfiles[0].id,
      ]);
      expect(perfil.cliente_id).toBeNull();
      const [cuentaCompleta] = await dataSource.query(
        'SELECT cliente_id FROM accounts WHERE id = $1',
        [completa.id],
      );
      expect(cuentaCompleta.cliente_id).toBeNull();

      // Repuesta una y desmarcada la otra, se reactivan.
      await restore(userA.accessToken, cuenta.id, { diasCompensacion: 0 });
      await post(userA.accessToken, `/api/accounts/${completa.id}/unmark-down`, {});
      await reactivate(conPerfil.id);
      await reactivate(sinPerfil.id);
      expect(await estado(conPerfil.id)).toBe(true);
      expect(await estado(sinPerfil.id)).toBe(true);
    });

    it('400 al reactivar una venta de combo finalizada si alguna de sus cuentas está caída, sin reactivar ninguna hija', async () => {
      const { cuenta, perfiles } = await escenario();
      const completa = await createAccount(userA.accessToken, servicioCompleta);
      const creado = await post(
        userA.accessToken,
        '/api/combo-sales',
        await comboSaleBody(cuenta.id, perfiles[0].id, completa.id),
      );
      const comboVentaId = creado.body.id as string;
      const estado = async () => {
        const [row] = await dataSource.query(
          `SELECT (SELECT activo FROM combo_sales WHERE id = $1) AS combo,
                  (SELECT COUNT(*)::int FROM sales WHERE venta_combo_id = $1 AND activo) AS hijas,
                  (SELECT cliente_id FROM profiles WHERE id = $2) AS "perfilCliente",
                  (SELECT cliente_id FROM accounts WHERE id = $3) AS "cuentaCliente"`,
          [comboVentaId, perfiles[0].id, completa.id],
        );
        return row;
      };
      const reactivate = (status = 200) =>
        http()
          .patch(`/api/combo-sales/${comboVentaId}/reactivate`)
          .set('Authorization', `Bearer ${userA.accessToken}`)
          .expect(status);
      await http()
        .delete(`/api/combo-sales/${comboVentaId}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(200);
      const finalizado = { combo: false, hijas: 0, perfilCliente: null, cuentaCliente: null };
      expect(await estado()).toEqual(finalizado);

      // Caída la cuenta por perfiles.
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-2) });
      const res1 = await reactivate(400);
      expect(res1.body.message).toContain('La cuenta está caída');
      expect(await estado()).toEqual(finalizado);
      await post(userA.accessToken, `/api/accounts/${cuenta.id}/unmark-down`, {});

      // Caída solo la cuenta completa (la otra hija está en una cuenta sana).
      await markDown(userA.accessToken, completa.id, { fechaCaida: offset(-2) });
      const res2 = await reactivate(400);
      expect(res2.body.message).toContain('La cuenta está caída');
      expect(await estado()).toEqual(finalizado);

      await restore(userA.accessToken, completa.id, { diasCompensacion: 0 });
      await reactivate();
      const reactivado = await estado();
      expect(reactivado).toMatchObject({ combo: true, hijas: 2 });
      expect(reactivado.perfilCliente).not.toBeNull();
      expect(reactivado.cuentaCliente).not.toBeNull();
    });

    it('/dashboard/inventario no cuenta los perfiles ni las cuentas completas de una cuenta caída', async () => {
      const libres = async () => {
        const res = await get(userA.accessToken, '/api/dashboard/inventario');
        const de = (id: string) =>
          res.body.find((item: { servicioId: string }) => item.servicioId === id).libres as number;
        return { perfiles: de(servicioPerfiles), completas: de(servicioCompleta) };
      };
      const antes = await libres();
      const { cuenta } = await escenario();
      const completa = await createAccount(userA.accessToken, servicioCompleta);
      expect(await libres()).toEqual({
        perfiles: antes.perfiles + 4,
        completas: antes.completas + 1,
      });

      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-1) });
      await markDown(userA.accessToken, completa.id, { fechaCaida: offset(-1) });
      expect(await libres()).toEqual(antes);

      await restore(userA.accessToken, cuenta.id, { diasCompensacion: 0 });
      await post(userA.accessToken, `/api/accounts/${completa.id}/unmark-down`, {});
      expect(await libres()).toEqual({
        perfiles: antes.perfiles + 4,
        completas: antes.completas + 1,
      });
    });
  });

  describe('GET /sales/summary', () => {
    // Revendedor nuevo: sus conteos son exactos sin importar qué más haya.
    it('no cuenta las ventas con la cuenta caída ni los combos con alguna hija en una cuenta caída; el listado sí las trae', async () => {
      const userC = await createRevendedor('caidas-c');
      const tk = userC.accessToken;
      const srvPerfiles = await createService(tk, { tipo: 'CON_PERFILES', pantallasMax: 4 });
      const srvCompleta = await createService(tk, { tipo: 'SIN_PERFILES' });
      const combo = await post(tk, '/api/combos', {
        nombre: `Combo summary ${randomUUID()}`,
        servicioIds: [srvPerfiles, srvCompleta],
        precioCombo: 25,
      });
      try {
        const cuentaA = await createAccount(tk, srvPerfiles, true);
        const cuentaB = await createAccount(tk, srvPerfiles, true);
        const completa = await createAccount(tk, srvCompleta);
        const perfilesA = await perfilesDe(tk, cuentaA.id);
        const perfilesB = await perfilesDe(tk, cuentaB.id);
        // Cuenta A: una vencida y una por vencer. Cuenta B: una vencida y
        // una al día. Combo (vencido): una hija en A y otra en `completa`.
        const vencidaA = await createSale(tk, cuentaA.id, perfilesA[0].id, offset(-2));
        await createSale(tk, cuentaA.id, perfilesA[1].id, offset(1));
        const vencidaB = await createSale(tk, cuentaB.id, perfilesB[0].id, offset(-2));
        await createSale(tk, cuentaB.id, perfilesB[1].id, offset(30));
        const comboSale = await post(tk, '/api/combo-sales', {
          clienteId: await createCliente(tk),
          comboId: combo.body.id,
          fechaInicio: offset(-32),
          fechaFin: offset(-2),
          duracionMeses: 1,
          moneda: 'PEN',
          metodoPago: 'Yape',
          asignaciones: [
            { servicioId: srvPerfiles, cuentaId: cuentaA.id, perfilId: perfilesA[2].id },
            { servicioId: srvCompleta, cuentaId: completa.id },
          ],
        });
        const hijaEnCompleta = comboSale.body.ventas.find(
          (h: { cuentaId: string }) => h.cuentaId === completa.id,
        ).id;
        const summary = async () => (await get(tk, '/api/sales/summary?diasAlerta=3')).body;
        const vencidas = async () =>
          (await get(tk, '/api/sales?vencimiento=vencida')).body as {
            id: string;
            cuentaCaida: boolean;
          }[];

        // vencidas: vencidaA, vencidaB y las 2 hijas del combo.
        const todo = { vencidas: 4, porVencer: 1, alDia: 1 };
        expect(await summary()).toEqual(todo);

        await markDown(tk, cuentaA.id, { fechaCaida: offset(-3) });

        // Salen las 2 ventas de A y el combo ENTERO (también su hija en
        // `completa`, que no está caída).
        expect(await summary()).toEqual({ vencidas: 1, porVencer: 0, alDia: 1 });
        // La lista de Vencimientos las sigue mostrando, con su marca.
        const lista = await vencidas();
        expect(lista).toHaveLength(4);
        const marca = new Map(lista.map((v) => [v.id, v.cuentaCaida]));
        expect(marca.get(vencidaA.id)).toBe(true);
        expect(marca.get(vencidaB.id)).toBe(false);
        expect(marca.get(hijaEnCompleta)).toBe(false);

        // Quitar la marca las devuelve tal cual estaban.
        await post(tk, `/api/accounts/${cuentaA.id}/unmark-down`, {});
        expect(await summary()).toEqual(todo);

        // Un admin viendo todo el negocio tampoco las cuenta.
        const adminAntes = (await get(adminToken, '/api/sales/summary?diasAlerta=3')).body;
        await markDown(tk, cuentaA.id, { fechaCaida: offset(-3) });
        const adminDespues = (await get(adminToken, '/api/sales/summary?diasAlerta=3')).body;
        expect(adminDespues).toEqual({
          vencidas: adminAntes.vencidas - 3,
          porVencer: adminAntes.porVencer - 1,
          alDia: adminAntes.alDia,
        });
      } finally {
        // El combo se borra en afterAll, después de sus ventas.
        combosExtra.push(combo.body.id);
      }
    });
  });

  describe('POST /accounts/:id/unmark-down', () => {
    it('quita la marca sin tocar ninguna fecha ni crear ajustes', async () => {
      const { cuenta, perfiles } = await escenario();
      const otraCuenta = await createAccount(userA.accessToken, servicioCompleta);
      const suelta = await createSale(userA.accessToken, cuenta.id, perfiles[0].id, offset(5));
      const res0 = await post(userA.accessToken, '/api/combo-sales', {
        clienteId: await createCliente(userA.accessToken),
        comboId,
        fechaInicio: offset(-10),
        fechaFin: offset(20),
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          { servicioId: servicioPerfiles, cuentaId: cuenta.id, perfilId: perfiles[1].id },
          { servicioId: servicioCompleta, cuentaId: otraCuenta.id },
        ],
      });
      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-6) });
      const antes = await cuentaCruda(cuenta.id);

      const res = await post(userA.accessToken, `/api/accounts/${cuenta.id}/unmark-down`, {});

      expect(res.body).toMatchObject({
        id: cuenta.id,
        fechaCaida: null,
        correo: cuenta.correo,
        claveServicio: 'clave-vieja',
      });
      expect(await cuentaCruda(cuenta.id)).toEqual({ ...antes, fechaCaida: null });
      expect(await fechaFinVenta(suelta.id)).toBe(offset(5));
      expect(await fechaFinCombo(res0.body.id)).toBe(offset(20));
      for (const hija of res0.body.ventas) {
        expect(await fechaFinVenta(hija.id)).toBe(offset(20));
      }
      expect(await ajustesDeCuenta(cuenta.id)).toEqual([]);
      const venta = await get(userA.accessToken, `/api/sales/${suelta.id}`);
      expect(venta.body.cuentaCaida).toBe(false);
      const caidas = await get(userA.accessToken, '/api/accounts/caidas');
      expect(caidas.body.some((c: { id: string }) => c.id === cuenta.id)).toBe(false);
    });

    it('400 si la cuenta no está caída; 404 si es ajena; 401 sin token', async () => {
      const { cuenta } = await escenario();
      const url = `/api/accounts/${cuenta.id}/unmark-down`;
      await post(userA.accessToken, url, {}, 400);

      await markDown(userA.accessToken, cuenta.id, { fechaCaida: offset(-2) });
      await post(userB.accessToken, url, {}, 404);
      await http().post(url).send({}).expect(401);
      expect((await cuentaCruda(cuenta.id)).fechaCaida).toBe(offset(-2));

      // El admin sí puede; y ya sin marca, otra vez 400.
      await post(adminToken, url, {});
      await post(userA.accessToken, url, {}, 400);
    });
  });
});
