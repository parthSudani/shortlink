import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Request } from 'express';
import { AppService } from '../core/app.service';
import { AuthGuard } from './auth.guard';

class AuthDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private service: AppService) {}

  @Post('register')
  async register(@Body() body: AuthDto) { return this.service.register(body.email, body.password); }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: AuthDto, @Req() req: Request) { return this.service.login(body.email, body.password, req.ip || 'unknown'); }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: Request) { return this.service.currentUser((req as any).user.sub); }
}
