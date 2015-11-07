"use strict";

let config = require('./config');
let _ = require('lodash');
let fs = require('fs');
let google = require('googleapis');
let OAuth2Client = google.auth.OAuth2;
let scraperWraper = require('./lib/scraper-wrapper');
let spreadsheetsManager = require('./lib/spreadsheets');
let spreadsheetsHelper = require('./lib/spreadsheets-helper');
let dateHelper = require('./lib/date-helper');
var tabletojson = require('tabletojson');
let argv = require('minimist')(process.argv.slice(2));

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
        { name: 'Contact Queue', rows: 100, col: 15 },
        { name: 'Roster', rows: 100, col: 15 },
        { name: 'Visitors', rows: 100, col: 15 },
        { name: 'Attendance', rows: 100, col: 15 },
        { name: 'Email Lists', rows: 100, col: 15 }
    ];

    var oauth2 = {
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: config.refresh_token
    };

    classes.forEach(function(currentClass){
        let _this = this;

        if (!!argv.classId && currentClass.id != argv.classId) {
            return;
        }

        try {
            let classData = readData(currentClass.id);

            if (!classData.roster || !classData.attendance) {
                return;
            }

            //go ahead and prep data before we talk to the Google API
            var contactQueue = getContactQueueData(classData.roster);
            var members = getRosterData(classData.roster);
            var visitors = getVisitorData(classData.roster);
            var attendance = getAttendanceData(classData.attendance);
            var emailLists = getEmailLists(classData.roster);

            spreadsheets.prepSheet( {
                name: currentClass.name,
                templateId: config.template_spreadsheet_id,
                worksheets: worksheets
            }).then(function(sheetData) {
                    spreadsheetsHelper.prependWorksheet(currentClass.id, sheetData, 'Contact Queue', oauth2, contactQueue, true);
                    spreadsheetsHelper.updateWorksheet(currentClass.id, sheetData, 'Roster', oauth2, members);
                    spreadsheetsHelper.updateWorksheet(currentClass.id, sheetData, 'Visitors', oauth2, visitors);
                    spreadsheetsHelper.updateWorksheet(currentClass.id, sheetData, 'Attendance', oauth2, attendance);
                    spreadsheetsHelper.updateWorksheet(currentClass.id, sheetData, 'Email Lists', oauth2, emailLists);

                }).catch(function(err) {
                    console.log(err);
                });
        } catch(e) {
            console.log("Error when processing data for classId: " + currentClass.id + " - " + e);
        }
    });
}

