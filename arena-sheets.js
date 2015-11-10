"use strict";

let fs = require('fs');

let logger = require('winston');
let moment = require('moment');
let argv = require('minimist')(process.argv.slice(2));
let tabletojson = require('tabletojson');
let google = require('googleapis');
let OAuth2Client = google.auth.OAuth2;
let _ = require('lodash');

let config = require('./config');
let scraperWraper = require('./lib/scraper-wrapper');
let sheetsManager = require('./lib/sheets-manager');
let sheetsEditor = require('./lib/sheets-editor');
let arenaDataManager = require('./lib/arena-data-manager');
let dateHelper = require('./lib/date-helper');

const DATA_PATH = "data/";
const LOG_PATH = "log/";
const KEEP_MAX_CONTACT_QUEUE_RECORDS = 100;
const WORKSHEETS = [
    { name: 'Contact Queue', rows: 100, col: 15 },
    { name: 'Members', rows: 100, col: 15 },
    { name: 'Visitors', rows: 100, col: 15 },
    { name: 'Attendance', rows: 100, col: 15 },
    { name: 'Email Lists', rows: 100, col: 15 },
    { name: 'Inactive', rows: 100, col: 15 }
];
const DEFALT_CLASS_SETTINGS = {
    skip: false,
    contactQueueItems: [
        { reason: "First Time Visitor", "filter": { isMember: false, firstPresentWeeksAgo: 0} },
        { reason: "Member Absent 3 Weeks", "filter": { isMember: true, lastPresentWeeksAgo: 3} },
        { reason: "Member Absent 2 Months", "filter": { isMember: true, lastPresentWeeksAgo: 8} }
    ]
};

var logFileName = new moment().format("YYYYMMDD_HHmmss") + ".log";
fs.existsSync(LOG_PATH) || fs.mkdirSync(LOG_PATH);
logger.add(logger.transports.File, { filename: LOG_PATH + logFileName });

function scapeData() {
    logger.info("Will scrape data...");
    return scraperWraper.startScrape({
        data_path: DATA_PATH,
        class_id: argv.class_id
    }).catch(function(code){
        logger.error("Error returned from scrape process", {code: code});
    });
}

function updateSheets(){
    logger.info("Will update sheets...");
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

    classes.forEach(function(currentClass){
        let _this = this;

        if (!!argv.class_id && currentClass.id != argv.class_id) {
            return;
        }

        logger.info("Starting sheets update", { class_id: currentClass.id });

        try {
            let classData = arenaDataManager.readData(DATA_PATH, currentClass.id);

            if (!classData.roster){
                logger.info("Roster data not available; will skip class", { class_id: currentClass.id });
                return;
            } else if (!classData.roster){
                logger.info("Attedance data not available; will skip class", { class_id: currentClass.id });
                return;
            }

            let lastestAttendanceDate = classData.attendance.dates[0];
            let activeRoster = _.filter(classData.roster, function(d) {
                return d.isActive && !d.isActiveMIA;
            });

            let inactiveRoster = _.filter(classData.roster, function(d) {
                return !d.isActive || d.isActiveMIA;
            });

            logger.info("Loading class settings", { class_id: currentClass.id });
            let classSettings = _.defaultsDeep((config.class_settings[currentClass.id] || {}), DEFALT_CLASS_SETTINGS);

            //go ahead and prep data before we talk to the Google API
            logger.info("Generating formatted sheets data", { class_id: currentClass.id });
            let contactQueue = arenaDataManager.getFormattedContactQueue(activeRoster, lastestAttendanceDate, classSettings.contactQueueItems);
            let members = arenaDataManager.getFormattedMembers(activeRoster);
            let visitors = arenaDataManager.getFormattedVisitors(activeRoster);
            let attendance = arenaDataManager.getFormattedAttendance(classData.attendance);
            let emailLists = arenaDataManager.getFormattedEmailLists(activeRoster);
            let inactive = arenaDataManager.getFormattedInactive(inactiveRoster);

            logger.info("Preparing spreadsheet for update", { class_id: currentClass.id });

            spreadsheets.prepSheet( {
                name: currentClass.name,
                templateId: config.template_spreadsheet_id,
                worksheets: WORKSHEETS,
                debug: (argv.debug || false)
            }).then(function(sheetMeta) {
                    let editor = new sheetsEditor(oauth2, currentClass.id, sheetMeta, {
                        debug: (argv.debug || false)
                    });

                    editor.prependWorksheet('Contact Queue', contactQueue, {
                        dataHasHeader: true,
                        skipIfFirstRowFirstCellValueEquals: lastestAttendanceDate,
                        maxExistingRows: KEEP_MAX_CONTACT_QUEUE_RECORDS

                    });

                    editor.overwriteWorksheet('Members', members);
                    editor.overwriteWorksheet('Visitors', visitors);
                    editor.overwriteWorksheet('Attendance', attendance);
                    editor.overwriteWorksheet('Email Lists', emailLists);
                    editor.overwriteWorksheet('Inactive', inactive);
            }).catch(function(err) {
                logger.error("Error when preparing spreadsheet", { class_id: currentClass.id, error: err.stack });
            });
        } catch(e) {
            logger.error("Error on sheets update", { class_id: currentClass.id, error: e.stack });
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
            logger.info("Attempting to refresh Google API access token");
            oauth2Client.refreshAccessToken(function(err, tokens) {
                oauth2Client.setCredentials({
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token
                });

                logger.info("Google API access token successfully refreshed");
                resolve(oauth2Client);
            });
        } catch(e){
            logger.info("Failure when attempting to refresh Google API access token", { error: e });
            reject(e);
        }
    });

    return promise;
}

if (argv.class_id) {
    logger.info("Single class mode!", {class_id: argv.class_id});
}

if (argv.help == true || _.contains(argv._, 'help')){
    console.log("usage: node arena-sheets.js [options]\n");
    console.log("OPTIONS:");
    console.log("     --no-scrape       Do not scrape Arena; only process /data directory and update sheets");
    console.log("     --no-sheets       Do not update Google Sheets; only scrape Arena data");
    console.log("     --class_id id     Only process a single class");
    console.log("     --debug           Output additional debug logging to console");
} else if (argv.scrape == false){
    updateSheets();
} else if (argv.sheets == false){
    scapeData();
} else {
    scapeData().then(function(){
        updateSheets();
    });
}
