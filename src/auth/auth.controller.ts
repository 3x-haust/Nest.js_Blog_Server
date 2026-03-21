import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SuccessMessage } from '@3xhaust/nest-response';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @SuccessMessage('Admin login success')
  login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(body.nickname, body.password, response);
  }

  @Post('refresh')
  @SuccessMessage('Token refreshed')
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.refresh(request, response);
  }

  @Get('me')
  @SuccessMessage('Admin session fetched')
  me(@Req() request: Request) {
    return this.authService.me(request);
  }

  @Post('logout')
  @SuccessMessage('Admin logout success')
  logout(@Res({ passthrough: true }) response: Response) {
    return this.authService.logout(response);
  }
}
