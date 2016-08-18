'use strict';

var _ = require('lodash');
var resquel = require('resquel');
var express = require('express');

// Parse the env file (if exists) and prepare the settings.
require('dotenv').config({silent: true});
var settings = require('./src/settings')();

// Create our app.
var app = express();

// Gather the Resquel specific settings.
var config = _.pick(settings, ['db', 'type', 'auth']);

// Mount Resquel and continue.
app.use(resquel(config));
app.listen(settings.port);
