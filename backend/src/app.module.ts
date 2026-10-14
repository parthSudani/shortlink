import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core/core.module';
import { HealthModule } from './health/health.module';
import { LinksModule } from './links/links.module';
import { RedirectsModule } from './redirects/redirects.module';

@Module({
  imports: [CoreModule, AuthModule, LinksModule, RedirectsModule, HealthModule],
})
export class AppModule {}
