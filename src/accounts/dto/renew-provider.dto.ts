import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { Moneda } from '../../sales/moneda.enum.js';

// POST /accounts/:id/renew-provider: el revendedor le pagó al proveedor
// otro periodo de la cuenta. A diferencia de RenewSaleDto no se hereda nada
// de la cuenta: el monto de una renovación puede ser distinto al de la
// compra, y la nueva fecha de vencimiento la dice el proveedor.
export class RenewProviderDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  @IsEnum(Moneda)
  moneda: Moneda;

  // Default 1 (mismo criterio que CreateSaleDto): en PEN no hace falta.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  tasaCambio?: number;

  @IsString()
  @MinLength(1)
  metodoPago: string;

  // Default: hoy (reloj del servidor, igual que el Payment de una
  // renovación de venta — ver todayIso()).
  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  // Tiene que ser posterior a la fechaFin actual de la cuenta (400 si no):
  // lo valida AccountsService.renewProvider, no se puede con un decorador.
  @IsDateString()
  nuevaFechaFin: string;
}
