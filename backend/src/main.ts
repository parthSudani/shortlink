import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/filters/api-error.filter';
import { randomUUID } from 'node:crypto';
import { getAuthConfig } from './config/auth.config';

async function bootstrap() {
  getAuthConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiErrorFilter());
  app.use((req: any, res: any, next: () => void) => { const id = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].slice(0, 100) : randomUUID(); req.headers['x-request-id'] = id; res.setHeader('X-Request-Id', id); next(); });
  app.enableCors({ origin: (process.env.CORS_ORIGINS || 'http://localhost:4200').split(',').map(x => x.trim()) });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: errors => Object.assign(new Error('VALIDATION_ERROR'), { status: 400, details: errors.flatMap(e => Object.values(e.constraints || {}).map(message => ({ field: e.property, message }))) }) }));
  const swagger = new DocumentBuilder().setTitle('Shortlink API').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
}
void bootstrap();
