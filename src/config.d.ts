import knex from 'knex';
import { PreparedQuery } from 'resquel';
import SQLConnector from './sql-connector';
import { Request, Response } from 'express';
import { RequestInit } from 'node-fetch';

type QueryHandlerArgs = {
  knex: knex;
  connector: SQLConnector;
  req: Request;
  res: Response;
  next: () => void;
};
export declare type QueryHandler = (args: QueryHandlerArgs) => Promise<void>;
export declare type SQLConnectorRoute = {
  method: 'get' | 'post' | 'delete' | 'put' | 'index' | string;
  endpoint: string;
  query?: PreparedQuery[];
  handler?: QueryHandler;
  db?: string;
  before?: (req: Request, res: Response, next: () => Promise<void>) => unknown;
  after?: (req: Request, res: Response, next: () => Promise<void>) => unknown;
};

export declare type SQLConnectorConfig = {
  app: {
    port: number;
    formio: {
      key: string;
      project: string;
    };
    auth?: {
      username: string;
      password: string;
    };
    externalConfig?: {
      url: string;
      extra?: RequestInit;
    };
  };
  db: {
    [key: string]: knex.Config<unknown>;
  };
  routes: SQLConnectorRoute[];
};
