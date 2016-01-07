"use strict";

let _ = require('lodash');

exports.getLastSunday = function(d) {
  d = new Date(d);
  let day = d.getDay(),
      diff = d.getDate() - day;
  d.setDate(diff)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

exports.getDaysBetweenDates = function(date1, date2) {
    let timeDiff = Math.abs(date2.getTime() - date1.getTime());
    let diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
    return diffDays;
}

exports.getFullWeeksBetweenDates = function(date1, date2) {
    let daysBetweenDates = exports.getDaysBetweenDates(date1, date2);
    return Math.floor((daysBetweenDates/7));
}

exports.getFullWeeksBetweenDatesAndExcludeGapDates = function(date1, date2, gapDates) {
    let daysBetweenDates = exports.getDaysBetweenDates(date1, date2);
    let weeksBetweenDates = Math.floor((daysBetweenDates/7));
    
     // substract the number of gap dates that fall between date1 and date2
     weeksBetweenDates -= exports.getDatesBetweenStartAndEndDate(gapDates, date1, date2).length;
          
    return weeksBetweenDates;
}

exports.stripTimeFromDateString = function(dateString) {
    let timeStrippedDate = (dateString && dateString.indexOf(' ') > -1) ? dateString.substring(0, dateString.indexOf(' ')) : dateString;
    return timeStrippedDate;
}

exports.getDatesBetweenStartAndEndDate = function(dates, startDate, endDate) {
    let datesBetween = _.filter(dates, function(d) {
        return (d.getTime() <= endDate.getTime() && d.getTime() >= startDate.getTime());
    });
     
    return datesBetween;
}
