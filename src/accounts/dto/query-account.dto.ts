import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class QueryAccountDto {
  @IsOptional()
  @IsUUID()
  servicioId?: string;

  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}
