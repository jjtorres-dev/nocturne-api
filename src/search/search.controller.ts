import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { SearchService } from './search.service.js';
import { QuerySearchDto } from './dto/query-search.dto.js';

// Sin RolesGuard/@Roles: cualquier usuario autenticado puede buscar, cada
// categoría se acota por ownerId adentro de su propio *Service.search (ver
// SearchService) — mismo criterio de ownership que el resto de la API.
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query() query: QuerySearchDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.searchService.search(query.q, currentUser);
  }
}
