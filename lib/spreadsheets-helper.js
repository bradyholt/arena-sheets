"use strict";

let _ = require('lodash');
let spreadsheetEditor = require('edit-google-spreadsheet');

exports.updateWorksheet = function(classId, sheetData, worksheetName, oauth2, data) {

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
        oauth2: oauth2
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

exports.prependWorksheet = function(classId, sheetData, worksheetName, oauth2, data, skipHeader) {

    var spreadsheetId = sheetData.spreadsheetId;
    var worksheetId = sheetData.worksheets[worksheetName];

    if (!data.length || data.length == 1) {
        return;
    }

    var padRows = 10;
    var padColumns = 2;

    spreadsheetEditor.load({
        debug: true,
        spreadsheetId: spreadsheetId,
        worksheetId: worksheetId,
        oauth2: oauth2
    }, function sheetReady(err, spreadsheet) {
        spreadsheet.receive(function(err, rows, info) {

            var newRows = {};
            var rowOffset = data.length;

            //move any existing rows down to make space for new ones at top
            _.keys(rows).forEach(function(k){
                if (skipHeader && k == '1') {
                    return;
                }
                var newRowNum = (Number(k) + rowOffset);
                newRows[newRowNum.toString()] = rows[k];
            });

            //prepend new data rows
            var startDataAtRowNum = (skipHeader ? 2 : 1);
            for(var i = 0; i < data.length; i++){
                var rowObj = new Object();
                for(var x = 0; x < data[i].length; x++){
                    rowObj[(x + 1).toString()] = data[i][x];
                }

                newRows[(i + startDataAtRowNum).toString()] = rowObj;
            }

            spreadsheet.metadata({
              title: worksheetName,
              rowCount: (_.keys(newRows).length + padRows),
              colCount: (_.keys(data["1"]).length + padColumns)
            }, function(err, metadata){
                spreadsheet.add(newRows);
                spreadsheet.send(function(err) {
                    if (err) throw err;
                });
            });
        });
    });
}
