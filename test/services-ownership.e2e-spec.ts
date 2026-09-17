import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Multi-usuario — Fase B1: el punto crítico no es que ServicesService tenga
// la lógica de ownership (eso lo cubre services.service.spec.ts con
// repositorio mockeado), sino que RolesGuard/JwtAuthGuard + el ownerId real
// guardado en la fila terminen dando 404 de punta a punta contra un JWT de
// verdad de dos usuarios REVENDEDOR distintos — un test unitario con el
// userId pasado a mano no puede probar que esto funciona en el flujo real.
//
// userA/userB se crean UNA sola vez en beforeAll y se reusan en todos los
// `it` (creando servicios nuevos por caso, no usuarios nuevos): POST
// /auth/login tiene rate limit de 5/min por IP (LoginThrottlerGuard), y
// supertest pega todo desde la misma IP — crear un usuario+login por test
// dispara un 429 a partir del sexto login dentro del mismo archivo.
describe('Services — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };
  const createdUserEmails: string[] = [];
  const createdServiceIds: string[] = [];

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

    userA = await createRevendedor('owner-a');
    userB = await createRevendedor('owner-b');
  });

  afterAll(async () => {
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
      .send({
        email,
        password: 'password123',
        name: prefix,
        role: 'revendedor',
      })
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
  ): Promise<{
    id: string;
    ownerId: string;
    owner?: { id: string; name: string; email: string };
  }> {
    const res = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nombre,
        tipo: 'CON_PERFILES',
        duracionMeses: 1,
        precioBase: 10,
      })
      .expect(201);
    createdServiceIds.push(res.body.id);
    return res.body;
  }

  it('un REVENDEDOR no puede ver, editar, desactivar ni reactivar un servicio ajeno (404, no 403), y su listado nunca lo incluye', async () => {
    const serviceA = await createService(
      userA.accessToken,
      `Servicio de A ${randomUUID()}`,
    );
    expect(serviceA.ownerId).toBe(userA.id);

    await request(app.getHttpServer())
      .get(`/api/services/${serviceA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/services/${serviceA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ nombre: 'Intento de edición ajena' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/services/${serviceA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/services/${serviceA.id}/reactivate`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/api/services')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(
      listB.body.some((s: { id: string }) => s.id === serviceA.id),
    ).toBe(false);

    // Control positivo: A sigue viendo y pudiendo tocar lo propio (si el
    // 404 de arriba fuera un bug que bloquea a cualquiera, esto fallaría).
    await request(app.getHttpServer())
      .get(`/api/services/${serviceA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    const listA = await request(app.getHttpServer())
      .get('/api/services')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(listA.body.some((s: { id: string }) => s.id === serviceA.id)).toBe(
      true,
    );
  });

  it('GET /:id y GET / siempre incluyen owner {id, name, email}, igual para el dueño y para el admin', async () => {
    const serviceA = await createService(
      userA.accessToken,
      `Servicio con owner ${randomUUID()}`,
    );
    const ownerEsperado = { id: userA.id, name: userA.name, email: userA.email };

    const getComoDuenio = await request(app.getHttpServer())
      .get(`/api/services/${serviceA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(getComoDuenio.body.owner).toEqual(ownerEsperado);

    const getComoAdmin = await request(app.getHttpServer())
      .get(`/api/services/${serviceA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(getComoAdmin.body.owner).toEqual(ownerEsperado);

    const listaComoDuenio = await request(app.getHttpServer())
      .get('/api/services')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(
      listaComoDuenio.body.find(
        (s: { id: string; owner: unknown }) => s.id === serviceA.id,
      ).owner,
    ).toEqual(ownerEsperado);

    const listaComoAdmin = await request(app.getHttpServer())
      .get('/api/services')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const servicioEnListaAdmin = listaComoAdmin.body.find(
      (s: { id: string; owner: unknown }) => s.id === serviceA.id,
    );
    expect(servicioEnListaAdmin.owner).toEqual(ownerEsperado);

    // Nunca se filtra por acá el password_hash del dueño — solo id/name/email.
    expect(servicioEnListaAdmin.owner).not.toHaveProperty('passwordHash');
    expect(servicioEnListaAdmin.owner).not.toHaveProperty('password_hash');
    expect(servicioEnListaAdmin.owner).not.toHaveProperty('role');
  });

  it('el admin ve y puede tocar los servicios de ambos revendedores', async () => {
    const serviceA = await createService(
      userA.accessToken,
      `Servicio admin-view A ${randomUUID()}`,
    );
    const serviceB = await createService(
      userB.accessToken,
      `Servicio admin-view B ${randomUUID()}`,
    );

    const listAdmin = await request(app.getHttpServer())
      .get('/api/services')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const idsVistosPorAdmin = listAdmin.body.map((s: { id: string }) => s.id);
    expect(idsVistosPorAdmin).toContain(serviceA.id);
    expect(idsVistosPorAdmin).toContain(serviceB.id);

    await request(app.getHttpServer())
      .patch(`/api/services/${serviceA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ precioBase: 15 })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/services/${serviceB.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/services/${serviceB.id}/reactivate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
  });
});
