'use strict';

var _ = require('lodash');
var defaults = require('../defaults.json');
var debug = {
  pluck: require('debug')('formio-sql:settings:pluck'),
  settings: require('debug')('formio-sql:settings')
};

// The required settings, which will stop the server from starting.
var required = ['formio.project', 'formio.key', 'type', 'db.server'];

module.exports = function() {
  var settings = {};

  var config;
  var legacy = false;
  try {
    config = require('../config.json');
  }
  catch (err) {
    legacy = true;

    if (_.has(process.env, 'LEGACY') && _.get(process.env, 'LEGACY') == 'false') {
      legacy = false;
    }

    debug.settings('Legacy: ', legacy);
  }

  /**
   * LEGACY
   *
   * Simple util to pluck settings from env or the defaults.
   *
   * NOTE: All vars in .env must be UPPERCASE.
   *
   * @param {String} first
   *   The first path to search
   * @param [String] second
   *   The fallback path to search (if different than first, if false, no fallback will be searched)
   */
  var pluck = function(first, second) {
    // One or the other is required - fail.
    if (first === undefined && second === undefined) {
      debug.pluck('Not given a first or second');
      return undefined;
    }
    else if (first === undefined && second !== undefined) {
      debug.pluck('Params in the wrong order');
      return undefined;
    }

    // If no second was given, default it to the first before mutation.
    if (second === undefined) {
      second = first;
    }

    // Mutate the first search path for env parsing.
    first = 'env.' + first.toString().toUpperCase();

    // Search the user defined settings.
    var temp = _.get(process, first);
    debug.pluck(first + ': ' + temp);

    // If fallback was disabled, return the original results.
    if (second === false) {
      debug.pluck('No fallback (' + first + ')');
      return temp;
    }

    // If the original search was undefined (user), attempt to use the system defaults.
    temp = temp !== undefined
      ? temp
      : _.get(defaults, second);

    debug.pluck('Fallback (' + second + '): ' + temp);
    return temp;
  };

  // The legacy configuration stuff.
  if (legacy === true) {
    // Build the settings with the plucked properties.
    settings = {
      port: pluck('port'),
      type: pluck('type'),
      db: {
        server: pluck('db_server', 'db.server'),
        user: pluck('db_user', 'db.user'),
        password: pluck('db_password'),
        database: pluck('db_database', 'db.database'),
        port: pluck('db_port', 'db.port')
      },
      formio: {
        project: pluck('formio_project', 'formio.project'),
        key: pluck('formio_key', 'formio.key')
      },
      auth: {
        username: pluck('auth_username'),
        password: pluck('auth_password')
      }
    };
    debug.settings(settings);

    // Iterate all required fields, and notify the user of all missing fields.
    var missing = [];
    required.forEach(function(setting) {
      if (!_.has(settings, setting) || _.get(settings, setting) === undefined) {
        missing.push(setting);
      }
    });

    if (missing.length !== 0) {
      console.error('The following settings are required, but were not found: ' + missing.join(', ')); // eslint-disable-line no-console
      process.exit(1);
    }

    debug.settings(settings);
    return settings;
  }

  // New settings options, which are more flexible.
  // Use the config.json data as the root configuration
  settings = config || {};

  var proc = function(key) {
    return _.get(process.env, key);
  };

  var add = function(key, prop) {
    prop = prop || key.toString().toLowerCase();

    if (_.has(process.env, key)) {
      _.set(settings, prop, proc(key));
    }
  };

  add('PORT');
  add('TYPE');
  add('DB_SERVER', 'db.server');
  add('DB_PORT', 'db.port');
  add('DB_USER', 'db.user');
  add('DB_PASSWORD', 'db.password');
  add('DB_DATABASE', 'db.database');
  add('AUTH_USERNAME', 'auth.username');
  add('AUTH_PASSWORD', 'auth.password');
  add('FORMIO_KEY', 'formio.key');
  add('FORMIO_PROJECT', 'formio.project');

  debug.settings(settings);
  return settings;
};
