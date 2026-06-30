import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, BadRequestException } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security — Helmet's default CSP includes `script-src 'self'` which
  // blocks eval. In development we relax this so Swagger UI (which uses eval
  // heavily for JSON schema rendering) works at localhost:4000/api.
  // Production keeps the strict default.
  const isDev = process.env.NODE_ENV !== 'production';
  app.use(
    helmet({
      contentSecurityPolicy: isDev
        ? {
            directives: {
              ...helmet.contentSecurityPolicy.getDefaultDirectives(),
              // Swagger UI needs eval for schema evaluation and inline scripts
              // for its own bundle. These are dev-only; production never serves
              // Swagger and therefore never needs these relaxations.
              'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
              'style-src': ["'self'", 'https:', "'unsafe-inline'"],
              'img-src': ["'self'", 'data:', 'blob:'],
            },
          }
        : {
            // Production: keep Helmet defaults but allow data:/blob: images
            // so PDF logo data-URIs embedded in the print HTML work correctly.
            directives: {
              ...helmet.contentSecurityPolicy.getDefaultDirectives(),
              'img-src': ["'self'", 'data:', 'blob:'],
            },
          },
    }),
  );
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Branch-Id'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Versioning
  app.enableVersioning({ type: VersioningType.URI });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
        return new BadRequestException({
          message: messages[0] || 'Të dhënat e dërguara janë të pasakta',
          errors: messages,
        });
      },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Xhelal Shatri Clinic API')
    .setDescription('API për Sistemin e Menaxhimit të Klinikës')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Health check endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const port = configService.get<number>('PORT', 4000);
  await app.listen(port);
  console.log(`🚀 Backend po dëgjon në: http://localhost:${port}`);
  console.log(`📖 Swagger: http://localhost:${port}/api`);
}

bootstrap();
