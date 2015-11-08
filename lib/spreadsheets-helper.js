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

exports.prependWorksheet = function(classId, sheetData, worksheetName, oauth2, data, dataHasHeader, skipIfFirstRowFirstCellValueEquals, maxRows) {

    var spreadsheetId = sheetData.spreadsheetId;
    var worksheetId = sheetData.worksheets[worksheetName];

    if (!data.length || data.length == 1) {
        //no data to prepend
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

            var firstRowfirstCellValue = null;
            var firstRow = dataHasHeader ? 2 : 1;
            if (rows[firstRow] && rows[firstRow]['1']) {
                firstRowfirstCellValue = rows[firstRow]['1'];
                if (skipIfFirstRowFirstCellValueEquals && (skipIfFirstRowFirstCellValueEquals == firstRowfirstCellValue)){
                    //don't update because firstRowFirstCellValue matches skipIfFirstRowFirstCellValueEquals
                    return;
                }
            }

            var newRows = {};
            var rowOffset = data.length - 1;
            var existingDataMaxColumns = 0;

            //move any existing rows down to make space for new ones at top
            _.keys(rows).forEach(function(k){
                var newRowNum = (Number(k) + rowOffset);

                if (dataHasHeader && k == '1') {
                    // skip header
                    return;
                } else if (maxRows && newRowNum > maxRows) {
                    // exceeds maxRows
                    return;
                } else {

                    newRows[newRowNum.toString()] = rows[k];

                    //keep track of column max for existing data
                    var columnCount = _.keys(rows[k]).length;
                    if (columnCount > existingDataMaxColumns) {
                        existingDataMaxColumns = columnCount;
                    }
                }
            });

            //prepend new data rows
            var startDataAtRowNum = 1;
            for(var i = 0; i < Math.min(data.length, (maxRows || data.length)) ; i++){
                var rowObj = new Object();
                for(var colIndex = 0; colIndex < data[i].length; colIndex++){
                    rowObj[(colIndex + 1).toString()] = data[i][colIndex];
                }

                //add empty cells to clear out previous date in row that had more columns
                for(var colIndex = data[i].length; colIndex < existingDataMaxColumns; colIndex++){
                    rowObj[(colIndex + 1).toString()] = "";
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
