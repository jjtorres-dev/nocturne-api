import { IsDateString, IsOptional } from 'class-validator';

// POST /accounts/:id/mark-down: la cuenta dejó de funcionar.
export class MarkDownDto {
  // Default: hoy. No puede ser futura (lo valida AccountsService.markDown
  // contra el reloj del servidor, no se puede con un decorador).
  @IsOptional()
  @IsDateString()
  fechaCaida?: string;
}
