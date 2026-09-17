import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryRangeDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  // Multi-usuario — Fase B7: solo tiene efecto para ADMIN (un REVENDEDOR
  // que lo mande se ignora en silencio, ver
  // AccountingService.resolveOwnerId). Un uuid de otro usuario, o el
  // literal "all" para la vista de todo el negocio sin filtro — de ahí que
  // no sea @IsUUID (no todos los valores válidos son un uuid).
  @IsOptional()
  @IsString()
  viewOwnerId?: string;
}
