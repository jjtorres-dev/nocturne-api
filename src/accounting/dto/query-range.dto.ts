import { IsDateString, IsOptional } from 'class-validator';

export class QueryRangeDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
