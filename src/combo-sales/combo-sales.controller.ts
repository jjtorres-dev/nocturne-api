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
import { ComboSalesService } from './combo-sales.service.js';
import { CreateComboSaleDto } from './dto/create-combo-sale.dto.js';
import { UpdateComboSaleDto } from './dto/update-combo-sale.dto.js';
import { QueryComboSaleDto } from './dto/query-combo-sale.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('combo-sales')
export class ComboSalesController {
  constructor(private readonly comboSalesService: ComboSalesService) {}

  @Get()
  findAll(@Query() query: QueryComboSaleDto) {
    return this.comboSalesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.comboSalesService.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateComboSaleDto) {
    return this.comboSalesService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComboSaleDto,
  ) {
    return this.comboSalesService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.comboSalesService.softDelete(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/reactivate')
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.comboSalesService.reactivate(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/renew')
  renew(@Param('id', ParseUUIDPipe) id: string) {
    return this.comboSalesService.renew(id);
  }
}
