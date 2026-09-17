import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ProfilesService } from './profiles.service.js';
import { Profile } from './entities/profile.entity.js';
import { ServiceType } from '../../services/service-type.enum.js';
import type { AccountsService } from '../accounts.service.js';
import type { ServicesService } from '../../services/services.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { AuthenticatedUser } from '../../auth/jwt.strategy.js';

describe('ProfilesService', () => {
  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@nocturne.dev',
    name: 'Admin',
    role: UserRole.ADMIN,
  };
  const revendedorA: AuthenticatedUser = {
    id: 'revendedor-a',
    email: 'a@nocturne.dev',
    name: 'Revendedor A',
    role: UserRole.REVENDEDOR,
  };

  const baseProfile: Profile = {
    id: 'profile-1',
    cuentaId: 'account-1',
    cuenta: undefined as unknown as Profile['cuenta'],
    nombre: 'Perfil 1',
    pin: null,
    clienteId: null,
    cliente: null,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const account = { id: 'account-1', ownerId: revendedorA.id, servicioId: 'service-1' };

  const serviceConLimite = {
    id: 'service-1',
    nombre: 'Netflix',
    tipo: ServiceType.CON_PERFILES,
    duracionMeses: 1,
    pantallasMax: 2,
    precioBase: 10,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const serviceSinLimite = { ...serviceConLimite, pantallasMax: null };

  let profilesRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let accountsService: {
    findOne: ReturnType<typeof vi.fn>;
    findOneOwned: ReturnType<typeof vi.fn>;
  };
  let servicesService: { findOne: ReturnType<typeof vi.fn> };
  let profilesService: ProfilesService;

  beforeEach(() => {
    profilesRepo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => entity),
      update: vi.fn(async () => ({ affected: 1 })),
      findOne: vi.fn(),
      find: vi.fn(),
      count: vi.fn(),
    };
    accountsService = {
      findOne: vi.fn().mockResolvedValue(account),
      findOneOwned: vi.fn().mockResolvedValue(account),
    };
    servicesService = { findOne: vi.fn().mockResolvedValue(serviceConLimite) };

    profilesService = new ProfilesService(
      profilesRepo as unknown as Repository<Profile>,
      accountsService as unknown as AccountsService,
      servicesService as unknown as ServicesService,
    );
  });

  describe('create', () => {
    it('crea el perfil si no se superó pantallasMax', async () => {
      profilesRepo.count.mockResolvedValue(1); // 1 activo, máximo 2

      const result = await profilesService.create(
        account.id,
        { nombre: 'Perfil nuevo' },
        revendedorA,
      );

      expect(accountsService.findOneOwned).toHaveBeenCalledWith(account.id, revendedorA);
      expect(profilesRepo.create).toHaveBeenCalledWith({
        nombre: 'Perfil nuevo',
        cuentaId: account.id,
      });
      expect(result).toMatchObject({ nombre: 'Perfil nuevo' });
    });

    it('rechaza crear si ya se alcanzó pantallasMax', async () => {
      profilesRepo.count.mockResolvedValue(2); // ya en el máximo

      await expect(
        profilesService.create(account.id, { nombre: 'Perfil 3' }, revendedorA),
      ).rejects.toThrow(ConflictException);
      expect(profilesRepo.create).not.toHaveBeenCalled();
    });

    it('sin límite (pantallasMax null) siempre permite crear', async () => {
      servicesService.findOne.mockResolvedValue(serviceSinLimite);
      profilesRepo.count.mockResolvedValue(50);

      await expect(
        profilesService.create(account.id, { nombre: 'Perfil 51' }, revendedorA),
      ).resolves.toBeDefined();
    });

    it('404 si la cuenta padre es ajena (delega en accountsService.findOneOwned)', async () => {
      accountsService.findOneOwned.mockRejectedValue(new NotFoundException());

      await expect(
        profilesService.create('cuenta-ajena', { nombre: 'X' }, revendedorA),
      ).rejects.toThrow(NotFoundException);
      expect(profilesRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('reactivate', () => {
    it('reactiva si hay lugar', async () => {
      profilesRepo.findOne.mockResolvedValue({ ...baseProfile, activo: false });
      profilesRepo.count.mockResolvedValue(1);

      const result = await profilesService.reactivate(
        account.id,
        baseProfile.id,
        revendedorA,
      );

      expect(result.activo).toBe(true);
    });

    it('rechaza reactivar si ya se alcanzó pantallasMax con otros perfiles activos', async () => {
      profilesRepo.findOne.mockResolvedValue({ ...baseProfile, activo: false });
      profilesRepo.count.mockResolvedValue(2);

      await expect(
        profilesService.reactivate(account.id, baseProfile.id, revendedorA),
      ).rejects.toThrow(ConflictException);
    });

    it('404 si la cuenta padre es ajena', async () => {
      accountsService.findOneOwned.mockRejectedValue(new NotFoundException());

      await expect(
        profilesService.reactivate('cuenta-ajena', baseProfile.id, revendedorA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOneOwned', () => {
    it('devuelve el perfil si la cuenta padre es del usuario (o el admin la ve)', async () => {
      profilesRepo.findOne.mockResolvedValue(baseProfile);

      const result = await profilesService.findOneOwned(
        account.id,
        baseProfile.id,
        admin,
      );

      expect(result).toBe(baseProfile);
      expect(accountsService.findOneOwned).toHaveBeenCalledWith(account.id, admin);
    });

    it('404 si la cuenta padre es ajena, antes de siquiera buscar el perfil', async () => {
      accountsService.findOneOwned.mockRejectedValue(new NotFoundException());

      await expect(
        profilesService.findOneOwned('cuenta-ajena', baseProfile.id, revendedorA),
      ).rejects.toThrow(NotFoundException);
      expect(profilesRepo.findOne).not.toHaveBeenCalled();
    });

    it('404 si el perfil no existe dentro de esa cuenta (aunque la cuenta sí sea del usuario)', async () => {
      profilesRepo.findOne.mockResolvedValue(null);

      await expect(
        profilesService.findOneOwned(account.id, 'no-existe', revendedorA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('findOne (sin scope) lanza NotFoundException si no existe en esa cuenta', async () => {
    profilesRepo.findOne.mockResolvedValue(null);

    await expect(
      profilesService.findOne(account.id, 'no-existe'),
    ).rejects.toThrow(NotFoundException);
  });

  it('softDelete pone activo en false', async () => {
    profilesRepo.findOne.mockResolvedValue({ ...baseProfile, activo: true });

    const result = await profilesService.softDelete(
      account.id,
      baseProfile.id,
      revendedorA,
    );

    expect(result.activo).toBe(false);
  });

  it('findAllOwned valida que la cuenta exista/sea del usuario antes de listar', async () => {
    accountsService.findOneOwned.mockRejectedValue(new NotFoundException());
    await expect(
      profilesService.findAllOwned('no-existe', {}, revendedorA),
    ).rejects.toThrow(NotFoundException);
  });
});
