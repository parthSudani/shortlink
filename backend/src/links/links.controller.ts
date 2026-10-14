import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { Request } from 'express';
import { AppService } from '../core/app.service';
import { AuthGuard } from '../auth/auth.guard';

class CreateLinkDto {
  @IsString()
  @MaxLength(2048)
  destinationUrl!: string;

  @IsOptional()
  @IsString()
  customAlias?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

@ApiTags('links')
@ApiBearerAuth()
@Controller('api/v1/links')
export class LinksController {
  constructor(private service: AppService) {}

  @Post()
  @UseGuards(AuthGuard)
  async create(@Req() req: Request, @Body() body: CreateLinkDto) {
    const link = await this.service.createLink((req as any).user.sub, body, req.ip || 'unknown');
    return { ...link, shortUrl: `${process.env.PUBLIC_BASE_URL}/${link.code}` };
  }

  @Get()
  @UseGuards(AuthGuard)
  list(@Req() req: Request, @Query('page') page = '0', @Query('size') size = '20', @Query('sort') sort = 'createdAt') {
    const p = Number(page), s = Number(size), max = Number(process.env.PAGE_SIZE_MAX || 100);
    if (!Number.isInteger(p) || p < 0 || !Number.isInteger(s) || s < 1 || s > max || !['createdAt', 'createdAtAsc', 'clicks'].includes(sort)) throw new Error('INVALID_PAGINATION');
    return this.service.listLinks((req as any).user.sub, p, s, sort);
  }

  @Get(':id/analytics/:kind')
  @UseGuards(AuthGuard)
  async analytics(@Req() req: Request, @Param('id') id: string, @Param('kind') kind: string, @Query('days') days = '30', @Query('limit') limit = '10') {
    const d = Number(days), l = Number(limit);
    if (!['summary', 'clicks', 'referrers', 'devices'].includes(kind) || (kind !== 'summary' && (!Number.isInteger(d) || d < 1 || d > 90)) || !Number.isInteger(l) || l < 1 || l > 50) throw new Error('INVALID_ANALYTICS_QUERY');
    const result = await this.service.analytics(id, (req as any).user.sub, kind, d, l);
    if (!result) throw new Error('NOT_FOUND');
    return result;
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async get(@Req() req: Request, @Param('id') id: string) {
    const link = await this.service.ownedLink(id, (req as any).user.sub);
    if (!link) throw new Error('NOT_FOUND');
    return { id: link.id, code: link.code, shortUrl: `${process.env.PUBLIC_BASE_URL}/${link.code}`, destinationUrl: link.destinationUrl, createdAt: link.createdAt, expiresAt: link.expiresAt };
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async remove(@Req() req: Request, @Param('id') id: string) {
    if (!await this.service.deleteLink(id, (req as any).user.sub)) throw new Error('NOT_FOUND');
  }
}
