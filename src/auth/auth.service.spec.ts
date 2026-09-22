import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { UserRole } from '../users/user-role.enum.js';
import type { DataSource } from 'typeorm';
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

  const txManager = { name: 'tx-manager' };

  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    hashPassword: ReturnType<typeof vi.fn>;
    updatePasswordHash: ReturnType<typeof vi.fn>;
  };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let refreshTokensService: {
    create: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    revokeAllForUser: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let authService: AuthService;

  beforeEach(async () => {
    baseUser.passwordHash = await bcrypt.hash('correct-password', 10);
    usersService = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      hashPassword: vi.fn().mockResolvedValue('new-hash'),
      updatePasswordHash: vi.fn().mockResolvedValue(undefined),
    };
    jwtService = { signAsync: vi.fn().mockResolvedValue('signed-token') };
    refreshTokensService = {
      create: vi.fn().mockResolvedValue('refresh-token-1'),
      rotate: vi.fn(),
      revoke: vi.fn(),
      revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    };
    // Transacción falsa que se limita a ejecutar el callback con un manager.
    dataSource = {
      transaction: vi.fn(async (work: (manager: unknown) => unknown) =>
        work(txManager),
      ),
    };
    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      refreshTokensService as unknown as RefreshTokensService,
      dataSource as unknown as DataSource,
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

  describe('changePassword', () => {
    it('con la contraseña actual correcta guarda la nueva y revoca todos los refresh tokens, ambos dentro de la MISMA transacción', async () => {
      usersService.findById.mockResolvedValue({ ...baseUser });

      await authService.changePassword(
        baseUser.id,
        'correct-password',
        'brand-new-password',
      );

      expect(usersService.hashPassword).toHaveBeenCalledWith(
        'brand-new-password',
      );
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // Las dos operaciones reciben el manager de la transacción.
      expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
        baseUser.id,
        'new-hash',
        txManager,
      );
      expect(refreshTokensService.revokeAllForUser).toHaveBeenCalledWith(
        baseUser.id,
        txManager,
      );
      // La contraseña se guarda antes de revocar las sesiones.
      expect(
        usersService.updatePasswordHash.mock.invocationCallOrder[0],
      ).toBeLessThan(
        refreshTokensService.revokeAllForUser.mock.invocationCallOrder[0],
      );
    });

    it('el hasheo (bcrypt) ocurre antes de abrir la transacción', async () => {
      usersService.findById.mockResolvedValue({ ...baseUser });

      await authService.changePassword(
        baseUser.id,
        'correct-password',
        'brand-new-password',
      );

      expect(
        usersService.hashPassword.mock.invocationCallOrder[0],
      ).toBeLessThan(dataSource.transaction.mock.invocationCallOrder[0]);
    });

    it('con la contraseña actual incorrecta da 400 y no toca nada (ni abre transacción)', async () => {
      usersService.findById.mockResolvedValue({ ...baseUser });

      const attempt = authService.changePassword(
        baseUser.id,
        'wrong-password',
        'brand-new-password',
      );

      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.toThrow(
        'La contraseña actual no es correcta',
      );
      expect(usersService.hashPassword).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
      expect(refreshTokensService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rechaza (401) si el usuario ya no existe o está inactivo, sin tocar nada', async () => {
      usersService.findById.mockResolvedValueOnce(null);
      await expect(
        authService.changePassword(
          baseUser.id,
          'correct-password',
          'x'.repeat(8),
        ),
      ).rejects.toThrow(UnauthorizedException);

      usersService.findById.mockResolvedValueOnce({
        ...baseUser,
        isActive: false,
      });
      await expect(
        authService.changePassword(
          baseUser.id,
          'correct-password',
          'x'.repeat(8),
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
      expect(refreshTokensService.revokeAllForUser).not.toHaveBeenCalled();
    });

    describe('atomicidad (transacción simulada con commit/rollback)', () => {
      // Base de datos falsa: las escrituras van a una copia "staged" que solo
      // se confirma si el callback de la transacción termina bien; si lanza,
      // se descarta — igual que el ROLLBACK real.
      interface Db {
        passwordHash: string;
        tokensRevoked: boolean;
      }
      let committed: Db;

      beforeEach(() => {
        committed = { passwordHash: 'old-hash', tokensRevoked: false };
        usersService.findById.mockResolvedValue({ ...baseUser });
        dataSource.transaction.mockImplementation(
          async (work: (manager: { staged: Db }) => Promise<unknown>) => {
            const manager = { staged: { ...committed } };
            const result = await work(manager); // si lanza, no se confirma
            committed = manager.staged;
            return result;
          },
        );
        usersService.updatePasswordHash.mockImplementation(
          async (_id: string, hash: string, manager: { staged: Db }) => {
            manager.staged.passwordHash = hash;
          },
        );
        refreshTokensService.revokeAllForUser.mockImplementation(
          async (_id: string, manager: { staged: Db }) => {
            manager.staged.tokensRevoked = true;
          },
        );
      });

      it('si todo sale bien se aplican las dos cosas', async () => {
        await authService.changePassword(
          baseUser.id,
          'correct-password',
          'brand-new-password',
        );

        expect(committed).toEqual({
          passwordHash: 'new-hash',
          tokensRevoked: true,
        });
      });

      it('si la revocación de tokens falla, la contraseña tampoco queda cambiada', async () => {
        refreshTokensService.revokeAllForUser.mockRejectedValue(
          new Error('falló la revocación'),
        );

        await expect(
          authService.changePassword(
            baseUser.id,
            'correct-password',
            'brand-new-password',
          ),
        ).rejects.toThrow('falló la revocación');

        // El UPDATE de la contraseña sí se intentó, pero dentro de la
        // transacción que se descartó: nada quedó aplicado.
        expect(usersService.updatePasswordHash).toHaveBeenCalledTimes(1);
        expect(committed).toEqual({
          passwordHash: 'old-hash',
          tokensRevoked: false,
        });
      });

      it('si el guardado de la contraseña falla, ningún token se toca', async () => {
        usersService.updatePasswordHash.mockRejectedValue(
          new Error('falló el guardado'),
        );

        await expect(
          authService.changePassword(
            baseUser.id,
            'correct-password',
            'brand-new-password',
          ),
        ).rejects.toThrow('falló el guardado');

        expect(refreshTokensService.revokeAllForUser).not.toHaveBeenCalled();
        expect(committed).toEqual({
          passwordHash: 'old-hash',
          tokensRevoked: false,
        });
      });
    });
  });
});
