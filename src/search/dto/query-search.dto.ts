import { IsString, MinLength } from 'class-validator';

export class QuerySearchDto {
  // Sin @IsOptional(): faltante o con menos de 2 caracteres da 400 (el
  // ValidationPipe global ya trae whitelist+transform en main.ts).
  @IsString()
  @MinLength(2)
  q: string;
}
