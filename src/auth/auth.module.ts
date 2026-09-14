import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './jwt.strategy.js';

// Global: JwtAuthGuard/RolesGuard se usan con @UseGuards() en cualquier
// módulo de features (Servicios, Contactos, y los que sigan), y esos
// guards necesitan AuthModuleOptions (provisto por PassportModule)
// resoluble en el injector de ese módulo. Marcar AuthModule como global
// y reexportar PassportModule evita tener que importarlo a mano en cada
// módulo nuevo.
@Global()
@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: {
          // El tipo de jsonwebtoken solo acepta strings como "1d"/"2h", no un string genérico.
          expiresIn: configService.get<string>(
            'jwt.expiresIn',
          ) as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
