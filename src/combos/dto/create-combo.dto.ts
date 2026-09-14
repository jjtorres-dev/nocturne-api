import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateComboDto {
  @IsString()
  @MinLength(1)
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  servicioIds: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precioCombo: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
