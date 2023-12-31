import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import { JwtPayloadDto } from 'src/auth/dto/auth.dto';
import { IntraInfoDto } from 'src/users/dto/user.dto';
import { CreateUsersDto } from 'src/users/dto/create-users.dto';

import { UserObject } from 'src/entity/users.entity';
import { UsersService, apiUid, apiSecret, frontcallback, jwtSecret, checking} from 'src/users/users.service';

export const intraApiTokenUri = 'https://api.intra.42.fr/oauth/token';
export const intraApiMyInfoUri = 'https://api.intra.42.fr/v2/me';

@Injectable()
export class LoginService {
  constructor(private readonly usersService: UsersService) {}
  private logger: Logger = new Logger('LoginService');

  async getAccessToken(code: string): Promise<any> {
    this.logger.log(`getAccessToken : code= ${code}`);
    const body = {
      grant_type: 'authorization_code',
      client_id: apiUid,
      client_secret: apiSecret,
      code: code,
      redirect_uri: frontcallback,
    };
    try {
      const response = await axios.post(intraApiTokenUri, body);
      this.logger.log(
        `getAccessToken: response.data.access_token : ${response.data.access_token}`,
      );
      return response.data.access_token;
    } catch (error) {
      throw error;
    }
  }

  async getIntraInfo(code: string): Promise<IntraInfoDto> {
    try {
      const token = await this.getAccessToken(code);
      const response = await axios.get(intraApiMyInfoUri, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const userInfo = response.data;

      return {
        userIdx: userInfo.id,
        intra: userInfo.login,
        imgUri: userInfo.image.versions.small,
        token: token,
        email: userInfo.email,
        check2Auth: false,
        nickname: userInfo.login,
        available: false,
      };
    } catch (error) {
      throw error;
    }
  }

  async issueToken(payload: JwtPayloadDto) {
    const paytoken = jwt.sign(payload, jwtSecret);

    this.logger.log('paytoken', paytoken);
    return paytoken;
  }

  async downloadProfileImg(intraInfo: IntraInfoDto) {
    const { userIdx, imgUri } = intraInfo;
    const imgData = await axios.get(imgUri, { responseEncoding: 'base64' }),
      fs = require('fs');
    fs.mkdirSync('public/img/', { recursive: true });
    fs.writeFileSync(
      `public/img/${userIdx}.png`,
      Buffer.from(imgData.data, 'base64'),
    );
  }
}
