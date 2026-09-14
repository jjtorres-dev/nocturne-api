import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole } from '../users/user-role.enum.js';
import { ComboSalesService } from './combo-sales.service.js';
import { CreateComboSaleDto } from './dto/create-combo-sale.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('combo-sales')
export class ComboSalesController {
  constructor(private readonly comboSalesService: ComboSalesService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateComboSaleDto) {
    return this.comboSalesService.create(dto);
  }
}
