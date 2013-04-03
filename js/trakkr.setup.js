'use strict';

var app = app || {};

app.currentRun = false;
app.location = new app.LocationProvider();
app.page = new app.PageWrapper();


app.navigate = function(url) { 
  history.pushState({}, '', url);
  app.router.trigger(url);
};


app.router = new Router({
  '/': app.page.bindVisit('home'),
  '/record-activity/': app.page.bindVisit('record-activity'),
  '/activity/:id': app.page.bindVisit('activity'),
  '/activities/': app.page.bindVisit('activities')
});


app.router.trigger('/');