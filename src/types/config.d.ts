import { ConfigRoute } from 'resquel/dist/src/index';
type SQLConnectorRoute = ConfigRoute & {
  db?: string;
};
export type FormioSQLConfig = {
  port: number;
  db: {
    [key: string]: {
      type: 'mssql' | 'mysql' | 'postgres';
      server: string;
      port: number;
      user: string;
      [key: string]: unknown;
    };
  };
  formio: {
    key: string;
    project: string;
  };
  auth?: {
    username: string;
    password: string;
  };
  routes?: SQLConnectorRoute[];
};
