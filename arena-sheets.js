"use strict";

let config = require('./config');
let _ = require('lodash');
let fs = require('fs');
let google = require('googleapis');
let OAuth2Client = google.auth.OAuth2;
let scraperWraper = require('./lib/scraper-wrapper');
let sheetsManager = require('./lib/sheets-manager');
let sheetsEditor = require('./lib/sheets-editor');
let arenaDataManager = require('./lib/arena-data-manager');
let dateHelper = require('./lib/date-helper');
var tabletojson = require('tabletojson');
let argv = require('minimist')(process.argv.slice(2));

const DATA_PATH = "data/";
const WORKSHEETS = [
    { name: 'Contact Queue', rows: 100, col: 15 },
    { name: 'Members', rows: 100, col: 15 },
    { name: 'Visitors', rows: 100, col: 15 },
    { name: 'Attendance', rows: 100, col: 15 },
    { name: 'Email Lists', rows: 100, col: 15 }
];
const DEFALT_CLASS_SETTINGS = {
    skip: false,
    contactQueueItems: [
        { reason: "First Time Visitor", "filter": { isMember: false, firstPresentWeeksAgo: 0} },
        { reason: "Member Absent 3 Weeks", "filter": { isMember: true, lastPresentWeeksAgo: 4} },
        { reason: "Member 2 Months", "filter": { isMember: true, lastPresentWeeksAgo: 9} }
    ]
};

function scapeData() {
    return scraperWraper.startScrape({
        data_path: DATA_PATH,
        class_id: argv.class_id
    });
}

function updateSheets(){
    return googleAuthenticate().then(function(oauth2Client){
        updateSheetsWithAuthentication(oauth2Client);
    })
}

function updateSheetsWithAuthentication(oauth2Client) {
    let spreadsheets = new sheetsManager(oauth2Client);
    let classes = require('./' + DATA_PATH + 'classes.json');

    let oauth2 = {
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: config.refresh_token
    };

    let todaysDate = new Date();
    let todaysDateAtMidnight = new Date(todaysDate.getFullYear(), todaysDate.getMonth(), todaysDate.getDate())
    let lastSundayDate = dateHelper.getLastSunday(todaysDateAtMidnight);
    let lastSundayDateFormatted = (lastSundayDate.getMonth() + 1) + "/" + (lastSundayDate.getDate()) + "/" + lastSundayDate.getFullYear();

    classes.forEach(function(currentClass){
        let _this = this;

        if (!!argv.class_id && currentClass.id != argv.class_id) {
            return;
        }

        try {
            let classData = arenaDataManager.readData(DATA_PATH, currentClass.id, lastSundayDate);

            if (!classData.roster || !classData.attendance // roster or attendance data not available
                || !_.contains(classData.attendance.dates, lastSundayDateFormatted) // data for last Sunday not available
            ) {
                //return;
            }

            let active = _.filter(classData.roster, function(d) {
                return d.isActive;
            });

            let classSettings = _.defaultsDeep((config.class_settings[currentClass.id] || {}), DEFALT_CLASS_SETTINGS);

            //go ahead and prep data before we talk to the Google API
            let contactQueue = arenaDataManager.getContactQueueData(active, lastSundayDateFormatted, classSettings.contactQueueItems);
            let members = arenaDataManager.getRosterData(active);
            let visitors = arenaDataManager.getVisitorData(active);
            let attendance = arenaDataManager.getAttendanceData(classData.attendance);
            let emailLists = arenaDataManager.getEmailLists(active);

            spreadsheets.prepSheet( {
                name: currentClass.name,
                templateId: config.template_spreadsheet_id,
                worksheets: WORKSHEETS
            }).then(function(sheetData) {
                    sheetsEditor.prependWorksheet(currentClass.id, sheetData, 'Contact Queue', oauth2, contactQueue, true, lastSundayDateFormatted, 100);
                    sheetsEditor.overwriteWorksheet(currentClass.id, sheetData, 'Members', oauth2, members);
                    sheetsEditor.overwriteWorksheet(currentClass.id, sheetData, 'Visitors', oauth2, visitors);
                    sheetsEditor.overwriteWorksheet(currentClass.id, sheetData, 'Attendance', oauth2, attendance);
                    sheetsEditor.overwriteWorksheet(currentClass.id, sheetData, 'Email Lists', oauth2, emailLists);

                }).catch(function(err) {
                    console.log(err);
                });
        } catch(e) {
            console.log("Error when processing data for classId: " + currentClass.id + " - " + e);
        }
    });
}

function googleAuthenticate(){
    let promise = new Promise(function(resolve, reject) {
        let oauth2Client = new OAuth2Client(config.client_id, config.client_secret);

        oauth2Client.setCredentials({
            access_token: config.access_token,
            refresh_token: config.refresh_token
        });

        try {
            oauth2Client.refreshAccessToken(function(err, tokens) {
                oauth2Client.setCredentials({
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token
                });

                resolve(oauth2Client);
            });
        } catch(e){
            reject(e);
        }
    });

    return promise;
}

if (argv.help == true || _.contains(argv._, 'help')){
    console.log("usage: node arena-sheets.js [options]\n");
    console.log("OPTIONS:");
    console.log("     --no-scrape       Do not scrape Arena; only process /data directory and update sheets");
    console.log("     --no-sheets       Do not update Google Sheets; only scrape Arena data");
    console.log("     --class_id id     Only process a single class");
} else if (argv.scrape == false){
    updateSheets();
} else if (argv.sheets == false){
    scapeData();
} else {
    scapeData().then(function(){
        updateSheets();
    }).catch(function(code){
        console.log('Scrape process exited with error code: ' + code);
    });
}
