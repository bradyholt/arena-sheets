"use strict";

let logger = require('winston');
let _ = require('lodash');
let googleSpreadsheetEditor = require('edit-google-spreadsheet');

const PAD_ROWS_COUNT = 10;
const PAD_COLUMNS_COUNT = 2;
const PREPEND_MAX_EXISTING_ROW_COUNT_DEFAULT = 1000;

function SheetsEditor(oauth2, classId, sheetMeta, opts) {
    this.oauth2 = oauth2;
    this.classId = classId;
    this.sheetMeta = sheetMeta;
    this.debug = (opts && opts.debug);
}

SheetsEditor.prototype.overwriteWorksheet = function(worksheetName, data) {

    let _this = this;
    let spreadsheetId = this.sheetMeta.spreadsheetId;
    let worksheetId = this.sheetMeta.worksheets[worksheetName];
    let classId = this.classId;
    let oauth2 = this.oauth2;

    if (!data.length || data.length == 1) {
        logger.info("No data to overwrite with", { class_id: classId, worksheetName: worksheetName});
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

    let promise = new Promise(function(resolve, reject) {
        
        googleSpreadsheetEditor.load({
            debug: _this.debug,
            spreadsheetId: spreadsheetId,
            worksheetId: worksheetId,
            oauth2: oauth2
        }, function sheetReady(err, spreadsheet) {

            var newRowCount = data.length;
            var newColumnCount = data[0].length;

            spreadsheet.metadata({
            title: worksheetName,
            rowCount: newRowCount,
            colCount: newColumnCount
            }, function(err, metadata){
                if (err) {
                    logger.error("Error when updating metadata for worksheet", { class_id: classId, worksheetName: worksheetName, rows: newRowCount, columns: newColumnCount, error: err});
                    reject(err);
                } else {
                    spreadsheet.add(data);

                    logger.info("Updating worksheet with new data", { class_id: classId, worksheetName: worksheetName});
                    spreadsheet.send(function(err) {
                        if (err) {
                            logger.error("Error when overwriting worksheet", { class_id: classId, worksheetName: worksheetName, error: err});
                            reject(err);
                        } else {
                            logger.info("Worksheet successfully updated", { class_id: classId, worksheetName: worksheetName});
                            resolve(worksheetId);
                        }
                    });
                }
            });
        });
    });
    
    return promise;
}

SheetsEditor.prototype.prependWorksheet = function(worksheetName, data, opts) {

    let _this = this;
    let spreadsheetId = this.sheetMeta.spreadsheetId;
    let worksheetId = this.sheetMeta.worksheets[worksheetName];
    let classId = this.classId;
    let oauth2 = this.oauth2;

    let dataHasHeader = (opts && opts.dataHasHeader == true);
    let skipIfFirstRowFirstCellValueEquals = null;
    if (opts && opts.skipIfFirstRowFirstCellValueEquals) {
        skipIfFirstRowFirstCellValueEquals = opts.skipIfFirstRowFirstCellValueEquals;
    }
    
    let maxExistingRows = PREPEND_MAX_EXISTING_ROW_COUNT_DEFAULT;
    if (opts && opts.maxExistingRows) {
        maxExistingRows = opts.maxExistingRows;
    }

    let promise = new Promise(function(resolve, reject) {
        
        if (!data.length || data.length == 1) {
            logger.info("No data to prepend", { class_id: classId, worksheetName: worksheetName});
            resolve(worksheetId);
        }
    
        googleSpreadsheetEditor.load({
            debug: _this.debug,
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
                        logger.info("Will skip worksheet prepend", { class_id: classId, worksheetName: worksheetName, firstRowfirstCellValue: firstRowfirstCellValue, skipIfFirstRowFirstCellValueEquals: skipIfFirstRowFirstCellValueEquals});
                        resolve(worksheetId);
                        return;
                    }
                }

                let newRows = {};
                let rowOffset = data.length - 1;
                let existingDataMaxColumns = _.chain(rows).toArray().flatMap(_.keys).max().value();

                //move any existing rows down to make space for new ones at top
                _.keys(rows).forEach(function(k){
                    let newRowNum = (Number(k) + rowOffset);

                    if (dataHasHeader && k == '1') {
                        // skip header
                        return;
                    } else if (maxExistingRows && newRowNum > maxExistingRows) {
                        logger.info("Trimming existing rows before prepend", { class_id: classId, worksheetName: worksheetName, newRowNum: newRowNum, maxExistingRows: maxExistingRows});
                        return;
                    } else {
                        
                        //add empty cells to clear out previous data in row that had more columns
                        for(let columnNumber = (_.max(_.keys(rows[k])) + 1); columnNumber <= existingDataMaxColumns; columnNumber++){
                            rows[k][columnNumber.toString()] = "";
                        }
                    
                        newRows[newRowNum.toString()] = rows[k];
                    }
                });

                //prepend new data rows
                let startDataAtRowNum = 1;
                for(let i = 0; i < data.length ; i++){
                    let rowObj = new Object();
                    for(let colIndex = 0; colIndex < data[i].length; colIndex++){
                        rowObj[(colIndex + 1).toString()] = data[i][colIndex];
                    }

                    //add empty cells to clear out previous data in row that had more columns
                    for(let columnNumber = data[i].length + 1; columnNumber <= existingDataMaxColumns; columnNumber++){
                        rowObj[(columnNumber).toString()] = "";
                    }

                    newRows[(i + startDataAtRowNum).toString()] = rowObj;
                }

                var newRowCount = (_.keys(newRows).length + PAD_ROWS_COUNT);
                
                var dataFieldsCount = _.keys(data["1"]).length;
                if (opts.colCountMin && dataFieldsCount < opts.colCountMin) {
                    dataFieldsCount = opts.colCountMin;
                }
                var newColumnCount = (dataFieldsCount + PAD_COLUMNS_COUNT);
                
                spreadsheet.metadata({
                    title: worksheetName,
                    rowCount: newRowCount,
                    colCount: newColumnCount
                    }, function(err, metadata){
                        if (err) {
                            logger.error("Error when updating metadata for worksheet", { class_id: classId, worksheetName: worksheetName, rows: newRowCount, columns: newColumnCount, error: err});
                            reject(err);
                        } else {
                            logger.info("Prepending worksheet with new data", { class_id: classId, worksheetName: worksheetName});
                            
                            spreadsheet.add(newRows);
                            spreadsheet.send(function(err) {
                                if (err) {
                                    logger.error("Error when prepending worksheet", { class_id: classId, worksheetName: worksheetName, error: err});
                                    reject(err);
                                } else {
                                    logger.info("Worksheet successfully prepended", { class_id: classId, worksheetName: worksheetName});
                                    resolve(worksheetId);
                                }
                            });
                        }
                    });
                });
        });
    });
    
    return promise;
}

module.exports = SheetsEditor;
