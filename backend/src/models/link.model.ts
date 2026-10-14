import { BelongsTo, Column, DataType, Default, ForeignKey, HasMany, Model, Table } from 'sequelize-typescript';
import { User } from './user.model';
import { ClickEvent } from './click-event.model';
import { DailyLinkStat } from './daily-link-stat.model';

export interface LinkCreationAttributes { ownerId: string; code: string; destinationUrl: string; expiresAt: Date | null }

@Table({
  tableName: 'links', timestamps: true, underscored: true,
  indexes: [{ unique: true, fields: ['code'] }, { fields: ['owner_id', 'created_at'] }],
})
export class Link extends Model<Link, LinkCreationAttributes> {
  @Default(DataType.UUIDV4) @Column({ type: DataType.UUID, primaryKey: true }) declare id: string;
  @ForeignKey(() => User) @Column({ type: DataType.UUID, allowNull: false, field: 'owner_id' }) declare ownerId: string;
  @Column({ type: DataType.STRING(32), allowNull: false, unique: true }) declare code: string;
  @Column({ type: DataType.TEXT, allowNull: false, field: 'destination_url' }) declare destinationUrl: string;
  @Column({ type: DataType.DATE, allowNull: true, field: 'expires_at' }) declare expiresAt: Date | null;
  @BelongsTo(() => User) declare owner: User;
  @HasMany(() => ClickEvent) declare clicks: ClickEvent[];
  @HasMany(() => DailyLinkStat) declare dailyStats: DailyLinkStat[];
}
