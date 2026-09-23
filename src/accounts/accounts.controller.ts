import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';
import { QueryAccountDto } from './dto/query-account.dto.js';
import { QueryPorRenovarDto } from './dto/query-por-renovar.dto.js';
import { RenewProviderDto } from './dto/renew-provider.dto.js';

const DIAS_POR_RENOVAR_DEFAULT = 7;

// Sin RolesGuard/@Roles acá: un REVENDEDOR puede crear/editar/desactivar
// cuentas igual que un admin, pero acotado a las suyas — el control de
// acceso es por ownership (AccountsService.findAllOwned/findOneOwned).
// Mismo patrón que Servicios/Contactos (Multi-usuario — Fase B1/B2/B3).
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  findAll(
    @Query() query: QueryAccountDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.findAllOwned(query, currentUser);
  }

  // Bloque C. Tiene que ir antes de `:id` (si no, Nest matchea
  // "por-renovar" como el parámetro de esa ruta).
  @Get('por-renovar')
  porRenovar(
    @Query() query: QueryPorRenovarDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.porRenovar(
      query.dias ?? DIAS_POR_RENOVAR_DEFAULT,
      currentUser,
    );
  }

  @Get(':id/rentabilidad')
  rentabilidad(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.rentabilidad(id, currentUser);
  }

  // Historial de pagos al proveedor (compra inicial + renovaciones).
  @Get(':id/provider-payments')
  providerPayments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.providerPayments(id, currentUser);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.findOneOwned(id, currentUser);
  }

  @Post()
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.create(dto, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.update(id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.softDelete(id, currentUser);
  }

  // Renovación con el proveedor: pago RENOVACION + nueva fechaFin, atómico.
  @Post(':id/renew-provider')
  renewProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenewProviderDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.renewProvider(id, dto, currentUser);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.reactivate(id, currentUser);
  }
}
