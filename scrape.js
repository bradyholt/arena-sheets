var casper = require('casper').create({
    clientScripts: ['casper-scripts/jquery-1.11.3.min.js']
});
var util = require('utils');
var fs = require('fs');
var config = require('config');

casper.start(config.arena_url + '/default.aspx?page=3062', function() {
    this.fill('form', {
	'ctl08$ctl01$txtLoginId': config.arena_username,
        'ctl08$ctl01$txtPassword': config.arena_password
    }, false);
});

casper.thenClick('#ctl08_ctl01_btnSignin').waitForText("Welcome!", function(){
	this.echo("Login successful.");
});

casper.thenOpen(config.arena_url + '/default.aspx?page=3071').waitForText("Select Class Name to View Members", function(){
    this.echo("Class list page loaded.");

    var classes = this.evaluate(function(){
          var classList = [];
          $('#ctl08_ctl02_dgGroups tr.listItem td:first a').each(function() {
              var url = $(this).attr("href");
              var name = $(this).text();
              var id = url.match(/\S*group\=(\d+)/i)[1];
              classList.push({ id: id, name: name});
          });
          return classList;
      });

      casper.then(function(){
          writeMetaFile(classes);
          classes.forEach(function(c){
              downloadRoster(c.id, c.name);
              downloadAttendance(c.id, c.name);
          });
      });
});

function writeMetaFile(classes){
    fs.write(config.scrape_data_path + "classes.json", JSON.stringify(classes), 'w');
}

function downloadRoster(classId, className) {
    casper.thenOpen(config.arena_url + '/default.aspx?page=3077&group=' + classId).waitForText("CLICK HERE TO LOG OUT", function(){
         this.echo(className + ": Members page loaded.");
         var form_info = this.evaluate(function(){
            var res={};
            f=document.forms[0];
            f.onsubmit= function() {
                //iterate the form fields
                var post={};
                for(i=0; i<f.elements.length; i++) {
                   post[f.elements[i].name]=f.elements[i].value;
                }

                post["ctl08$ctl11$stGroupMain$ctl22$dgMembers$ctl28$dgMembers_ibExport.x"] = "8";
                post["ctl08$ctl11$stGroupMain$ctl22$dgMembers$ctl28$dgMembers_ibExport.y"] = "7";

                res.action = f.action;
                res.post = post;
                return false; //Stop form submission
            }

            //Trigger the click on the link.
            var l = $("#ctl08_ctl11_stGroupMain_ctl22_dgMembers_ctl28_dgMembers_ibExport");
            l.removeAttr("onclick");
            l.click();

            return res; //Return the form data to casper
         });

         this.echo(className + ": Downloading roster data...");
         casper.download(form_info.action, config.scrape_data_path + classId + "_roster.html", "POST", form_info.post);
         this.echo(className + ": Roster data downloaded.");
    });
}

function downloadAttendance(classId, className) {
    casper.thenOpen(config.arena_url + '/default.aspx?page=3077&group=' + classId + '&tab=AggregateMembers').waitForText("CLICK HERE TO LOG OUT", function(){
         this.echo(className + ": Attendance page loaded.");
         var form_info = this.evaluate(function(){
            var res={};
            f=document.forms[0];
            f.onsubmit= function() {
                //iterate the form fields
                var post={};
                for(i=0; i<f.elements.length; i++) {
                   post[f.elements[i].name]=f.elements[i].value;
                }

                post["ctl08$ctl11$stGroupMain$ctl22$dgPersons$ctl28$dgPersons_ibExport.x"] = "4";
                post["ctl08$ctl11$stGroupMain$ctl22$dgPersons$ctl28$dgPersons_ibExport.y"] = "10";

                res.action = f.action;
                res.post = post;
                return false; //Stop form submission
            }

            //Trigger the click on the link.
            var l = $("#ctl08_ctl11_stGroupMain_ctl22_dgPersons_ctl28_dgPersons_ibExport");
            l.removeAttr("onclick");
            l.click();

            return res; //Return the form data to casper
         });

         this.echo(className + ": Downloading attendance data...");
         casper.download(form_info.action, config.scrape_data_path + classId + "_attendance.html", "POST", form_info.post);
         this.echo(className + ": Attendance data downloaded.");
    });
}

casper.run();
