module.exports = function (config) {

  // Library requirements
  var fs   = require('fs');
  var http = require('http');
  var path = require('path');
  var pg   = require('pg');
  var util = require('util');

  // Shell color strings
  var normal = '\033[0;m';
  var gray   = '\033[1;30m';
  var red    = '\033[0;31m';
  var green  = '\033[0;32m';
  var yellow = '\033[0;33m';
  var blue   = '\033[0;34m';
  var purple = '\033[0;35m';
  var cyan   = '\033[0;36m';
  var white  = '\033[1;37m';

  // App-specific variables
  var connectionPreString;
  var databases = {};
  var headers = {
    'Access-Control-Allow-Headers': [ 'X-Requested-With' ],
    'Access-Control-Allow-Origin': config.hasOwnProperty('allowOrigin') ? config.allowOrigin : '*',
    'Content-Type': 'application/json'
  };

  connectionPreString = 'postgres://' + config.connection.user +
    (config.connection.password ? ':' + config.connection.password : '') +
    '@' + config.connection.host + ':' + config.connection.port;

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
          var table = database.config.tables[tableName];
          var columns = [];
          var query = 'CREATE TABLE ' + tableName + ' (';
          var type;

          for (var columnName in table.columns) {
            if (table.columns.hasOwnProperty(columnName)) {
              type = table.columns[columnName];
              columns.push(columnName + ' ' + type);
            }
          }

          query += columns.join(', ') + ')';

          (function (_tableName, _table) {
            client.query(query, function (error, result) {
              if (error) {
                logError('Error creating table $1:$2', database.name, _tableName);
                return console.log(error.toString());
              }

              logSuccess('Created table $1:$2', database.name, _tableName);

              if (!table.hasOwnProperty('fixtures')) {
                return logNotice('No fixture data found for $1:$2', database.name, _tableName);
              }

              logInfo('Inserting fixtures for $1:$2', database.name, _tableName);

              _table.fixtures.forEach(function (fixture) {
                var values = [];
                var valueVars = [];

                columns = [];

                query = 'INSERT INTO ' + _tableName + ' (';
                for (var columnName in fixture) {
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
          })(tableName, table);
        }
      }

      client.on('drain', function () {
        done();
        startServer();
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

  function respond(response, status, data) {
    response.writeHead(status, headers);
    response.end(JSON.stringify(data));
  }

  function startServer() {
    http.createServer(function (request, response) {
      var database;
      var databaseName;
      var recordId;
      var table;
      var tableName;
      var url = request.url.split('/');

      databaseName = url[1];
      tableName = url[2];
      recordId = url[3];

      // Return "404 Not Found" if the database is not defined
      if (!databases.hasOwnProperty(databaseName) || !databases[databaseName].hasOwnProperty('config')) {
        return respond(response, 404, { error: 'Database "' + databaseName + '" not found' });
      }
      database = databases[databaseName];

      // Return "404 Not Found" if the table is not defined
      if (!database.config.hasOwnProperty('tables') || !database.config.tables.hasOwnProperty(tableName)) {
        return respond(response, 404, { error: 'Database table "' + tableName + '" not found' });
      }
      table = database.config.tables[tableName];

      pg.connect(database.connectionString, function (error, client, done) {
        var action;
        var data;
        var params = [];
        var query;

        // GET     /resources      findAll     List the URIs and perhaps other details
        // PUT     /resources      replaceAll  Replace the entire collection
        // POST    /resources      create      Create a new entry in the collection
        // DELETE  /resources      deleteAll   Delete the entire collection
        // GET     /resources/:id  find        Retrieve a representation of the resource
        // PUT     /resources/:id  update      Replace the addressed resource (or create if null)
        // DELETE  /resources/:id  delete      Delete the addressed resource

        switch (request.method) {
          case 'DELETE':
            action = recordId ? 'delete' : 'deleteAll';
            break;

          case 'GET':
            action = recordId ? 'find' : 'findAll';
            break;

          case 'PUT':
            action = recordId ? 'update' : 'replaceAll';
            break;

          case 'POST':
            if (!recordId) {
              action = 'create';
              break;
            }

          default:
            return respond(response, 405, { error: 'Method and request do not form a valid action' });
        }

        // Return "403 Forbidden" if the action is not allowed
        if (
          !table.hasOwnProperty('allow') ||
          !table.allow.hasOwnProperty(action) ||
          (typeof table.allow[action] === 'function' ? !table.allow[action](request) : !table.allow[action])
        ) {
          return respond(response, 403, { error: 'Forbidden' });
        }

        switch (action) {
          case 'find':
            query = 'SELECT * FROM ' + tableName + ' WHERE id = $1';
            params.push(recordId);
            break;

          case 'findAll':
            query = 'SELECT * FROM ' + tableName;
            break;

          // TODO: Add remaining actions
        }

        if (error) {
          response.writeHead(500, headers);
          return response.end(JSON.stringify({ error: 'Error connecting to database: ' + error }));
        }

        client.query(query, params, function (error, result) {
          if (error) {
            response.writeHead(500, headers);
            return response.end(JSON.stringify({ error: 'Error running query: ' + error }));
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
  config.databaseScripts.forEach(function (databaseScript) {
    var connectionString;
    var database = {
      config: require(process.cwd() + '/' + databaseScript),
      name: path.basename(databaseScript, '.js')
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
          logNotice('Found database $1', database.name);
          return startServer();
        }

        // Create the database if it doesn't exist
        var owner = database.config.owner || config.connection.user;
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
};
