import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module.js';
import { UsersService } from './users/users.service.js';

async function seed() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      'ADMIN_EMAIL y ADMIN_PASSWORD deben estar definidos en el entorno para poder crear el admin.',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  const passwordHash = await bcrypt.hash(password, 10);
  await usersService.upsertAdmin(email, passwordHash, 'Admin');

  console.log(`Usuario admin listo: ${email}`);
  await app.close();
}

seed().catch((error) => {
  console.error('Error creando el usuario admin:', error);
  process.exit(1);
});
