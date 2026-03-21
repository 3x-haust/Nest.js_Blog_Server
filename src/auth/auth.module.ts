import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminUserEntity } from './entities/admin-user.entity';

@Module({
  imports: [
    JwtModule.register({}),
    TypeOrmModule.forFeature([AdminUserEntity]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminAuthGuard],
  exports: [AuthService, AdminAuthGuard],
})
export class AuthModule {}
