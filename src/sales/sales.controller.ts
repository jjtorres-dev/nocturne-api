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
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole } from '../users/user-role.enum.js';
import { SalesService } from './sales.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { UpdateSaleDto } from './dto/update-sale.dto.js';
import { QuerySaleDto } from './dto/query-sale.dto.js';
import { QuerySummaryDto } from './dto/query-summary.dto.js';
import { RenewSaleDto } from './dto/renew-sale.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  findAll(@Query() query: QuerySaleDto) {
    return this.salesService.findAll(query);
  }

  // Tiene que ir antes de `:id`: si no, Nest matchea "summary" como si
  // fuera el parámetro de esa ruta.
  @Get('summary')
  summary(@Query() query: QuerySummaryDto) {
    return this.salesService.summary(query.diasAlerta);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateSaleDto) {
    return this.salesService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSaleDto) {
    return this.salesService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.softDelete(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/reactivate')
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.reactivate(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/renew')
  renew(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenewSaleDto) {
    return this.salesService.renew(id, dto);
  }
}
