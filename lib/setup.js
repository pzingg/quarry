module.exports = {
  createTables: function (database) {
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
};
