import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

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
