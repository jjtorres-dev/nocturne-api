import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RestorePerfilDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  // null borra el PIN (el perfil de la cuenta nueva puede no tener);
  // @IsOptional deja pasar null y undefined.
  @IsOptional()
  @IsString()
  @MinLength(1)
  pin?: string | null;
}

// POST /accounts/:id/restore: el proveedor repuso la cuenta caída con otra.
// Se actualiza la MISMA cuenta (credenciales nuevas) para que clientes,
// pagos y costo sigan juntos; no hay pago al proveedor (la reposición es
// gratis). Lo que no se manda (claves, perfiles) queda como estaba.
export class RestoreAccountDto {
  @IsEmail()
  correo: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claveServicio?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claveCorreo?: string;

  // Solo los perfiles que cambian; tienen que ser de esta cuenta (404 si no).
  @IsOptional()
  @IsArray()
  @ArrayUnique((perfil: RestorePerfilDto) => perfil.id)
  @ValidateNested({ each: true })
  @Type(() => RestorePerfilDto)
  perfiles?: RestorePerfilDto[];

  // Default: hoy. Ni futura ni anterior a la fecha de caída (400).
  @IsOptional()
  @IsDateString()
  fechaReposicion?: string;

  // Default: fechaReposicion - fechaCaida. Editable: el revendedor puede
  // dar más o menos días de los que la cuenta estuvo caída.
  @IsOptional()
  @IsInt()
  @Min(0)
  diasCompensacion?: number;
}
