"use strict";

let config = require('./config');
let _ = require('lodash');
let fs = require('fs');
let google = require('googleapis');
let OAuth2Client = google.auth.OAuth2;
let scraperWraper = require('./lib/scraper-wrapper');
let spreadsheetsManager = require('./lib/spreadsheets');
let spreadsheetEditor = require('edit-google-spreadsheet');
var tabletojson = require('tabletojson');


scraperWraper.startScrape({
    data_path: config.scrape_data_path
}, function(code){
    if (code != 0) {
        throw new Error('Scrape process exited with error code: ' + code);
    }

    startUpdateSheets();
});

function startUpdateSheets(){
    let oauth2Client = new OAuth2Client(config.client_id, config.client_secret, 'http://www.myauthorizedredirecturl.com');

    oauth2Client.setCredentials({
        access_token: config.access_token,
        refresh_token: config.refresh_token
    });

    oauth2Client.refreshAccessToken(function(err, tokens) {
        oauth2Client.setCredentials({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token
        });

        updateSheets(oauth2Client);
    });
}

function updateSheets(oauth2Client) {
    var spreadsheets = new spreadsheetsManager(oauth2Client);
    var classes = require('./data/classes.json');

    var worksheets = [
        { name: 'Roster', rows: 500, col: 15 },
        { name: 'Visitors', rows: 500, col: 15 },
        { name: 'Attendance', rows: 500, col: 15 },
        { name: 'Email Lists', rows: 500, col: 15 },
        { name: 'Inactive', rows: 500, col: 15 }
    ];

    classes.forEach(function(c){
        let classData = readData(c.id);
        spreadsheets.prepSheet( {
            name: c.name,
            templateId: config.template_spreadsheet_id,
            worksheets: worksheets
        }).then(function(sheetData) {
                var roster = getRosterData(classData.roster.data, function(status, role) {
                    return status == "Active" && (role == "Member" || role.indexOf('Leader') > -1);
                });

                var inactive = getRosterData(classData.roster.data, function(status, role) {
                    return status == "Inactive";
                });

                var attendance = getAttendanceData(classData.attendance);

                writeData(sheetData.spreadsheetId, sheetData.worksheets['Roster'], roster);
                writeData(sheetData.spreadsheetId, sheetData.worksheets['Inactive'], inactive);
                writeData(sheetData.spreadsheetId, sheetData.worksheets['Attendance'], attendance);

            }).catch(function(err) {
                console.log(err);
            });
    });
}

function readData(classId) {
    let rosterHtml = fs.readFileSync(config.scrape_data_path + '/' + classId + '_roster.html', 'utf8');
    let rosterData = tabletojson.convert(rosterHtml)[0];

    let attendanceHtml = fs.readFileSync(config.scrape_data_path + '/' + classId + '_attendance.html', 'utf8');
    let attendanceData = tabletojson.convert(attendanceHtml)[0];

    let fieldMappings = _.invert(rosterData[0]);
    rosterData.shift();

    let rosterFormatted = _.map(rosterData, function(d) {
        return [d[fieldMappings["last_name"]], d[fieldMappings["first_name"]], d[fieldMappings["gender"]], d[fieldMappings["person_birthdate"]],
            d[fieldMappings["person_email"]], d[fieldMappings["home_phone"]], d[fieldMappings["mobile_phone"]],
            d[fieldMappings["address"]], d[fieldMappings["city"]], d[fieldMappings["state"]], d[fieldMappings["postal_code"]],
            d[fieldMappings["record_status"]], d[fieldMappings["member_role"]]
        ];
    });
    return {
        roster: {
            fields: fieldMappings,
            data: rosterFormatted
        },
        attendance: attendanceData
    };
}

function writeData(spreadsheetId, worksheetId, data) {
    spreadsheetEditor.load({
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
            if (err) throw err;
        });
    });
}

function getRosterData(sourceData, filter) {
    return _.filter(sourceData, function(d) {
        return filter(d[11], d[12]);
    });
}

function getAttendanceData(sourceData) {
    for (var i = 9; i <= 20; i++) {
        var dirtyDate = sourceData[0][i.toString()];
        sourceData[0][i.toString()] = dirtyDate.substring(0, dirtyDate.length - 2);
    }

    var attenanceFormatted = _.map(sourceData, function(d) {
        return [d["0"], d["20"], d["19"], d["18"], d["17"], d["16"], d["15"], d["14"], d["13"], d["12"], d["11"], d["10"], d["9"]];
    });

    return attenanceFormatted;
}
