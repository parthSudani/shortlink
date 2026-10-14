import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoreModule } from '../core/core.module';
import { LinksController } from './links.controller';

@Module({
  imports: [CoreModule, AuthModule],
  controllers: [LinksController],
})
export class LinksModule {}
