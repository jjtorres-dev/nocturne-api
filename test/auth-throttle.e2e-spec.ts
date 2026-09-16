import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

// Aparte de auth.e2e-spec.ts para tener su propia instancia de app (y por lo
// tanto su propio ThrottlerStorage en memoria), y así no competir por la
// ventana de 5 intentos/minuto con los logins que ese otro archivo necesita.
describe('Auth — rate limit de login (e2e)', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('permite 5 intentos por minuto por IP y bloquea el 6to con 429', async () => {
    const credentials = {
      email: 'rate-limit-test@nocturne.local',
      password: 'wrong-password',
    };

    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials);
      expect(res.status).not.toBe(429);
    }

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(429);
    expect(res.body.message).toMatch(/intentos de inicio de sesión/i);
  });
});
