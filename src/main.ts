import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { applyNestResponse } from '@3xhaust/nest-response';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });
  app.use(cookieParser());
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  applyNestResponse(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
