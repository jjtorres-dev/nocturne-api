import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AccountingService } from './accounting.service.js';
import { QueryRangeDto } from './dto/query-range.dto.js';
import { QueryTimelineDto } from './dto/query-timeline.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('summary')
  summary(@Query() query: QueryRangeDto) {
    return this.accountingService.summary(query.desde, query.hasta);
  }

  @Get('by-service')
  byService(@Query() query: QueryRangeDto) {
    return this.accountingService.byService(query.desde, query.hasta);
  }

  @Get('by-payment-method')
  byPaymentMethod(@Query() query: QueryRangeDto) {
    return this.accountingService.byPaymentMethod(query.desde, query.hasta);
  }

  @Get('timeline')
  timeline(@Query() query: QueryTimelineDto) {
    return this.accountingService.timeline(
      query.desde,
      query.hasta,
      query.groupBy,
    );
  }
}
