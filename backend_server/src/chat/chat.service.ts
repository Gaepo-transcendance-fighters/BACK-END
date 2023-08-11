import { Injectable, Logger } from '@nestjs/common';
import { Channel } from './class/channel.class';
import { Chat, MessageInfo, MessageInteface } from './class/chat.class';
import { DataSource, EntityManager, Repository, Transaction } from 'typeorm';
import { Permission, UserObject } from 'src/entity/users.entity';
import { DMChannel, DirectMessage, Mode } from '../entity/chat.entity';
import { DMChannelRepository, DirectMessageRepository } from './DM.repository';
import { SendDMDto } from './dto/send-dm.dto';
import { InMemoryUsers } from 'src/users/users.provider';
import { Socket } from 'socket.io';
import { Message } from './class/message.class';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ChatService {
  constructor(
    private chat: Chat,
    private dataSource: DataSource,
    // @InjectRepository(DMChannel)
    private dmChannelRepository: DMChannelRepository,
    // @InjectRepository(DirectMessage)
    private directMessagesRepository: DirectMessageRepository,
    // @InjectRepository(DMChannel)
    // private dmChannelRepository: Repository<DMChannel>,
    // @InjectRepository(DirectMessage)
    // private directMessagesRepository: Repository<DirectMessage>,
    // TODO: gateway에서도 InmemoryUsers 를 사용하는데, service 로 옮기자
    private inMemoryUsers: InMemoryUsers,
  ) {}
  private logger: Logger = new Logger('ChatService');

  /********************* check Room Member & client *********************/
  // async checkAlreadyInRoom(clientData: any) {
  //   // find() 사용
  //   const channel = await this.findChannelByRoomId(clientData.roomId);
  //   // if (channel == null) {
  //   //   return false;
  //   // }
  //   return await channel.getMember.flat().find((member) => {
  //     return member === clientData.nickname;
  //   });
  //   // Set 사용
  //   // const channel = this.findChannelByRoomId(clientData.roomId);
  //   // const membersSet = new Set(channel.getMember.flat());
  //   // console.log(membersSet);
  //   // return membersSet.has(clientData.nickname);
  // }

  /***************************** Find Channel *****************************/
  // TODO: 아래 세가지 함수로 하나로 합치는게 좋을까? 논의 필요
  // 합치게 되면, 반환되는 채널이 어떤 채널인지 구분할 수 있는 방법이 필요함.
  async findChannelByRoomId(channelIdx: number): Promise<Channel | DMChannel> {
    let channel: Channel | DMChannel = this.chat.getProtectedChannels.find(
      (channel) => channel.getChannelIdx === channelIdx,
    );
    if (!channel) {
      channel = await this.dmChannelRepository.findDMChannelByChannelIdx(
        channelIdx,
      );
    }
    return channel;
  }

  findProtectedChannelByRoomId(roomId: number): Channel {
    const protectedChannel: Channel = this.chat.getProtectedChannels.find(
      (channel) => channel.getRoomId === roomId,
    );
    if (protectedChannel == undefined || protectedChannel.getPassword == null) {
      return null;
    }
    return protectedChannel;
  }

  findPublicChannelByRoomId(roomId: number): Channel {
    const publicChannel: Channel = this.chat.getProtectedChannels.find(
      (channel) => channel.getRoomId === roomId,
    );
    if (publicChannel == undefined || publicChannel.getPassword != null) {
      return null;
    }
    return publicChannel;
  }

  findPrivateChannelByRoomId(roomId: number): Channel {
    // DB 에서 찾아야함
    // const privateChannel = this.chat.getPrivateChannels.find(
    //   (channel) => channel.getRoomId === roomId,
    // );
    // if (privateChannel == undefined) {
    //   return null;
    // }
    // return privateChannel;
    return null;
  }

  async findPrivateChannelByUserIdx(userIdx: number): Promise<DMChannel[]> {
    // DB 에서 찾아야함
    const privateChannelList: DMChannel[] =
      await this.dmChannelRepository.findDMChannelsByUserIdx(userIdx);
    if (!privateChannelList) {
      return null;
    }
    return privateChannelList;
  }

  /******************* Check and Create Channel function *******************/

  async createDmChannel(
    client: UserObject,
    target: UserObject,
    channelIdx: number,
    msg: SendDMDto,
  ): Promise<boolean> {
    const queryRunner = this.dataSource.createQueryRunner();
    let ret = true;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const list = await this.dmChannelRepository.createChannel(
        client,
        target,
        channelIdx,
      );
      const firstDM = await this.directMessagesRepository.sendDm(
        msg,
        client,
        channelIdx,
      );
      await queryRunner.manager.save(list[0]);
      await queryRunner.manager.save(list[1]);
      await this.directMessagesRepository.save(firstDM);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      ret = false;
    } finally {
      await queryRunner.release();
    }
    return ret;
  }

  // FIXME: 반환값...
  async checkDM(
    userIdx: number,
    targetIdx: number,
  ): Promise<MessageInfo | boolean> {
    const dmChannel: DMChannel = await this.dmChannelRepository.findDMChannel(
      userIdx,
      targetIdx,
    );
    if (!dmChannel) {
      console.log('채널이 없습니다.');
      return false;
    }
    const dmMessageList = await Promise.all(
      (
        await this.directMessagesRepository.findMessageList(
          dmChannel.channelIdx,
        )
      ).map(async (dm) => {
        return {
          sender: dm.sender,
          msg: dm.msg,
          msgDate: dm.msgDate,
        };
      }),
    );
    const messageInfo: MessageInfo = {
      message: dmMessageList,
      userIdx1: dmChannel.userIdx1,
      userIdx2: dmChannel.userIdx2,
      userNickname1: dmChannel.userNickname1,
      userNickname2: dmChannel.userNickname2,
      channelIdx: dmChannel.channelIdx,
    };
    return messageInfo;
  }

  async createDM(
    client: Socket,
    user: UserObject,
    targetUser: UserObject,
    msg: SendDMDto,
  ) {
    const channelIdx = await this.setNewChannelIdx();
    // TODO: 예외처리 필요
    await this.createDmChannel(user, targetUser, channelIdx, msg);

    const msgInfo: MessageInteface = {
      sender: user.nickname,
      msg: msg.msg,
      msgDate: new Date(),
    };
    const dmInfo = {
      message: msgInfo,
      channelIdx: channelIdx,
    };
    // 상대방 소켓 찾아서 join 시키기
    const targetSocket = await this.chat.getSocketObject(targetUser.userIdx);
    if (targetSocket) {
      await targetSocket.socket.join(`chat_room_${channelIdx}`);
    } else {
      console.log('상대방이 오프라인입니다.');
    }
    client.join(`chat_room_${channelIdx}`);
    console.log('dmInfo', dmInfo);
    return dmInfo;
  }

  async createPublicAndProtected(password: string, user: UserObject) {
    const channelIdx = await this.setNewChannelIdx();
    // TODO: 함수로 빼기?
    const channel = new Channel();
    channel.setChannelIdx = channelIdx;
    channel.setRoomId = channelIdx;
    channel.setMember = user;
    channel.setOwner = user;
    channel.setAdmin = user;
    if (password === '') {
      channel.setMode = Mode.PUBLIC;
    } else if (password !== '') {
      channel.setMode = Mode.PROTECTED;
    }
    channel.setPassword = password;
    this.chat.setProtectedChannels = channel;
    const channelInfo = {
      owner: channel.getOwner.nickname,
      channelIdx: channel.getChannelIdx,
      mode: channel.getMode,
    };
    return channelInfo;
  }

  async setNewChannelIdx(): Promise<number> {
    const maxChannelIdxInIM = await this.chat.getMaxChannelIdxInIM();
    const maxChannelIdxInDB =
      await this.dmChannelRepository.getMaxChannelIdxInDB();
    // FIXME: chat 클래스에 있는 정적 변수는 지워도 되지 않을까?
    const channelIdx = Math.max(maxChannelIdxInIM, maxChannelIdxInDB) + 1;
    return channelIdx;
  }

  /******************* Save Message Funcions *******************/

  async saveMessageInIM(channelIdx: number, senderIdx: number, msg: string) {
    const channel = await this.chat.getProtectedChannels.find(
      (channel) => channel.getChannelIdx === channelIdx,
    );
    const msgInfo = new Message(channelIdx, senderIdx, msg);
    msgInfo.setMsgDate = new Date();
    if (channel) {
      channel.setMessage = msgInfo;
    } else {
      console.log('Channel not found.');
      return;
    }
    // const sender = await this.inMemoryUsers.getUserByIdFromIM(senderIdx);
    const message = {
      senderIdx: await this.inMemoryUsers.getUserByIdFromIM(senderIdx).userIdx,
      msg: msgInfo.getMessage,
      msgDate: msgInfo.getMsgDate,
    };
    return message;
  }

  async saveMessageInDB(channelIdx: number, senderIdx: number, msg: SendDMDto) {
    const message: SendDMDto = {
      msg: msg.msg,
    };
    const queryRunner = this.dataSource.createQueryRunner();
    const user = await this.inMemoryUsers.getUserByIdFromIM(senderIdx);

    let dm;
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      dm = await this.directMessagesRepository.sendDm(
        message,
        user,
        channelIdx,
      );
      await queryRunner.manager.save(dm);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return;
    } finally {
      await queryRunner.release();
    }
    return dm;
  }

  /******************* Save Message Funcions *******************/
  async enterPublicRoom(user: UserObject, channel: Channel) {
    channel.setMember = user;
    const channelInfo = {
      member: channel.getMember.map((member) => {
        return {
          nickname: member.nickname,
          imgUri: member.imgUri,
          permission: Permission.MEMBER,
        };
      }),
      channelIdx: channel.getChannelIdx,
    };
    return channelInfo;
  }

  async enterProtectedRoom(user: UserObject, channel: Channel) {
    channel.setMember = user;
    const channelInfo = {
      member: channel.getMember.map((member) => {
        return {
          nickname: member.nickname,
          imgUri: member.imgUri,
          permission: Permission.MEMBER,
        };
      }),
      channelIdx: channel.getChannelIdx,
    };
    return channelInfo;
  }

  /******************* Funcions in chat *******************/
  setAdmin(channel: Channel, user: UserObject, grant: boolean) {
    if (grant) {
      channel.setAdmin = user;
    } else {
      channel.removeAdmin(user);
    }
    const adminInfo = {
      userIdx: user.userIdx,
      grant: grant,
    };
    return adminInfo;
  }

  setBan(channel: Channel, user: UserObject) {
    const ban = channel.getBan.some(
      (member) => member.userIdx === user.userIdx,
    );
    if (!ban) {
      channel.setBan = user;
    } else {
      channel.removeBan(user);
    }
    const banInfo = {
      targetNickname: user.nickname,
      targetIdx: user.userIdx,
      leftMember: channel.getBan.map((member) => {
        return {
          userNickname: member.nickname,
          userIdx: member.userIdx,
        };
      }),
    };
    return banInfo;
  }

  changePassword(channel: Channel, password: string) {
    channel.setPassword = password;
    if (password === '') {
      channel.setMode = Mode.PUBLIC;
    } else {
      channel.setMode = Mode.PROTECTED;
    }
    const channelInfo = {
      channelIdx: channel.getChannelIdx,
      mode: channel.getMode,
    };
    return channelInfo;
  }

  /******************* Funcions about Exit Room *******************/

  goToLobby(client: Socket, channel: Channel, user: UserObject) {
    channel.removeMember(user);
    const isOwner: boolean = channel.getOwner.userIdx === user.userIdx;
    if (isOwner) {
      channel.setOwner = channel.getMember[0];
    }
    // const userSocket = this.chat.getSocketObject(user.userIdx);
    // userSocket.socket.leave(`chat_room_${channel.getChannelIdx}`);
    // userSocket.socket.emit('chat_goto_lobby', '방을 나왔습니다.');

    const channelInfo = {
      owner: channel.getOwner?.nickname,
      channelIdx: channel.getChannelIdx,
      mode: channel.getMode,
    };
    client.leave(`chat_room_${channel.getChannelIdx}`);
    return channelInfo;
  }

  exitAnnounce(channel: Channel) {
    const channelInfo = {
      leftMember: channel.getMember.map((member) => {
        return {
          userNickname: member.nickname,
          userIdx: member.userIdx,
        };
      }),
      owner: channel.getOwner.nickname,
    };
    return channelInfo;
  }

  checkEmptyChannel(channel: Channel) {
    if (channel.getMember.length === 0) {
      return true;
    }
    return false;
  }

  removeEmptyChannel(channel: Channel) {
    this.chat.removeChannel(channel.getChannelIdx);
    const channels = this.chat.getProtectedChannels.map((channel) => {
      return {
        owner: channel.getOwner.nickname,
        channelIdx: channel.getChannelIdx,
        mode: channel.getMode,
      };
    });
    return channels;
  }

  getPublicAndProtectedChannel() {
    const channels = this.chat.getProtectedChannels.map((channel) => {
      return {
        owner: channel.getOwner.nickname,
        channelIdx: channel.getChannelIdx,
        mode: channel.getMode,
      };
    });
    return channels;
  }

  async getPrivateChannels(user: UserObject) {
    const channels: DMChannel[] =
      await this.dmChannelRepository.findDMChannelsByUserIdx(user.userIdx);

    const channelsInfo = channels.map((channel) => {
      return {
        targetNickname: channel.userNickname2,
        channelIdx: channel.channelIdx,
        mode: Mode.PRIVATE,
      };
    });
    return channelsInfo;
  }

  // DM 채널 클릭 시
  async getPrivateChannel(channelIdx: number) {
    const channel: DMChannel =
      await this.dmChannelRepository.findDMChannelByChannelIdx(channelIdx);
    const dmMessageList = await Promise.all(
      (
        await this.directMessagesRepository.findMessageList(channelIdx)
      ).map(async (dm) => {
        return {
          sender: dm.sender,
          msg: dm.msg,
          msgDate: dm.msgDate,
        };
      }),
    );
    const targetUser = this.inMemoryUsers.getUserByIdFromIM(channel.userIdx2);
    const messageInfo = {
      message: dmMessageList,
      userIdx1: channel.userIdx1,
      userIdx2: channel.userIdx2,
      userNickname1: channel.userNickname1,
      userNickname2: channel.userNickname2,
      channelIdx: channel.channelIdx,
      imgUrl: targetUser.imgUri,
    };
    return messageInfo;
  }

  kickMember(channel: Channel, user: UserObject) {
    channel.removeMember(user);
    const userSocket = this.chat.getSocketObject(user.userIdx);
    // FIXME: return 으로 해도 될듯
    userSocket.socket.emit('chat_room_exit', '퇴장 당했습니다.');
    userSocket.socket.leave(`chat_room_${channel.getChannelIdx}`);

    const channelInfo = {
      targetNickname: user.nickname,
      targetIdx: user.userIdx,
      leftMember: channel.getMember.map((member) => {
        return {
          userNickname: member.nickname,
          userIdx: member.userIdx,
        };
      }),
    };
    return channelInfo;
  }
}
