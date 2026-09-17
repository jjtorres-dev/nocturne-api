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
import { ComboSalesService } from './combo-sales.service.js';
import { CreateComboSaleDto } from './dto/create-combo-sale.dto.js';
import { UpdateComboSaleDto } from './dto/update-combo-sale.dto.js';
import { QueryComboSaleDto } from './dto/query-combo-sale.dto.js';

// Sin RolesGuard/@Roles acá: un REVENDEDOR puede crear/editar/desactivar/
// reactivar/renovar VentaCombo igual que un admin, pero acotado a las
// suyas — el control de acceso es por ownership (ComboSalesService.
// findAllOwned/findOneOwned). Mismo patrón que Servicios/Contactos/
// Cuentas/Ventas/Combos (Multi-usuario — Fase B1/B2/B3/B4/B5).
@UseGuards(JwtAuthGuard)
@Controller('combo-sales')
export class ComboSalesController {
  constructor(private readonly comboSalesService: ComboSalesService) {}

  @Get()
  findAll(
    @Query() query: QueryComboSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.comboSalesService.findAllOwned(query, currentUser);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.comboSalesService.findOneOwned(id, currentUser);
  }

  @Post()
  create(
    @Body() dto: CreateComboSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.comboSalesService.create(dto, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComboSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.comboSalesService.update(id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.comboSalesService.softDelete(id, currentUser);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.comboSalesService.reactivate(id, currentUser);
  }

  @Post(':id/renew')
  renew(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.comboSalesService.renew(id, currentUser);
  }
}
