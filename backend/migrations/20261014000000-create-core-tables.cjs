'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    await queryInterface.createTable('users', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') },
      email: { type: DataTypes.STRING(320), allowNull: false, unique: true },
      password_hash: { type: DataTypes.TEXT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.createTable('links', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') },
      owner_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      destination_url: { type: DataTypes.TEXT, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('links', ['owner_id', 'created_at'], { name: 'links_owner_id_created_at_idx' });
    await queryInterface.createTable('click_events', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') },
      link_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'links', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      clicked_at: { type: DataTypes.DATE, allowNull: false },
      referrer_host: { type: DataTypes.STRING(253), allowNull: true },
      device: { type: DataTypes.STRING(16), allowNull: false },
      idempotency_key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    });
    await queryInterface.addIndex('click_events', ['link_id', 'clicked_at'], { name: 'click_events_link_id_clicked_at_idx' });
    await queryInterface.createTable('daily_link_stats', {
      link_id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, references: { model: 'links', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      day: { type: DataTypes.DATEONLY, allowNull: false, primaryKey: true },
      clicks: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('daily_link_stats');
    await queryInterface.dropTable('click_events');
    await queryInterface.dropTable('links');
    await queryInterface.dropTable('users');
  },
};
