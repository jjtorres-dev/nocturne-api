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
import { ServicesService } from './services.service.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { QueryServiceDto } from './dto/query-service.dto.js';

// Sin RolesGuard/@Roles acá: un REVENDEDOR puede crear/editar/desactivar
// servicios igual que un admin, pero acotado a los suyos — el control de
// acceso es por ownership (ServicesService.findAllOwned/findOneOwned), no
// por rol. Ver Multi-usuario — Fase B1 en PROGRESS.md.
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  findAll(
    @Query() query: QueryServiceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.servicesService.findAllOwned(query, currentUser);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.servicesService.findOneOwned(id, currentUser);
  }

  @Post()
  create(
    @Body() dto: CreateServiceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.servicesService.create(dto, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.servicesService.update(id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.servicesService.softDelete(id, currentUser);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.servicesService.reactivate(id, currentUser);
  }
}
