import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UsersService } from '../users/users.service.js';
import { RefreshTokensService } from './refresh-tokens.service.js';
import type { AuthenticatedUser, JwtPayload } from './jwt.strategy.js';

const SESSION_EXPIRED_MESSAGE = 'Sesión expirada, inicia sesión de nuevo';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly dataSource: DataSource,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async login(user: AuthenticatedUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.refreshTokensService.create(user.id),
    ]);
    return { accessToken, refreshToken, user };
  }

  async refresh(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { userId, token: refreshToken } =
      await this.refreshTokensService.rotate(rawRefreshToken);
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, refreshToken };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.refreshTokensService.revoke(rawRefreshToken);
  }

  // Cambio de contraseña propia. Es 400 (no 401) si la actual no coincide:
  // el usuario sí está autenticado, y un 401 haría que el frontend intente
  // refrescar la sesión en vez de mostrar el error. Guardar la nueva
  // contraseña y revocar TODOS los refresh tokens del usuario (incluida la
  // sesión actual) van en una sola transacción: o se aplican las dos cosas
  // o ninguna. Sin ella, un fallo a mitad de camino dejaría la contraseña
  // cambiada con las sesiones viejas todavía renovables (o al revés).
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no válido');
    }
    const currentMatches = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!currentMatches) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    // bcrypt (CPU) antes de abrir la transacción, para no mantenerla abierta.
    const newPasswordHash = await this.usersService.hashPassword(newPassword);
    await this.dataSource.transaction(async (manager) => {
      await this.usersService.updatePasswordHash(
        user.id,
        newPasswordHash,
        manager,
      );
      await this.refreshTokensService.revokeAllForUser(user.id, manager);
    });
  }
}
