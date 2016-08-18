'use strict';

var _ = require('lodash');
var defaults = require('../defaults.json');
var debug = {
  settings: require('debug')('formio-sql:settings')
};

// The required settings, which will stop the server from starting.
var required = ['project', 'type', 'db.host'];

module.exports = function() {
  var settings = {
    project: _.get(process, 'env.PROJECT'),
    port: _.get(process, 'env.PORT') || _.get(defaults, 'port'),
    type: _.get(process, 'env.TYPE') || _.get(defaults, 'type'),
    db: {
      server: _.get(process, 'env.DB_SERVER') || _.get(defaults, 'db.server'),
      user: _.get(process, 'env.DB_USER') || _.get(defaults, 'db.user')
    }
  };

  debug.settings(settings);

  // Iterate all required fields, and notify the user of all missing fields.
  var missing = [];
  required.forEach(function(setting) {
    if (!_.has(settings, setting) || settings[setting] === undefined) {
      missing.push(setting);
    }
  });

  if (missing.length !== 0) {
    console.error('The following settings are required, but were not found: ' + missing.join(', '));
    process.exit(1);
  }

  return settings;
};
