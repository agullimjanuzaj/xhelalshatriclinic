import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubscribeDto {
  @ApiProperty({ description: 'Push endpoint URL from the browser' })
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({ description: 'p256dh key from PushSubscription.getKey("p256dh")' })
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @ApiProperty({ description: 'auth key from PushSubscription.getKey("auth")' })
  @IsString()
  @IsNotEmpty()
  auth: string;

  @ApiPropertyOptional({ description: 'User-Agent string for platform detection' })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
