"use strict";

let _ = require('lodash');
let fs = require('fs');
let tabletojson = require('tabletojson');
let dateHelper = require('./date-helper');

exports.readData = function(dataPath, classId, lastSundayDate) {
    let result = {
        roster: null,
        attendance: null
    };

    let attendanceHtml = fs.readFileSync(dataPath + classId + '_attendance.html', 'utf8');
    let attendanceData = tabletojson.convert(attendanceHtml)[0];
    let attendanceMappedByFullName = {};

    if (attendanceData && attendanceData.length){
        result.attendance = {
            dates: [],
            records: []
        };

        let datesStartColumnIndex = 8;
        let datesEndColumnIndex = _.keys(attendanceData[0]).length - 2;
        let datesWithDataEndColumnIndex = datesEndColumnIndex;
        let datesAvailableCount = (datesEndColumnIndex - datesStartColumnIndex);
        let dates = [];

        for (let i = datesEndColumnIndex; i >= datesStartColumnIndex; i--) {
            let isDataForDate = _.any(attendanceData, function(d){
                return d[i] == "X";
            });

            if (isDataForDate) {
                let dirtyDate = attendanceData[0][i.toString()];
                if (dirtyDate && dirtyDate.length) {
                    var formattedDate = dirtyDate.substring(0, dirtyDate.lastIndexOf('/') + 5);
                    dates.push(formattedDate);
                }
            } else {
                datesWithDataEndColumnIndex--;
            }
        }

        result.attendance.dates = dates;

        //remove header row
        attendanceData.shift();

        result.attendance.records = _.map(attendanceData, function(d) {
            let attendanceRecord = {
                fullName: d["0"],
                lastName: d["0"].substring(0, d["0"].indexOf(",")),
                firstName: d["0"].substring(d["0"].indexOf(",") + 1),
                firstPresent: d["5"],
                lastPresent: d["6"]
            };

            let dateIndex = 1;
            for (let i = datesWithDataEndColumnIndex; i >= datesStartColumnIndex; i--) {
                attendanceRecord[dateIndex.toString()] = d[i.toString()];
                dateIndex++;
            }

            attendanceMappedByFullName[attendanceRecord.fullName] = attendanceRecord;
            return attendanceRecord;
        });
    }

    let rosterHtml = fs.readFileSync(dataPath + classId + '_roster.html', 'utf8');
    let rosterData = tabletojson.convert(rosterHtml)[0];

    if (rosterData && rosterData.length) {
        let fieldMappings = _.invert(rosterData[0]);

        //remove header row
        rosterData.shift();

        result.roster = _.map(rosterData, function(d) {
            let rosterRecord = {
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

            let latestAttendanceDate = new Date(result.attendance.dates[0]);
            if (attendanceMappedByFullName[rosterRecord.fullName]){
                let attendance = attendanceMappedByFullName[rosterRecord.fullName];
                if (attendance.firstPresent) {
                    rosterRecord.firstPresent = attendance.firstPresent;
                    rosterRecord.firstPresentWeeksAgo = dateHelper.getFullWeeksBetweenDates(new Date(attendance.firstPresent), latestAttendanceDate);
                }

                if (attendance.lastPresent) {
                    rosterRecord.lastPresent = attendance.lastPresent;
                    rosterRecord.lastPresentWeeksAgo = dateHelper.getFullWeeksBetweenDates(new Date(attendance.lastPresent), latestAttendanceDate);
                }
            }

            return rosterRecord;
        });
    }

    return result;
}

exports.getContactQueueData = function(activeRoster, lastestAttendanceDate, items){
    let unmergedContactQueue = [];
    items.forEach(function(i){
        let currentList = getContactQueueList(activeRoster, i.reason, i.filter);
        unmergedContactQueue = unmergedContactQueue.concat(currentList);
    });

    //merge contact queue to get one person from each family (unique by last name and address)
    let mergedContactQueue = _.uniq(unmergedContactQueue, function(c){
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
            //we found a spouse so append spouse's name
            m.firstName = m.firstName + " and " + spouse.firstName;
        }
    });

    let formattedContactQueue = _.map(mergedContactQueue, function(m){
        return [
            lastestAttendanceDate,
            m.lastName,
            m.firstName,
            m.lastPresent,
            m.reason
        ];
    });

    if (formattedContactQueue.length > 0) {
        //add header
        let header = ['Date Added', 'Last Name', 'First Name(s)', 'Last Present', 'Contact Reason', 'Contacted By', 'Contact Notes'];
        formattedContactQueue.unshift(header);

        //add space row
        formattedContactQueue.push(['--------']);
    }

    return formattedContactQueue;
}

function getContactQueueList(activeRoster, reason, filter){
    let list = _.chain(activeRoster)
        .where(filter)
        .map(function(d) {
            return {
                lastName: d.lastName,
                firstName: d.firstName,
                address: d.address,
                gender: d.gender,
                lastPresent: d.lastPresent,
                reason: reason
            };
        })
        .value();

    return list;
}

exports.getMemberData = function(activeRoster, filter) {
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

exports.getVisitorData = function(activeRoster, filter) {
    let visitors = _.filter(activeRoster, { 'isMember': false });

    let sorted = _.sortByOrder(visitors, function(d) {
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

exports.getAttendanceData = function(sourceData) {

    let formatted = _.map(sourceData.records, function(d) {
        let formattedRecord = [d.lastName, d.firstName, d.lastPresent];

        for(let i = 1; i <= sourceData.dates.length; i++){
            formattedRecord.push(d[i.toString()]);
        }

        return formattedRecord;
    });

    let header = ['Last Name', 'First Name', 'Last Present'].concat(sourceData.dates);
    formatted.unshift(header);

    return formatted;
}

exports.getEmailLists = function(activeRoster){
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
