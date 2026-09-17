import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Multi-usuario — Fase B2 (mismo patrón que Servicios, Fase B1): el punto
// crítico es que RolesGuard/JwtAuthGuard + el ownerId real guardado en la
// fila den 404 de punta a punta contra un JWT de verdad de dos usuarios
// REVENDEDOR distintos, no que ContactsService tenga la lógica de ownership
// (eso lo cubre contacts.service.spec.ts con repositorio mockeado).
//
// userA/userB se crean UNA sola vez en beforeAll y se reusan en todos los
// `it` (ver el mismo comentario en services-ownership.e2e-spec.ts sobre el
// rate limit de POST /auth/login).
describe('Contacts — ownership entre usuarios (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let userA: { id: string; name: string; email: string; accessToken: string };
  let userB: { id: string; name: string; email: string; accessToken: string };
  const createdUserEmails: string[] = [];
  const createdContactIds: string[] = [];

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

    userA = await createRevendedor('c-owner-a');
    userB = await createRevendedor('c-owner-b');
  });

  afterAll(async () => {
    if (createdContactIds.length > 0) {
      await dataSource.query('DELETE FROM contacts WHERE id = ANY($1)', [
        createdContactIds,
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

  async function createContact(
    accessToken: string,
    nombre: string,
  ): Promise<{
    id: string;
    ownerId: string;
    owner?: { id: string; name: string; email: string };
  }> {
    const res = await request(app.getHttpServer())
      .post('/api/contacts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nombre,
        whatsapp: '+51999999999',
        tipo: 'CLIENTE_FINAL',
      })
      .expect(201);
    createdContactIds.push(res.body.id);
    return res.body;
  }

  it('un REVENDEDOR no puede ver, editar, desactivar ni reactivar un contacto ajeno (404, no 403), y su listado nunca lo incluye', async () => {
    const contactA = await createContact(
      userA.accessToken,
      `Contacto de A ${randomUUID()}`,
    );
    expect(contactA.ownerId).toBe(userA.id);

    await request(app.getHttpServer())
      .get(`/api/contacts/${contactA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/contacts/${contactA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ nombre: 'Intento de edición ajena' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/contacts/${contactA.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/contacts/${contactA.id}/reactivate`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);

    const listB = await request(app.getHttpServer())
      .get('/api/contacts')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(
      listB.body.some((c: { id: string }) => c.id === contactA.id),
    ).toBe(false);

    // Control positivo: A sigue viendo y pudiendo tocar lo propio.
    await request(app.getHttpServer())
      .get(`/api/contacts/${contactA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    const listA = await request(app.getHttpServer())
      .get('/api/contacts')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(listA.body.some((c: { id: string }) => c.id === contactA.id)).toBe(
      true,
    );
  });

  it('GET /:id y GET / siempre incluyen owner {id, name, email}, igual para el dueño y para el admin', async () => {
    const contactA = await createContact(
      userA.accessToken,
      `Contacto con owner ${randomUUID()}`,
    );
    const ownerEsperado = { id: userA.id, name: userA.name, email: userA.email };

    const getComoDuenio = await request(app.getHttpServer())
      .get(`/api/contacts/${contactA.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(getComoDuenio.body.owner).toEqual(ownerEsperado);

    const getComoAdmin = await request(app.getHttpServer())
      .get(`/api/contacts/${contactA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(getComoAdmin.body.owner).toEqual(ownerEsperado);

    const listaComoDuenio = await request(app.getHttpServer())
      .get('/api/contacts')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(
      listaComoDuenio.body.find(
        (c: { id: string; owner: unknown }) => c.id === contactA.id,
      ).owner,
    ).toEqual(ownerEsperado);

    const listaComoAdmin = await request(app.getHttpServer())
      .get('/api/contacts')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const contactoEnListaAdmin = listaComoAdmin.body.find(
      (c: { id: string; owner: unknown }) => c.id === contactA.id,
    );
    expect(contactoEnListaAdmin.owner).toEqual(ownerEsperado);

    // Nunca se filtra por acá el password_hash del dueño — solo id/name/email.
    expect(contactoEnListaAdmin.owner).not.toHaveProperty('passwordHash');
    expect(contactoEnListaAdmin.owner).not.toHaveProperty('password_hash');
    expect(contactoEnListaAdmin.owner).not.toHaveProperty('role');
  });

  it('el admin ve y puede tocar los contactos de ambos revendedores', async () => {
    const contactA = await createContact(
      userA.accessToken,
      `Contacto admin-view A ${randomUUID()}`,
    );
    const contactB = await createContact(
      userB.accessToken,
      `Contacto admin-view B ${randomUUID()}`,
    );

    const listAdmin = await request(app.getHttpServer())
      .get('/api/contacts')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const idsVistosPorAdmin = listAdmin.body.map((c: { id: string }) => c.id);
    expect(idsVistosPorAdmin).toContain(contactA.id);
    expect(idsVistosPorAdmin).toContain(contactB.id);

    await request(app.getHttpServer())
      .patch(`/api/contacts/${contactA.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ whatsapp: '+51988888888' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/contacts/${contactB.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/contacts/${contactB.id}/reactivate`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
  });
});
