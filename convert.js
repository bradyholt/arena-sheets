var tabletojson = require('tabletojson');

fs = require('fs')
fs.readFile('data/roster.html', 'utf8', function (err,data) {
  var tablesAsJson = tabletojson.convert(data);
  var rosterString = JSON.stringify(tablesAsJson[0], null, 4);
  fs.writeFile('data/roster.json', rosterString);
});

fs.readFile('data/attendance.html', 'utf8', function (err,data) {
  var tablesAsJson = tabletojson.convert(data);
  var rosterString = JSON.stringify(tablesAsJson[0], null, 4);
  fs.writeFile('data/attendance.json', rosterString);
});
