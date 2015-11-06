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


function startScrape() {
    scraperWraper.startScrape({
        data_path: config.scrape_data_path,
    }, function(code){
        if (code != 0) {
            throw new Error('Scrape process exited with error code: ' + code);
        }

        startUpdateSheets();
    });
}

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
        { name: 'Roster', rows: 100, col: 15 },
        { name: 'Visitors', rows: 100, col: 15 },
        { name: 'Attendance', rows: 100, col: 15 },
        { name: 'Email Lists', rows: 100, col: 15 }
    ];

    classes.forEach(function(currentClass){
        let _this = this;

        try {
            let classData = readData(currentClass.id);

            if (!classData.roster || !classData.attendance) {
                return;
            }

            //go ahead and prep data before we talk to the Google API
            var members = getRosterData(classData.roster, function(d) {
                return d.status == "Active" && memberFilter(d.role);
            });

            var visitors = getRosterData(classData.roster, function(d) {
                return d.status == "Active" && !memberFilter(d.role);
            });

            var attendance = getAttendanceData(classData.attendance);
            var emailLists = getEmailLists(classData.roster);

            spreadsheets.prepSheet( {
                name: currentClass.name,
                templateId: config.template_spreadsheet_id,
                worksheets: worksheets
            }).then(function(sheetData) {
                    writeData(currentClass.id, sheetData, 'Roster', members);
                    writeData(currentClass.id, sheetData, 'Visitors', visitors);
                    writeData(currentClass.id, sheetData, 'Attendance', attendance);
                    writeData(currentClass.id, sheetData, 'Email Lists', emailLists);

                }).catch(function(err) {
                    console.log(err);
                });
        } catch(e) {
            console.log("Error when processing data for classId: " + currentClass.id + " - " + e);
        }
    });
}

function readData(classId) {
    let rosterHtml = fs.readFileSync(config.scrape_data_path + '/' + classId + '_roster.html', 'utf8');
    let rosterData = tabletojson.convert(rosterHtml)[0];
    let result = {
        roster: null,
        attendance: null
    };

    if (rosterData && rosterData.length) {
        let fieldMappings = _.invert(rosterData[0]);
        rosterData.shift();

        result.roster = _.map(rosterData, function(d) {
            return {
                lastName: d[fieldMappings["last_name"]],
                firstName: d[fieldMappings["first_name"]],
                gender: (d[fieldMappings["gender"]] || "") == "0" ? "M" : "F",
                dob: (d[fieldMappings["person_birthdate"]] && d[fieldMappings["person_birthdate"]].length > 8) ? d[fieldMappings["person_birthdate"]].substring(0,d[fieldMappings["person_birthdate"]].indexOf(' ')) : "",
                email: d[fieldMappings["person_email"]],
                cellPhone: d[fieldMappings["mobile_phone"]],
                homePhone: d[fieldMappings["home_phone"]],
                address: d[fieldMappings["address"]],
                cityStateZip: (d[fieldMappings["city"]] || "") + ", " + (d[fieldMappings["state"]] || "") + " " + (d[fieldMappings["postal_code"]] || ""),
                role: d[fieldMappings["member_role"]],
                status: d[fieldMappings["date_inactive"]].length > 0 ? "Inactive" : d[fieldMappings["record_status"]    ]
            };
        });
    }

    let attendanceHtml = fs.readFileSync(config.scrape_data_path + '/' + classId + '_attendance.html', 'utf8');
    result.attendance = tabletojson.convert(attendanceHtml)[0];

    return result;
}

