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

export class UpdateAccountDto {
  @IsOptional()
  @IsUUID()
  servicioId?: string;

  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @IsOptional()
  @IsEmail()
  correo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claveServicio?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claveCorreo?: string;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  costo?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  metodoPago?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsBoolean()
  renovacionAutomatica?: boolean;
}
