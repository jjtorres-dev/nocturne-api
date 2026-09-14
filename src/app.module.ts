import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration.js';
import { validationSchema } from './config/validation.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ServicesModule } from './services/services.module.js';
import { ContactsModule } from './contacts/contacts.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { ProfilesModule } from './accounts/profiles/profiles.module.js';
import { SalesModule } from './sales/sales.module.js';
import { PaymentsModule } from './payments/payments.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        autoLoadEntities: true,
        // El schema se maneja con migraciones (ver src/database/) a partir
        // de la Fase 1, tanto en local como en producción.
        synchronize: false,
      }),
    }),
    UsersModule,
    AuthModule,
    ServicesModule,
    ContactsModule,
    AccountsModule,
    ProfilesModule,
    SalesModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
