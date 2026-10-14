import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { Link } from './link.model';

export interface UserCreationAttributes { email: string; passwordHash: string }

@Table({ tableName: 'users', timestamps: true, underscored: true })
export class User extends Model<User, UserCreationAttributes> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 }) declare id: string;
  @Column({ type: DataType.STRING(320), allowNull: false, unique: true }) declare email: string;
  @Column({ type: DataType.TEXT, allowNull: false, field: 'password_hash' }) declare passwordHash: string;
  @HasMany(() => Link) declare links: Link[];
}
