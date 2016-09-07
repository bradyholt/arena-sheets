"use strict";

let fs = require('fs');

let logger = require('winston');
let Moment = require('moment');
let argv = require('minimist')(process.argv.slice(2));
let tabletojson = require('tabletojson');
let google = require('googleapis');
let OAuth2Client = google.auth.OAuth2;
let _ = require('lodash');

let config = require('./config/app');
let scraperWraper = require('./lib/scraper-wrapper');
let arenaDataManager = require('./lib/arena-data-manager');

let SheetsManager = require('./lib/sheets-manager');
let SheetsEditor = require('./lib/sheets-editor');

const DATA_PATH = "data/";
const LOG_PATH = "log/";
const KEEP_MAX_CONTACT_QUEUE_RECORDS = 100;
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
        { reason: "Member Absent 2 Weeks", "filter": { isMember: true, lastPresentWeeksAgo: 2} },
        { reason: "Member Absent 1 Months", "filter": { isMember: true, lastPresentWeeksAgo: 4} },
        { reason: "Member Absent 2 Months", "filter": { isMember: true, lastPresentWeeksAgo: 8} }
    ]
};

var logFileName = new Moment().format("YYYYMMDD_HHmmss") + ".log";
fs.existsSync(LOG_PATH) || fs.mkdirSync(LOG_PATH);
logger.add(logger.transports.File, { filename: LOG_PATH + logFileName });

function scapeData() {
    logger.info("Will scrape data...");
    return scraperWraper.startScrape({
        data_path: DATA_PATH,
        class_id: argv.class_id,
        scrape_proxy: config.scrape_proxy
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
    let sheetsManager = new SheetsManager(oauth2Client);
    let classes = require('./' + DATA_PATH + 'classes.json');

    let oauth2 = {
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: config.refresh_token
    };
    
    var p = Promise.resolve();    
    sheetsManager.init().then(function(){
        
        //handle each class one at a time
        classes.forEach(function(currentClass){
            
            if (!!argv.class_id && currentClass.id != argv.class_id) {
                return;
            }
            
            p = p.then(function(){
                logger.info("Done updating class spreadsheet.", { class_id: currentClass.id });
                return updateClassSheet(sheetsManager, oauth2, currentClass);
            }).catch(function(reason){
                logger.error("Error when updating class spreadsheet (but will continue on with next class)", { class_id: currentClass.id });
                return updateClassSheet(sheetsManager, oauth2, currentClass);
            });
        });
    });
}

function updateClassSheet(sheetsManager, oauth2, currentClass) {
    logger.info("Starting sheets update", { class_id: currentClass.id });

    let promise = new Promise(function(resolve, reject) {
        
        try {
            let classData = arenaDataManager.readData(DATA_PATH, currentClass.id);

            if (!classData.roster){
                logger.info("Roster data not available; will skip class", { class_id: currentClass.id });
                resolve(currentClass);
                return;
            } else if (!classData.roster){
                logger.info("Attendance data not available; will skip class", { class_id: currentClass.id });
                resolve(currentClass);
                return;
            }

            let lastestAttendanceDate = classData.attendance.dates[0];
            let activeRoster = _.filter(classData.roster, function(d) {
                return d.isActive;
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

            logger.info("Preparing spreadsheet for update", { class_id: currentClass.id });

            sheetsManager.prepSheet( {
                name: currentClass.name,
                templateId: config.template_spreadsheet_id,
                worksheets: WORKSHEETS,
                debug: (argv.trace || false)
            }).then(function(sheetMeta) {
                    let editor = new SheetsEditor(oauth2, currentClass.id, sheetMeta, {
                        debug: (argv.trace || false)
                    });
                        let contactQueueUpdate = editor.prependWorksheet('Contact Queue', contactQueue, {
                            dataHasHeader: true,
                            colCountMin: 9,
                            skipIfFirstRowFirstCellValueEquals: lastestAttendanceDate,
                        });
                       
                        let membersUpdate = editor.overwriteWorksheet('Members', members);
                        let visitorsUpdate = editor.overwriteWorksheet('Visitors', visitors);
                        let attendanceUpdate = editor.overwriteWorksheet('Attendance', attendance);
                        let emailListsUpdate = editor.overwriteWorksheet('Email Lists', emailLists);
                        
                        Promise.all([contactQueueUpdate, membersUpdate, visitorsUpdate, attendanceUpdate, emailListsUpdate])
                            .then(function(){
                                resolve(currentClass); 
                            }, function(err) {
                                reject(err);
                            });                    
            }).catch(function(err) {
                logger.error("Error when preparing spreadsheet", { class_id: currentClass.id, error: err.stack });
                reject(err);
            });
        } catch(e) {
            logger.error("Error on sheets update", { class_id: currentClass.id, error: e.stack });
            reject(e);
        }
   });
   
   return promise;
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

if (argv.help == true || _.includes(argv._, 'help')){
    console.log("usage: node arena-sheets.js [options]\n");
    console.log("OPTIONS:");
    console.log("     --no-scrape       Do not scrape Arena; only process /data directory and update sheets");
    console.log("     --no-sheets       Do not update Google Sheets; only scrape Arena data");
    console.log("     --class_id id     Only process a single class");
    console.log("     --trace           Output additional debug logging to console");
} else if (argv.scrape == false){
    updateSheets();
} else if (argv.sheets == false){
    scapeData();
} else {
    scapeData().then(function(){
        updateSheets();
    });
}
