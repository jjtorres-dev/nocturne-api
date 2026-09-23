import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { DashboardService } from './dashboard.service.js';

// Sin RolesGuard/@Roles: cada usuario ve lo suyo según su rol (ver
// DashboardService).
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('inventario')
  inventario(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardService.inventario(currentUser);
  }
}
