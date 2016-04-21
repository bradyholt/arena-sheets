"use strict";

let fs = require('fs');

let _ = require('lodash');
let logger = require('winston');
let tabletojson = require('tabletojson');

let dateHelper = require('./date-helper');

exports.readData = function(dataPath, classId, lastSundayDate) {
    let result = {
        roster: null,
        attendance: null
    };

    logger.info("Loading raw attendance data", {class_id: classId});
    let attendanceHtml = fs.readFileSync(dataPath + classId + '_attendance.html', 'utf8');
    logger.info("Converting attendance data", {class_id: classId});
    let attendanceData = tabletojson.convert(attendanceHtml)[0];
    let attendanceMappedByFullName = {};

    if (attendanceData && attendanceData.length){
        result.attendance = {
            dates: [],
            records: []
        };

        let datesStartColumnIndex = 8;
        let datesEndColumnIndex = _.keys(attendanceData[0]).length - 2;
        let firstDateWithDataEndColumnIndex = null;
        let dates = [];
        let gapDates = []; //attendance dates with no data

        logger.info("Will load and format attendance dates", {class_id: classId });

        //first find date with data
        for (let i = datesEndColumnIndex; i >= datesStartColumnIndex; i--) {
            
            let dirtyDate = attendanceData[0][i.toString()];
            let formattedDate = dirtyDate.substring(0, dirtyDate.lastIndexOf('/') + 5);
                
            let isDataForDate = _.some(attendanceData, function(d){
                return d[i] == "X";
            });

            if (firstDateWithDataEndColumnIndex) {
                // we already found start date so just add this date
                dates.push(formattedDate);
                
                if (!isDataForDate) {
                    gapDates.push(formattedDate);
                }
            } else if (isDataForDate) {
                // we don't already have a start date and this date has data so use it as the start
                firstDateWithDataEndColumnIndex = i;
                dates.push(formattedDate);
            }
        }
        
        logger.info("Attendance dates loaded", {class_id: classId, datesStartColumnIndex: datesStartColumnIndex, firstDateWithDataEndColumnIndex: firstDateWithDataEndColumnIndex, dates: dates, gapDates: gapDates});
        result.attendance.dates = dates;
        result.attendance.gapDates = gapDates;

        //remove header row
        attendanceData.shift();

        result.attendance.records = _.map(attendanceData, function(d) {
            let attendanceRecord = {
                fullName: d["0"],
                lastName: d["0"].substring(0, d["0"].indexOf(",")),
                firstName: d["0"].substring(d["0"].indexOf(",") + 2),
                firstPresent: d["5"],
                lastPresent: d["6"]
            };

            let dateIndex = 1;
            for (let i = firstDateWithDataEndColumnIndex; i >= datesStartColumnIndex; i--) {
                attendanceRecord[dateIndex.toString()] = d[i.toString()];
                dateIndex++;
            }

            attendanceMappedByFullName[attendanceRecord.fullName] = attendanceRecord;

            return attendanceRecord;
        });
    }

    logger.info("Loading raw roster data", {class_id: classId});
    let rosterHtml = fs.readFileSync(dataPath + classId + '_roster.html', 'utf8');
    logger.info("Converting attendance data", {class_id: classId});
    let rosterData = tabletojson.convert(rosterHtml)[0];

    if (rosterData && rosterData.length) {
        let fieldMappings = _.invert(rosterData[0]);

        //remove header row
        rosterData.shift();

        logger.info("Formatting roster data", {class_id: classId});
        result.roster = _.map(rosterData, function(d) {
            let rosterRecord = {
                fullName: d[fieldMappings["last_name"]] + ", " + d[fieldMappings["nick_name"]],
                lastName: d[fieldMappings["last_name"]],
                firstName: d[fieldMappings["nick_name"]],
                gender: (d[fieldMappings["gender"]] || "") == "0" ? "M" : "F",
                dob: dateHelper.stripTimeFromDateString(d[fieldMappings["person_birthdate"]]),
                email: d[fieldMappings["person_email"]],
                cellPhone: d[fieldMappings["mobile_phone"]],
                homePhone: d[fieldMappings["home_phone"]],
                address: d[fieldMappings["address"]],
                cityStateZip: (d[fieldMappings["city"]] || "") + ", " + (d[fieldMappings["state"]] || "") + " " + (d[fieldMappings["postal_code"]] || ""),
                role: d[fieldMappings["member_role"]],
                isActive: d[fieldMappings["date_inactive"]].length > 0 ? false : ((d[fieldMappings["record_status"]] == "Active") ? true : false),
                isMember: (d[fieldMappings["member_role"]].indexOf('Visit') == -1 && !_.includes(['YVNA', 'YMNA'], d[fieldMappings["member_role"]])),
                dateInactive: dateHelper.stripTimeFromDateString(d[fieldMappings["date_inactive"]]),
                isActiveMIA: false,
                isActiveMIADate: null,
                firstPresent: null,
                firstPresentWeeksAgo: null,
                lastPresent: null,
                lastPresentWeeksAgo: null
            };

            let latestAttendanceDate = new Date(result.attendance.dates[0]);
            let gapDates= _.map(result.attendance.gapDates, function(d){
                return new Date(d);
            });
            
            if (attendanceMappedByFullName[rosterRecord.fullName]){
                let attendance = attendanceMappedByFullName[rosterRecord.fullName];
                if (attendance.firstPresent) {
                    rosterRecord.firstPresent = attendance.firstPresent;
                    rosterRecord.firstPresentWeeksAgo = dateHelper.getFullWeeksBetweenDatesAndExcludeGapDates(new Date(attendance.firstPresent), latestAttendanceDate, gapDates);
                }

                if (attendance.lastPresent) {
                    rosterRecord.lastPresent = attendance.lastPresent;
                    rosterRecord.lastPresentWeeksAgo = dateHelper.getFullWeeksBetweenDatesAndExcludeGapDates(new Date(attendance.lastPresent), latestAttendanceDate, gapDates);
                }
            } else if (rosterRecord.isActive) {
                //no attendance history available for active record so mark as MIA
                rosterRecord.isActiveMIA = true;
                //use oldest available attendance date as isActiveMIADate
                rosterRecord.isActiveMIADate = result.attendance.dates[result.attendance.dates.length - 1];
            }

            return rosterRecord;
        });
    }

    return result;
}

