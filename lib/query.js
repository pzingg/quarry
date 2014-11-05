/**
  MONGOOSE QUERY GENERATOR FROM HTTP URL
  e.g.
  var QueryPlugin = require(mongoose-query);
  schema.plugin(QueryPlugin);
  mymodel.Query(req.query, function(error, data) {
  });
  
  Original source:
  https://github.com/jupe/mongoose-query/
  
  Modified for PostgresSQL.
*/
var util = require('util');
var u_   = require('underscore');
var dbg  = true;  
  
var parseQuery = function(query, options) {
  /**
  
  reserved keys: q,t,f,s,sk,l,p
  
  [q=<query>][&t=<type>][&f=<fields>][&s=<order>][&sk=<skip>][&l=<limit>][&p=<populate>]
  q=<query> - restrict results by the specified JSON query
  t=<type> - find|findOne|count|aggregate|distinct..
  f=<set of fields> - specify the set of fields to include or exclude in each document (1 - include; 0 - exclude)
  s=<sort order> - specify the order in which to sort each specified field (1- ascending; -1 - descending)
  sk=<num results to skip> - specify the number of results to skip in the result set; useful for paging
  l=<limit> - specify the limit for the number of results (default is 1000)
  p=<populate> - specify the fields for populate
  
  alternative search conditions:
  "key={in}a,b"
  "At least one of these is in array"
  
  "key={nin}a,b"
  "Any of these values is not in array"
  
  "key={all}a,b"
  "All of these contains in array"
  
  "key={empty}-"
   "Field is empty or not exists"

  "key={!empty}-"
   "Field exists and is not empty"

  "key={mod}a,b"
  "Docs where key mod a is b"
  
  "key={gt}a"
  "Docs key is greater than a"
  
  "key={lt}a"
  "Docs key is lower than a"
  
  "key=a|b|c"
  "Docs where key type is Array, contains at least one of given value
  */
  
  var qy = {
    q: {},       // query
    t: 'find',   // count
    f: false,    // fields
    s: false,    // sort
    sk: false,   // skip
    pg: 1,       // page
    l: 1000      // limit
  }
  
  function toJSON(str) {
    var json = {};
    try {
      json = JSON.parse(str);
    } catch(e) {
      console.log('parsing error');
      json = {};
    } 
    return json;
  }
  
  function convertToBoolean(str) {
    if (str.toLowerCase() === "true" ||
        str.toLowerCase() === "yes" ) {
      return true;
    } else if (str.toLowerCase() === "false" ||
        str.toLowerCase() === "no" ) {
      return false;
    } else {
      return -1;
    }
  }
  
  function addCondition(key, cond) {
    if (cond['$or']) {
      if ( !qy.q.hasOwnProperties('$or') ) {
        qy.q['$or'] = [];
      }
      qy.q['$or'].push( {key: cond} );
    } else {
      qy.q[key] = cond;
    }
  }
  
  function parseDate(str) {
    //31/2/2010
    var m = str.match(/^(\d{1,2})[\/\s\.\-\,](\d{1,2})[\/\s\.\-\,](\d{4})$/);
    return (m) ? new Date(m[3], m[2]-1, m[1]) : null;
  }
  
  function parseDate2(str) {
    //2010/31/2
    var m = str.match(/^(\d{4})[\/\s\.\-\,](\d{1,2})[\/\s\.\-\,](\d{1,2})$/);
    return (m) ? new Date(m[1], m[2]-1, m[3]) : null;
  }
  
  function isStringValidDate(str) {
    if (util.isDate(new Date(str)))return true;
    if (util.isDate(parseDate(str)))return true;
    if (util.isDate(parseDate2(str)))return true;
    return false;
  }
   
  function walker(value, key, obj) {
    if (value !== null && typeof value === "object") {
      // Recurse into children
      u_.each(value, walker);
    } else if (typeof value === "string") {
      if (key === '$regex') {
        var m = value.match(/\/(.*)\//);
        if (m) {
          var options;
          if (obj['$options']) {
            m[2] = obj['$options']
            delete obj['$options'];
          }
          obj[key] = new RegExp(m[1], m[2]);
        }
      }
    }
  }
  
  function whereWalker(value, key, obj) {
    if (value !== null && typeof value === "object") {
      for (var op in value) {
        var sqlOp = false;
        var expectList = false;
        switch (op) {
        case '$ne':  sqlOp = '<>$'; break;
        case '$lt':  sqlOp = '<$'; break;
        case '$lte': sqlOp = '<=$'; break;
        case '$gt':  sqlOp = '>$'; break;
        case '$gte': sqlOp = '>=$'; break;
        case '$in':  sqlOp = ' IN '; expectList = true; break;
        case '$nin': sqlOp = ' NOT IN '; expectList = true; break;
        }
        if (sqlOp) {
          if (qy['WHERE']) qy['WHERE'] += ' AND ';
          if (expectList) {
            var pred = '';
            var ary = value[op];
            for (var i = ary.length-1; i >= 0; i--) {
              qy['WPARAMS'].push(ary[i]);
              var plen = qy['WPARAMS'].length;
              if (pred) pred += ',';
              pred += ('$' + plen);
            }
            pred = key + sqlOp + '(' + pred + ')';
            qy['WHERE'] += pred;
          } else {
            qy['WPARAMS'].push(value[op]);
            var plen = qy['WPARAMS'].length;
            var pred = key + sqlOp + plen; 
            qy['WHERE'] += pred;
          }
          break;
        } 
      }
      // Recurse into children
      // u_.each(value, walker);
    } else {
      if (key[0] == '$') {
        switch (key) {
        case '$or':
          break;
        }
      } else {
        // field == value
        if (qy['WHERE']) qy['WHERE'] += ' AND ';
        qy['WPARAMS'].push(value);
        var plen = qy['WPARAMS'].length;
        var pred = key + '=$' + plen; 
        qy['WHERE'] += pred;
      }
    }
  }
  
  function generateSql() {
    if (qy.l) {
      qy['LIMIT'] = ' LIMIT ' + qy.l;
    }
    if (qy.sk) {
      qy['OFFSET'] = ' OFFSET ' + qy.sk;
    } else if (qy.pg && qy.l) {
      qy['OFFSET'] = ' OFFSET ' + ((qy.pg-1)*qy.l);
    }
    if (qy.s) {
      qy['ORDER'] = '';
      for (var key in qy.s) {
        if (qy['ORDER']) qy['ORDER'] += ', ';
        qy['ORDER'] += key;
        if (qy.s[key] < 0) qy['ORDER'] += ' DESC';
      }
      qy['ORDER'] = ' ORDER BY ' + qy['ORDER'];
    }
    if (qy.q) {
      qy['WHERE'] = '';
      qy['WPARAMS'] = [];
      u_.each(qy.q, whereWalker);
      qy['WHERE'] = ' WHERE ' + qy['WHERE'];
    }
  }
  
  if (options.max_results) {
    var mr = parseInt(options.max_results);
    if (mr > 0) qy.l = mr;
  }
  for (var key in query) {
    switch (key) {
    case 'q':
    case 'where':
      qy.q = toJSON(decodeURIComponent(query[key]));
      u_.each(qy.q, walker);
      break;
    case 's': 
    case 'sort':
      qy.s = toJSON(query[key]); 
      break;
    case 'sk': 
    case 'skip': 
    case 'offset': 
      qy.sk = parseInt(query[key]); 
      break;
    case 'pg':
    case 'page':
      qy.pg = parseInt(query[key]); 
      break;
    case 'l':
    case 'limit':
    case 'max_results':
      qy.l = parseInt(query[key]); 
      break;
    case 'f': 
    case 'fields':
      qy.f = query[key]; break;
    default: 
      // parseParam(key, query[key]);
      break;
    }
  }
  
  generateSql();
  return qy;
}

module.exports = {
  getQuery: function(query, options) {
    if (dbg) {
      console.log(query);
      console.log(options);
    }
    var q = parseQuery(query, options);
    if (dbg) 
      console.log(q);
      
    return q;
  }
};
