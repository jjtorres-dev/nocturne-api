import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../services/entities/service.entity.js';
import { Account } from '../accounts/entities/account.entity.js';
import { Profile } from '../accounts/profiles/entities/profile.entity.js';
import { ServiceType } from '../services/service-type.enum.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { resolveOwnerName } from '../common/search-result.js';
import type { InventarioItem } from './inventario-item.js';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Service)
    private readonly servicesRepository: Repository<Service>,
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    @InjectRepository(Profile)
    private readonly profilesRepository: Repository<Profile>,
  ) {}

  // Mismo scoping que las tarjetas de vencimiento del Dashboard
  // (SalesService.summaryOwned): REVENDEDOR → solo lo suyo, ADMIN → todo el
  // negocio.
  // Libre = perfil activo sin cliente en una cuenta activa, o (servicios sin
  // perfiles) cuenta activa sin cliente. Las cuentas caídas no cuentan: no
  // se pueden vender hasta que el proveedor las reponga.
  // Total = el mismo universo sin mirar el cliente (libres + ocupados).
  async inventario(currentUser: AuthenticatedUser): Promise<InventarioItem[]> {
    const ownerId =
      currentUser.role === UserRole.REVENDEDOR ? currentUser.id : undefined;

    const serviciosQb = this.servicesRepository
      .createQueryBuilder('servicio')
      .leftJoin('servicio.owner', 'owner')
      .select(['servicio.id', 'servicio.nombre', 'servicio.tipo'])
      .addSelect(['owner.id', 'owner.name'])
      .where('servicio.activo = true')
      .orderBy('servicio.nombre', 'ASC');
    const perfilesQb = this.profilesRepository
      .createQueryBuilder('profile')
      .innerJoin('profile.cuenta', 'cuenta')
      .select('cuenta.servicioId', 'servicioId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN profile.clienteId IS NULL THEN 1 ELSE 0 END)',
        'libres',
      )
      .where('profile.activo = true')
      .andWhere('cuenta.activo = true')
      .andWhere('cuenta.fechaCaida IS NULL')
      .groupBy('cuenta.servicioId');
    const cuentasQb = this.accountsRepository
      .createQueryBuilder('cuenta')
      .select('cuenta.servicioId', 'servicioId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN cuenta.clienteId IS NULL THEN 1 ELSE 0 END)',
        'libres',
      )
      .where('cuenta.activo = true')
      .andWhere('cuenta.fechaCaida IS NULL')
      .groupBy('cuenta.servicioId');
    if (ownerId) {
      serviciosQb.andWhere('servicio.ownerId = :ownerId', { ownerId });
      perfilesQb.andWhere('cuenta.ownerId = :ownerId', { ownerId });
      cuentasQb.andWhere('cuenta.ownerId = :ownerId', { ownerId });
    }

    type Row = { servicioId: string; libres: string; total: string };
    const [servicios, perfilesLibres, cuentasLibres] = await Promise.all([
      serviciosQb.getMany(),
      perfilesQb.getRawMany<Row>(),
      cuentasQb.getRawMany<Row>(),
    ]);
    const toMap = (rows: Row[]) =>
      new Map(
        rows.map((r) => [
          r.servicioId,
          { libres: parseInt(r.libres, 10), total: parseInt(r.total, 10) },
        ]),
      );
    const perfilesById = toMap(perfilesLibres);
    const cuentasById = toMap(cuentasLibres);

    return servicios.map((servicio) => {
      const usaPerfiles =
        servicio.tipo === ServiceType.CON_PERFILES ||
        servicio.tipo === ServiceType.FAMILIAR;
      const conteo = (usaPerfiles ? perfilesById : cuentasById).get(
        servicio.id,
      );
      return {
        servicioId: servicio.id,
        nombre: servicio.nombre,
        usaPerfiles,
        libres: conteo?.libres ?? 0,
        total: conteo?.total ?? 0,
        ownerName: resolveOwnerName(servicio.owner?.name, currentUser),
      };
    });
  }
}
