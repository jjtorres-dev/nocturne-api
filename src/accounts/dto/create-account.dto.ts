import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateAccountDto {
  @IsUUID()
  servicioId: string;

  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @IsEmail()
  correo: string;

  @IsString()
  @MinLength(1)
  claveServicio: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claveCorreo?: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  costo: number;

  @IsString()
  @MinLength(1)
  metodoPago: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsBoolean()
  renovacionAutomatica?: boolean;
}
