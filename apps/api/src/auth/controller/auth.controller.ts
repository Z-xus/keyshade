import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
  UseGuards
} from '@nestjs/common'
import { AuthService } from '../service/auth.service'
import { Public } from '../../decorators/public.decorator'
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { GithubOAuthStrategyFactory } from '../../config/factory/github/github-strategy.factory'
import { GoogleOAuthStrategyFactory } from '../../config/factory/google/google-strategy.factory'
import { GitlabOAuthStrategyFactory } from '../../config/factory/gitlab/gitlab-strategy.factory'
import { Response } from 'express'
import { AuthProvider } from '@prisma/client'
import setCookie from '../../common/set-cookie'
import {
  sendOAuthFailureRedirect,
  sendOAuthSuccessRedirect
} from '../../common/redirect'

@ApiTags('Auth Controller')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(
    private authService: AuthService,
    private githubOAuthStrategyFactory: GithubOAuthStrategyFactory,
    private googleOAuthStrategyFactory: GoogleOAuthStrategyFactory,
    private gitlabOAuthStrategyFactory: GitlabOAuthStrategyFactory
  ) {}

  @Public()
  @Post('send-otp/:email')
  @ApiOperation({
    summary: 'Send OTP',
    description:
      'This endpoint sends OTPs to an email address. The OTP can then be used to generate valid tokens'
  })
  @ApiParam({
    name: 'email',
    description: 'Email to send OTP',
    required: true
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Send OTP successfully'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Email is invalid'
  })
  async sendOtp(
    @Param('email')
    email: string
  ): Promise<void> {
    await this.authService.sendOtp(email)
  }

  /* istanbul ignore next */
  @Public()
  @Post('validate-otp')
  @ApiOperation({
    summary: 'Validate OTP',
    description:
      'This endpoint validates OTPs. If the OTP is valid, it returns a valid token along with the user details'
  })
  @ApiQuery({
    name: 'email',
    description: 'Email to send OTP',
    required: true
  })
  @ApiQuery({
    name: 'otp',
    description: 'OTP to validate',
    required: true
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Validate OTP successfully'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Email not found'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'OTP is invalid'
  })
  async validateOtp(
    @Query('email') email: string,
    @Query('otp') otp: string,
    @Res({ passthrough: true }) response: Response
  ) {
    return setCookie(response, await this.authService.validateOtp(email, otp))
  }

  /* istanbul ignore next */
  @Public()
  @Get('github')
  @ApiOperation({
    summary: 'Github OAuth',
    description:
      'This endpoint validates Github OAuth. If the OAuth is valid, it returns a valid token along with the user details'
  })
  async githubOAuthLogin(@Res() res: Response) {
    if (!this.githubOAuthStrategyFactory.isOAuthEnabled()) {
      throw new HttpException(
        'GitHub Auth is not enabled in this environment. Refer to the https://docs.keyshade.xyz/contributing-to-keyshade/environment-variables if you would like to set it up.',
        HttpStatus.BAD_REQUEST
      )
    }

    res.status(302).redirect('/api/auth/github/callback')
  }

  /* istanbul ignore next */
  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({
    summary: 'Github OAuth Callback',
    description:
      'This endpoint validates Github OAuth. If the OAuth is valid, it returns a valid token along with the user details'
  })
  @ApiParam({
    name: 'code',
    description: 'Code for the Callback',
    required: true
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged in successfully'
  })
  async githubOAuthCallback(@Req() req: any) {
    const { emails, displayName: name, photos } = req.user

    if (!emails.length) {
      throw new UnprocessableEntityException(
        'Email information is missing from the OAuth provider data.'
      )
    }
    const email = emails[0].value
    const profilePictureUrl = photos[0]?.value

    return this.authService.handleOAuthLogin(
      email,
      name,
      profilePictureUrl,
      AuthProvider.GITHUB
    )
  }

  /* istanbul ignore next */
  @Public()
  @Get('gitlab')
  @ApiOperation({
    summary: 'Gitlab OAuth',
    description:
      'This endpoint validates Gitlab OAuth. If the OAuth is valid, it returns a valid token along with the user details'
  })
  async gitlabOAuthLogin(@Res() res: Response) {
    if (!this.gitlabOAuthStrategyFactory.isOAuthEnabled()) {
      throw new HttpException(
        'GitLab Auth is not enabled in this environment. Refer to the https://docs.keyshade.xyz/contributing-to-keyshade/environment-variables if you would like to set it up.',
        HttpStatus.BAD_REQUEST
      )
    }

    res.status(302).redirect('/api/auth/gitlab/callback')
  }

  /* istanbul ignore next */
  @Public()
  @Get('gitlab/callback')
  @UseGuards(AuthGuard('gitlab'))
  @ApiOperation({
    summary: 'Gitlab OAuth Callback',
    description:
      'This endpoint validates Gitlab OAuth. If the OAuth is valid, it returns a valid token along with the user details'
  })
  @ApiParam({
    name: 'code',
    description: 'Code for the Callback',
    required: true
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged in successfully'
  })
  async gitlabOAuthCallback(@Req() req: any, @Res() res: Response) {
    const { emails, displayName: name, avatarUrl: profilePictureUrl } = req.user

    if (!emails.length) {
      throw new UnprocessableEntityException(
        'Email information is missing from the OAuth provider data.'
      )
    }
    const email = emails[0].value

    this.handleOAuthProcess(
      email,
      name,
      profilePictureUrl,
      AuthProvider.GITLAB,
      res
    )
  }

  /* istanbul ignore next */
  @Public()
  @Get('google')
  @ApiOperation({
    summary: 'Google OAuth',
    description: 'Initiates Google OAuth'
  })
  async googleOAuthLogin(@Res() res: Response) {
    if (!this.googleOAuthStrategyFactory.isOAuthEnabled()) {
      throw new HttpException(
        'Google Auth is not enabled in this environment. Refer to the https://docs.keyshade.xyz/contributing-to-keyshade/environment-variables if you would like to set it up.',
        HttpStatus.BAD_REQUEST
      )
    }

    res.status(302).redirect('/api/auth/google/callback')
  }

  /* istanbul ignore next */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Google OAuth Callback',
    description: 'Handles Google OAuth callback'
  })
  @ApiParam({
    name: 'code',
    description: 'Code for the Callback',
    required: true
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Logged in successfully'
  })
  async googleOAuthCallback(@Req() req: any, @Res() res: Response) {
    const { emails, displayName: name, photos } = req.user

    if (!emails.length) {
      throw new UnprocessableEntityException(
        'Email information is missing from the OAuth provider data.'
      )
    }
    const email = emails[0].value
    const profilePictureUrl = photos[0]?.value

    this.handleOAuthProcess(
      email,
      name,
      profilePictureUrl,
      AuthProvider.GOOGLE,
      res
    )
  }

  /* istanbul ignore next */
  private async handleOAuthProcess(
    email: string,
    name: string,
    profilePictureUrl: string,
    oauthProvider: AuthProvider,
    response: Response
  ) {
    try {
      const data = await this.authService.handleOAuthLogin(
        email,
        name,
        profilePictureUrl,
        oauthProvider
      )
      const user = setCookie(response, data)
      sendOAuthSuccessRedirect(response, user)
    } catch (error) {
      this.logger.warn(
        'User attempted to log in with a different OAuth provider'
      )
      sendOAuthFailureRedirect(
        response,
        'User attempted to log in with a different OAuth provider'
      )
    }
  }
}
