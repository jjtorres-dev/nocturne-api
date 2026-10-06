import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Bloque C: GET /accounts/:id/rentabilidad, GET /dashboard/inventario y
// GET /accounts/por-renovar, con usuarios reales (admin + 2 revendedores
// creados por la API) y JWT real de POST /auth/login.
//
// Todo el escenario se arma UNA vez en beforeAll (mismo motivo de rate
// limit de login que los demás e2e de ownership) y cada `it` solo lee.
// Las fechas parten de CURRENT_DATE de Postgres (no del reloj de Node):
// es la fecha que usa el backend, así el test no depende de la zona
// horaria de quien lo corre.
describe('Bloque C — rentabilidad, inventario y cuentas por renovar (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let hoyServidor: string;
  let userA: { id: string; name: string; accessToken: string };
  let userB: { id: string; name: string; accessToken: string };

  // Servicios de A
  let servicioPerfilesId: string; // CON_PERFILES, pantallasMax 4, precioBase 12.5
  let servicioCompletaId: string; // SIN_PERFILES, precioBase 10
  // Servicio de B
  let servicioBId: string;

  // Cuentas de A
  let cuentaRentable: { id: string }; // perfiles, costo 40, vence en +2
  let cuentaSinVentas: { id: string }; // perfiles, costo 100, vence en +7
  let cuentaCompletaCombo: { id: string }; // sin perfiles, vendida por combo
  let cuentaCompletaLibre: { id: string }; // sin perfiles, libre, vence en -3
  let cuentaVenceHoy: { id: string }; // sin perfiles, libre, vence hoy
  let cuentaVenceEn8: { id: string }; // sin perfiles, libre, vence en +8
  let cuentaInactivaVencida: { id: string };
  let cuentaPerfilesInactiva: { id: string };
  // Cuenta de B, vencida: nunca debe aparecerle a A
  let cuentaB: { id: string };

  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];
  const createdContactIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdSaleIds: string[] = [];
  const createdComboIds: string[] = [];
  const createdComboSaleIds: string[] = [];

  function offset(days: number): string {
    const [y, m, d] = hoyServidor.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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

    userA = await createRevendedor('bloque-c-a');
    userB = await createRevendedor('bloque-c-b');

    servicioPerfilesId = (
      await createService(userA.accessToken, 'CON_PERFILES', 12.5)
    ).id;
    servicioCompletaId = (
      await createService(userA.accessToken, 'SIN_PERFILES', 10)
    ).id;
    servicioBId = (await createService(userB.accessToken, 'SIN_PERFILES', 10)).id;

    const cliente1 = await createContact(userA.accessToken);
    const cliente2 = await createContact(userA.accessToken);

    // --- Rentabilidad ---
    cuentaRentable = await createAccount(userA.accessToken, servicioPerfilesId, {
      costo: 40,
      fechaFin: offset(2),
      crearPerfiles: true,
    });
    const perfiles = await listProfiles(userA.accessToken, cuentaRentable.id);
    // Venta 1: 15 PEN, renovada después por 16 PEN.
    const venta1 = await createSale(userA.accessToken, {
      clienteId: cliente1.id,
      cuentaId: cuentaRentable.id,
      perfilId: perfiles[0].id,
      precio: 15,
      moneda: 'PEN',
    });
    await http()
      .post(`/api/sales/${venta1.id}/renew`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ precio: 16 })
      .expect(201);
    // Venta 2: 5 USD × 3.8 = 19 PEN.
    await createSale(userA.accessToken, {
      clienteId: cliente2.id,
      cuentaId: cuentaRentable.id,
      perfilId: perfiles[1].id,
      precio: 5,
      moneda: 'USD',
      tasaCambio: 3.8,
    });
    // Venta por combo (30 PEN) que ocupa el perfil 3 de la misma cuenta,
    // del mismo cliente1: NO debe sumar a los ingresos de la cuenta.
    cuentaCompletaCombo = await createAccount(userA.accessToken, servicioCompletaId);
    const combo = await http()
      .post('/api/combos')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        nombre: `Combo Bloque C ${randomUUID()}`,
        servicioIds: [servicioPerfilesId, servicioCompletaId],
        precioCombo: 30,
      })
      .expect(201);
    createdComboIds.push(combo.body.id);
    const ventaCombo = await http()
      .post('/api/combo-sales')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        clienteId: cliente1.id,
        comboId: combo.body.id,
        fechaInicio: offset(0),
        fechaFin: offset(30),
        duracionMeses: 1,
        moneda: 'PEN',
        metodoPago: 'Yape',
        asignaciones: [
          {
            servicioId: servicioPerfilesId,
            cuentaId: cuentaRentable.id,
            perfilId: perfiles[2].id,
          },
          { servicioId: servicioCompletaId, cuentaId: cuentaCompletaCombo.id },
        ],
      })
      .expect(201);
    createdComboSaleIds.push(ventaCombo.body.id);

    cuentaSinVentas = await createAccount(userA.accessToken, servicioPerfilesId, {
      costo: 100,
      fechaFin: offset(7),
      crearPerfiles: true,
    });

    // --- Inventario / por renovar ---
    cuentaCompletaLibre = await createAccount(userA.accessToken, servicioCompletaId, {
      fechaFin: offset(-3),
    });
    cuentaVenceHoy = await createAccount(userA.accessToken, servicioCompletaId, {
      fechaFin: offset(0),
    });
    cuentaVenceEn8 = await createAccount(userA.accessToken, servicioCompletaId, {
      fechaFin: offset(8),
    });
    // Inactivas: no cuentan como libres ni aparecen por renovar.
    cuentaInactivaVencida = await createAccount(userA.accessToken, servicioCompletaId, {
      fechaFin: offset(-1),
    });
    await deactivateAccount(userA.accessToken, cuentaInactivaVencida.id);
    cuentaPerfilesInactiva = await createAccount(userA.accessToken, servicioPerfilesId, {
      crearPerfiles: true,
    });
    await deactivateAccount(userA.accessToken, cuentaPerfilesInactiva.id);
    // Un perfil desactivado de cuentaSinVentas: tampoco cuenta como libre.
    const perfilesSinVentas = await listProfiles(userA.accessToken, cuentaSinVentas.id);
    await http()
      .delete(`/api/accounts/${cuentaSinVentas.id}/profiles/${perfilesSinVentas[0].id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    cuentaB = await createAccount(userB.accessToken, servicioBId, {
      fechaFin: offset(-5),
    });
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
      await dataSource.query('DELETE FROM sales WHERE id = ANY($1)', [createdSaleIds]);
    }
    if (createdComboIds.length > 0) {
      await dataSource.query('DELETE FROM combo_servicios WHERE combo_id = ANY($1)', [
        createdComboIds,
      ]);
      await dataSource.query('DELETE FROM combos WHERE id = ANY($1)', [createdComboIds]);
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
      name: prefix,
      accessToken: loginRes.body.accessToken as string,
    };
  }

  async function createService(
    token: string,
    tipo: 'CON_PERFILES' | 'SIN_PERFILES',
    precioBase: number,
  ) {
    const res = await http()
      .post('/api/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: `Bloque C ${tipo} ${randomUUID()}`,
        tipo,
        duracionMeses: 1,
        precioBase,
        ...(tipo === 'CON_PERFILES' ? { pantallasMax: 4 } : {}),
      })
      .expect(201);
    createdServiceIds.push(res.body.id);
    return res.body;
  }

  async function createContact(token: string) {
    const res = await http()
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: `Cliente Bloque C ${randomUUID()}`,
        whatsapp: '+51999999999',
        tipo: 'CLIENTE_FINAL',
      })
      .expect(201);
    createdContactIds.push(res.body.id);
    return res.body;
  }

  async function createAccount(
    token: string,
    servicioId: string,
    extra: Record<string, unknown> = {},
  ) {
    const res = await http()
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        servicioId,
        correo: `${randomUUID()}@nocturne.dev`,
        claveServicio: 'clave-servicio',
        fechaInicio: offset(-30),
        fechaFin: offset(335),
        costo: 10,
        metodoPago: 'transferencia',
        ...extra,
      })
      .expect(201);
    createdAccountIds.push(res.body.id);
    return res.body;
  }

  async function deactivateAccount(token: string, id: string) {
    await http()
      .delete(`/api/accounts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function listProfiles(token: string, accountId: string) {
    const res = await http()
      .get(`/api/accounts/${accountId}/profiles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body as { id: string; nombre: string }[]).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    );
  }

  async function createSale(token: string, extra: Record<string, unknown>) {
    const res = await http()
      .post('/api/sales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fechaInicio: offset(0),
        fechaFin: offset(30),
        metodoPago: 'Yape',
        ...extra,
      })
      .expect(201);
    createdSaleIds.push(res.body.id);
    return res.body;
  }

  async function getRentabilidad(token: string, id: string, status = 200) {
    const res = await http()
      .get(`/api/accounts/${id}/rentabilidad`)
      .set('Authorization', `Bearer ${token}`)
      .expect(status);
    return res.body;
  }

  async function getInventario(token: string) {
    const res = await http()
      .get('/api/dashboard/inventario')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as {
      servicioId: string;
      nombre: string;
      usaPerfiles: boolean;
      libres: number;
      total: number;
      ownerName?: string;
    }[];
  }

  async function getPorRenovar(token: string, query = '') {
    const res = await http()
      .get(`/api/accounts/por-renovar${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as {
      id: string;
      servicioNombre: string;
      fechaFin: string;
      diasRestantes: number;
      clientesActivos: number;
      ownerName?: string;
    }[];
  }

  describe('GET /accounts/:id/rentabilidad', () => {
    it('suma venta inicial + renovación + venta en USD convertida, y NO la venta de combo', async () => {
      const r = await getRentabilidad(userA.accessToken, cuentaRentable.id);
      expect(r).toEqual({
        costo: 40,
        desgloseCosto: { compraInicial: 40, renovaciones: 0, cantidadRenovaciones: 0 },
        perfilesTotal: 4,
        // 2 ventas sueltas + 1 venta hija de combo ocupan perfiles.
        perfilesVendidos: 3,
        usaPerfiles: true,
        // 15 (inicial) + 16 (renovación) + 19 (5 USD × 3.8). Los 30 del
        // combo quedan afuera.
        ingresos: 50,
        ganancia: 10,
        // precioBase 12.5 × 4 perfiles
        potencial: 50,
        ventasCombo: 1,
      });
    });

    it('una cuenta sin ventas: ingresos 0 y ganancia = -costo (perfil desactivado no cuenta)', async () => {
      const r = await getRentabilidad(userA.accessToken, cuentaSinVentas.id);
      expect(r).toEqual({
        costo: 100,
        desgloseCosto: { compraInicial: 100, renovaciones: 0, cantidadRenovaciones: 0 },
        perfilesTotal: 3,
        perfilesVendidos: 0,
        usaPerfiles: true,
        ingresos: 0,
        ganancia: -100,
        potencial: 37.5,
        ventasCombo: 0,
      });
    });

    it('servicio sin perfiles vendido solo por combo: ingresos 0, potencial = precioBase', async () => {
      const r = await getRentabilidad(userA.accessToken, cuentaCompletaCombo.id);
      expect(r).toEqual({
        costo: 10,
        desgloseCosto: { compraInicial: 10, renovaciones: 0, cantidadRenovaciones: 0 },
        perfilesTotal: 0,
        perfilesVendidos: 0,
        usaPerfiles: false,
        ingresos: 0,
        ganancia: -10,
        potencial: 10,
        ventasCombo: 1,
      });
    });

    it('un REVENDEDOR recibe 404 con una cuenta ajena; el admin sí la ve', async () => {
      await getRentabilidad(userB.accessToken, cuentaRentable.id, 404);
      const r = await getRentabilidad(adminToken, cuentaRentable.id);
      expect(r.ingresos).toBe(50);
    });

    it('sin token → 401', async () => {
      await http().get(`/api/accounts/${cuentaRentable.id}/rentabilidad`).expect(401);
    });
  });

  describe('GET /dashboard/inventario', () => {
    it('cuenta perfiles libres (activos, sin cliente, en cuentas activas) y cuentas libres en servicios sin perfiles', async () => {
      const inventario = await getInventario(userA.accessToken);
      // A solo tiene estos 2 servicios: nada de B ni de otros usuarios.
      expect(inventario.map((i) => i.servicioId).sort()).toEqual(
        [servicioPerfilesId, servicioCompletaId].sort(),
      );
      const perfiles = inventario.find((i) => i.servicioId === servicioPerfilesId);
      const completa = inventario.find((i) => i.servicioId === servicioCompletaId);
      // cuentaRentable: 4 perfiles - 3 ocupados = 1; cuentaSinVentas: 4
      // perfiles - 1 desactivado = 3; cuentaPerfilesInactiva: 0 (inactiva).
      // Total: 4 de cuentaRentable + 3 activos de cuentaSinVentas.
      expect(perfiles).toMatchObject({ usaPerfiles: true, libres: 4, total: 7 });
      // Activas sin cliente: cuentaCompletaLibre, cuentaVenceHoy,
      // cuentaVenceEn8. cuentaCompletaCombo está ocupada por el combo y
      // cuentaInactivaVencida está inactiva.
      // Total: las 3 libres + cuentaCompletaCombo (ocupada).
      expect(completa).toMatchObject({ usaPerfiles: false, libres: 3, total: 4 });
      // Un REVENDEDOR nunca recibe ownerName.
      expect(perfiles?.ownerName).toBeUndefined();
    });

    it('respeta el dueño: B no ve los servicios de A; el admin ve ambos con ownerName', async () => {
      const inventarioB = await getInventario(userB.accessToken);
      expect(inventarioB).toEqual([
        {
          servicioId: servicioBId,
          nombre: expect.any(String),
          usaPerfiles: false,
          libres: 1,
          total: 1,
        },
      ]);

      const inventarioAdmin = await getInventario(adminToken);
      const perfiles = inventarioAdmin.find((i) => i.servicioId === servicioPerfilesId);
      const deB = inventarioAdmin.find((i) => i.servicioId === servicioBId);
      expect(perfiles).toMatchObject({ libres: 4, ownerName: userA.name });
      expect(deB).toMatchObject({ libres: 1, ownerName: userB.name });
    });
  });

  describe('GET /accounts/por-renovar', () => {
    it('default 7 días: vencidas + hoy..hoy+7 (bordes inclusive), ordenadas por fechaFin, con días según CURRENT_DATE del servidor', async () => {
      const lista = await getPorRenovar(userA.accessToken);
      expect(
        lista.map((c) => ({ id: c.id, fechaFin: c.fechaFin, dias: c.diasRestantes })),
      ).toEqual([
        { id: cuentaCompletaLibre.id, fechaFin: offset(-3), dias: -3 },
        { id: cuentaVenceHoy.id, fechaFin: offset(0), dias: 0 },
        { id: cuentaRentable.id, fechaFin: offset(2), dias: 2 },
        { id: cuentaSinVentas.id, fechaFin: offset(7), dias: 7 },
      ]);
      // Fuera: cuentaVenceEn8 (+8), cuentaInactivaVencida (inactiva), las
      // de +335 y la de B.
    });

    it('clientesActivos cuenta clientes DISTINTOS con ventas activas (incluye la de combo)', async () => {
      const lista = await getPorRenovar(userA.accessToken);
      const rentable = lista.find((c) => c.id === cuentaRentable.id);
      // cliente1 (venta suelta + venta de combo) y cliente2 → 2.
      expect(rentable?.clientesActivos).toBe(2);
      expect(lista.find((c) => c.id === cuentaSinVentas.id)?.clientesActivos).toBe(0);
    });

    it('?dias=8 corre el borde e incluye la de +8', async () => {
      const lista = await getPorRenovar(userA.accessToken, '?dias=8');
      expect(lista.map((c) => c.id)).toContain(cuentaVenceEn8.id);
    });

    it('respeta el dueño: B solo ve la suya; el admin ve las de ambos con ownerName', async () => {
      const listaB = await getPorRenovar(userB.accessToken);
      expect(listaB.map((c) => c.id)).toEqual([cuentaB.id]);
      expect(listaB[0].ownerName).toBeUndefined();

      const listaAdmin = await getPorRenovar(adminToken);
      const ids = listaAdmin.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining([cuentaB.id, cuentaRentable.id]));
      expect(listaAdmin.find((c) => c.id === cuentaB.id)?.ownerName).toBe(userB.name);
    });

    it('dias inválido → 400', async () => {
      await http()
        .get('/api/accounts/por-renovar?dias=-1')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(400);
    });
  });
});
