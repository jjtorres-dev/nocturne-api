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

  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountsService.reactivate(id, currentUser);
  }
}
