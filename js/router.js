// This is an ultra minimal router that I wrote because I spent about 10
// minutes trying to get Backbones to work and couldnt. Its majorly NIH
// and I wouldnt recommend using it. I will document it anyway because 
// I am nice like that and my memory sucks
//
// You can initialise it with some router
// 
//   var app = new Router({
//     '/': function() { console.log('Ok pretty boring'); },
//     '/static/path/': function() { console.log('A static path!'); },
//     '/user/:username': function(username) { console.log('Hello', username); }
//   });
//
// and / or you can add routes to it 
// 
//   app.on('/magic/', function() { console.log('totally amazing'); });
//
// and to trigger paths, you 
//
//   app.trigger('/some/path/');
//
// Thats it folks, exciting eh? it doesnt do any of the fancy pushState or 
// hashchanged stuff because its a few lines to wrap them around this
//

"use strict";

var Router = function(_routes) { 
  
  var PATH_MATCHER = /:([\w\d]+)/g;
  var PATH_REPLACER = "([^\/]+)";
  
  var WILD_MATCHER = /\*([\w\d]+)/g;
  var WILD_REPLACER = "(.*?)";
  
  var routes = [];
  var api = {};
  
  function matchPath(path) {
    for (var i = 0; i < routes.length; i++) {
      var routeObj = routes[i];
      var match = path.match(routeObj.re);
      if (match) {
        return {match: match, route: routeObj};
      }
    }
    return false;
  }
  
  function toRegex(path) {
    if (path.constructor == String) {
      var regex = '^' + path.replace(PATH_MATCHER, PATH_REPLACER)
        .replace(WILD_MATCHER, WILD_REPLACER) + '$';
      return new RegExp(regex);
    } 
    return path;
  }
  
  function trigger(path) { 
    if (!path) return;
    var match = matchPath(path);
    if (!match) return;
    var args = match.match.slice(1);
    match.route.fun.apply({}, args);    
  }
  
  api.on = function(route, fun) {
    routes.push({
      route: route,
      re: toRegex(route),
      fun: fun
    });
  };
  
  api.trigger = function(path) { 
    trigger(path);
  };
  
  Object.keys(_routes).map(function(route) { 
    api.on(route, _routes[route]);
  });
  
  return api;
};

