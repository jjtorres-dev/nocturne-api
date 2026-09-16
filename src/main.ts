import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Railway pone un único proxy delante de la app: sin esto, Express (y por
  // lo tanto el rate limit por IP de POST /auth/login) ve la IP del proxy
  // para todas las requests en vez de la real del cliente (X-Forwarded-For).
  app.set('trust proxy', 1);
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
