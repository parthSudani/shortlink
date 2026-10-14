import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Injectable, Param, Post, Query, Req, Res, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsISO8601, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { AppService } from './app.service';
import { RedisStatusService } from './redis-status.service';

class AuthDto { @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() email!: string; @IsString() @MinLength(12) @MaxLength(128) password!: string; }
class CreateLinkDto { @IsString() @MaxLength(2048) destinationUrl!: string; @IsOptional() @IsString() customAlias?: string; @IsOptional() @IsISO8601() expiresAt?: string; }
@Injectable()
export class AuthGuard {
  constructor(private jwt: JwtService) {}
  async canActivate(ctx: any) {
    const req = ctx.switchToHttp().getRequest() as Request;
    const authorization = req.headers.authorization;
    const match = typeof authorization === 'string' ? /^Bearer ([^\s]+)$/i.exec(authorization) : null;
    if (!match) throw new UnauthorizedException();
    try {
      const user = await this.jwt.verifyAsync(match[1], { algorithms: ['HS256'] });
      if (typeof user.sub !== 'string' || !user.sub) throw new Error('invalid subject');
      (req as any).user = user;
      return true;
    } catch { throw new UnauthorizedException(); }
  }
}
@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private service: AppService) {}
  @Post('register') async register(@Body() body: AuthDto) { return this.service.register(body.email, body.password); }
  @Post('login') @HttpCode(HttpStatus.OK) async login(@Body() body: AuthDto, @Req() req: Request) { return this.service.login(body.email, body.password, req.ip || 'unknown'); }
  @Get('me') @UseGuards(AuthGuard) me(@Req() req: Request) { return this.service.currentUser((req as any).user.sub); }
}
@ApiTags('links') @ApiBearerAuth()
@Controller('api/v1/links')
export class LinksController {
  constructor(private service: AppService) {}
  @Post() @UseGuards(AuthGuard) async create(@Req() req: Request, @Body() body: CreateLinkDto) {
    const link = await this.service.createLink((req as any).user.sub, body, req.ip || 'unknown');
    return { ...link, shortUrl: `${process.env.PUBLIC_BASE_URL}/${link.code}` };
  }
  @Get() @UseGuards(AuthGuard) list(@Req() req: Request, @Query('page') page = '0', @Query('size') size = '20', @Query('sort') sort = 'createdAt') {
    const p = Number(page), s = Number(size), max = Number(process.env.PAGE_SIZE_MAX || 100);
    if (!Number.isInteger(p) || p < 0 || !Number.isInteger(s) || s < 1 || s > max || !['createdAt', 'createdAtAsc', 'clicks'].includes(sort)) throw new Error('INVALID_PAGINATION');
    return this.service.listLinks((req as any).user.sub, p, s, sort);
  }
  @Get(':id/analytics/:kind') @UseGuards(AuthGuard) async analytics(@Req() req: Request, @Param('id') id: string, @Param('kind') kind: string, @Query('days') days = '30', @Query('limit') limit = '10') {
    const d = Number(days), l = Number(limit);
    if (!['summary','clicks','referrers','devices'].includes(kind) || (kind !== 'summary' && (!Number.isInteger(d) || d < 1 || d > 90)) || !Number.isInteger(l) || l < 1 || l > 50) throw new Error('INVALID_ANALYTICS_QUERY');
    const result = await this.service.analytics(id, (req as any).user.sub, kind, d, l); if (!result) throw new Error('NOT_FOUND'); return result;
  }
  @Get(':id') @UseGuards(AuthGuard) async get(@Req() req: Request, @Param('id') id: string) { const link = await this.service.ownedLink(id, (req as any).user.sub); if (!link) throw new Error('NOT_FOUND'); return { id: link.id, code: link.code, shortUrl: `${process.env.PUBLIC_BASE_URL}/${link.code}`, destinationUrl: link.destinationUrl, createdAt: link.createdAt, expiresAt: link.expiresAt }; }
  @Delete(':id') @HttpCode(204) @UseGuards(AuthGuard) async remove(@Req() req: Request, @Param('id') id: string) { if (!await this.service.deleteLink(id, (req as any).user.sub)) throw new Error('NOT_FOUND'); }
}
@ApiTags('redirect') @Controller()
export class RedirectController {
  constructor(private service: AppService) {}
  @Get(':code') async redirect(@Param('code') code: string, @Headers() headers: Record<string,string>, @Res() res: Response) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) return res.status(404).end();
    const result = await this.service.redirect(code, headers);
    if (result.status !== 302) return res.status(result.status).json({ statusCode: result.status, code: result.status === 410 ? 'LINK_EXPIRED' : 'NOT_FOUND', message: result.status === 410 ? 'This link has expired' : 'Link not found' });
    return res.redirect(HttpStatus.FOUND, result.destinationUrl!);
  }
}
@ApiTags('health') @Controller('health')
export class HealthController {
  constructor(@InjectConnection() private db: Sequelize, private redis: RedisStatusService) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready(@Res() res: Response) {
    try {
      await this.db.authenticate();
      const status = await this.redis.check();
      const ready = status.dependencies.worker === 'ok';
      return res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'not_ready', dependencies: { postgres: 'ok', ...status.dependencies } });
    } catch { return res.status(503).json({ status: 'not_ready' }); }
  }
  @Get('metrics') metrics() { return this.redis.metrics(); }
}
