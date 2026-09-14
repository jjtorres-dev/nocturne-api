import { IsOptional, IsUUID } from 'class-validator';

export class ComboSaleAsignacionDto {
  @IsUUID()
  servicioId: string;

  @IsUUID()
  cuentaId: string;

  @IsOptional()
  @IsUUID()
  perfilId?: string;
}
