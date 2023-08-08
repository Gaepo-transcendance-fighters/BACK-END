import { HttpException, HttpStatus, Injectable, Logger, } from '@nestjs/common';
import axios from 'axios';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import { JwtPayloadDto } from 'src/auth/dto/auth.dto';
import { IntraInfoDto } from 'src/users/dto/user.dto';
import { CreateUsersDto } from 'src/users/dto/create-users.dto';

import { UserObject } from 'src/users/entities/users.entity';
import { UsersService } from 'src/users/users.service';

dotenv.config({
  path:
    process.env.NODE_ENV === 'dev' ? '/dev.backend.env' : '/prod.backend.env',
});

export const redirectUri = process.env.REDIRECT_URI;
export const apiUid = process.env.CLIENT_ID;
const apiSecret = process.env.CLIENT_SECRET;
const jwtSecret = process.env.JWT_SECRET;
export const intraApiTokenUri = 'https://api.intra.42.fr/oauth/token';
const intraApiMyInfoUri = 'https://api.intra.42.fr/v2/me';

@Injectable()
export class LoginService {
  constructor(
    private readonly httpService: HttpService,
    private readonly usersService: UsersService,
  ) {}
  private logger: Logger = new Logger('LoginService');



  async getToken(code: string): Promise<any> {
    this.logger.log(`getToken : code= ${code}`);
    const body = {
      grant_type: 'authorization_code',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code: code,
      redirect_uri: process.env.FRONT_CALLBACK_URI,
    };
  
    try {
      const response = await axios.post(intraApiTokenUri, body);
      console.log("trying get response from axios post : ",response)
      // this.logger.log(`getToken: response.data : ${response.data}`) // [object Object]
      // this.logger.log(`getToken: response.data.message : ${response.data.message}`) // undefined
      this.logger.log(`getToken: response.data.access_token : ${response.data.access_token}`)
      return response.data.access_token;
    } catch (error) {
      // Handle error
      console.error('Error making POST request:', error.message);
      throw error;
    }
  }

  async getIntraInfo(code: string): Promise<IntraInfoDto> {

    // 여기에 헤더 bearder 가 존재하는지 확인하는 코드가 필요함
    // /* https://api.intra.42.fr/oauth/token?grant_type=authorization_code&client_id=${client_id}&client_secret=${client_secret}&code=${code}&redirect_uri=${redirect_uri} */
    // const params = new URLSearchParams();
    // params.set('grant_type', 'authorization_code');
    // params.set('client_id', process.env.CLIENT_ID);
    // params.set('client_secret', process.env.CLIENT_SECRET);
    // params.set('code', code);
    // params.set('redirect_uri', process.env.FRONT_CALLBACK_URI);
    
    // const tokens = await lastValueFrom(
    //   this.httpService.post(intraApiTokenUri, params)
    // );
    const tokens = await this.getToken(code);

    try {
      const response = await axios.get(intraApiMyInfoUri, {
        headers: {
          Authorization: `Bearer ${tokens}`,
        },
          timeout: 10000,
      });
      this.logger.log(`getIntraInfo: response.data.access_token : [data : undefined] : ${response.data.access_token}`)
      this.logger.log(`getIntraInfo: Not response.data.access_token, but tokens   : ${tokens}`)
      
      const userInfo = response;
      console.log('userInfo : Logging :',userInfo);
      // 이제 userInfo를 사용하여 원하는 작업을 수행할 수 있습니다.
      this.logger.log(`getIntraInfo: userInfo : ${userInfo.data.id}, ${userInfo.data.image.versions.small}`);
    
    return {
      userIdx: userInfo.data.id,
      intra: userInfo.data.login,
      img: userInfo.data.image.versions.small,
      accessToken : tokens,
      email: userInfo.data.email,
    };
    } catch (error) {
      // 에러 핸들링
      console.error('Error making GET request:', error);
    }
    // httpService.get() 메서드 안에서 headers: Authorization 이 존재하는지 확인하는 코드가 필요함
    
    
  }

  
  

  async issueToken(payload: JwtPayloadDto) {
    const paytoken = jwt.sign(payload, jwtSecret);
    
    this.logger.log('paytoken', paytoken);
    return paytoken;
  }
  
  
  


  async getUserInfo(intraInfo: IntraInfoDto): Promise<JwtPayloadDto> {
    this.logger.log('getUserInfo start');
    /* 
    userIdx: number;
    intra: string;
    img: string;
    accessToken: string;
    email: string; 
    */
  //  const dto = new CreateUsersDto(id, username, username, image );
    // const intrainfoDto = new IntraInfoDto( userIdx, intra, img, accessToken, email );
    
    const intraInfoDto: IntraInfoDto = {
      userIdx: intraInfo.userIdx,
      intra: intraInfo.intra,
      img: intraInfo.img,
      accessToken: intraInfo.accessToken,
      email: intraInfo.email,
    };
    const { userIdx, intra, img, accessToken, email } = intraInfoDto;
    this.logger.log(`getUserInfo : ${userIdx}, ${intra}, ${img}, ${accessToken}, ${email}`);
    let user: UserObject | CreateUsersDto = await this.usersService.findOneUser(userIdx);
    if (user === null || user === undefined) {
      
      const savedtoken = await this.usersService.saveToken({
        token: accessToken,
        check2Auth: false,
        email: email,
        userIdx: userIdx,
      });
      const newUser: CreateUsersDto = {
        userIdx : userIdx,
        intra: intra,
        nickname : intra,
        img: img,
        certificate: savedtoken,
        email: email,
      };
      this.logger.log(`saveToken called : ${savedtoken}`);
      // newUser.certificate = savedtoken;
      user = await this.usersService.createUser(newUser);
      this.logger.log('createUser called');
      
    }

    return {
      id: user.userIdx,
      check2Auth: false,
      accessToken: accessToken,
    };
  }
}