exports.getFormattedContactQueue = function(activeRoster, lastestAttendanceDate, items){
    let unmergedContactQueue = [];
    items.forEach(function(i){
        let currentList = getContactQueueList(activeRoster, i.reason, i.filter);
        unmergedContactQueue = unmergedContactQueue.concat(currentList);
    });

    //merge contact queue to get one person from each family (unique by last name and address)
    let mergedContactQueue = _.uniqBy(unmergedContactQueue, function(c){
        return (c.lastName + c.address);
    });

    //now try to append spouse's name
    mergedContactQueue.forEach(function(m){
        let spouse = _.find(unmergedContactQueue, function(u){
            return (u.lastName == m.lastName
                    && u.address == m.address
                    && u.gender != m.gender);
        });

        if (spouse){
            //we found a spouse so append spouse's info
            m.firstName = m.firstName + " and " + spouse.firstName;
            
            if (spouse.cellPhone) {
                m.cellPhone = m.cellPhone + " " + spouse.cellPhone;
            }
            
            if (spouse.email) {
                m.email = m.email + "; " + spouse.email;
            }
        }
    });

    let formattedContactQueue = _.map(mergedContactQueue, function(m){
        return [
            lastestAttendanceDate,
            m.lastName,
            m.firstName,
            m.cellPhone,
            m.email,
            m.lastPresent,
            m.reason
        ];
    });

    if (formattedContactQueue.length > 0) {
        //add header
        let header = ['Date Added', 'Last Name', 'First Name(s)', 'Phone(s)', 'Email(s)', 'Last Present', 'Contact Reason', 'Contacted By', 'Contact Notes'];
        formattedContactQueue.unshift(header);

        //add space row
        formattedContactQueue.push(['--------', '-', '-', '-', '-', '-', '-', '-', '-']);
    }

    return formattedContactQueue;
}

