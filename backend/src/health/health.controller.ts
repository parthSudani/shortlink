import { Controller, Get, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Sequelize } from 'sequelize';
import { RedisStatusService } from './redis-status.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private db: Sequelize, private redis: RedisStatusService) {}

  @Get('live')
  live() { return { status: 'ok' }; }

  @Get('ready')
  async ready(@Res() res: Response) {
    try {
      await this.db.authenticate();
      const status = await this.redis.check();
      const ready = status.dependencies.worker === 'ok';
      return res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'not_ready', dependencies: { postgres: 'ok', ...status.dependencies } });
    } catch { return res.status(503).json({ status: 'not_ready' }); }
  }

  @Get('metrics')
  metrics() { return this.redis.metrics(); }
}
