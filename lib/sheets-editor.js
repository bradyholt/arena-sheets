"use strict";

let _ = require('lodash');
let spreadsheetEditor = require('edit-google-spreadsheet');

const PAD_ROWS_COUNT = 10;
const PAD_COLUMNS_COUNT = 2;

exports.overwriteWorksheet = function(classId, sheetData, worksheetName, oauth2, data) {

    let spreadsheetId = sheetData.spreadsheetId;
    let worksheetId = sheetData.worksheets[worksheetName];

    if (!data.length || data.length == 1) {
        return;
    }

    //pad extra empty rows and columns
    for(let i = 1; i <= PAD_ROWS_COUNT; i++){
        let padRow = _.fill(new Array(data[0].length), '');
        data.push(padRow);
    }

    data.forEach(function(d, idx){
        data[idx] = d.concat(_.fill(new Array(PAD_COLUMNS_COUNT), ''));
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

exports.prependWorksheet = function(classId, sheetData, worksheetName, oauth2, data, dataHasHeader, skipIfFirstRowFirstCellValueEquals, maxExistingRows) {

    let spreadsheetId = sheetData.spreadsheetId;
    let worksheetId = sheetData.worksheets[worksheetName];

    if (!data.length || data.length == 1) {
        //no data to prepend
        return;
    }

    const PAD_ROWS_COUNT = 10;
    const PAD_COLUMNS_COUNT = 2;

    spreadsheetEditor.load({
        debug: true,
        spreadsheetId: spreadsheetId,
        worksheetId: worksheetId,
        oauth2: oauth2
    }, function sheetReady(err, spreadsheet) {
        spreadsheet.receive(function(err, rows, info) {

            let firstRowfirstCellValue = null;
            let firstRow = dataHasHeader ? 2 : 1;
            if (rows[firstRow] && rows[firstRow]['1']) {
                firstRowfirstCellValue = rows[firstRow]['1'];
                if (skipIfFirstRowFirstCellValueEquals && (skipIfFirstRowFirstCellValueEquals == firstRowfirstCellValue)){
                    console.log("Skipping prepend because skipIfFirstRowFirstCellValueEquals matched.");
                    //don't update because firstRowFirstCellValue matches skipIfFirstRowFirstCellValueEquals
                    return;
                }
            }

            let newRows = {};
            let rowOffset = data.length - 1;
            let existingDataMaxColumns = 0;

            //move any existing rows down to make space for new ones at top
            _.keys(rows).forEach(function(k){
                let newRowNum = (Number(k) + rowOffset);

                if (dataHasHeader && k == '1') {
                    // skip header
                    return;
                } else if (maxExistingRows && newRowNum > maxExistingRows) {
                    // exceeds maxExistingRows
                    return;
                } else {

                    newRows[newRowNum.toString()] = rows[k];

                    //keep track of column max for existing data
                    let columnCount = _.keys(rows[k]).length;
                    if (columnCount > existingDataMaxColumns) {
                        existingDataMaxColumns = columnCount;
                    }
                }
            });

            //prepend new data rows
            let startDataAtRowNum = 1;
            for(let i = 0; i < data.length ; i++){
                let rowObj = new Object();
                for(let colIndex = 0; colIndex < data[i].length; colIndex++){
                    rowObj[(colIndex + 1).toString()] = data[i][colIndex];
                }

                //add empty cells to clear out previous date in row that had more columns
                for(let colIndex = data[i].length; colIndex < existingDataMaxColumns; colIndex++){
                    rowObj[(colIndex + 1).toString()] = "";
                }

                newRows[(i + startDataAtRowNum).toString()] = rowObj;
            }

            spreadsheet.metadata({
              title: worksheetName,
              rowCount: (_.keys(newRows).length + PAD_ROWS_COUNT),
              colCount: (_.keys(data["1"]).length + PAD_COLUMNS_COUNT)
            }, function(err, metadata){
                spreadsheet.add(newRows);
                spreadsheet.send(function(err) {
                    if (err) throw err;
                });
            });
        });
    });
}
