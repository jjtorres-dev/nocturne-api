import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { UserRole } from '../users/user-role.enum.js';
import type { UsersService } from '../users/users.service.js';
import type { JwtService } from '@nestjs/jwt';

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

  let usersService: { findByEmail: ReturnType<typeof vi.fn> };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let authService: AuthService;

  beforeEach(async () => {
    baseUser.passwordHash = await bcrypt.hash('correct-password', 10);
    usersService = { findByEmail: vi.fn() };
    jwtService = { signAsync: vi.fn().mockResolvedValue('signed-token') };
    authService = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
    );
  });

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

  it('genera un access token al hacer login', async () => {
    const result = await authService.login({
      id: baseUser.id,
      email: baseUser.email,
      name: baseUser.name,
      role: baseUser.role,
    });

    expect(result.accessToken).toBe('signed-token');
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: baseUser.id,
      email: baseUser.email,
      role: baseUser.role,
    });
  });
});
