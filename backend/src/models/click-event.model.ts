import { BelongsTo, Column, DataType, Default, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Link } from './link.model';

export interface ClickEventCreationAttributes { linkId: string; clickedAt: Date; referrerHost: string | null; device: string; idempotencyKey: string }

@Table({
  tableName: 'click_events', timestamps: false,
  indexes: [{ unique: true, fields: ['idempotency_key'] }, { fields: ['link_id', 'clicked_at'] }],
})
export class ClickEvent extends Model<ClickEvent, ClickEventCreationAttributes> {
  @Default(DataType.UUIDV4) @Column({ type: DataType.UUID, primaryKey: true }) declare id: string;
  @ForeignKey(() => Link) @Column({ type: DataType.UUID, allowNull: false, field: 'link_id' }) declare linkId: string;
  @Column({ type: DataType.DATE, allowNull: false, field: 'clicked_at' }) declare clickedAt: Date;
  @Column({ type: DataType.STRING(253), allowNull: true, field: 'referrer_host' }) declare referrerHost: string | null;
  @Column({ type: DataType.STRING(16), allowNull: false }) declare device: string;
  @Column({ type: DataType.STRING(64), allowNull: false, unique: true, field: 'idempotency_key' }) declare idempotencyKey: string;
  @BelongsTo(() => Link) declare link: Link;
}
