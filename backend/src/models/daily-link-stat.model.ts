import { BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { Link } from './link.model';

export interface DailyLinkStatCreationAttributes { linkId: string; day: string; clicks?: string }

@Table({ tableName: 'daily_link_stats', timestamps: false })
export class DailyLinkStat extends Model<DailyLinkStat, DailyLinkStatCreationAttributes> {
  @PrimaryKey @ForeignKey(() => Link) @Column({ type: DataType.UUID, field: 'link_id' }) declare linkId: string;
  @PrimaryKey @Column({ type: DataType.DATEONLY, allowNull: false }) declare day: string;
  @Column({ type: DataType.BIGINT, allowNull: false, defaultValue: 0 }) declare clicks: string;
  @BelongsTo(() => Link) declare link: Link;
}
