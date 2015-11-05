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
                var members = getRosterData(classData.roster, function(d) {
                    return d.status == "Active" && memberFilter(d.role);
                });

                var visitors = getRosterData(classData.roster, function(d) {
                    return d.status == "Active" && !memberFilter(d.role);
                });

                var inactive = getInactiveData(classData.roster);
                var attendance = getAttendanceData(classData.attendance);
                var emailLists = getEmailLists(classData.roster);

                writeData(sheetData.spreadsheetId, sheetData.worksheets['Roster'], members);
                writeData(sheetData.spreadsheetId, sheetData.worksheets['Visitors'], visitors);
                writeData(sheetData.spreadsheetId, sheetData.worksheets['Attendance'], attendance);
                writeData(sheetData.spreadsheetId, sheetData.worksheets['Email Lists'], emailLists);
                writeData(sheetData.spreadsheetId, sheetData.worksheets['Inactive'], inactive);

            }).catch(function(err) {
                console.log(err);
            });
    });
}

function readData(classId) {
    let rosterHtml = fs.readFileSync(config.scrape_data_path + '/' + classId + '_roster.html', 'utf8');
    let rosterData = tabletojson.convert(rosterHtml)[0];

    let fieldMappings = _.invert(rosterData[0]);
    rosterData.shift();

    let rosterFormatted = _.map(rosterData, function(d) {
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
            status: d[fieldMappings["date_inactive"]].length > 0 ? "Inactive" : d[fieldMappings["record_status"]],
            inactiveDate: (d[fieldMappings["date_inactive"]] && d[fieldMappings["date_inactive"]].length >= 8) ? d[fieldMappings["date_inactive"]].substring(0,d[fieldMappings["date_inactive"]].indexOf(' ')) : "",
        };
    });

    let attendanceHtml = fs.readFileSync(config.scrape_data_path + '/' + classId + '_attendance.html', 'utf8');
    let attendanceData = tabletojson.convert(attendanceHtml)[0];

    return {
        roster: rosterFormatted,
        attendance: attendanceData
    };
}

function writeData(spreadsheetId, worksheetId, data) {
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
        spreadsheet.add(data);

        spreadsheet.send(function(err) {
            if (err) throw err;
        });
    });
}

function memberFilter(role){
    return (role.indexOf('Visit') == -1 && !_.contains(['YVNA', 'YMNA'], role));
}

function getInactiveData(sourceData, filter) {
    var filtered = _.filter(sourceData, function(d) {
        return d.status == "Inactive";
    });

    var formatted = _.map(filtered, function(d){
        return [
            d.inactiveDate,
            d.lastName,
            d.firstName,
            d.gender,
            d.dob,
            d.email,
            d.cellPhone,
            d.homePhone,
            d.address,
            d.cityStateZip
        ];
    });

    var sorted = _.sortBy(formatted, function(d){
        var inactiveDateFormatted = '';
        if (d[0]){
          var dateGroups = d[0].match(/(\d+)\/(\d+)\/(\d+)/i);
          inactiveDateFormatted = `${dateGroups[3]}-${dateGroups[1]}-${dateGroups[2]}`;
        }

        return inactiveDateFormatted;
    }).reverse();

    //add header
    var header = ['Inactive As Of', 'Last Name', 'First Name', 'Gender', 'DOB', 'Email', 'Cell Phone', 'Mobile Phone', 'Address', 'City, State Zip'];
    sorted.unshift(header);

    return sorted;
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
    for (var i = 9; i <= 20; i++) {
        var dirtyDate = attendance[0][i.toString()];
        attendance[0][i.toString()] = dirtyDate.substring(0, dirtyDate.length - 2);
    }

    //ad
    var attenanceFormatted = _.map(attendance, function(d) {
        return [d["0"], d["20"], d["19"], d["18"], d["17"], d["16"], d["15"], d["14"], d["13"], d["12"], d["11"], d["10"], d["9"]];
    });

    return attenanceFormatted;
}

function getEmailLists(sourceData){
    var active = _.filter(sourceData, function(d){ return d.status == "Active" });

    var memberEmails = generateEmailList(active, function(d){ return memberFilter(d.role); });
    var visitorEmails = generateEmailList(active, function(d){ return !memberFilter(d.role); });
    var menEmails = generateEmailList(active, function(d){ return d.gender == "M"; });
    var womenEmails = generateEmailList(active, function(d){ return d.gender == "F" });

    return [
            ['Members', memberEmails],
            ['Visitors', visitorEmails],
            ['Men', menEmails],
            ['Women', womenEmails]
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
