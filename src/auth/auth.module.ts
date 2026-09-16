import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './jwt.strategy.js';
import { RefreshToken } from './refresh-token.entity.js';
import { RefreshTokensService } from './refresh-tokens.service.js';

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
    TypeOrmModule.forFeature([RefreshToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Config por defecto de los throttlers de este módulo. No se registra
    // ThrottlerGuard como APP_GUARD (rate limit no global): solo se aplica
    // donde se pone @UseGuards(LoginThrottlerGuard) explícitamente, hoy
    // únicamente en POST /auth/login.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: {
          // El tipo de jsonwebtoken solo acepta strings como "1d"/"2h", no un string genérico.
          expiresIn: configService.get<string>(
            'jwt.accessTokenExpiresIn',
          ) as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshTokensService],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
