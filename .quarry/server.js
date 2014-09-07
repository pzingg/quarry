// Library requirements
var fs   = require('fs');
var http = require('http');
var path = require('path');
var pg   = require('pg');
var util = require('util');

// Color shell strings
var blue   = '\033[0;34m';
var green  = '\033[0;32m';
var normal = '\033[0;m';
var purple = '\033[0;35m';
var red    = '\033[0;31m';
var white  = '\033[1;37m';
var yellow = '\033[0;33m';

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

function createTables(database) {
  if (!database.config.hasOwnProperty('tables') || database.config.tables.length < 1) {
    return logNotice('No tables found for database $1', database.name);
  }

  pg.connect(database.connectionString, function (error, client, done) {
    if (error) {
      logError('Error connecting to database $1', database.name);
      return console.log(error.toString());
    }

    for (var tableName in database.config.tables) {
      if (database.config.tables.hasOwnProperty(tableName)) {
        var columnNames = database.config.tables[tableName];
        var columns = [];
        var query = 'CREATE TABLE ' + tableName + ' (';
        var type;

        for (var columnName in columnNames) {
          if (columnNames.hasOwnProperty(columnName)) {
            type = columnNames[columnName];
            columns.push(columnName + ' ' + type);
          }
        }

        query += columns.join(', ') + ')';

        (function (_tableName) {
          client.query(query, function (error, result) {
            if (error) {
              logError('Error creating table $1 in database $2', _tableName, database.name);
              return console.log(error.toString());
            }

            logSuccess('Created table $1 in database $2', _tableName, database.name);

            if (!database.config.hasOwnProperty('fixtures') || !database.config.fixtures.hasOwnProperty(_tableName)) {
              return logNotice('No $1 fixture data found for database $2', _tableName, database.name);
            }

            logInfo('Inserting $1 fixtures in database $2', _tableName, database.name);

            database.config.fixtures[_tableName].forEach(function (fixture) {
              var values = [];
              var valueVars = [];

              columns = [];

              query = 'INSERT INTO ' + _tableName + ' (';
              for (columnName in fixture) {
                if (fixture.hasOwnProperty(columnName)) {
                  columns.push(columnName);
                  values.push(fixture[columnName]);
                  valueVars.push('$' + (valueVars.length + 1));
                }
              }

              query += columns.join(', ') + ') VALUES (' + valueVars.join(', ') + ')';

              client.query(query, values, function (error, result) {
                if (error) {
                  logError('Error inserting fixture');
                  return console.log(error.toString());
                }
              });
            });
          });
        })(tableName);
      }
    }

    client.on('drain', function () {
      logSuccess('Finished adding tables and fixtures');
      done();
    });
  });
}

function log(color, args) {
  console.log(color + args[0].replace(/\$([0-9]*)/g, function (match, value) {
    return white + args[value].toString() + color;
  }) + normal);
}

function logError()   { log(red,    arguments || []); }
function logInfo()    { log(purple, arguments || []); }
function logNotice()  { log(blue,   arguments || []); }
function logSuccess() { log(green,  arguments || []); }
function logWarning() { log(yellow, arguments || []); }

function startServer() {
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

    // GET resources     list      List the URIs and perhaps other details
    // PUT resources     replace   Replace the entire collection
    // POST resources    create    Create a new entry in the collection
    // DELETE resources  clear     Delete the entire collection
    // GET resource      retrieve  Retrieve a representation of the resource
    // PUT resource      update    Replace the addressed resource (or create if null)
    // DELETE resource   delete    Delete the addressed resource

    var data;
    var params = [];
    var query;

    query = 'SELECT * FROM ' + tableName;

    pg.connect(database.connectionString, function (error, client, done) {
      if (error) {
        response.writeHead(500, headers);
        return response.end({ error: 'Error connecting to database: ' + error });
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
      logError('Error connecting to Postgres');
      return console.log(error.toString());
    }

    // Check if the database exists
    client.query('SELECT 1 FROM pg_database WHERE datname = $1', [ database.name ], function (error, result) {
      if (error) {
        logError('Error connecting to database $1', database.name);
        return console.log(error.toString());
      }

      if (result.rowCount > 0) {
        done();
        return logNotice('Found database $1', database.name);
      }

      // Create the database if it doesn't exist
      var owner = database.config.owner || config.database.user;
      client.query('CREATE DATABASE ' + database.name + ' OWNER = ' + owner, function (error, result) {
        if (error) {
          logError('Error creating database $1', database.name);
          return console.log(error.toString);
        }

        logSuccess('Created database $1', database.name);
        done();

        createTables(database);
      });
    });
  });

  databases[database.name] = database;
});
