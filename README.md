Easily convert your SQL database into a REST API, using the SQLConnector action from Form.io
====================================================
This is a lightweight Express.js server that is able to wrap a SQL database, and expose functionality through
pre-configured SQL Statements attached to a REST API. Using data from your [Form.io](https://form.io) project, routes
are dynamically generated along with the SQL code to allow you to create forms in [Form.io](https://form.io), and have
the contents automatically inserted into your SQL Database using field mapping within the SQL Connector Form Action.
Please go to https://form.io to learn more.

**This library currently is validated with Microsoft SQL Server, MySQL, and PostgreSQL. See [docker-compose.yaml](docker-compose.yaml) for specific configurations used in testing**

# Getting Started
## Dockerized
View [docker-compose.yaml](docker-compose.yaml) for example setup, and the most up to date list of environment variables. Running this repo as a container is the intended way to use this.

## Local
1. Clone repo
2. Modify [config.json](config/config.json) or [.env](.env) to meet your needs.

**Note:** The config is subject to automated validation, and server will quit if invalid. This functionality can be disabled with environment variables if you like living on the edge. If your editor has json schema support (like VSCode), config validation is done directly in IDE for convenience.

3. `yarn install`
4. Configure your Form.io Project Settings, to have a SQL Connector Data Connection (**Integrations** > **Data Connections**, `http(s)` scheme must be included on **Host URL** field)
 ![](/formio-sql1.png)
5. Configure a Form to have the SQL Connector action, and configure the mappings
 ![](/formio-sql2.png)
6. `yarn start` (`yarn debug:start` to include all log messages)

## Extending
SQLConnector and [Resquel](https://github.com/formio/resquel) are built to be extended should you require more customized logic. Adding additional logic is this easy
```typescript
import SQLConnector from 'formio-sql';

export class MyCustomConnector extends SQLConnector {
  public async init() {
    await super.init();
    this.config.routes.forEach((route) => {
      route.before = async (req, res, next) => {
        console.log('I run before the queries!');
        next();
      };
    });
  }
}
```


# Requirements
The following items are required to use the **formio-sql** server.

 1. A Form.io Project on the Team Pro or Commercial Plan
 2. A Node.js LTS Server, `4.x.x` or higher
 3. A MySQL/Microsoft SQL/PostgreSQL server(s)

## Compatibility
Version `1.0.0` drops backwards compatibility for `0.1.0` and prior. The move to a prepared query format instead of simple string substitutions fundamentally breaks existing route definitions.

## Routes
The routes are primarily generated on Form.io, but can also be added manually. These are now defined in [config.json](config/config.json)

## How it works
When this service starts, it will automatically connect to your Form.io project and load the generated SQL Connector Routes.

⚠️ **NOTE**: Anytime the SQLConnector Action is modified on Form.io, this service will need to be restarted stay in sync. ⚠️

If you are not using a Form.io project, check out [Resquel](https://github.com/formio/resquel).

Enjoy!

 - The [Form.io](https://form.io) Team
