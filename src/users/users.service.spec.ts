import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { UserRole } from './user-role.enum.js';

describe('UsersService', () => {
  const baseUser: User = {
    id: 'user-1',
    email: 'revendedor@nocturne.dev',
    passwordHash: 'hash-original',
    name: 'Revendedor Uno',
    role: UserRole.REVENDEDOR,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let usersService: UsersService;

  beforeEach(() => {
    repo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => ({ id: baseUser.id, ...entity })),
      update: vi.fn(async () => ({ affected: 1 })),
      findOne: vi.fn(),
      find: vi.fn(),
    };
    usersService = new UsersService(repo as unknown as Repository<User>);
  });

  describe('create', () => {
    it('hashea la contraseña y no la devuelve en la respuesta', async () => {
      const { passwordHash: _omit, ...publicUser } = baseUser;
      repo.findOne
        .mockResolvedValueOnce(null) // findByEmail: no existe todavía
        .mockResolvedValueOnce(publicUser); // findOne público post-create

      const result = await usersService.create({
        email: baseUser.email,
        password: 'password123',
        name: baseUser.name,
        role: UserRole.REVENDEDOR,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: baseUser.email, name: baseUser.name, role: UserRole.REVENDEDOR }),
      );
      const createArg = repo.create.mock.calls[0][0];
      expect(createArg.passwordHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', createArg.passwordHash)).toBe(true);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('lanza ConflictException si ya existe un usuario con ese email', async () => {
      repo.findOne.mockResolvedValueOnce(baseUser);

      await expect(
        usersService.create({
          email: baseUser.email,
          password: 'password123',
          name: 'Otro nombre',
          role: UserRole.ADMIN,
        }),
      ).rejects.toThrow(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll / findOne', () => {
    it('lista usuarios sin pedir password_hash a la DB', async () => {
      repo.find.mockResolvedValue([{ ...baseUser, passwordHash: undefined }]);

      await usersService.findAll();

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ id: true, email: true, name: true, role: true, isActive: true }),
        }),
      );
      const selectArg = repo.find.mock.calls[0][0].select;
      expect(selectArg.passwordHash).toBeUndefined();
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(usersService.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza name/role sin tocar password_hash si no viene password', async () => {
      repo.findOne.mockResolvedValue({ ...baseUser, passwordHash: undefined });

      await usersService.update(baseUser.id, { name: 'Nuevo nombre' }, 'admin-id');

      expect(repo.update).toHaveBeenCalledWith(baseUser.id, {
        name: 'Nuevo nombre',
        role: undefined,
        passwordHash: undefined,
      });
    });

    it('hashea la nueva contraseña cuando viene en el PATCH', async () => {
      repo.findOne.mockResolvedValue({ ...baseUser, passwordHash: undefined });

      await usersService.update(baseUser.id, { password: 'nueva-clave-123' }, 'admin-id');

      const updateArg = repo.update.mock.calls[0][1];
      expect(updateArg.passwordHash).not.toBe('nueva-clave-123');
      expect(await bcrypt.compare('nueva-clave-123', updateArg.passwordHash)).toBe(true);
    });

    it('no permite que un usuario se cambie su propio rol', async () => {
      repo.findOne.mockResolvedValue({ ...baseUser, id: 'admin-id', passwordHash: undefined });

      await expect(
        usersService.update('admin-id', { role: UserRole.REVENDEDOR }, 'admin-id'),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('sí permite que un usuario cambie su propio nombre o contraseña', async () => {
      repo.findOne.mockResolvedValue({ ...baseUser, id: 'admin-id', passwordHash: undefined });

      await expect(
        usersService.update('admin-id', { name: 'Nuevo nombre' }, 'admin-id'),
      ).resolves.toBeDefined();
    });

    it('lanza NotFoundException si el usuario a actualizar no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        usersService.update('no-existe', { name: 'X' }, 'admin-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('pone isActive en false', async () => {
      repo.findOne.mockResolvedValue({ ...baseUser, passwordHash: undefined, isActive: false });

      const result = await usersService.softDelete(baseUser.id, 'admin-id');

      expect(repo.update).toHaveBeenCalledWith(baseUser.id, { isActive: false });
      expect(result.isActive).toBe(false);
    });

    it('no permite que un usuario se desactive a sí mismo', async () => {
      await expect(usersService.softDelete('admin-id', 'admin-id')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('reactivate', () => {
    it('pone isActive en true', async () => {
      repo.findOne.mockResolvedValue({ ...baseUser, passwordHash: undefined, isActive: true });

      const result = await usersService.reactivate(baseUser.id);

      expect(repo.update).toHaveBeenCalledWith(baseUser.id, { isActive: true });
      expect(result.isActive).toBe(true);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(usersService.reactivate('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('hashPassword / updatePasswordHash', () => {
    it('hashPassword devuelve un hash bcrypt que no es la contraseña en texto plano', async () => {
      const hash = await usersService.hashPassword('nueva-clave-123');

      expect(hash).not.toContain('nueva-clave-123');
      expect(await bcrypt.compare('nueva-clave-123', hash)).toBe(true);
    });

    it('updatePasswordHash sin manager actualiza solo password_hash con el repositorio inyectado', async () => {
      await usersService.updatePasswordHash('user-1', 'hash-nuevo');

      expect(repo.update).toHaveBeenCalledWith('user-1', {
        passwordHash: 'hash-nuevo',
      });
    });

    it('updatePasswordHash con manager corre en esa transacción y no toca el repositorio inyectado', async () => {
      const txRepo = { update: vi.fn().mockResolvedValue({ affected: 1 }) };
      const manager = { getRepository: vi.fn().mockReturnValue(txRepo) };

      await usersService.updatePasswordHash(
        'user-1',
        'hash-nuevo',
        manager as unknown as EntityManager,
      );

      expect(manager.getRepository).toHaveBeenCalledWith(User);
      expect(txRepo.update).toHaveBeenCalledWith('user-1', {
        passwordHash: 'hash-nuevo',
      });
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
