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
import { SalesService } from './sales.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { UpdateSaleDto } from './dto/update-sale.dto.js';
import { QuerySaleDto } from './dto/query-sale.dto.js';
import { QuerySummaryDto } from './dto/query-summary.dto.js';
import { RenewSaleDto } from './dto/renew-sale.dto.js';

// Sin RolesGuard/@Roles acá: un REVENDEDOR puede crear/editar/desactivar/
// renovar ventas igual que un admin, pero acotado a las suyas — el control
// de acceso es por ownership (SalesService.findAllOwned/findOneOwned/
// summaryOwned). Mismo patrón que Servicios/Contactos/Cuentas (Multi-
// usuario — Fase B1/B2/B3/B4).
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  findAll(
    @Query() query: QuerySaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.findAllOwned(query, currentUser);
  }

  // Tiene que ir antes de `:id`: si no, Nest matchea "summary" como si
  // fuera el parámetro de esa ruta.
  @Get('summary')
  summary(
    @Query() query: QuerySummaryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.summaryOwned(query.diasAlerta, currentUser);
  }

  @Get(':id/adjustments')
  adjustments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.adjustments(id, currentUser);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.findOneOwned(id, currentUser);
  }

  @Post()
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.create(dto, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.update(id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.softDelete(id, currentUser);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.reactivate(id, currentUser);
  }

  @Post(':id/renew')
  renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenewSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.renew(id, dto, currentUser);
  }
}
