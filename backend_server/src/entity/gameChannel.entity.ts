import {
  BaseEntity,
  Entity,
  Column,
  OneToOne,
  PrimaryColumn,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { GameRecord } from './gameRecord.entity';
import { UserObject } from './users.entity';

export enum RecordType {
  NORMAL = 'NORMAL',
  SPECIAL = 'SPECIAL',
}

export enum RecordResult {
  PLAYING = 'PLAYING',
  WIN = 'WIN',
  LOSE = 'LOSE',
  SHUTDOWN = 'SHUTDOWN',
}

@Entity('game_channel')
export class GameChannel extends BaseEntity {
  @PrimaryColumn({ type: 'int', unique: true })
  gameIdx: number;

  @Column({ type: 'enum', enum: RecordType })
  type: RecordType;

  @Column({ type: 'int' })
  userIdx1: number;

  @Column({ type: 'int' })
  userIdx2: number;

  @Column({ type: 'smallint' })
  score1: number;

  @Column({ type: 'smallint' })
  score2: number;

  @Column({ type: 'enum', enum: RecordResult })
  status: RecordResult;

  @ManyToOne(() => UserObject, (user1) => user1.userGameChannelList)
  @JoinColumn([{ name: 'userIdx1', referencedColumnName: 'userIdx' }])
  user1: UserObject;

  @ManyToOne(() => UserObject, (user2) => user2.userGameChannelList)
  @JoinColumn([{ name: 'userIdx2', referencedColumnName: 'userIdx' }])
  user2: UserObject;

  @OneToOne(() => GameRecord, (record) => record.channel)
  record: GameRecord;
}