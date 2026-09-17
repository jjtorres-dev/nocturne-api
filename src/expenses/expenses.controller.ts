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
import { ExpensesService } from './expenses.service.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { QueryExpenseDto } from './dto/query-expense.dto.js';

// Sin RolesGuard/@Roles acá: un REVENDEDOR puede crear/editar/desactivar/
// reactivar gastos igual que un admin, pero acotado a los suyos — el
// control de acceso es por ownership (ExpensesService.findAllOwned/
// findOneOwned). Mismo patrón que Servicios/Contactos/Cuentas/Ventas/
// Combos (Multi-usuario — Fase B1-B5).
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  findAll(
    @Query() query: QueryExpenseDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.expensesService.findAllOwned(query, currentUser);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.expensesService.findOneOwned(id, currentUser);
  }

  @Post()
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.expensesService.create(dto, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.expensesService.update(id, dto, currentUser);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.expensesService.softDelete(id, currentUser);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.expensesService.reactivate(id, currentUser);
  }
}
