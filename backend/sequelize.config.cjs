const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  logging: false,
  migrationStorageTableName: 'sequelize_meta',
};

module.exports = { development: common, test: common, production: common };
