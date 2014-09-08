module.exports = {
  tables: {
    cats: {
      columns: {
        id   : 'serial',
        age  : 'integer NOT NULL',
        name : 'text NOT NULL'
      },

      fixtures: [
        { name: 'Baron', age: 8 },
        { name: 'Mocha', age: 6 },
        { name: 'Ping',  age: 4 }
      ]
    },

    users: {
      columns: {
        id       : 'serial',
        email    : 'text NOT NULL',
        name     : 'text NOT NULL',
        password : 'text NOT NULL'
      },

      fixtures: [
        { name: 'Jon',   email: 'jon@forisha.com',   password: 'jonpw' },
        { name: 'Josh',  email: 'josh@forisha.com',  password: 'joshpw' },
        { name: 'Kathy', email: 'kathy@forisha.com', password: 'kathypw' },
        { name: 'Tom',   email: 'tom@forisha.com',   password: 'tompw' }
      ],

      allow: { // create, delete, deleteAll, find, findAll, replaceAll, update
        findAll: function ( request ) {
          console.log( 'findAll request:', request );
        }
      }
    }
  }
};