function readData(classId) {
    let result = {
        roster: null,
        attendance: null
    };

    let attendanceHtml = fs.readFileSync(config.scrape_data_path + '/' + classId + '_attendance.html', 'utf8');
    let attendanceData = tabletojson.convert(attendanceHtml)[0];
    let attendanceMappedByFullName = {};

    if (attendanceData && attendanceData.length){
        result.attendance = {
            dates: [],
            records: []
        };

        var datesStartColumnIndex = 8;
        var datesEndColumnIndex = _.keys(attendanceData[0]).length - 2;
        var datesAvailableCount = (datesEndColumnIndex - datesStartColumnIndex);
        var dates = [];

        for (var i = datesEndColumnIndex; i >= datesStartColumnIndex; i--) {
            var dirtyDate = attendanceData[0][i.toString()];
            if (dirtyDate && dirtyDate.length) {
                dates.push(dirtyDate.substring(0, dirtyDate.length - 2));
            }
        }

        result.attendance.dates = dates;

        //remove header row
        attendanceData.shift();

        result.attendance.records = _.map(attendanceData, function(d) {
            var attendanceRecord = {
                fullName: d["0"],
                lastName: d["0"].substring(0, d["0"].indexOf(",")),
                firstName: d["0"].substring(d["0"].indexOf(",") + 1),
                firstPresent: d["5"],
                lastPresent: d["6"]
            };

            var dateIndex = 1;
            for (var i = datesEndColumnIndex; i >= datesStartColumnIndex; i--) {
                attendanceRecord[dateIndex.toString()] = d[i.toString()];
                dateIndex++;
            }

            attendanceMappedByFullName[attendanceRecord.fullName] = attendanceRecord;
            return attendanceRecord;
        });
    }

    let rosterHtml = fs.readFileSync(config.scrape_data_path + '/' + classId + '_roster.html', 'utf8');
    let rosterData = tabletojson.convert(rosterHtml)[0];

    if (rosterData && rosterData.length) {
        let fieldMappings = _.invert(rosterData[0]);

        //remove header row
        rosterData.shift();

        var todaysDate = new Date();
        var todaysDateAtMidnight = new Date(todaysDate.getFullYear(), todaysDate.getMonth(), todaysDate.getDate())
        var lastSundayDate = dateHelper.getLastSunday(todaysDateAtMidnight);

        result.roster = _.map(rosterData, function(d) {
            var rosterRecord = {
                fullName: d[fieldMappings["last_name"]] + ", " + d[fieldMappings["first_name"]],
                lastName: d[fieldMappings["last_name"]],
                firstName: d[fieldMappings["first_name"]],
                gender: (d[fieldMappings["gender"]] || "") == "0" ? "M" : "F",
                dob: dateHelper.stripTimeFromDateString(d[fieldMappings["person_birthdate"]]),
                email: d[fieldMappings["person_email"]],
                cellPhone: d[fieldMappings["mobile_phone"]],
                homePhone: d[fieldMappings["home_phone"]],
                address: d[fieldMappings["address"]],
                cityStateZip: (d[fieldMappings["city"]] || "") + ", " + (d[fieldMappings["state"]] || "") + " " + (d[fieldMappings["postal_code"]] || ""),
                dateAdded: d[fieldMappings["date_added"]],
                role: d[fieldMappings["member_role"]],
                isActive: d[fieldMappings["date_inactive"]].length > 0 ? false : ((d[fieldMappings["record_status"]] == "Active") ? true : false),
                isMember: (d[fieldMappings["member_role"]].indexOf('Visit') == -1 && !_.contains(['YVNA', 'YMNA'], d[fieldMappings["member_role"]])),
                firstPresent: null,
                firstPresentWeeksAgo: null,
                lastPresent: null,
                lastPresentWeeksAgo: null
            };

            if (attendanceMappedByFullName[rosterRecord.fullName]){
                var attendance = attendanceMappedByFullName[rosterRecord.fullName];
                if (attendance.firstPresent) {
                    rosterRecord.firstPresent = attendance.firstPresent;
                    rosterRecord.firstPresentWeeksAgo = dateHelper.getFullWeeksBetweenDates(new Date(attendance.firstPresent), lastSundayDate);
                }

                if (attendance.lastPresent) {
                    rosterRecord.lastPresent = attendance.lastPresent;
                    rosterRecord.lastPresentWeeksAgo = dateHelper.getFullWeeksBetweenDates(new Date(attendance.lastPresent), lastSundayDate);
                }
            }

            return rosterRecord;
        });
    }

    return result;
}

function getContactQueueData(sourceData){
    var active = _.filter(sourceData, function(d) {
        return d.isActive;
    });

    var todaysDate = new Date();
    var todaysDateAtMidnight = new Date(todaysDate.getFullYear(), todaysDate.getMonth(), todaysDate.getDate())
    var lastSundayDate = dateHelper.getLastSunday(todaysDateAtMidnight);
    var lastSundayDateFormatted = (lastSundayDate.getMonth() + 1) + "/" + (lastSundayDate.getDate() + 1) + "/" + lastSundayDate.getFullYear();

    var firstTimeVisitors = _.chain(active)
        .where({ 'isMember': false, 'firstPresentWeeksAgo': 0 })
        .map(function(visitor) {
            return [
                lastSundayDateFormatted,
                visitor.fullName,
                visitor.lastPresent,
                "First Time Visitor"
            ];
        })
        .value();

    var secondTimeVisitors = _.chain(active)
        .where({ 'isMember': false, 'firstPresentWeeksAgo': 1, 'lastPresentWeeksAgo': 0 })
        .map(function(visitor) {
            return [
                lastSundayDateFormatted,
                visitor.fullName,
                visitor.lastPresent,
                "Second Time Visitor"
            ];
        })
        .value();

    var memberAbsentTwoWeeks = _.chain(active)
        .where({ 'isMember': true, 'lastPresentWeeksAgo': 2 })
        .map(function(visitor) {
            return [
                lastSundayDateFormatted,
                visitor.fullName,
                visitor.lastPresent,
                "Member Absent 2 Weeks"
            ];
        })
        .value();

    var memberAbsentOneMonth = _.chain(active)
        .where({ 'isMember': true, 'lastPresentWeeksAgo': 4 })
        .map(function(visitor) {
            return [
                lastSundayDateFormatted,
                visitor.fullName,
                visitor.lastPresent,
                "Member Absent 1 Month"
            ];
        })
        .value();

    return firstTimeVisitors
        .concat(secondTimeVisitors)
        .concat(memberAbsentTwoWeeks)
        .concat(memberAbsentOneMonth);
}

