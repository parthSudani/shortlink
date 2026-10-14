import { Controller, Get, Headers, HttpStatus, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppService } from '../core/app.service';

@ApiTags('redirect')
@Controller()
export class RedirectController {
  constructor(private service: AppService) {}

  @Get(':code')
  async redirect(@Param('code') code: string, @Headers() headers: Record<string, string>, @Res() res: Response) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) return res.status(404).end();
    const result = await this.service.redirect(code, headers);
    if (result.status !== 302) return res.status(result.status).json({ statusCode: result.status, code: result.status === 410 ? 'LINK_EXPIRED' : 'NOT_FOUND', message: result.status === 410 ? 'This link has expired' : 'Link not found' });
    return res.redirect(HttpStatus.FOUND, result.destinationUrl!);
  }
}