function writeData(classId, sheetData, worksheetName, data) {

    var spreadsheetId = sheetData.spreadsheetId;
    var worksheetId = sheetData.worksheets[worksheetName];

    if (!data.length || data.length == 1) {
        return;
    }

    var padRows = 10;
    var padColumns = 2;

    //pad extra empty rows and columns
    for(var i = 1; i <= padRows; i++){
        var padRow = _.fill(new Array(data[0].length), '');
        data.push(padRow);
    }

    data.forEach(function(d, idx){
        data[idx] = d.concat(_.fill(new Array(padColumns), ''));
    });

    spreadsheetEditor.load({
        debug: true,
        spreadsheetId: spreadsheetId,
        worksheetId: worksheetId,

        oauth2: {
            client_id: config.client_id,
            client_secret: config.client_secret,
            refresh_token: config.refresh_token
        }
    }, function sheetReady(err, spreadsheet) {

        spreadsheet.metadata({
          title: worksheetName,
          rowCount: data.length,
          colCount: data[0].length
        }, function(err, metadata){
            if (err) {
                console.log('Error when setting metadata data for classId:' + classId + ' (' + err + ')');
            } else {
                spreadsheet.add(data);
                spreadsheet.send(function(err) {
                    if (err) {
                        console.log('Error when writing data for classId:' + classId + ' (' + err + ')');
                    }
                });
            }
        });
    });
}

function memberFilter(role){
    return (role.indexOf('Visit') == -1 && !_.contains(['YVNA', 'YMNA'], role));
}

function getRosterData(sourceData, filter) {
    var filtered = _.filter(sourceData, filter);

    var sorted = _.sortBy(filtered, function(d) {
        return d.lastName;
    });

    var formatted = _.map(sorted, function(d){
        return [
            d.lastName,
            d.firstName,
            d.gender,
            d.dob,
            d.email,
            d.cellPhone,
            d.homePhone,
            d.address,
            d.cityStateZip,
            d.role
        ];
    });

    //add header
    var header = ['Last Name', 'First Name', 'Gender', 'DOB', 'Email', 'Cell Phone', 'Mobile Phone', 'Address', 'City, State Zip', 'Role'];
    formatted.unshift(header);

    return formatted;
}

function getAttendanceData(sourceData) {
    var attendance = sourceData;

    //add header with attendance dates
    // i.e.:  Name,	10/25/2015,	10/18/2015
    var datesStartColumnIndex = 8;
    var datesEndColumnIndex = _.keys(attendance[0]).length - 1;
    var datesAvailableCount = (datesEndColumnIndex - datesStartColumnIndex);

    for (var i = datesStartColumnIndex; i <= datesEndColumnIndex; i++) {
        var dirtyDate = attendance[0][i.toString()];
        if (dirtyDate && dirtyDate.length) {
            attendance[0][i.toString()] = dirtyDate.substring(0, dirtyDate.length - 2);
        }
    }

    //ad
    var attenanceFormatted = _.map(attendance, function(d) {
        var attendanceRecord = [d["0"]];

        for(var i = datesEndColumnIndex - 1; i >= datesStartColumnIndex; i--){
            attendanceRecord.push(d[i]);
        }

        return attendanceRecord;
    });

    return attenanceFormatted;
}

function getEmailLists(sourceData){
    var padColumnsCount = 9;
    var active = _.filter(sourceData, function(d){ return d.status == "Active" });

    var memberEmails = generateEmailList(active, function(d){ return memberFilter(d.role); });
    var visitorEmails = generateEmailList(active, function(d){ return !memberFilter(d.role); });
    var menEmails = generateEmailList(active, function(d){ return d.gender == "M"; });
    var womenEmails = generateEmailList(active, function(d){ return d.gender == "F" });

    var padColumns = _.fill(new Array(padColumnsCount), '');
    return [
            ['Members', memberEmails].concat(padColumns),
            ['Visitors', visitorEmails].concat(padColumns),
            ['Men', menEmails].concat(padColumns),
            ['Women', womenEmails].concat(padColumns)
    ];
}

function generateEmailList(source, filter){
    var filtered = _.filter(source, filter);
    var formatted = _.map(filtered, function(d) { return d.email; }).join(", ");
    return formatted;

}

if (_.contains(process.argv, '--no-scrape')){
    startUpdateSheets();
} else {
    startScrape();
}
