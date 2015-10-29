var Spreadsheet = require('edit-google-spreadsheet');
var config = require('./config');
var _ = require('lodash');
var fs = require('fs');
var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;
var spreadsheetManager = require('./lib/spreadsheet-manager');

var rosterData = JSON.parse(fs.readFileSync('data/roster.json', 'utf8'));
var attendanceData = JSON.parse(fs.readFileSync('data/attendance.json', 'utf8'));

var fieldMappings = _.invert(rosterData[0]);
rosterData.shift();

var rosterFormatted = _.map(rosterData, function(d) {
    return [ d[fieldMappings["last_name"]], d[fieldMappings["first_name"]], d[fieldMappings["gender"]], d[fieldMappings["person_birthdate"]],
             d[fieldMappings["person_email"]], d[fieldMappings["home_phone"]], d[fieldMappings["mobile_phone"]],
             d[fieldMappings["address"]], d[fieldMappings["city"]], d[fieldMappings["state"]], d[fieldMappings["postal_code"]],
             d[fieldMappings["record_status"]], d[fieldMappings["member_role"]]];
});

var activeRoster = _.filter(rosterFormatted, function(d) {
    return d[11] == "Active" && (d[12] == "Member" || d[12].indexOf('Leader') > -1);
});

var inActiveRoster = _.filter(rosterFormatted, function(d) {
    return d[11] == "Inactive";
});

var oauth2Client = new OAuth2Client(config.client_id, config.client_secret, 'http://www.myauthorizedredirecturl.com');

oauth2Client.setCredentials({
  access_token: config.access_token,
  refresh_token: config.refresh_token
});

var manager = new spreadsheetManager(oauth2Client);
manager.prepSheet('Arena Test 1', config.template_spreadsheet_id)
.then(function(sheetData) {
    writeData(sheetData.spreadsheetId, sheetData.worksheets['Roster'], activeRoster);
    writeData(sheetData.spreadsheetId, sheetData.worksheets['Inactive'], inActiveRoster);
    writeData(sheetData.spreadsheetId, sheetData.worksheets['Attendance'], getAttendanceData(attendanceData));
}).catch(function(err){
    console.log(err);
});

function writeData(spreadsheetId, worksheetId, data) {
  Spreadsheet.load({
    debug: true,
    spreadsheetId: spreadsheetId,
    worksheetId: worksheetId,

    // OR 3. OAuth2 (See get_oauth2_permissions.js)
    oauth2: {
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token
    }
  }, function sheetReady(err, spreadsheet) {
      spreadsheet.add(data);

      spreadsheet.send(function(err) {
        if(err) throw err;
      });
  });
}

function getAttendanceData(rawData) {
  for(var i=9; i<= 20; i++){
      var dirtyDate = rawData[0][i.toString()];
      rawData[0][i.toString()] = dirtyDate.substring(0, dirtyDate.length - 2);
  }

  var attenanceFormatted = _.map(rawData, function(d) {
      return [ d["0"], d["20"], d["19"], d["18"], d["17"], d["16"], d["15"], d["14"], d["13"], d["12"], d["11"], d["10"], d["9"] ];
  });

  return attenanceFormatted;
 }
