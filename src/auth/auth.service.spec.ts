import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { UserRole } from '../users/user-role.enum.js';
import type { UsersService } from '../users/users.service.js';
import type { JwtService } from '@nestjs/jwt';
import type { RefreshTokensService } from './refresh-tokens.service.js';

describe('AuthService', () => {
  const baseUser = {
    id: 'user-1',
    email: 'admin@nocturne.local',
    name: 'Admin',
    role: UserRole.ADMIN,
    isActive: true,
    passwordHash: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let refreshTokensService: {
    create: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let authService: AuthService;

  beforeEach(async () => {
    baseUser.passwordHash = await bcrypt.hash('correct-password', 10);
    usersService = { findByEmail: vi.fn(), findById: vi.fn() };
    jwtService = { signAsync: vi.fn().mockResolvedValue('signed-token') };
    refreshTokensService = {
      create: vi.fn().mockResolvedValue('refresh-token-1'),
      rotate: vi.fn(),
      revoke: vi.fn(),
    };
    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      refreshTokensService as unknown as RefreshTokensService,
    );
  });

  describe('validateUser', () => {
    it('valida credenciales correctas y devuelve el usuario sin el hash', async () => {
      usersService.findByEmail.mockResolvedValue({ ...baseUser });

      const result = await authService.validateUser(
        baseUser.email,
        'correct-password',
      );

      expect(result).toEqual({
        id: baseUser.id,
        email: baseUser.email,
        name: baseUser.name,
        role: baseUser.role,
      });
    });

    it('rechaza contraseñas incorrectas', async () => {
      usersService.findByEmail.mockResolvedValue({ ...baseUser });

      await expect(
        authService.validateUser(baseUser.email, 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza usuarios inexistentes', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.validateUser('nadie@nocturne.local', 'any-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('genera un access token y un refresh token', async () => {
      const result = await authService.login({
        id: baseUser.id,
        email: baseUser.email,
        name: baseUser.name,
        role: baseUser.role,
      });

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('refresh-token-1');
      expect(result.user.id).toBe(baseUser.id);
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
      expect(refreshTokensService.create).toHaveBeenCalledWith(baseUser.id);
    });
  });

  describe('refresh', () => {
    it('rota el refresh token y firma un access token nuevo', async () => {
      refreshTokensService.rotate.mockResolvedValue({
        userId: baseUser.id,
        token: 'refresh-token-2',
      });
      usersService.findById.mockResolvedValue({ ...baseUser });

      const result = await authService.refresh('refresh-token-1');

      expect(refreshTokensService.rotate).toHaveBeenCalledWith(
        'refresh-token-1',
      );
      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'refresh-token-2',
      });
    });

    it('propaga el 401 de RefreshTokensService.rotate si el token es inválido/vencido/revocado', async () => {
      refreshTokensService.rotate.mockRejectedValue(
        new UnauthorizedException('Sesión expirada, inicia sesión de nuevo'),
      );

      await expect(authService.refresh('refresh-token-1')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('rechaza si el usuario del token ya no existe o está inactivo', async () => {
      refreshTokensService.rotate.mockResolvedValue({
        userId: baseUser.id,
        token: 'refresh-token-2',
      });
      usersService.findById.mockResolvedValue(null);

      await expect(authService.refresh('refresh-token-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('delega la revocación en RefreshTokensService', async () => {
      await authService.logout('refresh-token-1');

      expect(refreshTokensService.revoke).toHaveBeenCalledWith(
        'refresh-token-1',
      );
    });
  });
});
