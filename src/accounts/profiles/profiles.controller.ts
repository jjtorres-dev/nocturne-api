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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/jwt.strategy.js';
import { ProfilesService } from './profiles.service.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { QueryProfileDto } from './dto/query-profile.dto.js';

// Sin RolesGuard/@Roles acá: el control de acceso es por ownership de la
// Cuenta padre (ProfilesService.findOneOwned delega en
// AccountsService.findOneOwned). Mismo patrón que Cuentas/Servicios/
// Contactos (Multi-usuario — Fase B1/B2/B3).
@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId/profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  findAll(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: QueryProfileDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.profilesService.findAllOwned(accountId, query, currentUser);
  }

  @Get(':id')
  findOne(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.profilesService.findOneOwned(accountId, id, currentUser);
  }

  @Post()
  create(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: CreateProfileDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.profilesService.create(accountId, dto, currentUser);
  }

  @Patch(':id')
  update(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.profilesService.update(accountId, id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.profilesService.softDelete(accountId, id, currentUser);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.profilesService.reactivate(accountId, id, currentUser);
  }
}
