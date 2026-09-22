import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { EntityManager, Repository } from 'typeorm';
import { RefreshTokensService } from './refresh-tokens.service.js';
import { RefreshToken } from './refresh-token.entity.js';
import type { ConfigService } from '@nestjs/config';

describe('RefreshTokensService', () => {
  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };
  let service: RefreshTokensService;

  beforeEach(() => {
    repo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => ({
        id: '11111111-1111-4111-8111-111111111111',
        ...entity,
      })),
      findOne: vi.fn(),
      update: vi.fn().mockResolvedValue({ affected: 0 }),
    };
    configService = {
      getOrThrow: vi.fn().mockReturnValue('30d'),
    };
    service = new RefreshTokensService(
      repo as unknown as Repository<RefreshToken>,
      configService as unknown as ConfigService,
    );
  });

  function record(overrides: Partial<RefreshToken> = {}): RefreshToken {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      tokenHash: '',
      expiresAt: new Date(Date.now() + 60_000),
      revoked: false,
      createdAt: new Date(),
      user: undefined as never,
      ...overrides,
    };
  }

  describe('create', () => {
    it('genera un token "id:secreto" y guarda solo el hash del secreto', async () => {
      const raw = await service.create('user-1');

      const [id, secret] = raw.split(':');
      expect(id).toBe('11111111-1111-4111-8111-111111111111');
      expect(secret).toBeTruthy();

      expect(repo.save).toHaveBeenCalled();
      const saved = repo.save.mock.calls[0][0];
      expect(saved.userId).toBe('user-1');
      expect(saved.revoked).toBe(false);
      expect(saved.tokenHash).not.toBe(secret);
      await expect(bcrypt.compare(secret, saved.tokenHash)).resolves.toBe(true);
    });

    it('calcula expiresAt a partir de jwt.refreshTokenExpiresIn', async () => {
      const before = Date.now();
      await service.create('user-1');
      const saved = repo.save.mock.calls[0][0];

      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'jwt.refreshTokenExpiresIn',
      );
      const expectedMs = 30 * 24 * 60 * 60 * 1000;
      expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + expectedMs - 1000,
      );
      expect(saved.expiresAt.getTime()).toBeLessThanOrEqual(
        before + expectedMs + 1000,
      );
    });
  });

  describe('rotate', () => {
    it('revoca el token actual y crea uno nuevo para el mismo usuario', async () => {
      const secret = 'a-secret-value';
      const tokenHash = await bcrypt.hash(secret, 10);
      repo.findOne.mockResolvedValue(record({ tokenHash }));

      const result = await service.rotate(
        `11111111-1111-4111-8111-111111111111:${secret}`,
      );

      expect(result.userId).toBe('user-1');
      expect(result.token).toContain(':');
      // Primer save: revoca el registro encontrado.
      expect(repo.save.mock.calls[0][0]).toMatchObject({ revoked: true });
    });

    it('rechaza (401) un token que ya fue revocado', async () => {
      const secret = 'a-secret-value';
      const tokenHash = await bcrypt.hash(secret, 10);
      repo.findOne.mockResolvedValue(record({ tokenHash, revoked: true }));

      await expect(
        service.rotate(`11111111-1111-4111-8111-111111111111:${secret}`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza (401) un token vencido', async () => {
      const secret = 'a-secret-value';
      const tokenHash = await bcrypt.hash(secret, 10);
      repo.findOne.mockResolvedValue(
        record({ tokenHash, expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.rotate(`11111111-1111-4111-8111-111111111111:${secret}`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza (401) si el secreto no matchea el hash guardado', async () => {
      const tokenHash = await bcrypt.hash('otro-secreto', 10);
      repo.findOne.mockResolvedValue(record({ tokenHash }));

      await expect(
        service.rotate(
          '11111111-1111-4111-8111-111111111111:secreto-incorrecto',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza (401) un formato de token inválido sin tocar la base de datos', async () => {
      await expect(service.rotate('formato-invalido')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('rechaza (401) si el token no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.rotate('11111111-1111-4111-8111-111111111111:algun-secreto'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('revoke', () => {
    it('marca revoked=true si el token existe y es válido', async () => {
      const secret = 'a-secret-value';
      const tokenHash = await bcrypt.hash(secret, 10);
      const found = record({ tokenHash });
      repo.findOne.mockResolvedValue(found);

      await service.revoke(`11111111-1111-4111-8111-111111111111:${secret}`);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ revoked: true }),
      );
    });

    it('no falla si el token no existe (idempotente)', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.revoke('11111111-1111-4111-8111-111111111111:algun-secreto'),
      ).resolves.toBeUndefined();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllForUser', () => {
    it('revoca todos los refresh tokens vigentes del usuario, y solo los suyos', async () => {
      await service.revokeAllForUser('user-1');

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'user-1', revoked: false },
        { revoked: true },
      );
    });

    it('con un EntityManager corre dentro de esa transacción y no usa el repositorio inyectado', async () => {
      const txRepo = { update: vi.fn().mockResolvedValue({ affected: 2 }) };
      const manager = { getRepository: vi.fn().mockReturnValue(txRepo) };

      await service.revokeAllForUser(
        'user-1',
        manager as unknown as EntityManager,
      );

      expect(manager.getRepository).toHaveBeenCalledWith(RefreshToken);
      expect(txRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1', revoked: false },
        { revoked: true },
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
