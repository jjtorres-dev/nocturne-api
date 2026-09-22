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

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsEmail()
  correo: string;

  // Opcional: hay proveedores que solo dan un código, sin contraseña.
  @IsOptional()
  @IsString()
  @MinLength(1)
  claveServicio?: string;

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

  // Si viene en true y el servicio tiene pantallasMax, crea "Perfil 1"..
  // "Perfil N" en la misma transacción que la cuenta (ver
  // AccountsService.create). Sin pantallasMax (servicio SIN_PERFILES) se
  // ignora en silencio, no es un error.
  @IsOptional()
  @IsBoolean()
  crearPerfiles?: boolean;
}
