// Library requirements
var fs = require('fs');
var http = require('http');
var path = require('path');
var pg = require('pg');

// Color shell strings
var blue   = '\033[0;34m';
var green  = '\033[0;32m';
var normal = '\033[0;m';
var red    = '\033[0;31m';
var white  = '\033[1;37m';

// App-specific variables
var config = require('../config.json');
var connectionPreString;
var databases = {};
var headers = {
  'Access-Control-Allow-Headers': config.allowHeaders.join(', '),
  'Access-Control-Allow-Origin': config.allowOrigin,
  'Content-Type': 'application/json'
};

connectionPreString = 'postgres://' + config.database.user +
  (config.database.password ? ':' + config.database.password : '') +
  '@' + config.database.host + ':' + config.database.port;

function log(color, args) {
  console.log(color + args[0].replace( /\$([0-9]*)/g, function (match, value) {
    return white + args[value].toString() + color;
  }) + normal);
}

function logError() { log(red, arguments); }
function logNotice() { log(blue, arguments); }
function logSuccess() { log(green, arguments); }

function createTables(database) {
  pg.connect(database.connectionString, function (error, client, done) {
    if (error) {
      return logError('Error connecting to database $1: $2', database.name, error);
    }

    var columns;
    var columnName;
    var columnNames;
    var query;
    var tableName;
    var type;

    for (tableName in database.config.tables) {
      if (database.config.tables.hasOwnProperty(tableName)) {
        columnNames = database.config.tables[tableName];
        columns = [];
        query = 'CREATE TABLE ' + tableName + ' (';

        for (columnName in columnNames) {
          if (columnNames.hasOwnProperty(columnName)) {
            type = columnNames[columnName];
            columns.push(columnName + ' ' + type);
          }
        }

        query += columns.join(', ') + ')';

        client.query(query, function (error, result) {
          if (error) {
            return logError('Error creating table $1 in database $2: $3', tableName, database.name, error);
          }

          logSuccess('Created table $1 in database $2', tableName, database.name);
        });
      }
    }

    client.on('drain', done);
  });
}

function createFixtures(database) {
  // TODO
}

// Setup and initialize databases
fs.readdirSync( 'databases' ).forEach(function (databaseConfigScript) {
  var connectionString;
  var database = {
    config: require('../databases/' + databaseConfigScript),
    name: path.basename(databaseConfigScript, '.json')
  };

  database.connectionString = connectionPreString + '/' + database.name;

  pg.connect(connectionPreString, function (error, client, done) {
    if (error) {
      return logError('Error connecting to database: $1', error);
    }

    // Check if the database exists
    client.query('SELECT 1 FROM pg_database WHERE datname = $1', [ database.name ], function (error, result) {
      if (error) {
        logError('Error looking for database $1: $2', database.name, error);
      }

      if (result.rowCount > 0) {
        done();
        return logNotice('Found existing database $1', database.name);
      }

      // Create the database if it doesn't exist
      var owner = database.config.owner || config.database.user;
      client.query('CREATE DATABASE ' + database.name + ' OWNER = ' + owner, function (error, result) {
        done();

        if (error) {
          return logError('Error creating database $1: $2', database.name, error);
        }

        logSuccess('Created database $1 with owner $2', database.name, owner);

        createTables(database);
      });
    });
  });

  databases[database.name] = database;
});

// Start HTTP server and listening service
http.createServer(function (request, response) {
  var databaseName;
  var recordId;
  var tableName;
  var url = request.url.split('/');

  databaseName = url[1];
  tableName = url[2];
  recordId = url[3];

  // TODO: Return "403 Forbidden" if permission check fails

  if (!databases.hasOwnProperty(databaseName) || !databases[databaseName].hasOwnProperty('config')) {
    response.writeHead(404);
    return response.end('Database "' + databaseName + '" not found');
  }

  var database = databases[databaseName];
  if (!database.config.hasOwnProperty('tables') || !database.config.tables.hasOwnProperty(tableName)) {
    response.writeHead(404);
    return response.end('Database table not found');
  }

  // GET resources     list     List the URIs and perhaps other details
  // PUT resources     replace  Replace the entire collection
  // POST resources    create   Create a new entry in the collection
  // DELETE resources  clear    Delete the entire collection
  // GET resource      get      Retrieve a representation of the resource
  // PUT resource      update   Replace the addressed resource (or create if null)
  // DELETE resource   delete   Delete the addressed resource

  var data;
  var params = [];
  var query;

  query = 'SELECT * FROM ' + tableName;

  pg.connect(database.connectionString, function (error, client, done) {
    if (error) {
      response.writeHead(500, headers);
      return response.end({ error: 'Error connecting to database: ' + error});
    }

    client.query(query, params, function (error, result) {
      if (error) {
        response.writeHead(500, headers);
        return response.end({ error: 'Error running query: ' + error });
      }

      data = JSON.stringify(result.rows);

      response.writeHead(200, headers);
      response.end(data);

      done();
    });
  });
}).listen(config.port, config.host);

console.log('Server running at http://' + config.host + ':' + config.port);
