import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

type AdminRequest = Request & {
  admin?: {
    sub: string;
    nickname: string;
  };
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const payload = await this.authService.verifyAdminRequest(request);
    request.admin = payload;
    return true;
  }
}
