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
import { CombosService } from './combos.service.js';
import { CreateComboDto } from './dto/create-combo.dto.js';
import { UpdateComboDto } from './dto/update-combo.dto.js';
import { QueryComboDto } from './dto/query-combo.dto.js';

// Sin RolesGuard/@Roles acá: un REVENDEDOR puede crear/editar/desactivar/
// reactivar combos igual que un admin, pero acotado a los suyos — el
// control de acceso es por ownership (CombosService.findAllOwned/
// findOneOwned). Mismo patrón que Servicios/Contactos/Cuentas/Ventas
// (Multi-usuario — Fase B1/B2/B3/B4/B5).
@UseGuards(JwtAuthGuard)
@Controller('combos')
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @Get()
  findAll(
    @Query() query: QueryComboDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.combosService.findAllOwned(query, currentUser);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.combosService.findOneOwned(id, currentUser);
  }

  @Post()
  create(
    @Body() dto: CreateComboDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.combosService.create(dto, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComboDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.combosService.update(id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.combosService.softDelete(id, currentUser);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.combosService.reactivate(id, currentUser);
  }
}
