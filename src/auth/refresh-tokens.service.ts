import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import ms from 'ms';
import { EntityManager, Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity.js';

const SESSION_EXPIRED_MESSAGE = 'Sesión expirada, inicia sesión de nuevo';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El valor real del refresh token nunca se guarda: se genera un secreto
// aleatorio, se guarda solo su hash (bcrypt) en `tokenHash`, y al cliente se
// le devuelve `${id}:${secreto}`. El `id` (de la fila recién creada) actúa
// de selector para encontrar el registro en O(1) sin tener que comparar el
// secreto contra el hash de todos los refresh tokens activos.
@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
  ) {}

  async create(userId: string): Promise<string> {
    const secret = randomBytes(48).toString('hex');
    const tokenHash = await bcrypt.hash(secret, 10);
    const expiresIn = this.configService.getOrThrow<string>(
      'jwt.refreshTokenExpiresIn',
    );
    // El tipo de `ms` solo acepta un literal tipo "30d", no un string
    // genérico — mismo motivo del cast en AuthModule para accessTokenExpiresIn.
    const expiresAt = new Date(
      Date.now() + ms(expiresIn as unknown as ms.StringValue),
    );

    const refreshToken = this.refreshTokensRepository.create({
      userId,
      tokenHash,
      expiresAt,
      revoked: false,
    });
    const saved = await this.refreshTokensRepository.save(refreshToken);
    return `${saved.id}:${secret}`;
  }

  // Valida el refresh token recibido, lo revoca (rotación) y crea uno nuevo
  // para el mismo usuario. Un token ya revocado o vencido nunca llega a
  // rotar: siempre 401.
  async rotate(rawToken: string): Promise<{ userId: string; token: string }> {
    const record = await this.findValidOrThrow(rawToken);
    record.revoked = true;
    await this.refreshTokensRepository.save(record);
    const token = await this.create(record.userId);
    return { userId: record.userId, token };
  }

  async revoke(rawToken: string): Promise<void> {
    const record = await this.find(rawToken);
    if (!record) {
      return;
    }
    record.revoked = true;
    await this.refreshTokensRepository.save(record);
  }

  // Revoca todos los refresh tokens vigentes del usuario (todas sus sesiones).
  // Los access tokens ya emitidos siguen valiendo hasta que expiran (son
  // stateless), pero ninguna sesión puede renovarse.
  // Con `manager` corre dentro de esa transacción; sin él, con el repositorio.
  async revokeAllForUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(RefreshToken)
      : this.refreshTokensRepository;
    await repository.update({ userId, revoked: false }, { revoked: true });
  }

  private async find(rawToken: string): Promise<RefreshToken | null> {
    const parsed = this.parse(rawToken);
    if (!parsed) {
      return null;
    }
    const record = await this.refreshTokensRepository.findOne({
      where: { id: parsed.id },
    });
    if (!record) {
      return null;
    }
    const matches = await bcrypt.compare(parsed.secret, record.tokenHash);
    return matches ? record : null;
  }

  private async findValidOrThrow(rawToken: string): Promise<RefreshToken> {
    const record = await this.find(rawToken);
    if (!record || record.revoked || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }
    return record;
  }

  private parse(rawToken: string): { id: string; secret: string } | null {
    const separatorIndex = rawToken.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }
    const id = rawToken.slice(0, separatorIndex);
    const secret = rawToken.slice(separatorIndex + 1);
    if (!UUID_RE.test(id) || secret.length === 0) {
      return null;
    }
    return { id, secret };
  }
}
