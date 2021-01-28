import _ from 'lodash';
import Ajv, { DefinedError } from 'ajv';
import CONFIG from '../schemas/config.json';
import knex from 'knex';
import logger from './log';
import fetch from 'node-fetch';
import SQLConnector from './sql-connector';
import { AnyKindOfDictionary, Dictionary } from 'lodash';
import { PreparedQuery } from 'resquel';
import { Request, Response } from 'express';

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

// see schemas/config.json for json equiv
// formats must be kept in sync or validation 💥
export declare type SQLConnectorConfig = {
  app: {
    cors?: AnyKindOfDictionary;
    port: number;
    formio: {
      key: string;
      project: string;
      routesResourceTag?: string;
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

export declare type CustomRoutes = {
  _id: string;
  data: {
    method: string;
    endpoint: string;
    query: string[];
    db?: string;
  };
}[];

const configSchema: Dictionary<unknown> = CONFIG;

const sleep = (ms): Promise<void> =>
  new Promise((i) => setTimeout(() => i(), ms));
const { log, warn, debug, error } = logger('sql-connector');

export class Config {
  constructor(public configData: SQLConnectorConfig) {}

  /**
   * Big expansion on Resquel implementation -
   * This function is intended to replace `config.json` that is utilized w/ Resquel
   *
   * Configuration data from these sources are merged into a completed overall config:
   * - config.json
   * - environment variables
   * - external config
   *
   * This function will be expanded in the future with more config sources
   * If you have requests, send in an email to support@form.io
   */
  public async build(): Promise<void> {
    // await this._config
    // Step 1: Merge environment variables into config
    const mapping = {
      // [environment variable]: 'config.object.path',
      PORT: 'app.port',
      FORMIO_KEY: 'app.formio.key',
      FORMIO_PROJECT: 'app.formio.project',
      AUTH_USERNAME: 'app.auth.username',
      AUTH_PASSWORD: 'app.auth.password',
      EXTERNAL_CONFIG: 'app.externalConfig.url',
      ROUTES_RESOURCE: 'app.formio.routeResource',
    };
    Object.keys(mapping).forEach((key) => {
      if (process.env[key] !== undefined) {
        warn(`Using process.env.${key} value for ${mapping[key]}`);
        _.set(this.configData, mapping[key], process.env[key]);
      }
    });

    // Step 2: If defined, pull in external config and merge
    if (this.configData.app.externalConfig) {
      // When in doubt, external config takes priority
      const external = this.configData.app.externalConfig;
      warn(`External config path provided`);
      const response = await fetch(
        external.url,
        external.extra as AnyKindOfDictionary,
      );
      const externalConfig: SQLConnectorConfig = await response.json();
      debug(externalConfig);

      // app merging
      if (externalConfig.app) {
        this.configData.app.cors =
          externalConfig.app.cors || this.configData.app.cors;
        this.configData.app.auth =
          externalConfig.app.auth || this.configData.app.auth;
        this.configData.app.formio =
          externalConfig.app.formio || this.configData.app.formio;
        this.configData.app.port =
          externalConfig.app.port || this.configData.app.port;
      }

      // db merging
      if (externalConfig.db) {
        this.configData.db = {
          ...this.configData.db,
          ...externalConfig.db,
        };
      }

      // routes merging
      if (externalConfig.routes) {
        this.configData.routes = [
          ...this.configData.routes,
          ...externalConfig.routes,
        ];
      }
    }

    if (this.configData.app.auth) {
      warn(`SQLConnector config defines app.auth`);
    }

    // Step 3: Grab routes from formio project
    log(`Fetching routes from formio project`);
    const formioRoutes = await this.getFormRouteInfo();
    log(`Fetching custom routes`);
    const customRoutes = await this.fetchFromConnectorResource();
    this.configData.routes = [
      ...this.configData.routes,
      ...formioRoutes,
      ...customRoutes,
    ];

    this.validateConfig();
  }

  // Pull auto generated routes from server
  private async getFormRouteInfo(
    failures = 0,
  ): Promise<SQLConnectorRoute[]> | never {
    if (failures > SQLConnector.ROUTE_INFO_MAX_RETRIES) {
      error(
        `MAX_RETRIES exceeded, verify formio-server is running and the project url is correct`,
      );
      process.exit(0);
    }
    if (failures > 0) {
      log('sleep(5000)');
      await sleep(5000);
    }
    try {
      const url = `${this.configData.app.formio.project}/sqlconnector?format=v2`;
      log(`Loading connector data from: ${url}`);
      const body = await fetch(url, {
        headers: {
          'x-token': this.configData.app.formio.key,
        },
      });
      const out = await body.json();
      debug(JSON.stringify(out, null, '  '));
      return out;
    } catch (err) {
      error(`Failed to pull formio sqlconnector info %O`, err);
      return this.getFormRouteInfo(failures + 1);
    }
  }

  private validateConfig(): void | never {
    if (SQLConnector.BYPASS_CONFIG_VALIDATION) {
      warn(`Config validation bypassed`);
      return;
    }
    let validate;
    try {
      const ajv = new Ajv({
        allowMatchingProperties: true,
      });
      validate = ajv.compile(configSchema);
      if (validate(this.configData)) {
        const invalidRoutes = this.configData.routes.filter((route) => {
          if (typeof this.configData.db[route.db] === 'undefined') {
            error(`Unknown db: ${route.db}`);
            error(route);
            return true;
          }
          return false;
        });
        if (invalidRoutes.length !== 0) {
          error(
            `${invalidRoutes.length} routes refer to unregistered db connections`,
          );
          process.exit(0);
        }
        log(`Config passed validation`);
        return;
      }
    } catch (err) {
      error(err);
    }
    error('config failed validation!');
    debug(JSON.stringify(this.configData as SQLConnectorConfig, null, '  '));
    debug(validate.errors as DefinedError[]);
    process.exit(0);
  }

  // Look up all resources that are tagged with the sqlconnector tag
  // This tag can be changed via config settings
  private async fetchFromConnectorResource():
    | Promise<SQLConnectorRoute[]>
    | never {
    const project = this.configData.app.formio.project;
    try {
      // Step 1: Load list of forms from project
      const url = `${project}/form`;
      log(url);
      const res = await fetch(url);
      const data = await res.json();
      // debug(data);
      const forms = data.filter((form) => {
        // split on comma, and be sure all tags are present
        const tags = (
          this.configData.app.formio.routesResourceTag || 'sqlconnector'
        ).split(',');
        return tags.every((t) => form.tags.includes(t));
      });
      const out: SQLConnectorRoute[] = [];
      await Promise.all(
        forms.map(async (form) => {
          const url = `${project}/${form.path}/submission`;
          log(url);
          const result = await fetch(url, {
            headers: {
              'x-token': this.configData.app.formio.key,
            },
          });
          const submissions = await result.json();
          submissions.forEach((submission) => {
            const routeInfo = submission.data;
            out.push({
              method: routeInfo.method,
              endpoint: routeInfo.endpoint,
              db: routeInfo.db || 'default',
              query: this.prepareQuery(routeInfo.query),
            });
          });
          debug(out);
        }),
      );
      return out;
    } catch (err) {
      error(`Request failed`);
      error(err);
      process.exit();
    }
  }

  // Modify the query format
  // ex: UPDATE `customers` SET (`firstName` = {{data.firstName}}) WHERE `id` = {{params.id}}
  // to
  // [
  //   'UPDATE `customers` SET (`firstName` = ?) WHERE `id` = ?',
  //   'body.data.firstName',
  //   'params.id',
  // ]
  //
  private prepareQuery(formattedQueries: string[]): PreparedQuery[] {
    return formattedQueries.map((query) => {
      const queryToken = /{{\s*([^}]+)\s*}}/g;
      const parts = query.match(queryToken);
      if (parts === null) {
        // No substitutions
        return [query];
      }

      const params = parts.map((token) => {
        const objPath = this.reformatKey(token.substr(2, token.length - 4));
        query = query.replace(token, '?');
        return objPath;
      });

      return [query, ...params];
    });
  }

  private reformatKey(key: string): string {
    // Aliases:
    //  - {{data.firstName}} = body.data.firstName
    //  - {{submission.param}} = body.param
    //

    const parts = key.split('.');
    const aliases = {
      data: 'body.data',
      submission: 'body',
    };
    const prefix = parts[0];
    if (typeof aliases[prefix] === 'string') {
      parts[0] = '';
      return `${aliases[prefix]}${parts.join('.')}`;
    }
    return key;
  }
}
export default Config;
