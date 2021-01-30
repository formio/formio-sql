import { SQLConnectorConfig } from 'config';
import SQLConnector from './sql-connector';
import express from 'express';
import logger from './log';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config: SQLConnectorConfig = require('../config/config.json');
const { warn } = logger('formio-sql');

const run = async () => {
  const connector = new SQLConnector(config);
  await connector.init();
  const app = express();
  connector.attach(app);

  const port = config.app.port || 3100;
  app.listen(port);
  warn(`Listening on ${port}`);
};
run();
