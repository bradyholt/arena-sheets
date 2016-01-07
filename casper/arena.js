var casper = require('casper').create({
    clientScripts: ['../node_modules/jquery/dist/jquery.js'],
    waitTimeout: 10000
});
var util = require('utils');
var fs = require('fs');
var config = require('../config/app');
var _ = require('../node_modules/lodash');

var dataOutPath = "./data/";
var onlyClassId = null;
if (casper.cli.args[0]) {
    dataOutPath = casper.cli.args[0];
}
if (casper.cli.args[1]) {
    onlyClassId = casper.cli.args[1];
}

setupDebug();
setupDataDirectory();

casper.start(config.arena_url + '/default.aspx?page=3062', function() {
    this.fill('form', {
	'ctl08$ctl01$txtLoginId': config.arena_username,
        'ctl08$ctl01$txtPassword': config.arena_password
    }, false);
});

casper.thenClick('#ctl08_ctl01_btnSignin').waitForText("You are currently logged in", function(){
	casper.echo("Login successful");
});

casper.thenOpen(config.arena_url + '/default.aspx?page=3071').waitForText("You are currently logged in",
 function(){
    casper.echo("Paged class list page loaded");
    this.fillSelectors('form', {
	'input.listItem': '200'
    }, false);
}, null, 30000);

casper.thenClick('input#ctl08_ctl02_dgGroups_ctl34_btnRefreshdgGroups');

casper.waitWhileSelector('a[href*="ctl08$ctl02$dgGroups$ctl28$ctl03"', function(){
    casper.echo("Full class list page loaded");
    var classes = this.evaluate(function(class_settings){
          var classList = [];
          $('#ctl08_ctl02_dgGroups tr.listItem, #ctl08_ctl02_dgGroups tr.listAltItem').each(function() {
              var link = $(this).find('td:first a');
              var url = link.attr("href");
              var id = url.match(/\S*group\=(\d+)/i)[1];

              var skipClass = (class_settings && class_settings[id] && class_settings[id].skip == true);
              if (skipClass) {
                  return;
              }

              var name = link.text();
              if (class_settings && class_settings[id] && class_settings[id].name) {
                  //overridden class name
                  name = class_settings[id].name;
              }

              //append room number to name
              var room = $(this).find('td:last');
              if (room.length){
                  var roomText = room.text();
                  if (roomText && roomText.length > 1) {
                      name = name + " (" + roomText + ")";
                  }
              }

              classList.push({ id: id, name: name});
          });
          return classList;
      }, config.class_settings);

      casper.then(function(){
          writeMetaFile(classes);
          classes.forEach(function(c){
              if (onlyClassId && c.id != onlyClassId) {
                  return;
              }
              casper.echo("Queuing download of data class_id=" + c.id);
              downloadRoster(c.id, c.name);
              downloadAttendance(c.id, c.name);
          });
      });
});

function writeMetaFile(classes){
    var metaFilePath = dataOutPath + "classes.json";
    casper.echo("Writing meta data to " + metaFilePath);
    fs.write(dataOutPath + "classes.json", JSON.stringify(classes,null, 2), 'w');
}

function downloadRoster(classId, className) {
    var url = config.arena_url + '/default.aspx?page=3077&group=' + classId;
    casper.thenOpen(url).waitForText("CLICK HERE TO LOG OUT", function(){
        casper.echo("Roster page loaded class_id=" + classId);
        var form_info = this.evaluate(function(){
            var res={};
            var exportId = $("input[id$='_ibExport']").first().attr('id');
            res.exportId = exportId;


            f=document.forms[0];
            f.onsubmit= function() {
                //iterate the form fields
                var post={};
                for(i=0; i<f.elements.length; i++) {
                   post[f.elements[i].name]=f.elements[i].value;
                }

                post[exportId.replace(/\_/g, '$').replace('$ibExport', '_ibExport') + ".x"] = "1";
                post[exportId.replace(/\_/g, '$').replace('$ibExport', '_ibExport') + ".y"] = "1";

                res.action = f.action;
                res.post = post;
                return false; //Stop form submission
            }

            //Trigger the click on the link.
            var l = $("#" + exportId);
            l.removeAttr("onclick");
            l.click();

            return res; //Return the form data to casper
         });

         casper.echo("Start download of roster class_id=" + classId);
         casper.download(form_info.action, dataOutPath + classId + "_roster.html", "POST", form_info.post);
         casper.echo("Download of roster finished class_id=" + classId);
    });
}

function downloadAttendance(classId, className) {
    var url = config.arena_url + '/default.aspx?page=3077&pagetab=3315&group=' + classId + '&tab=AggregateMembers';
    casper.thenOpen(url).waitForText("CLICK HERE TO LOG OUT", function(){
         casper.echo("Attendance page loaded class_id=" + classId);
         var form_info = this.evaluate(function(){
            var res={};
            var exportId = $("input[id$='_ibExport']").first().attr('id');

            f=document.forms[0];
            f.onsubmit= function() {
                //iterate the form fields
                var post={};
                for(i=0; i<f.elements.length; i++) {
                   post[f.elements[i].name]=f.elements[i].value;
                }

                post[exportId.replace(/\_/g, '$').replace('$ibExport', '_ibExport') + ".x"] = "1";
                post[exportId.replace(/\_/g, '$').replace('$ibExport', '_ibExport') + ".y"] = "1";

                res.action = f.action;
                res.post = post;
                return false; //Stop form submission
            }

            //Trigger the click on the link.
            var l = $("#" + exportId);
            l.removeAttr("onclick");
            l.click();

            return res; //Return the form data to casper
         });

         casper.echo("Start download of attendance data class_id=" + classId);
         casper.download(form_info.action, dataOutPath + classId + "_attendance.html", "POST", form_info.post);
         casper.echo("Download of attendance data finished class_id=" + classId);
    });
}

casper.run();

function setupDataDirectory(){
    casper.echo("Deleting data directory " + dataOutPath);
    fs.removeTree(dataOutPath);
}

function setupDebug(){
    var debugDirectory = 'debug/';
    casper.echo("Deleting debug directory " + debugDirectory);
    fs.removeTree(debugDirectory);

    casper.on('load.finished', function(resource) {
    	var fileNamePrefix = new Date().getTime();

        this.capture(debugDirectory + fileNamePrefix + '-screenshot.png', {
    		top: 0,
    		left: 0,
    		width: 1024,
    		height: 768
    	});

        var href = this.evaluate(function() {
    		return document.location.href;
    	});

    	var innerHTML = this.evaluate(function(){
    		return document.body.innerHTML;
    	});

    	innerHTML = '<!-- ' + href + ' -->\n\n' + innerHTML;

    	fs.write(debugDirectory + fileNamePrefix + '-content.html', innerHTML, 'w');
    });

    casper.on('open', function(location, settings) {
        casper.echo("Requesting url " + location + " " + JSON.stringify(settings));
    });
}
