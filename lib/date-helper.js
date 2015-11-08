"use strict";

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

exports.stripTimeFromDateString = function(dateString) {
    let timeStrippedDate = (dateString && dateString.indexOf(' ') > -1) ? dateString.substring(0, dateString.indexOf(' ')) : dateString;
    return timeStrippedDate;
}