function getRosterData(sourceData, filter) {
    var filtered = _.filter(sourceData, function(d) {
        return d.isActive && d.isMember;
    });

    var sorted = _.sortBy(filtered, function(d) {
        return d.lastName;
    });

    var formatted = _.map(sorted, function(d){
        return [
            d.lastName || "",
            d.firstName || "",
            d.gender || "",
            d.dob || "",
            d.email || "",
            d.cellPhone || "",
            d.homePhone || "",
            d.address || "",
            d.cityStateZip || "",
            d.role || "",
            d.lastPresent || ""
        ];
    });

    //add header
    var header = ['Last Name', 'First Name', 'Gender', 'DOB', 'Email', 'Cell Phone', 'Mobile Phone', 'Address', 'City, State Zip', 'Role', 'Last Present'];
    formatted.unshift(header);

    return formatted;
}

function getVisitorData(sourceData, filter) {
    var filtered = _.filter(sourceData, function(d) {
        return d.isActive && !d.isMember;
    });

    var sorted = _.sortByOrder(filtered, function(d) {
        var date = new Date(0);
        if (d.firstPresent){
            date = new Date(d.firstPresent)
        }
        return date;
    }, ['desc']);

    var formatted = _.map(sorted, function(d){
        var mapped = [
            d.firstPresent || "",
            d.lastPresent || "",
            d.lastName || "",
            d.firstName || "",
            d.gender || "",
            d.dob || "",
            d.email || "",
            d.cellPhone || "",
            d.homePhone || "",
            d.address || "",
            d.cityStateZip || "",
            d.role || ""
        ];

        return mapped;
    });

    //add header
    var header = ['First Visit', 'Last Visit', 'Last Name', 'First Name', 'Gender', 'DOB', 'Email', 'Cell Phone', 'Mobile Phone', 'Address', 'City, State Zip', 'Role'];
    formatted.unshift(header);

    return formatted;
}

function getAttendanceData(sourceData) {

    var formatted = _.map(sourceData.records, function(d) {
        var formattedRecord = [d.lastName, d.firstName, d.lastPresent];

        for(var i = 1; i <= sourceData.dates.length; i++){
            formattedRecord.push(d[i.toString()]);
        }

        return formattedRecord;
    });

    var header = ['Last Name', 'First Name', 'Last Present'].concat(sourceData.dates);
    formatted.unshift(header);

    return formatted;
}

function getEmailLists(sourceData){
    var padColumnsCount = 9;
    var activeWithEmail = _.filter(sourceData, function(d){ return d.isActive && d.email });

    var memberEmails = generateEmailList(activeWithEmail, function(d){ return d.isMember; });
    var visitorEmails = generateEmailList(activeWithEmail, function(d){ return !d.isMember; });
    var menEmails = generateEmailList(activeWithEmail, function(d){ return d.gender == "M"; });
    var womenEmails = generateEmailList(activeWithEmail, function(d){ return d.gender == "F" });

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

if (!argv.scrape){
    startUpdateSheets();
} else {
    startScrape();
}