function getContactQueueList(activeRoster, reason, filter){
    let list = _.chain(activeRoster)
        .filter(filter)
        .map(function(d) {
            return {
                lastName: d.lastName,
                firstName: d.firstName,
                address: d.address,
                gender: d.gender,
                email: d.email,
                cellPhone: d.cellPhone,
                lastPresent: d.lastPresent,
                reason: reason
            };
        })
        .value();

    return list;
}

exports.getFormattedMembers = function(activeRoster, filter) {
    let members = _.filter(activeRoster, { 'isMember': true });

    let sorted = _.sortBy(members, function(d) {
        return d.lastName;
    });

    let formatted = _.map(sorted, function(d){
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

    if (formatted.length > 0) {
        //add header
        let header = ['Last Name', 'First Name', 'Gender', 'DOB', 'Email', 'Cell Phone', 'Mobile Phone', 'Address', 'City, State Zip', 'Role', 'Last Present'];
        formatted.unshift(header);
    }

    return formatted;
}

exports.getFormattedVisitors = function(activeRoster, filter) {
    let visitors = _.filter(activeRoster, { 'isMember': false });

    let sorted = _.orderBy(visitors, function(d) {
        let date = new Date(0);
        if (d.firstPresent){
            date = new Date(d.firstPresent)
        }
        return date;
    }, ['desc']);

    let formatted = _.map(sorted, function(d){
        let mapped = [
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

    if (formatted.length > 0) {
        //add header
        let header = ['First Visit', 'Last Visit', 'Last Name', 'First Name', 'Gender', 'DOB', 'Email', 'Cell Phone', 'Mobile Phone', 'Address', 'City, State Zip', 'Role'];
        formatted.unshift(header);
    }

    return formatted;
}

exports.getFormattedInactive = function(inactiveRoster) {

    let sorted = _.orderBy(inactiveRoster, [
        function(d) {
            //inactive date
            let date = new Date(0);
            if (d.isActiveMIA && d.isActiveMIADate) {
                date = new Date(d.isActiveMIADate);
            } else if (d.dateInactive) {
                date = new Date(d.dateInactive);
            }
            return date;
        }, function(d) {
            //last name
            return d.lastName;
        }], ['desc', 'asc']);

    let formatted = _.map(sorted, function(d){
        let mapped = [
            d.isActiveMIA ? d.isActiveMIADate : d.dateInactive,
            d.isActiveMIA ? "Attendance" : "Marked Inactive",
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

    if (formatted.length > 0) {
        //add header
        let header = ['Inactive Date', 'Reason', 'Last Name', 'First Name', 'Gender', 'DOB', 'Email', 'Cell Phone', 'Mobile Phone', 'Address', 'City, State Zip', 'Role'];
        formatted.unshift(header);
    }

    return formatted;
}

exports.getFormattedAttendance = function(attendance) {
    let formatted = _.map(attendance.records, function(d) {
        let formattedRecord = [d.lastName, d.firstName, d.lastPresent];

        for(let i = 1; i <= attendance.dates.length; i++){
            formattedRecord.push(d[i.toString()]);
        }

        return formattedRecord;
    });

    let header = ['Last Name', 'First Name', 'Last Present'].concat(attendance.dates);
    formatted.unshift(header);

    return formatted;
}

exports.getFormattedEmailLists = function(activeRoster){
    let padColumnsCount = 9;
    let activeWithEmail = _.filter(activeRoster, function(d){ return d.email });

    let memberEmails = generateEmailList(activeWithEmail, function(d){ return d.isMember; });
    let visitorEmails = generateEmailList(activeWithEmail, function(d){ return !d.isMember; });
    let menEmails = generateEmailList(activeWithEmail, function(d){ return d.gender == "M"; });
    let womenEmails = generateEmailList(activeWithEmail, function(d){ return d.gender == "F" });

    let padColumns = _.fill(new Array(padColumnsCount), '');
    return [
            ['Members', memberEmails].concat(padColumns),
            ['Visitors', visitorEmails].concat(padColumns),
            ['Men', menEmails].concat(padColumns),
            ['Women', womenEmails].concat(padColumns)
    ];
}

function generateEmailList(source, filter){
    let filtered = _.filter(source, filter);
    let formatted = _.map(filtered, function(d) { return d.email; }).join(", ");
    return formatted;

}
