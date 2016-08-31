Easily convert your SQL database into a REST API, using the SQLConnector action from Form.io
====================================================
This is a lightweight Express.js server that is able to wrap a SQL database, and expose functionality through
pre-configured SQL Statements attached to a REST API. Using data from your [Form.io](https://form.io) project, routes
are dynamically generated along with the SQL code to allow you to create forms in [Form.io](https://form.io), and have
the contents automatically inserted into your SQL Database using field mapping within the SQL Connector Form Action.
Please go to https://form.io to learn more.

**This library currently supports Microsoft SQL Server and MySQL.**

All the settings of this library are controlled via environment variables, which may be manually added to the start
command, e.g. `SETTING=something npm start`, or you can configure the `.env` file. To configure the `.env` file, copy
the `.env.example` file to `.env` and add your settings.

## Settings
| Setting | Default | Required | Purpose |
|---------|---------|----------|---------|
| PORT | 3000 | yes | The port this express server will run on. |
| TYPE | mysql | yes | The type of SQL syntax to use. |
| DB_SERVER | localhost | yes | The SQL database host to use. |
| DB_USER | root | yes | The SQL database user to use. |
| DB_DATABASE | formiosql | yes | The SQL database user to use. |
| FORMIO_KEY | | yes | The API key for your Form.io Project. |
| FORMIO_PROJECT | | yes | The Project _id for your Form.io Project. |
| AUTH_USERNAME | | no | A Random username required to access this Server for Basic Auth, also used in the Form.io Project settings for SQL Connector. |
| AUTH_PASSWORD | | no | A Random password required to access this Server for Basic Auth, also used in the Form.io Project settings for SQL Connector. |

## Routes
The routes are primarily generated on Form.io, but can also be added manually. Adding custom routes to `routes.json`
will overwrite Form.io generated routes.

## How it works
Upon running the formio-sql server, it will authenticate to your Form.io project and grab all the generated SQL
Connector routes, so anytime the SQLConnector action is changed on Form.io, this server will need to be restarted to get
the updated routes.

If you are not using a Form.io project, check out [https://github.com/formio/resquel](Resquel).

Enjoy!

 - The Form.io Team
