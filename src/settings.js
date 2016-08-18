'use strict';

var _ = require('lodash');
var defaults = require('../defaults.json');
var debug = {
  pluck: require('debug')('formio-sql:settings:pluck'),
  settings: require('debug')('formio-sql:settings')
};

// The required settings, which will stop the server from starting.
var required = ['project', 'type', 'db.server'];

module.exports = function() {
  var settings = {};

  /**
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

  // Build the settings with the plucked properties.
  settings = {
    project: pluck('project', false),
    port: pluck('port'),
    type: pluck('type'),
    db: {
      server: pluck('db_server', 'db.server'),
      user: pluck('db_user', 'db.user')
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
    console.error('The following settings are required, but were not found: ' + missing.join(', '));
    process.exit(1);
  }

  return settings;
};
