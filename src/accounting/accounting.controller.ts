import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { AccountingService } from './accounting.service.js';
import { QueryRangeDto } from './dto/query-range.dto.js';
import { QueryTimelineDto } from './dto/query-timeline.dto.js';

// Multi-usuario — Fase B7: los 4 reportes se scopean por ownerId (ver
// AccountingService.resolveOwnerId) en vez de por rol — no hace falta
// RolesGuard/@Roles acá, todo usuario autenticado puede pedir estos
// endpoints, cada uno ve lo que le corresponde según su rol y el
// `viewOwnerId` opcional (solo con efecto para ADMIN).
@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('summary')
  summary(
    @Query() query: QueryRangeDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountingService.summary(
      query.desde,
      query.hasta,
      currentUser,
      query.viewOwnerId,
    );
  }

  @Get('by-service')
  byService(
    @Query() query: QueryRangeDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountingService.byService(
      query.desde,
      query.hasta,
      currentUser,
      query.viewOwnerId,
    );
  }

  @Get('by-payment-method')
  byPaymentMethod(
    @Query() query: QueryRangeDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountingService.byPaymentMethod(
      query.desde,
      query.hasta,
      currentUser,
      query.viewOwnerId,
    );
  }

  @Get('timeline')
  timeline(
    @Query() query: QueryTimelineDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.accountingService.timeline(
      query.desde,
      query.hasta,
      currentUser,
      query.groupBy,
      query.viewOwnerId,
    );
  }
}
