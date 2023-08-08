import {
  Controller,
  Post,
  Get,
  Headers,
  Res,
  Req,
  Query,
  Redirect,
  Body,
  UseGuards,
  Logger,
  Header,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from 'src/auth/auth.guard';
import { apiUid, LoginService, redirectUri } from './login.service';
import { IntraInfoDto } from 'src/users/dto/user.dto';
import { UsersService } from 'src/users/users.service';
import { CreateCertificateDto } from 'src/auth/dto/auth.dto';
import { plainToClass } from 'class-transformer';
import { CertificateObject } from 'src/users/entity/certificate.entity';
import { UserObject } from 'src/users/entity/users.entity';


@Controller()
export class LoginController {
  constructor(
    private readonly loginService: LoginService,
    private readonly usersService: UsersService,
    ) { }

  private logger: Logger = new Logger('LoginController');
  @Get('login/42')
  @Redirect(
    `${process.env.REDIRECT_URI}`,
    301,
  )
  loginOauth() {
    this.logger.log('loginOauth');
    
    return;
  }

  @Post('login/auth')
  async codeCallback(@Headers('authorization') authHeader: any, @Req() req:Request, @Res() res: Response, @Body() query: any) {
    if (authHeader === undefined) {
      // authHeader =  req.cookies.Authentication;
      //

      // doesn't work res:any in case
    // this.logger.log(`authHeader Authorization : ${authHeader.Authorization}`);
    // this.logger.log(`authHeader Bearer : ${authHeader.token}, ${req.cookies.Authentication}`);
    // this.logger.log(`codeCallback req.cookies : ${req.cookies.token}`);
    // this.logger.log(`codeCallback req : ${req}`);
    // this.logger.log('res.cookie', res.cookie);
    // res.headers.authorization = `Authentication=${userData.token.token}; Path=/; HttpOnly; Max-Age=86400`;
    // this.logger.log(`check res.headers.cookie : ${res.headers.cookie}`);
    }

    const userData: {token: CertificateObject; user: any;} = {
      token: null,
      user: null,
    }
    let intraInfo: IntraInfoDto;
    let userDto: UserObject;
    this.logger.log('codeCallback start');
    this.logger.log(`codeCallback query : ${query.code}`);
    this.logger.log(`codeCallback res.headersSent : ${res.headersSent}`);
    async (res:Response): Promise<void> => {
      const log = res.getHeaderNames().toString();
      this.logger.log(`codeCallback res.getHeaderNames : ${log}`)
    };

    this.logger.log(`codeCallback req.headers : ${req.headers}`);
    this.logger.log(`codeCallback req.headers.authorization : ${req.headers.authorization}`); // find it out !
    this.logger.log(`codeCallback req.headers.Authorization_true, false : ${req.headers.Authorization !== undefined? true: false}`);
    this.logger.log(`codeCallback req.headers.cookie : ${req.headers.cookie}`);
    this.logger.log(`codeCallback req.body : ${req.body}`);
    this.logger.log(`codeCallback req.cookies : ${req.cookies}`)
    authHeader = req.headers.authorization.startsWith('Bearer') ? req.headers.authorization.split(' ')[1] : req.headers.authorization;
    if (authHeader === "null" || authHeader === "undefined" ) {
      this.logger.log('codeCallback authHeader null');
      intraInfo = await this.loginService.getIntraInfo(query.code);
    } else {
    this.logger.log(`codeCallback authHeader : ${authHeader}`);
    userDto = await this.usersService.validateUser(authHeader);
    
    this.logger.log(`codeCallback userDto :`);
    console.log(userDto);

    // { userIdx, intra, imgUri, accessToken, email }
    intraInfo.imgUri = userDto.imgUri;
    intraInfo.accessToken = userDto.certificate.token;
    intraInfo.email = intraInfo.email;
    // this.logger.log(`codeCallback intraInfo : ${intraInfo}`)
    console.log("codeCallback intraInfo",intraInfo);
    }
    const userInfo = await this.loginService.getUserInfo(intraInfo);

    // const token = await this.loginService.issueToken(userInfo.id, userInfo.check2Auth);
    userData.user = await this.usersService.findOneUser(userInfo.id);
    const createdCertificateDto: CreateCertificateDto = {token:userInfo.accessToken, check2Auth: false, email: intraInfo.email, userIdx: userInfo.id};
    userData.token = await this.usersService.saveToken(createdCertificateDto);
    this.logger.log(`check userData.token.token isExist : ${userData.token.token}`); 
    this.logger.log('codeCallback end accessToken', userInfo.accessToken);
    
    // this.logger.log(`res.header : \n${res.header}`); // just function
    // this.logger.log(`res.headers : ${res.headers}`); // [res.headers : undefined]
    // this.logger.log('res.headers.cookie', res.headers.cookie);
    // this.logger.log(`res.headers.authorization :  ${res.headers.authorization}`);
    // this.logger.log(`res.body : ${res.body}`); // [res.body : undefined]
    const resp :Response =res;
    // resp.cookie('token', userData.token.token, { httpOnly: true, path: '/' });
    resp.setHeader('Set-Cookie', `Authentication=${userData.token.token}; `);
    console.log(resp);
    
    return res.status(200).json({ code:userData.token.token ,message: '로그인 성공' });
  }

  @Post('logout')
  @Header('Set-Cookie', 'Authentication=; Path=/; HttpOnly; Max-Age=0')
  logout() {
    this.logger.log('logout');
    return { message: '로그아웃 되었습니다.' };
  }

}
