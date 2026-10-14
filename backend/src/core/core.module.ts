import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { AppService } from './app.service';
import { ClickQueueService } from '../infrastructure/clicks/click-queue.service';
import { RedisConnectionService } from '../infrastructure/redis/redis-connection.service';
import { RedirectCacheService } from '../infrastructure/redis/redirect-cache.service';
import { RateLimitService } from '../infrastructure/redis/rate-limit.service';
import { RedisStatusService } from '../health/redis-status.service';
import { User } from '../models/user.model';
import { Link } from '../models/link.model';
import { ClickEvent } from '../models/click-event.model';
import { DailyLinkStat } from '../models/daily-link-stat.model';
import { postgresOptions } from '../config/database.config';
import { getAuthConfig } from '../config/auth.config';

const authConfig = getAuthConfig();

@Module({
  imports: [
    SequelizeModule.forRoot({ ...postgresOptions(), models: [User, Link, ClickEvent, DailyLinkStat], autoLoadModels: true, synchronize: false }),
    SequelizeModule.forFeature([User, Link, ClickEvent, DailyLinkStat]),
    JwtModule.register({
      secret: authConfig.secret,
      signOptions: { expiresIn: authConfig.expiresInSeconds, issuer: authConfig.issuer, audience: authConfig.audience, algorithm: 'HS256' },
      verifyOptions: { issuer: authConfig.issuer, audience: authConfig.audience, algorithms: ['HS256'] },
    }),
  ],
  providers: [AppService, ClickQueueService, RedisConnectionService, RedirectCacheService, RateLimitService, RedisStatusService],
  exports: [AppService, RedisStatusService, JwtModule],
})
export class CoreModule {}
