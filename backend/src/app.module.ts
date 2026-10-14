import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthController, HealthController, LinksController, RedirectController, AuthGuard } from './app.controller';
import { AppService } from './app.service';
import { ClickQueueService } from './click-queue.service';
import { RedisConnectionService } from './redis-connection.service';
import { RedirectCacheService } from './redirect-cache.service';
import { RateLimitService } from './rate-limit.service';
import { RedisStatusService } from './redis-status.service';
import { User } from './models/user.model';
import { Link } from './models/link.model';
import { ClickEvent } from './models/click-event.model';
import { DailyLinkStat } from './models/daily-link-stat.model';
import { postgresOptions } from './database-options';
import { getAuthConfig } from './auth-config';

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
  controllers: [AuthController, HealthController, LinksController, RedirectController],
  providers: [AppService, ClickQueueService, RedisConnectionService, RedirectCacheService, RateLimitService, RedisStatusService, AuthGuard],
})
export class AppModule {}
