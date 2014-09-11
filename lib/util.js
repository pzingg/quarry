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

module.exports = {
  log: function (color, args) {
    console.log(color + args[0].replace(/\$([0-9]*)/g, function (match, value) {
      return white + args[value].toString() + color;
    }) + normal);
  },

  logError: function () {
    this.log(red, arguments);
  },

  logInfo: function () {
    this.log(purple, arguments);
  },

  logNotice: function () {
    this.log(blue, arguments);
  },

  logSuccess: function () {
    this.log(green, arguments);
  },

  logWarning: function () {
    this.log(yellow, arguments);
  },

  singularize: function (pluralString) {
    var replacements = [
      [/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$/i, '$1$2sis'],
      [/([^aeiouy]|qu)ies$/i, '$1y'],
      [/([^f])ves$/i, '$1fe'],
      [/([lr])ves$/i, '$1f'],
      [/([ti])a$/i, '$1um'],
      [/(^analys)es$/i, '$1is'],
      [/(alias|status)es$/i, '$1'],
      [/(bus)es$/i, '$1'],
      [/(children)$/i, 'child'],
      [/(cris|ax|test)es$/i, '$1is'],
      [/(database)s$/i, '$1'],
      [/(ive)s$/i, '$1'],
      [/(m)ovies$/i, '$1ovie'],
      [/(matri)ces$/i, '$1x'],
      [/(men)$/i, 'man'],
      [/(m|l)ice$/i, '$1ouse'],
      [/(o)es$/i, '$1'],
      [/(octop|vir)i$/i, '$1us'],
      [/(people)$/i, 'person'],
      [/(quiz)zes$/i, '$1'],
      [/(sexes)$/i, 'sex'],
      [/(shoe)s$/i, '$1'],
      [/(vert|ind)ices$/i, '$1ex'],
      [/(x|ch|ss|sh)es$/i, '$1'],
      [/^(ox)en/i, '$1'],
      [/s$/i, '']
    ];

    for (var i = 0; i < replacements.length; i++) {
      if (pluralString.match(replacements[i][0])) {
        return pluralString.replace(replacements[i][0], replacements[i][1]);
      }
    }

    return pluralString;
  }
};
